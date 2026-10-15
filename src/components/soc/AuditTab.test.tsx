import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { fakeSocket, deferred } from './testSupport';

const live = vi.hoisted(() => ({ socket: null as any, isLive: true, resyncKey: 0 }));
vi.mock('./SocketContext', () => ({ useSocSocket: () => live, useOnResync: () => {} }));
vi.mock('../../api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  return { ApiError, api: { soc: { piiAudit: vi.fn(), auditTrail: vi.fn(), verifyAuditTrail: vi.fn(), download: vi.fn() } } };
});

import { api, ApiError } from '../../api';
import AuditTab from './AuditTab';

const soc = api.soc as unknown as Record<string, ReturnType<typeof vi.fn>>;

const pii = (email: string) => ({
  topAccessors: [{ _id: 'a1', accessorEmail: email, accessorRole: 'counselor', totalAccesses: 3, uniqueApplicants: 2 }],
  recentAccesses: [],
});

describe('AuditTab', () => {
  beforeEach(() => {
    Object.values(soc).forEach(fn => fn.mockReset());
    live.socket = fakeSocket();
    soc.piiAudit.mockResolvedValue(pii('first@example.com'));
    soc.auditTrail.mockResolvedValue({ actions: [] });
    soc.verifyAuditTrail.mockResolvedValue({ ok: true, checked: 4, unchained: 0, brokenAt: null });
  });

  it('refreshes in place when a student record is viewed, instead of replacing the tab with a spinner', async () => {
    render(<AuditTab />);
    expect(await screen.findByText('first@example.com')).toBeInTheDocument();

    const refresh = deferred<any>();
    soc.piiAudit.mockReturnValueOnce(refresh.promise); // the pushed refresh is still in flight
    act(() => { live.socket.emit('pii_access'); });

    // Still showing the data it had, with no "Loading…" over the top of it
    expect(screen.getByText('first@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/Loading/)).toBeNull();

    await act(async () => { refresh.resolve(pii('second@example.com')); });
    expect(await screen.findByText('second@example.com')).toBeInTheDocument();
  });

  it('keeps what it has when a pushed refresh fails', async () => {
    render(<AuditTab />);
    await screen.findByText('first@example.com');

    soc.piiAudit.mockRejectedValueOnce(new ApiError('blip', 500));
    await act(async () => { live.socket.emit('pii_access'); });
    expect(screen.getByText('first@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says the tamper check could not be run, rather than showing nothing', async () => {
    soc.verifyAuditTrail.mockRejectedValue(new ApiError('verify failed', 500));
    render(<AuditTab />);
    expect(await screen.findByText('Tamper check unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/Tamper check passed/)).toBeNull();
  });

  it('shows a failed load with a retry', async () => {
    soc.piiAudit.mockRejectedValueOnce(new ApiError('pii store down', 503));
    render(<AuditTab />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/pii store down/);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
