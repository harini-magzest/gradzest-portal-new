import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CounselorCountries from './CounselorCountries';

vi.mock('../../api', () => ({
  api: {
    countries: { list: vi.fn() },
    universities: { list: vi.fn() },
    users: { myPermissions: vi.fn().mockResolvedValue({ roleName: null }) },
  },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'c1', role: 'counselor', name: 'Test Counselor' } }),
}));

import { api } from '../../api';

describe('CounselorCountries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.users.myPermissions as any).mockResolvedValue({ roleName: null });
  });

  it('renders the loaded countries once both fetches succeed', async () => {
    (api.countries.list as any).mockResolvedValue([{ id: '1', name: 'Canada', region: 'North America' }]);
    (api.universities.list as any).mockResolvedValue([]);

    render(<CounselorCountries />);

    await waitFor(() => expect(screen.getByText('Canada')).toBeInTheDocument());
    expect(screen.queryByText(/Failed to load countries/i)).not.toBeInTheDocument();
  });

  it('shows an error banner with Retry when the fetch fails, instead of failing silently', async () => {
    (api.countries.list as any).mockRejectedValue(new Error('network down'));
    (api.universities.list as any).mockResolvedValue([]);

    render(<CounselorCountries />);

    const banner = await screen.findByText('Failed to load countries.');
    expect(banner).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('recovers when Retry is clicked after the underlying fetch starts working', async () => {
    (api.countries.list as any)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([{ id: '1', name: 'Canada', region: 'North America' }]);
    (api.universities.list as any).mockResolvedValue([]);

    render(<CounselorCountries />);

    await screen.findByText('Failed to load countries.');

    await userEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.getByText('Canada')).toBeInTheDocument());
    expect(screen.queryByText(/Failed to load countries/i)).not.toBeInTheDocument();
  });
});
