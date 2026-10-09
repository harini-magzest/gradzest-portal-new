import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import NotificationPermissionPrompt, { NotificationNavigator } from './NotificationPermissionPrompt';
import { claimNotification, showDeviceNotification, NAVIGATE_EVENT } from '../lib/deviceNotifications';

const auth = vi.hoisted(() => ({ isAuthenticated: true }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

// A stand-in for the browser's Notification API
class FakeNotification {
  static permission: NotificationPermission = 'default';
  static nextAnswer: NotificationPermission = 'granted';
  static requestPermission = vi.fn(async () => { FakeNotification.permission = FakeNotification.nextAnswer; return FakeNotification.permission; });
  static instances: FakeNotification[] = [];
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(public title: string, public options: NotificationOptions = {}) { FakeNotification.instances.push(this); }
}

function setPageState(visible: boolean, focused: boolean) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (visible ? 'visible' : 'hidden') });
  vi.spyOn(document, 'hasFocus').mockReturnValue(focused);
}

beforeEach(() => {
  FakeNotification.permission = 'default';
  FakeNotification.nextAnswer = 'granted';
  FakeNotification.instances = [];
  FakeNotification.requestPermission.mockClear();
  vi.stubGlobal('Notification', FakeNotification);
  localStorage.clear();
  auth.isAuthenticated = true;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}><NotificationPermissionPrompt /></MemoryRouter>,
);
const prompt = () => screen.queryByRole('dialog', { name: /notifications/i });

describe('asking for device notifications', () => {
  it('asks a signed-in user on their dashboard, but not on public pages or when signed out', () => {
    const { unmount } = renderAt('/student');
    expect(prompt()).toBeInTheDocument();
    unmount();

    const pub = renderAt('/universities');
    expect(prompt()).not.toBeInTheDocument();
    pub.unmount();

    auth.isAuthenticated = false;
    renderAt('/admin');
    expect(prompt()).not.toBeInTheDocument();
  });

  it('does not ask again once the device has already decided', () => {
    FakeNotification.permission = 'granted';
    renderAt('/counselor');
    expect(prompt()).not.toBeInTheDocument();
  });

  it('Allow asks the browser from the click, then confirms with a device notification', async () => {
    renderAt('/admin/students');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Allow' })); });
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(FakeNotification.instances.map(n => n.title)).toEqual(['Notifications are on']);
    await waitFor(() => expect(prompt()).not.toBeInTheDocument());
  });

  it('explains how to unblock when the person blocks notifications', async () => {
    FakeNotification.nextAnswer = 'denied';
    renderAt('/student');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Allow' })); });
    expect(screen.getByText('Notifications are blocked')).toBeInTheDocument();
  });

  it('"Not now" hides it and it stays hidden for a few days', () => {
    const first = renderAt('/student');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(prompt()).not.toBeInTheDocument();
    first.unmount();
    renderAt('/student');
    expect(prompt()).not.toBeInTheDocument();
  });
});

describe('device pop-ups', () => {
  it('shows nothing without permission, or while the person is looking at the app', () => {
    setPageState(false, false);
    showDeviceNotification({ id: 'a', title: 'T', message: 'M' });
    expect(FakeNotification.instances).toHaveLength(0);

    FakeNotification.permission = 'granted';
    setPageState(true, true);
    showDeviceNotification({ id: 'b', title: 'T', message: 'M' });
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('pops up when the app is in the background; urgent ones stay; a click opens the link', () => {
    FakeNotification.permission = 'granted';
    setPageState(false, false);
    const opened: string[] = [];
    const onNavigate = (e: Event) => opened.push((e as CustomEvent<string>).detail);
    window.addEventListener(NAVIGATE_EVENT, onNavigate);
    vi.spyOn(window, 'focus').mockImplementation(() => {});

    showDeviceNotification({ id: 'n1', title: 'New Task Assigned', message: 'Call Aryan', link: '/counselor/activities', urgent: true });
    const [popup] = FakeNotification.instances;
    expect(popup.title).toBe('New Task Assigned');
    expect(popup.options).toMatchObject({ body: 'Call Aryan', tag: 'n1', requireInteraction: true });

    popup.onclick?.();
    expect(opened).toEqual(['/counselor/activities']);
    expect(popup.close).toHaveBeenCalled();
    window.removeEventListener(NAVIGATE_EVENT, onNavigate);
  });

  it('only one open tab claims each notification (one sound, one pop-up, one saved copy)', () => {
    expect(claimNotification('evt-1')).toBe(true);
    expect(claimNotification('evt-1')).toBe(false);
    expect(claimNotification('evt-2')).toBe(true);
  });

  it('a clicked pop-up navigates inside the app', () => {
    function Where() { return <p data-testid="path">{useLocation().pathname}</p>; }
    render(<MemoryRouter initialEntries={['/student']}><NotificationNavigator /><Where /></MemoryRouter>);
    act(() => { window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: '/student/meetings' })); });
    expect(screen.getByTestId('path')).toHaveTextContent('/student/meetings');
  });
});
