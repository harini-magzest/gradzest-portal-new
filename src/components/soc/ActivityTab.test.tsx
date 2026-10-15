import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { fakeSocket } from './testSupport';

const live = vi.hoisted(() => ({ socket: null as any, isLive: true, resyncKey: 0 }));
vi.mock('./SocketContext', () => ({ useSocSocket: () => live, useOnResync: () => {} }));
vi.mock('./FeatureUsage', () => ({ default: () => null }));
vi.mock('../../api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  return { ApiError, api: { soc: { uiActivity: vi.fn(), download: vi.fn() } } };
});

import { api, ApiError } from '../../api';
import ActivityTab, { matches } from './ActivityTab';

const uiActivity = api.soc.uiActivity as unknown as ReturnType<typeof vi.fn>;

const row = (over: Record<string, unknown> = {}) => ({
  _id: 'r1', userId: 'u1', email: 'staff@example.com', name: 'Staff Member', role: 'counselor', kind: 'page_view',
  page: '/counselor/students', createdAt: new Date().toISOString(), ...over,
});

const NO_FILTERS = { email: '', kind: 'all', page: '', q: '' };

describe('matches (live rows against the active filters)', () => {
  it('does not throw for a signed-out visitor, who has no email', () => {
    const visitor = { _id: 'v', userId: '', role: 'visitor', kind: 'page_view', createdAt: '' } as any;
    expect(() => matches(visitor, { ...NO_FILTERS, email: 'ann' })).not.toThrow();
    expect(matches(visitor, { ...NO_FILTERS, email: 'ann' })).toBe(false);
    expect(matches(visitor, { ...NO_FILTERS, page: '/x' })).toBe(false);
    expect(matches(visitor, NO_FILTERS)).toBe(true);
  });

  it('matches the exact email (as the server does: addresses are stored encrypted), an action and a page fragment', () => {
    const r = row() as any;
    expect(matches(r, { ...NO_FILTERS, email: ' STAFF@example.com ' })).toBe(true);
    expect(matches(r, { ...NO_FILTERS, email: 'STAFF' })).toBe(false); // not a prefix search: the server could not run one either
    expect(matches(r, { ...NO_FILTERS, kind: 'click' })).toBe(false);
    expect(matches(r, { ...NO_FILTERS, page: 'students' })).toBe(true);
  });
});

describe('ActivityTab trail', () => {
  beforeEach(() => {
    uiActivity.mockReset();
    live.socket = fakeSocket();
    uiActivity.mockResolvedValue({ activity: [row({ name: 'Already Loaded' })], total: 1, trackedRoles: ['counselor'] });
  });

  async function openTrail() {
    render(<ActivityTab onInvestigateUser={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Activity trail' }));
    await screen.findByText('Already Loaded');
  }

  it('shows a pushed row once even when it was already in the loaded page', async () => {
    await openTrail();
    act(() => { live.socket.emit('ui_activity', [row({ name: 'Already Loaded' })]); });
    expect(screen.getAllByText('Already Loaded')).toHaveLength(1);
  });

  it('keeps showing live rows after one with no email arrives', async () => {
    await openTrail();
    act(() => { live.socket.emit('ui_activity', [row({ _id: 'v1', email: undefined, name: undefined, userId: '', role: 'visitor' })]); });
    expect(screen.getByText('Signed-out visitor')).toBeInTheDocument();
    act(() => { live.socket.emit('ui_activity', [row({ _id: 'r2', name: 'Next Person' })]); });
    expect(screen.getByText('Next Person')).toBeInTheDocument();
  });

  it('keeps the rows on screen when "Load more" fails', async () => {
    uiActivity.mockReset();
    uiActivity.mockResolvedValueOnce({ activity: [row({ name: 'Already Loaded' })], total: 5, trackedRoles: [] });
    await openTrail();
    uiActivity.mockRejectedValueOnce(new ApiError('trail store offline', 500));
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/trail store offline/);
    expect(screen.getByText('Already Loaded')).toBeInTheDocument();
  });
});
