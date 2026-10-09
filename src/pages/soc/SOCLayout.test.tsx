import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const auth = vi.hoisted(() => ({ user: null as any, isAuthenticated: false, loading: false, logout: () => {} }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  return { ApiError, api: { soc: { access: vi.fn() } } };
});

import { api, ApiError } from '../../api';
import SOCLayout from './SOCLayout';

const access = api.soc.access as unknown as ReturnType<typeof vi.fn>;

function renderSoc() {
  return render(
    <MemoryRouter initialEntries={['/soc']}>
      <Routes>
        <Route path="/soc" element={<SOCLayout />}>
          <Route index element={<p>SOC content</p>} />
        </Route>
        <Route path="/admin" element={<p>Admin home</p>} />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const asAdmin = (extra: object = {}) => {
  auth.isAuthenticated = true;
  auth.user = { name: 'Hameed', role: 'admin', ...extra };
};

describe('SOCLayout: only the SOC owner gets in', () => {
  beforeEach(() => {
    access.mockReset();
    auth.user = null;
    auth.isAuthenticated = false;
    auth.loading = false;
  });

  it('shows the SOC to the owner, with the top bar naming the product and not repeating the page title', async () => {
    asAdmin();
    access.mockResolvedValue({ ok: true });
    renderSoc();
    expect(await screen.findByText('SOC content')).toBeInTheDocument();
    expect(screen.getByText('Gradzest SOC')).toBeInTheDocument();
    expect(screen.queryByText('Security Operations Center')).toBeNull();
    expect(screen.getByText(/Hameed · analyst/)).toBeInTheDocument();
  });

  it('sends an admin who is not the owner back to the admin area, without drawing any SOC', async () => {
    asAdmin();
    access.mockRejectedValue(new ApiError('Not authorised for the SOC', 403));
    renderSoc();
    expect(await screen.findByText('Admin home')).toBeInTheDocument();
    expect(screen.queryByText('SOC content')).toBeNull();
    expect(screen.queryByText('Gradzest SOC')).toBeNull();
  });

  it('draws nothing while it is still asking the server', () => {
    asAdmin();
    access.mockReturnValue(new Promise(() => {})); // never answers
    renderSoc();
    expect(screen.queryByText('SOC content')).toBeNull();
    expect(screen.queryByText('Admin home')).toBeNull();
  });

  it('still shows the page on a network or server error: only an explicit refusal sends someone away', async () => {
    asAdmin();
    access.mockRejectedValue(new Error('Failed to fetch'));
    renderSoc();
    expect(await screen.findByText('SOC content')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to the login page without asking the server', async () => {
    renderSoc();
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(access).not.toHaveBeenCalled();
  });

  it('sends an Application Team account to the login page without asking the server', async () => {
    asAdmin({ isAppTeam: true });
    renderSoc();
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(access).not.toHaveBeenCalled();
  });

  it('sends a counselor or student to the login page without asking the server', async () => {
    auth.isAuthenticated = true;
    auth.user = { name: 'Kavitha', role: 'counselor' };
    renderSoc();
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    await waitFor(() => expect(access).not.toHaveBeenCalled());
  });
});
