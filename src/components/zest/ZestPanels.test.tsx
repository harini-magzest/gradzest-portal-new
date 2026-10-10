import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ZestKnowledgePanel from './ZestKnowledgePanel';
import ZestInsightsPanel from './ZestInsightsPanel';
import ZestQueryLogPanel from './ZestQueryLogPanel';

const zest = vi.hoisted(() => ({
  documents: vi.fn(), replaceDocument: vi.fn(), uploadDocument: vi.fn(), renameDocument: vi.fn(), deleteDocument: vi.fn(),
  analytics: vi.fn(), addToKnowledge: vi.fn(), queryLogs: vi.fn(),
}));
vi.mock('../../api', () => ({ api: { zest } }));

const doc = (over: Record<string, unknown> = {}) => ({
  _id: 'd1', title: 'Visa guide', status: 'ready', chunkCount: 4, fileSize: 20480, originalFilename: 'visa.pdf',
  createdAt: '2026-09-01T00:00:00Z', timesUsed: 0, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  zest.documents.mockResolvedValue([]);
});

describe('Knowledge tab: usage', () => {
  it('says how often each document was used as a source, and when it was not used at all', async () => {
    zest.documents.mockResolvedValue([
      doc({ _id: 'a', title: 'Popular guide', timesUsed: 3 }),
      doc({ _id: 'b', title: 'Single use guide', timesUsed: 1, originalFilename: 'b.pdf', fileSize: 1 }),
      doc({ _id: 'c', title: 'Never used guide', timesUsed: 0, originalFilename: 'c.pdf', fileSize: 2 }),
    ]);
    render(<ZestKnowledgePanel />);
    expect(await screen.findByText('Used as a source 3 times in the last 90 days')).toBeTruthy();
    expect(screen.getByText('Used as a source 1 time in the last 90 days')).toBeTruthy();
    expect(screen.getByText('Not used as a source in the last 90 days')).toBeTruthy();
  });
});

describe('Knowledge tab: possible duplicates', () => {
  it('flags documents with the same title, or the same file name and size, and leaves unique ones alone', async () => {
    zest.documents.mockResolvedValue([
      doc({ _id: 'a', title: 'Fees 2026', originalFilename: 'one.pdf', fileSize: 10 }),
      doc({ _id: 'b', title: 'fees 2026 ', originalFilename: 'two.pdf', fileSize: 20 }), // same title, different case and spacing
      doc({ _id: 'c', title: 'Housing', originalFilename: 'same.pdf', fileSize: 30 }),
      doc({ _id: 'd', title: 'Housing copy', originalFilename: 'SAME.pdf', fileSize: 30 }), // same file name and size
      doc({ _id: 'e', title: 'Scholarships', originalFilename: 'sch.pdf', fileSize: 40 }),
    ]);
    render(<ZestKnowledgePanel />);
    await screen.findByText('Scholarships');
    expect(screen.getAllByText('Possible duplicate')).toHaveLength(4);
  });

  it('shows no warning when every document is different', async () => {
    zest.documents.mockResolvedValue([doc({ _id: 'a', title: 'One', originalFilename: 'a.pdf', fileSize: 1 }), doc({ _id: 'b', title: 'Two', originalFilename: 'b.pdf', fileSize: 2 })]);
    render(<ZestKnowledgePanel />);
    await screen.findByText('Two');
    expect(screen.queryByText('Possible duplicate')).toBeNull();
  });
});

describe('Knowledge tab: replacing a file', () => {
  const pdf = () => new File(['%PDF-1.4'], 'visa-2027.pdf', { type: 'application/pdf' });

  it('sends the new PDF for that document, keeps the title, and shows the new details', async () => {
    zest.documents.mockResolvedValue([doc({ _id: 'd1', title: 'Visa guide', chunkCount: 4, timesUsed: 5 })]);
    // The server's reply is the document itself; usage is only added when listing, so it is absent here.
    const { timesUsed: _unused, ...fromServer } = doc({ _id: 'd1', title: 'Visa guide', chunkCount: 9, fileSize: 51200, originalFilename: 'visa-2027.pdf' });
    zest.replaceDocument.mockResolvedValue(fromServer);
    render(<ZestKnowledgePanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Replace the file for Visa guide' }));
    fireEvent.change(screen.getByLabelText('Replacement PDF'), { target: { files: [pdf()] } });

    expect(await screen.findByText('9 sections')).toBeTruthy();
    expect(screen.getByText('Visa guide')).toBeTruthy();
    expect(screen.getByText('50 KB')).toBeTruthy();
    // The usage count belongs to the document, not the file, so it survives the swap.
    expect(screen.getByText('Used as a source 5 times in the last 90 days')).toBeTruthy();

    const [id, form] = zest.replaceDocument.mock.calls[0];
    expect(id).toBe('d1');
    expect((form as FormData).get('file')).toBeInstanceOf(File);
    expect(((form as FormData).get('file') as File).name).toBe('visa-2027.pdf');
  });

  it('replaces the right document when there are several', async () => {
    zest.documents.mockResolvedValue([doc({ _id: 'a', title: 'First', originalFilename: 'a.pdf', fileSize: 1 }), doc({ _id: 'b', title: 'Second', originalFilename: 'b.pdf', fileSize: 2 })]);
    zest.replaceDocument.mockResolvedValue(doc({ _id: 'b', title: 'Second', chunkCount: 7 }));
    render(<ZestKnowledgePanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Replace the file for Second' }));
    fireEvent.change(screen.getByLabelText('Replacement PDF'), { target: { files: [pdf()] } });
    await screen.findByText('7 sections');
    expect(zest.replaceDocument.mock.calls[0][0]).toBe('b');
  });

  it('shows the reason and leaves the document as it was when the new PDF is refused', async () => {
    zest.documents.mockResolvedValue([doc({ _id: 'd1', title: 'Visa guide', chunkCount: 4 })]);
    zest.replaceDocument.mockRejectedValue(new Error('No extractable text found in this PDF (it may be a scanned image). The existing document was left as it was.'));
    render(<ZestKnowledgePanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Replace the file for Visa guide' }));
    fireEvent.change(screen.getByLabelText('Replacement PDF'), { target: { files: [pdf()] } });

    expect((await screen.findByRole('alert')).textContent).toMatch(/left as it was/);
    expect(screen.getByText('4 sections')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replace the file for Visa guide' }).textContent).toMatch(/Replace file/);
  });
});

describe('Insights tab: what Zest is used for', () => {
  const analytics = (over: Record<string, unknown> = {}) => ({
    days: 30, total: 12, rated: 4, up: 3, down: 1, degraded: 0, toolUsage: [], unanswered: [], downvoted: [], ...over,
  });

  it('lists the lookups people ask for, most used first, in plain words', async () => {
    zest.analytics.mockResolvedValue(analytics({ toolUsage: [{ tool: 'my_status', count: 8 }, { tool: 'draft_followup_message', count: 2 }, { tool: 'brand_new_tool', count: 1 }] }));
    render(<ZestInsightsPanel />);
    expect(await screen.findByText('Student progress checks')).toBeTruthy();
    const labels = screen.getAllByText(/Student progress checks|Follow-up drafts|brand_new_tool/).map(e => e.textContent);
    expect(labels).toEqual(['Student progress checks', 'Follow-up drafts', 'brand_new_tool']); // an unknown tool still shows, by its own name
    expect(screen.getByText('8')).toBeTruthy();
  });

  it('says so when there were no lookups', async () => {
    zest.analytics.mockResolvedValue(analytics());
    render(<ZestInsightsPanel />);
    expect(await screen.findByText(/No live lookups in this period/)).toBeTruthy();
  });

  it('tells the admin when the AI was unavailable, and stays quiet when it never was', async () => {
    zest.analytics.mockResolvedValue(analytics({ degraded: 2 }));
    const view = render(<ZestInsightsPanel />);
    expect(await screen.findByText(/The AI was unavailable 2 times/)).toBeTruthy();
    view.unmount();

    zest.analytics.mockResolvedValue(analytics({ degraded: 0 }));
    render(<ZestInsightsPanel />);
    await waitFor(() => expect(screen.getByText('Questions asked')).toBeTruthy());
    expect(screen.queryByText(/The AI was unavailable/)).toBeNull();
  });

  it('still works with an older server reply that has no usage figures', async () => {
    zest.analytics.mockResolvedValue({ days: 30, total: 0, rated: 0, up: 0, down: 0, unanswered: [], downvoted: [] });
    render(<ZestInsightsPanel />);
    expect(await screen.findByText(/No live lookups in this period/)).toBeTruthy();
  });
});

describe('Log tab: query log', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'l1', question: 'Which countries offer the cheapest masters?', answer: 'Germany and Ireland have low fees.',
    userRole: 'guest', userName: 'Guest', userEmail: '', sourceDocCount: 1, createdAt: '2026-10-01T10:00:00Z', ...over,
  });

  it('lists each question with who asked it, including signed-out guests', async () => {
    zest.queryLogs.mockResolvedValue({
      logs: [row(), row({ id: 'l2', question: 'Where is my file?', userRole: 'student', userName: 'Asha' })],
      total: 2,
    });
    render(<ZestQueryLogPanel />);
    expect(await screen.findByText('Which countries offer the cheapest masters?')).toBeTruthy();
    expect(screen.getByText('Where is my file?')).toBeTruthy();
    expect(screen.getByText('(guest)')).toBeTruthy();
    expect(screen.getByText('(student)')).toBeTruthy();
    expect(zest.queryLogs).toHaveBeenCalledWith({ limit: 50 });
  });

  it('says so when nothing has been asked, and shows the error when loading fails', async () => {
    zest.queryLogs.mockResolvedValueOnce({ logs: [], total: 0 });
    const { unmount } = render(<ZestQueryLogPanel />);
    expect(await screen.findByText('No questions asked yet.')).toBeTruthy();
    unmount();

    zest.queryLogs.mockRejectedValueOnce(new Error('Forbidden'));
    render(<ZestQueryLogPanel />);
    expect((await screen.findByRole('alert')).textContent).toBe('Forbidden');
  });
});
