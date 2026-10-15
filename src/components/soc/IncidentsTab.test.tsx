import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fakeSocket, deferred, incident } from './testSupport';

const live = vi.hoisted(() => ({ socket: null as any, isLive: true, resyncKey: 0 }));
vi.mock('./SocketContext', () => ({ useSocSocket: () => live, useOnResync: () => {} }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Me' } }) }));
vi.mock('./IncidentContext', () => ({ default: () => null }));
vi.mock('../../api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  return {
    ApiError,
    api: { soc: {
      incidents: vi.fn(), incident: vi.fn(), analysts: vi.fn(), download: vi.fn(),
      bulkUpdateIncidents: vi.fn(), suppressions: vi.fn(),
    } },
  };
});

import { api, ApiError } from '../../api';
import IncidentsTab from './IncidentsTab';

const soc = api.soc as unknown as Record<string, ReturnType<typeof vi.fn>>;

const renderTab = (path = '/soc') => render(<MemoryRouter initialEntries={[path]}><IncidentsTab /></MemoryRouter>);

describe('IncidentsTab', () => {
  beforeEach(() => {
    Object.values(soc).forEach(fn => fn.mockReset());
    live.socket = fakeSocket();
    soc.analysts.mockResolvedValue({ analysts: [] });
  });

  it('shows a failure to load once, with a way to retry', async () => {
    soc.incidents.mockRejectedValueOnce(new ApiError('database down', 503));
    renderTab();
    expect(await screen.findAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByText(/database down/)).toHaveLength(1);

    const a = incident({ title: 'Back again' });
    soc.incidents.mockResolvedValueOnce({ incidents: [a], total: 1 });
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Back again')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the list on screen when "Load more" fails, and retries just that page', async () => {
    const first = [incident({ title: 'Alpha' }), incident({ title: 'Bravo' })];
    soc.incidents.mockResolvedValueOnce({ incidents: first, total: 3 });
    renderTab();
    await screen.findByText('Alpha');

    soc.incidents.mockRejectedValueOnce(new ApiError('boom', 500));
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/boom/);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    soc.incidents.mockResolvedValueOnce({ incidents: [incident({ title: 'Charlie' })], total: 3 });
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Charlie')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not let an older response overwrite the list for the filter now selected', async () => {
    const slow = deferred<any>();
    soc.incidents.mockReturnValueOnce(slow.promise); // the first load (status "open") is held in flight
    renderTab();
    await waitFor(() => expect(soc.incidents).toHaveBeenCalledTimes(1));

    soc.incidents.mockResolvedValueOnce({ incidents: [incident({ title: 'Resolved one', status: 'resolved' })], total: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'resolved' }));
    expect(await screen.findByText('Resolved one')).toBeInTheDocument();

    await act(async () => { slow.resolve({ incidents: [incident({ title: 'Stale open one' })], total: 1 }); });
    expect(screen.queryByText('Stale open one')).toBeNull();
    expect(screen.getByText('Resolved one')).toBeInTheDocument();
  });

  it('drops a ticked incident that is no longer on screen, so a bulk action cannot reach it', async () => {
    const open = incident({ title: 'Tick me' });
    soc.incidents.mockResolvedValueOnce({ incidents: [open], total: 1 });
    renderTab();
    fireEvent.click(await screen.findByLabelText('Select Tick me'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    soc.incidents.mockResolvedValueOnce({ incidents: [incident({ title: 'Closed', status: 'resolved' })], total: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'resolved' }));
    await screen.findByText('Closed');
    expect(screen.queryByText(/selected/)).toBeNull();
    expect(screen.queryByRole('button', { name: /mark resolved/i })).toBeNull();
  });

  it('updates the open incident when someone else changes it', async () => {
    const inc = incident({ title: 'Watched', status: 'open' });
    soc.incidents.mockResolvedValueOnce({ incidents: [inc], total: 1 });
    renderTab();
    fireEvent.click(await screen.findByText('Watched'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'open' })).toHaveAttribute('aria-pressed', 'true');

    act(() => { live.socket.emit('incident_updated', { ...inc, status: 'resolved', resolutionReason: 'fixed' }); });
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'resolved' })).toHaveAttribute('aria-pressed', 'true'));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'open' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('says so when a linked incident cannot be opened, and drops it from the address', async () => {
    soc.incidents.mockResolvedValueOnce({ incidents: [], total: 0 });
    soc.incident.mockRejectedValueOnce(new ApiError('Incident not found', 404));
    renderTab('/soc?incident=gone');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not open that incident/);
  });
});
