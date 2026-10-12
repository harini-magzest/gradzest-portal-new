import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

const MIN = 60_000;
const IDLE = 30 * MIN;

const auth = vi.hoisted(() => ({
  user: null as any,
  session: null as any,
  logout: vi.fn(),
  extendSession: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

import SessionTimeoutDialog from './SessionTimeoutDialog';

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

function signIn(expiresInMs = 12 * 60 * MIN) {
  auth.user = { id: 'u1', role: 'counselor' };
  auth.session = { expiresAt: new Date(Date.now() + expiresInMs).toISOString(), idleTimeoutMs: IDLE };
}

describe('SessionTimeoutDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T09:00:00Z'));
    auth.user = null;
    auth.session = null;
    auth.logout.mockReset();
    auth.extendSession.mockReset();
    auth.extendSession.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('renders nothing when nobody is signed in', () => {
    const { container } = render(<SessionTimeoutDialog />);
    advance(2 * IDLE);
    expect(container).toBeEmptyDOMElement();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('renders nothing while the person is active', () => {
    signIn();
    const { container } = render(<SessionTimeoutDialog />);
    advance(10 * MIN);
    expect(container).toBeEmptyDOMElement();
  });

  it('asks "are you still there?" a minute before the idle limit, with the time left', () => {
    signIn();
    render(<SessionTimeoutDialog />);
    advance(IDLE - 45_000);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Are you still there?');
    expect(dialog).toHaveTextContent(/signed out in 0:45/);
    // Keyboard users land on the safe choice
    expect(screen.getByRole('button', { name: 'Stay signed in' })).toHaveFocus();
  });

  it('"Stay signed in" renews the session and dismisses the dialog', () => {
    signIn();
    render(<SessionTimeoutDialog />);
    advance(IDLE - 30_000);
    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }));
    expect(auth.extendSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('Escape counts as "I am still here"', () => {
    signIn();
    render(<SessionTimeoutDialog />);
    advance(IDLE - 30_000);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(auth.extendSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('"Sign out now" signs out without a time-limit reason', () => {
    signIn();
    render(<SessionTimeoutDialog />);
    advance(IDLE - 30_000);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out now' }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(auth.logout).toHaveBeenCalledWith();
  });

  it('signs out as "idle" when the minute runs out', () => {
    signIn();
    render(<SessionTimeoutDialog />);
    advance(IDLE + 2_000);
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(auth.logout).toHaveBeenCalledWith('idle');
  });

  it('shows a non-blocking banner when the session is about to reach its hard end', () => {
    signIn(4 * MIN);
    render(<SessionTimeoutDialog />);
    advance(1_000);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/sign-in ends in 3:59/);
  });

  it('signs out as "expired" at the hard end', () => {
    signIn(2 * MIN);
    render(<SessionTimeoutDialog />);
    advance(2 * MIN + 1_000);
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(auth.logout).toHaveBeenCalledWith('expired');
  });
});
