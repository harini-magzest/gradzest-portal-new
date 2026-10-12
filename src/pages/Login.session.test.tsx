import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Login from './Login';
import { setLogoutReason, LOGOUT_MESSAGES } from '../lib/sessionLogout';

const { login, verifyTwoFactor, toast } = vi.hoisted(() => ({
  login: vi.fn(),
  verifyTwoFactor: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login, verifyTwoFactor }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ toast }) }));
// The code entry has its own tests; here it only needs to hand a code to the page
vi.mock('../components/TwoFactorStep', () => ({
  default: ({ onSubmit }: { onSubmit: (code: string) => void }) => (
    <button type="button" onClick={() => onSubmit('123456')}>Submit code</button>
  ),
}));

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter>,
);

async function submitPassword() {
  await userEvent.type(screen.getByPlaceholderText('your@email.com'), 'sam@example.com');
  await userEvent.type(screen.getByPlaceholderText('••••••••'), 'a-good-password');
  await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));
}

describe('Login: why you were signed out', () => {
  beforeEach(() => { vi.clearAllMocks(); setLogoutReason(null); });

  it('says so when an inactivity limit ended the session', () => {
    setLogoutReason('idle');
    renderAt('/login');
    expect(screen.getByRole('status')).toHaveTextContent(LOGOUT_MESSAGES.idle);
  });

  it('says so when the session reached its time limit', () => {
    setLogoutReason('expired');
    renderAt('/login');
    expect(screen.getByRole('status')).toHaveTextContent(LOGOUT_MESSAGES.expired);
  });

  it('shows the explanation once: a reload of the page does not repeat it', () => {
    setLogoutReason('idle');
    renderAt('/login');
    expect(screen.getByRole('status')).toBeInTheDocument();
    renderAt('/login'); // a fresh mount reads the (now forgotten) reason
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('shows nothing for an ordinary visit to the sign-in page', () => {
    renderAt('/login');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Login: ?redirect= stays inside the site, on both sign-in steps', () => {
  beforeEach(() => { vi.clearAllMocks(); setLogoutReason(null); });

  it('after the password step, follows a same-site path', async () => {
    login.mockResolvedValue({ success: true, role: 'student' });
    renderAt('/login?redirect=%2Fstudent%2Fchat');
    await submitPassword();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/student/chat'));
  });

  it('after the password step, ignores an off-site address', async () => {
    login.mockResolvedValue({ success: true, role: 'student' });
    renderAt('/login?redirect=https%3A%2F%2Fevil.example');
    await submitPassword();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/student'));
  });

  it('after the two-step code, follows a same-site path', async () => {
    login.mockResolvedValue({ success: false, twoFactor: { challengeToken: 'c1' } });
    verifyTwoFactor.mockResolvedValue({ success: true, role: 'counselor' });
    renderAt('/login?redirect=%2Fcounselor%2Fleads');
    await submitPassword();
    await userEvent.click(await screen.findByRole('button', { name: 'Submit code' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/counselor/leads'));
  });

  it.each([
    ['an absolute URL', 'https%3A%2F%2Fevil.example%2Fphish'],
    ['a protocol-relative URL', '%2F%2Fevil.example'],
    ['a backslash trick', '%2F%5Cevil.example'],
    ['a javascript: URL', 'javascript%3Aalert(1)'],
  ])('after the two-step code, ignores %s', async (_label, encoded) => {
    login.mockResolvedValue({ success: false, twoFactor: { challengeToken: 'c1' } });
    verifyTwoFactor.mockResolvedValue({ success: true, role: 'counselor' });
    renderAt(`/login?redirect=${encoded}`);
    await submitPassword();
    await userEvent.click(await screen.findByRole('button', { name: 'Submit code' }));
    // lands on the role's own home, never on the supplied address
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/counselor'));
    expect(screen.getByTestId('where')).not.toHaveTextContent('evil');
  });
});
