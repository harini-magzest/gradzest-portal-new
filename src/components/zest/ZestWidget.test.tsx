import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import ZestWidget from './ZestWidget';

const auth = vi.hoisted(() => ({ user: null as any, isAuthenticated: false, loading: false }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

const noNotifications = vi.hoisted(() => ({ notifications: [] as any[] }));
vi.mock('../../context/NotificationContext', () => ({ useNotifications: () => noNotifications }));

const zest = vi.hoisted(() => ({
  askStream: vi.fn(), askWithFile: vi.fn(), feedback: vi.fn(),
  documents: vi.fn(), analytics: vi.fn(), alerts: vi.fn(), resolveAlert: vi.fn(), downloadAlerts: vi.fn(),
}));
vi.mock('../../api', () => ({ api: { zest } }));

const student = { id: 's1', role: 'student', name: 'Sam' };
const counselor = { id: 'c1', role: 'counselor', name: 'Cora' };
const admin = { id: 'a1', role: 'admin', name: 'Ada' };
const appTeam = { id: 'a2', role: 'admin', name: 'App', isAppTeam: true };

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname}{l.search}</p>;
}

const tree = (path: string) => <MemoryRouter initialEntries={[path]}><ZestWidget /><Where /></MemoryRouter>;

function signIn(user: any, loading = false) {
  auth.user = user;
  auth.isAuthenticated = !!user;
  auth.loading = loading;
}

function renderAt(path: string, user: any) {
  signIn(user);
  return render(tree(path));
}

const savedKeys = () => Object.keys(sessionStorage).filter(k => k.startsWith('gz_zest_chat_'));

const ask = (text: string) => {
  fireEvent.change(screen.getByPlaceholderText('Ask Zest a question...'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
};

const alert = {
  id: 'al1', alertType: 'stale', severity: 'urgent', detail: 'No movement in 9 days',
  flaggedOn: new Date().toISOString(), leadName: 'Asha Lead', leadEmail: 'asha@example.com', counselorName: 'Ravi',
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  signIn(null);
  // jsdom has no Element.scrollTo; the panel scrolls to the newest message with it.
  Element.prototype.scrollTo = vi.fn();
  zest.askStream.mockImplementation(async (_q: string, _h: unknown, onDelta: (t: string) => void) => {
    onDelta('Here is');
    return { answer: 'Here is your draft', sources: [], logId: 'log1' };
  });
  zest.documents.mockResolvedValue([]);
  zest.alerts.mockResolvedValue([alert]);
  zest.analytics.mockResolvedValue({ days: 30, total: 0, rated: 0, up: 0, down: 0, unanswered: [], downvoted: [] });
});

describe('ZestWidget: who sees what', () => {
  it('shows nothing to a signed-out visitor, or on the SOC pages', () => {
    const { container } = renderAt('/', null);
    expect(container.querySelector('button')).toBeNull();
    renderAt('/soc', counselor);
    expect(screen.queryByRole('button', { name: 'Open Zest' })).toBeNull();
  });

  it.each([['a student', student], ['a counselor', counselor], ['an app-team admin', appTeam]])(
    'gives %s the chat only, with no management tabs',
    (_label, user) => {
      renderAt('/', user);
      expect(screen.getByRole('button', { name: 'Open Zest' })).toBeTruthy();
      expect(screen.queryByRole('tablist')).toBeNull();
    },
  );

  it('gives an admin Chat, Knowledge, Insights and Alerts tabs inside the panel', () => {
    renderAt('/admin', admin);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Chat', 'Knowledge', 'Insights', 'Alerts']);
  });

  it('does not push suggested questions on anyone', () => {
    for (const user of [student, counselor, admin]) {
      const { unmount } = renderAt('/', user);
      expect(screen.queryByLabelText('Suggestions')).toBeNull();
      expect(screen.queryByRole('button', { name: /waiting for my reply|application status|How is Zest doing/ })).toBeNull();
      unmount();
    }
  });
});

describe('ZestWidget: asking', () => {
  it('sends what the person types and shows the streamed answer', async () => {
    renderAt('/', counselor);
    ask('Who is waiting for my reply in chat?');
    expect(await screen.findByText('Here is your draft')).toBeTruthy();
    // text pieces, and (new) a callback for the "Checking your students…" notes
    expect(zest.askStream).toHaveBeenCalledWith('Who is waiting for my reply in chat?', [], expect.any(Function), expect.any(Function));
    expect((screen.getByPlaceholderText('Ask Zest a question...') as HTMLInputElement).value).toBe('');
  });

  it('copies an answer so a draft can be pasted into email, WhatsApp or chat', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderAt('/', counselor);
    ask('Which students are stuck?');
    await screen.findByText('Here is your draft');

    fireEvent.click(await screen.findByRole('button', { name: 'Copy answer' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Here is your draft'));
    expect(await screen.findByText('Copied')).toBeTruthy();
  });
});

describe('ZestWidget: admin tabs', () => {
  it('loads the lead alerts when the Alerts tab is opened', async () => {
    renderAt('/admin', admin);
    expect(zest.alerts).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Alerts' }));
    expect(await screen.findByText('Asha Lead')).toBeTruthy();
    expect(screen.getByText('No movement in 9 days')).toBeTruthy();
  });

  it('opens on the Alerts tab from a /admin?zest=alerts link, then tidies the address', async () => {
    renderAt('/admin?zest=alerts', admin);
    expect(await screen.findByText('Asha Lead')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Alerts' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/admin'));
  });

  it('keeps other query parameters when it tidies the address', async () => {
    renderAt('/admin/settings?section=users&zest=knowledge', admin);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/admin/settings?section=users'));
    expect(screen.getByRole('tab', { name: 'Knowledge' }).getAttribute('aria-selected')).toBe('true');
  });

  it('ignores the link for someone who cannot manage Zest, and still tidies the address', async () => {
    renderAt('/counselor?zest=alerts', counselor);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/counselor'));
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(zest.alerts).not.toHaveBeenCalled();
  });

  it('lets an admin resolve an alert, and removes it from the list', async () => {
    zest.alerts.mockResolvedValue([alert]);
    zest.resolveAlert.mockResolvedValue({});
    renderAt('/admin?zest=alerts', admin);
    await screen.findByText('Asha Lead');
    fireEvent.click(screen.getByRole('button', { name: /Resolve/ }));
    await waitFor(() => expect(screen.queryByText('Asha Lead')).toBeNull());
    expect(zest.resolveAlert).toHaveBeenCalledWith('al1');
  });
});

describe('ZestWidget: remembering the conversation', () => {
  it('brings the conversation back after a reload, for the same person', async () => {
    const first = renderAt('/', counselor);
    ask('Which students are stuck?');
    await screen.findByText('Here is your draft');
    await waitFor(() => expect(sessionStorage.getItem('gz_zest_chat_c1')).toContain('Here is your draft'));
    first.unmount();

    renderAt('/', counselor);
    expect(await screen.findByText('Here is your draft')).toBeTruthy();
    expect(screen.getByText('Which students are stuck?')).toBeTruthy();
  });

  it('sends the restored messages as history, so a follow-up question still makes sense', async () => {
    const first = renderAt('/', counselor);
    ask('Which students are stuck?');
    await screen.findByText('Here is your draft');
    await waitFor(() => expect(sessionStorage.getItem('gz_zest_chat_c1')).toBeTruthy());
    first.unmount();

    renderAt('/', counselor);
    await screen.findByText('Here is your draft');
    ask('And the first one?');
    await waitFor(() => expect(zest.askStream).toHaveBeenCalledTimes(2));
    expect(zest.askStream.mock.calls[1][1]).toEqual([
      { role: 'user', text: 'Which students are stuck?' },
      { role: 'assistant', text: 'Here is your draft' },
    ]);
  });

  it("never shows one person's conversation to another in the same tab", async () => {
    const first = renderAt('/', counselor);
    ask('Which students are stuck?');
    await screen.findByText('Here is your draft');
    await waitFor(() => expect(savedKeys()).toEqual(['gz_zest_chat_c1']));
    first.unmount();

    renderAt('/', admin);
    expect(screen.queryByText('Which students are stuck?')).toBeNull();
    expect(screen.queryByText('Here is your draft')).toBeNull();
  });

  it('wipes every saved conversation when the person signs out', async () => {
    const view = renderAt('/', counselor);
    ask('Which students are stuck?');
    await screen.findByText('Here is your draft');
    await waitFor(() => expect(savedKeys()).toHaveLength(1));

    signIn(null);
    view.rerender(tree('/'));
    await waitFor(() => expect(savedKeys()).toEqual([]));
  });

  it('does not mistake a session still being restored for a sign-out', async () => {
    sessionStorage.setItem('gz_zest_chat_c1', JSON.stringify([
      { id: 'u-1', role: 'user', text: 'Earlier question' }, { id: 'a-1', role: 'assistant', text: 'Earlier answer' },
    ]));
    signIn(null, true); // reload: the user is not known yet, but the session is being restored
    const view = render(tree('/'));
    expect(sessionStorage.getItem('gz_zest_chat_c1')).toContain('Earlier answer');

    signIn(counselor); // restored
    view.rerender(tree('/'));
    expect(await screen.findByText('Earlier answer')).toBeTruthy();
  });

  it('starts over with New chat, and forgets the saved copy', async () => {
    renderAt('/', counselor);
    expect(screen.queryByRole('button', { name: 'New chat' })).toBeNull(); // nothing to clear yet
    ask('Which students are stuck?');
    await screen.findByText('Here is your draft');
    await waitFor(() => expect(savedKeys()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(screen.queryByText('Here is your draft')).toBeNull();
    await waitFor(() => expect(savedKeys()).toEqual([]));
  });

  it('keeps nothing from an answer that failed, and ignores damaged saved data', async () => {
    sessionStorage.setItem('gz_zest_chat_c1', '{not json');
    zest.askStream.mockRejectedValue(new Error('Zest could not answer right now.'));
    renderAt('/', counselor);
    ask('Will this fail?');
    await screen.findByText('Zest could not answer right now.');
    await waitFor(() => expect(sessionStorage.getItem('gz_zest_chat_c1')).toContain('Will this fail?'));
    expect(sessionStorage.getItem('gz_zest_chat_c1')).not.toContain('could not answer');
  });
});

describe('ZestWidget: showing what Zest is doing', () => {
  it('shows the lookup in plain words while Zest works, and clears it once the answer arrives', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    zest.askStream.mockImplementation(async (_q: string, _h: unknown, onDelta: (t: string) => void, onStatus?: (t: string) => void) => {
      onStatus?.('Checking your students…');
      await gate;
      onDelta('Here is');
      return { answer: 'Here is your answer', sources: [], logId: 'log2' };
    });
    renderAt('/', counselor);
    ask('Who is stuck?');

    expect(await screen.findByText('Checking your students…')).toBeTruthy();
    release();
    expect(await screen.findByText('Here is your answer')).toBeTruthy();
    expect(screen.queryByText('Checking your students…')).toBeNull();
  });
});
