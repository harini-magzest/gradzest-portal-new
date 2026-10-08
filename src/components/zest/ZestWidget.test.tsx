import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ZestWidget from './ZestWidget';

vi.mock('../../api', () => ({
  api: {
    zest: {
      askStream: vi.fn(),
      askWithFile: vi.fn(),
      feedback: vi.fn(),
    },
  },
}));
import { api } from '../../api';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: 's1', role: 'student', name: 'Test Student' },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom doesn't implement scrollTo; the widget calls it to keep the chat scrolled to the bottom.
  Element.prototype.scrollTo = vi.fn();
});

async function openAndAsk(question: string) {
  render(<MemoryRouter><ZestWidget /></MemoryRouter>);
  await userEvent.click(screen.getByLabelText('Open Zest'));
  await userEvent.type(screen.getByPlaceholderText('Ask Zest a question...'), question);
  await userEvent.keyboard('{Enter}');
}

describe('ZestWidget renders Zest\'s Markdown instead of showing raw syntax', () => {
  it('renders **bold** and `code` as real elements, not literal asterisks/backticks', async () => {
    (api.zest.askStream as any).mockImplementation(async (_q: string, _h: unknown, onDelta: (d: string) => void) => {
      onDelta('You can check status under **Applications** (`/student/applications`).');
      return { answer: 'You can check status under **Applications** (`/student/applications`).', sources: [], logId: 'log1' };
    });

    await openAndAsk('Where are my applications?');

    const bold = await screen.findByText('Applications', { selector: 'strong' });
    expect(bold).toBeInTheDocument();
    expect(screen.getByText('/student/applications', { selector: 'code' })).toBeInTheDocument();
    // the raw markdown syntax itself must not appear anywhere in the bubble
    expect(screen.queryByText(/\*\*Applications\*\*/)).not.toBeInTheDocument();
  });

  it('still shows the user\'s own typed message as plain text, not parsed as Markdown', async () => {
    (api.zest.askStream as any).mockResolvedValue({ answer: 'ok', sources: [], logId: 'log2' });
    await openAndAsk('what about **this** question?');
    expect(screen.getByText('what about **this** question?')).toBeInTheDocument();
  });

  it('shows an error message as plain text even if it happens to contain Markdown-like characters', async () => {
    (api.zest.askStream as any).mockRejectedValue(new Error('Zest could not reach the *model* right now.'));
    await openAndAsk('anything');
    expect(await screen.findByText('Zest could not reach the *model* right now.')).toBeInTheDocument();
  });
});
