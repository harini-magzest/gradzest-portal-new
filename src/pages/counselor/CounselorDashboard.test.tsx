import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CounselorDashboard from './CounselorDashboard';

vi.mock('../../api', () => ({
  api: {
    students: { list: vi.fn() },
    universities: { list: vi.fn() },
    meetings: { list: vi.fn() },
    applications: { addComment: vi.fn() },
    counselors: { updateMe: vi.fn() },
    users: { myPermissions: vi.fn().mockResolvedValue({ roleName: null }) },
  },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'c1', role: 'counselor', name: 'Test Counselor', assignedStudents: [], specialization: [] },
  }),
}));

// App.tsx provides CallContext around every page; this test renders the dashboard on its own, so supply the bits
// the page's presence indicators read. MyCallPerformance has its own loading/error handling and API call, which
// are not what this test is about.
vi.mock('../../context/CallContext', () => ({
  useCallContext: () => ({ isOnline: () => false, lastSeenOf: () => null, lastMessageTime: 0 }),
}));
vi.mock('../../components/MyCallPerformance', () => ({ default: () => null }));
vi.mock('../../components/dashboards/FollowupQueue', () => ({ default: () => null }));

import { api } from '../../api';

function renderDashboard() {
  return render(
    <MemoryRouter>
      <CounselorDashboard />
    </MemoryRouter>,
  );
}

describe('CounselorDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.students.list as any).mockResolvedValue([]);
    (api.universities.list as any).mockResolvedValue([]);
    (api.meetings.list as any).mockResolvedValue([]);
  });

  it('renders with no error banners when every section loads successfully', async () => {
    renderDashboard();

    await waitFor(() => expect(screen.getByText('No upcoming calls scheduled')).toBeInTheDocument());
    expect(screen.queryByText(/Failed to load/i)).not.toBeInTheDocument();
  });

  it('shows an independent error banner for the Scheduled Calls section when meetings.list fails, without affecting the rest of the page', async () => {
    (api.meetings.list as any).mockRejectedValue(new Error('boom'));

    renderDashboard();

    await screen.findByText('Failed to load scheduled calls.');
    // Students/universities sections, which succeeded, should render normally alongside it
    expect(screen.queryByText(/Failed to load your students/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to load universities/i)).not.toBeInTheDocument();
  });

  it('shows an error banner for the student stats when students.list fails', async () => {
    (api.students.list as any).mockRejectedValue(new Error('boom'));

    renderDashboard();

    const banner = await screen.findByText(/Failed to load your students/i);
    expect(banner).toBeInTheDocument();
  });

  it('retries the Scheduled Calls fetch when Retry is clicked, and the banner clears once it succeeds', async () => {
    (api.meetings.list as any)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([]);

    renderDashboard();

    await screen.findByText('Failed to load scheduled calls.');

    const { default: userEvent } = await import('@testing-library/user-event');
    const retryButtons = screen.getAllByRole('button', { name: /retry/i });
    await userEvent.click(retryButtons[0]);

    await waitFor(() => expect(screen.getByText('No upcoming calls scheduled')).toBeInTheDocument());
    expect(screen.queryByText('Failed to load scheduled calls.')).not.toBeInTheDocument();
  });
});
