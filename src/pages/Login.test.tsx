import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login: vi.fn() }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ toast: { success: vi.fn(), error: vi.fn() } }) }));

const renderLogin = () => render(<MemoryRouter><Login /></MemoryRouter>);

describe('Login demo accounts', () => {
  afterEach(() => vi.unstubAllEnvs());

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
});
