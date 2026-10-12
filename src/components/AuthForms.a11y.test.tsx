import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// The sign-in and password forms are the one place everybody has to use. These find each field by its label (which is what a
// screen reader announces, and what clicking the label focuses), so a label that is not wired to its input fails here.

const modal = vi.hoisted(() => ({ isOpen: true, tab: 'login' as 'login' | 'register', close: vi.fn(), setTab: vi.fn() }));
vi.mock('../context/AuthModalContext', () => ({ useAuthModal: () => modal }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), verifyTwoFactor: vi.fn(), refreshUser: vi.fn(), logout: vi.fn() }),
}));
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }),
}));

import Login from '../pages/Login';
import ForgotPassword from '../pages/ForgotPassword';
import ResetPassword from '../pages/ResetPassword';
import AuthModal from './AuthModal';

const at = (ui: React.ReactElement, url = '/') => render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);

describe('sign-in page', () => {
  it('has its fields named by their labels', () => {
    at(<Login />, '/login');
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('clicking a label puts the cursor in its field', async () => {
    at(<Login />, '/login');
    await userEvent.click(screen.getByText('Email Address'));
    expect(screen.getByLabelText('Email Address')).toHaveFocus();
  });

  it('names the show/hide button and reports its state', async () => {
    at(<Login />, '/login');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('forgot-password page', () => {
  it('has its email field named by its label', () => {
    at(<ForgotPassword />, '/forgot-password');
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('type', 'email');
  });
});

describe('reset-password page', () => {
  it('has both fields named by their labels, and a named toggle for each', async () => {
    at(<ResetPassword />, '/reset-password?token=abc123');
    expect(screen.getByLabelText('New Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirm Password')).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('New Password')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Confirm Password')).toHaveAttribute('type', 'password'); // independent
    await userEvent.click(screen.getByRole('button', { name: 'Show password confirmation' }));
    expect(screen.getByLabelText('Confirm Password')).toHaveAttribute('type', 'text');
  });
});

describe('sign-in / create-account dialog', () => {
  beforeEach(() => { modal.isOpen = true; modal.tab = 'login'; modal.close.mockReset(); modal.setTab.mockReset(); });

  it('is a modal dialog with a name', () => {
    at(<AuthModal />);
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toHaveAttribute('aria-modal', 'true');
  });

  it('names the dialog after the tab that is showing', () => {
    modal.tab = 'register';
    at(<AuthModal />);
    expect(screen.getByRole('dialog', { name: 'Create account' })).toBeInTheDocument();
  });

  it('labels the sign-in fields', () => {
    at(<AuthModal />);
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
  });

  it('labels every create-account field', () => {
    modal.tab = 'register';
    at(<AuthModal />);
    expect(screen.getByLabelText('Full Name')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirm Password')).toHaveAttribute('type', 'password');
  });

  it('closes on Escape, and does not listen while it is closed', () => {
    const { unmount } = at(<AuthModal />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(modal.close).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'a' });
    expect(modal.close).toHaveBeenCalledTimes(1);
    unmount();

    modal.isOpen = false;
    at(<AuthModal />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(modal.close).toHaveBeenCalledTimes(1);
  });
});
