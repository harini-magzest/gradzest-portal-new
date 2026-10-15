import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { deferred } from './testSupport';

vi.mock('./NeedsAttention', () => ({ default: () => null }));
vi.mock('./BlockedIpsPanel', () => ({ default: () => null, BLOCK_DURATIONS: [{ label: 'Permanent', hours: 0 }] }));
vi.mock('./FeatureUsage', () => ({ default: () => null }));
vi.mock('./IncidentDetail', () => ({ default: () => null }));
vi.mock('../../api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  return {
    ApiError,
    api: { soc: { searchUsers: vi.fn(), investigateUser: vi.fn(), investigateIp: vi.fn(), logoutUserEverywhere: vi.fn() } },
  };
});

import { api, ApiError } from '../../api';
import InvestigateTab from './InvestigateTab';

const soc = api.soc as unknown as Record<string, ReturnType<typeof vi.fn>>;

const payload = (id: string, name: string) => ({
  user: { id, name, email: `${name.toLowerCase()}@example.com`, role: 'student', activeSessions: 2 },
  profile: {}, sessions: [], relatedIncidents: [], recentUploads: [], timeline: [],
});

describe('InvestigateTab', () => {
  let confirm: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    Object.values(soc).forEach(fn => fn.mockReset());
    confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('says when a search found no one, instead of showing nothing', async () => {
    soc.searchUsers.mockResolvedValueOnce({ users: [] });
    render(<InvestigateTab />);
    fireEvent.change(screen.getByLabelText('Search people by name or email'), { target: { value: 'zed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/No one matches/)).toHaveTextContent('zed');
  });

  it('shows the failure when signing someone out everywhere does not work', async () => {
    soc.investigateUser.mockResolvedValueOnce(payload('u1', 'Alice'));
    soc.logoutUserEverywhere.mockRejectedValueOnce(new ApiError('session store offline', 500));
    render(<InvestigateTab initialUserId="u1" />);
    await screen.findByRole('heading', { name: 'Alice' });

    fireEvent.click(screen.getByRole('button', { name: /log out everywhere/i }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/session store offline/)).toBeInTheDocument();
    expect(screen.queryByText('All sessions revoked for this user.')).toBeNull();
  });

  it('asks before signing someone out everywhere, and does nothing if declined', async () => {
    soc.investigateUser.mockResolvedValueOnce(payload('u1', 'Alice'));
    confirm.mockReturnValue(false);
    render(<InvestigateTab initialUserId="u1" />);
    await screen.findByRole('heading', { name: 'Alice' });

    fireEvent.click(screen.getByRole('button', { name: /log out everywhere/i }));
    expect(soc.logoutUserEverywhere).not.toHaveBeenCalled();
  });

  it('shows the person asked for last when two lookups overlap', async () => {
    soc.searchUsers.mockResolvedValueOnce({
      users: [
        { id: 'a', name: 'Ann', email: 'ann@example.com', role: 'student' },
        { id: 'b', name: 'Bob', email: 'bob@example.com', role: 'student' },
      ],
    });
    const slowAnn = deferred<any>();
    soc.investigateUser.mockImplementation((id: string) => id === 'a' ? slowAnn.promise : Promise.resolve(payload('b', 'Bob')));

    render(<InvestigateTab />);
    fireEvent.change(screen.getByLabelText('Search people by name or email'), { target: { value: 'an' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByRole('button', { name: /Ann/ }));
    fireEvent.click(screen.getByRole('button', { name: /Bob/ }));
    expect(await screen.findByRole('heading', { name: 'Bob' })).toBeInTheDocument();

    await act(async () => { slowAnn.resolve(payload('a', 'Ann')); });
    expect(screen.getByRole('heading', { name: 'Bob' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ann' })).toBeNull();
  });
});
