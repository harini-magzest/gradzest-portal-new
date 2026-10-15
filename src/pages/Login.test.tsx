import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';

const { login, toast } = vi.hoisted(() => ({
  login: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ toast }) }));

const renderLogin = () => render(<MemoryRouter><Login /></MemoryRouter>);
const adminButton = () => screen.getAllByRole('button').find((b) => b.textContent?.includes('admin@eduabroad.com'))!;

describe('Login demo accounts', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it('lists the demo logins in development', () => {
    renderLogin();
    expect(screen.getByText('Demo Accounts')).toBeInTheDocument();
    expect(screen.getAllByText('admin@eduabroad.com').length).toBeGreaterThan(0);
  });

  it('shows no demo logins outside development', () => {
    vi.stubEnv('DEV', false);
    renderLogin();
    expect(screen.queryByText('Demo Accounts')).not.toBeInTheDocument();
  });

  it('without VITE_DEMO_PASSWORD a demo button only fills in the email', async () => {
    vi.stubEnv('VITE_DEMO_PASSWORD', '');
    renderLogin();
    await userEvent.click(adminButton());
    expect(login).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('admin@eduabroad.com')).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalled();
  });

  it('with VITE_DEMO_PASSWORD a demo button signs in with it', async () => {
    vi.stubEnv('VITE_DEMO_PASSWORD', 'local-dev-password');
    login.mockResolvedValue({ success: false, message: 'nope' });
    renderLogin();
    await userEvent.click(adminButton());
    expect(login).toHaveBeenCalledWith('admin@eduabroad.com', 'local-dev-password');
  });
});
