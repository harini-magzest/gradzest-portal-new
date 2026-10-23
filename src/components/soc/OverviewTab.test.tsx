import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { fakeSocket } from './testSupport';

const live = vi.hoisted(() => ({ socket: null as any, isLive: true, resyncKey: 0 }));
vi.mock('./SocketContext', () => ({ useSocSocket: () => live, useOnResync: () => {} }));
// Charts need layout the test DOM does not have; what is under test here is the data around them.
vi.mock('recharts', () => {
  const Nothing = () => null;
  return {
    AreaChart: Nothing, Area: Nothing, PieChart: Nothing, Pie: Nothing, Cell: Nothing, XAxis: Nothing, YAxis: Nothing,
    CartesianGrid: Nothing, Tooltip: Nothing, ResponsiveContainer: Nothing,
  };
});
vi.mock('./OverviewInsights', () => {
  const Nothing = () => null;
  return {
    deltaLabel: () => ({ text: '', up: null }),
    ResponseMetrics: Nothing, BacklogCard: Nothing, RuleEffectivenessCard: Nothing, TopIpsCard: Nothing, TargetedAccountsCard: Nothing, GeoCard: Nothing,
  };
});
vi.mock('./DeviceDetails', () => ({ default: () => null }));
vi.mock('../../api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  return { ApiError, api: { soc: { stats: vi.fn(), events: vi.fn(), download: vi.fn() } } };
});

import { api, ApiError } from '../../api';
import OverviewTab from './OverviewTab';

const soc = api.soc as unknown as Record<string, ReturnType<typeof vi.fn>>;

const stats = (failedLogins: number) => ({
  failedLogins, activeLockouts: 0, blockedRequests: 0, unauthorizedRequests: 0, uniqueIps: 3,
  series: [], severityBreakdown: {}, topIps: [],
});
const event = (over: Record<string, unknown> = {}) => ({
  _id: 'e1', type: 'login_failure', severity: 'medium', email: 'alice@example.com', ip: '203.0.113.9',
  message: 'Bad password', createdAt: new Date().toISOString(), ...over,
});

describe('OverviewTab', () => {
  beforeEach(() => {
    Object.values(soc).forEach(fn => fn.mockReset());
    live.socket = fakeSocket();
    soc.stats.mockResolvedValue(stats(7));
    soc.events.mockResolvedValue({ events: [], total: 0 });
  });

  it('shows why the live feed could not load, with a retry, instead of an empty feed', async () => {
    soc.events.mockRejectedValueOnce(new ApiError('feed store offline', 500));
    render(<OverviewTab />);
    expect(await screen.findByText(/feed store offline/)).toBeInTheDocument();
    expect(screen.queryByText('No security events yet')).toBeNull();

    soc.events.mockResolvedValueOnce({ events: [event({ message: 'Recovered row' })], total: 1 });
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText(/Recovered row/)).toBeInTheDocument();
  });

  it('does not leave the previous period\'s numbers on screen when the new period fails to load', async () => {
    render(<OverviewTab />);
    expect(await screen.findByText('Failed Logins')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();

    soc.stats.mockRejectedValueOnce(new ApiError('stats unavailable', 500));
    fireEvent.click(screen.getByRole('button', { name: '7 Days' }));
    expect(await screen.findByText(/stats unavailable/)).toBeInTheDocument();
    expect(screen.queryByText('Failed Logins')).toBeNull();
    expect(screen.getByRole('button', { name: '7 Days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the numbers it has when a background refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<OverviewTab />);
      expect(await screen.findByText('Failed Logins')).toBeInTheDocument();
      soc.stats.mockRejectedValue(new Error('Failed to fetch'));
      await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
      expect(soc.stats.mock.calls.length).toBeGreaterThan(1);
      expect(screen.getByText('Failed Logins')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('shows a pushed event once even when it is already in the loaded page', async () => {
    soc.events.mockResolvedValue({ events: [event({ message: 'Only once please' })], total: 1 });
    render(<OverviewTab />);
    expect(await screen.findByText(/Only once please/)).toBeInTheDocument();

    act(() => { live.socket.emit('security_event', event({ message: 'Only once please' })); });
    expect(screen.getAllByText(/Only once please/)).toHaveLength(1);

    act(() => { live.socket.emit('security_event', event({ _id: 'e2', message: 'A different one' })); });
    expect(screen.getByText(/A different one/)).toBeInTheDocument();
  });

  it('says when filters, not an empty system, are why there is nothing to show', async () => {
    render(<OverviewTab />);
    expect(await screen.findByText('No security events yet')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search the live feed'), { target: { value: 'nobody' } });
    expect(await screen.findByText('No events match these filters')).toBeInTheDocument();
  });

  it('names the feed controls for assistive technology', async () => {
    render(<OverviewTab />);
    await screen.findByText('Failed Logins');
    const pause = screen.getByRole('button', { name: 'Pause feed' });
    expect(pause).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pause);
    expect(screen.getByRole('button', { name: 'Resume feed' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Clear feed' })).toBeInTheDocument();
  });
});
