// NotificationProvider keeps a copy of the signed-in user's list in localStorage, for when the server can't be reached.
// That copy holds student names and application news, so it is forgotten at sign-out: the next person on a shared
// computer must not be able to read it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NotificationProvider, useNotifications } from './NotificationContext';

const auth = vi.hoisted(() => ({ user: null as any, isAuthenticated: false, loading: false }));
vi.mock('./AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../api', () => ({ API_ORIGIN: '', getApiToken: () => 'token' }));
vi.mock('socket.io-client', () => ({ io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn(), connected: false }) }));
vi.mock('../lib/deviceNotifications', () => ({ claimNotification: () => false, playNotificationSound: vi.fn(), showDeviceNotification: vi.fn() }));

const counselor = { id: 'c1', role: 'counselor', name: 'Asha' };
const fromServer = { _id: 'n1', type: 'student', priority: 'normal', title: 'Ravi was assigned to you', message: 'New student', createdAt: '2026-10-01T10:00:00Z', read: false };

function signIn(user: any, loading = false) {
  auth.user = user;
  auth.isAuthenticated = !!user;
  auth.loading = loading;
}

function Titles() {
  const { notifications } = useNotifications();
  return <ul>{notifications.map(n => <li key={n.id}>{n.title}</li>)}</ul>;
}
const tree = () => <NotificationProvider><Titles /></NotificationProvider>;
const cachedKeys = () => Object.keys(localStorage).filter(k => k.startsWith('gradzest_notifications'));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [fromServer] })));
});
afterEach(() => { vi.unstubAllGlobals(); signIn(null); });

describe('the cached notification list', () => {
  it('is kept while the user is signed in, and forgotten when they sign out', async () => {
    signIn(counselor);
    const view = render(tree());
    expect(await screen.findByText('Ravi was assigned to you')).toBeTruthy();
    await waitFor(() => expect(localStorage.getItem('gradzest_notifications_c1')).toContain('Ravi was assigned to you'));

    signIn(null);
    view.rerender(tree());
    await waitFor(() => expect(cachedKeys()).toEqual([]));
    expect(screen.queryByText('Ravi was assigned to you')).toBeNull();
  });

  it('is never copied anywhere while no one is signed in', async () => {
    localStorage.setItem('gradzest_notifications', JSON.stringify([{ ...fromServer, id: 'old', timestamp: fromServer.createdAt }]));
    render(tree());
    await waitFor(() => expect(cachedKeys()).toEqual([]));
    expect(screen.queryByText('Ravi was assigned to you')).toBeNull();
  });

  it('is not mistaken for a sign-out while a reload restores the session', async () => {
    localStorage.setItem('gradzest_notifications_c1', JSON.stringify([{ ...fromServer, id: 'n1', timestamp: fromServer.createdAt }]));
    signIn(null, true); // reload: the user is not known yet, but the session is being restored
    const view = render(tree());
    expect(localStorage.getItem('gradzest_notifications_c1')).toContain('Ravi was assigned to you');

    signIn(counselor); // restored
    view.rerender(tree());
    expect(await screen.findByText('Ravi was assigned to you')).toBeTruthy();
    await waitFor(() => expect(localStorage.getItem('gradzest_notifications_c1')).toContain('Ravi was assigned to you'));
  });
});
