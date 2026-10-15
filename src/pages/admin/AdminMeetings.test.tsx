// The admin Meetings page reads one tab a page at a time (GET /api/meetings?page=…&when=…), deciding "upcoming"
// against this browser's clock, and loads every student only when the schedule dialog needs them.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminMeetings from './AdminMeetings';

const api = vi.hoisted(() => ({
  meetings: { page: vi.fn(), list: vi.fn(), delete: vi.fn(), create: vi.fn() },
  admin: { students: vi.fn(), counselors: vi.fn() },
}));
vi.mock('../../api', async (importOriginal) => ({ ...(await importOriginal<any>()), api }));
vi.mock('../../hooks/usePortalName', () => ({ usePortalName: () => ({ portal: 'Admin Portal' }) }));

const meeting = (id: string, title: string) => ({
  _id: id, title, scheduledDate: '2030-01-01', scheduledTime: '10:00', duration: 60, platform: 'other', participants: [],
});
const lastQuery = () => api.meetings.page.mock.calls[api.meetings.page.mock.calls.length - 1][0];

beforeEach(() => {
  vi.clearAllMocks();
  api.meetings.page.mockResolvedValue({ items: [meeting('m1', 'Visa briefing')], total: 1, page: 1, limit: 30, upcoming: 4, past: 9 });
  api.admin.counselors.mockResolvedValue([]);
  api.admin.students.mockResolvedValue([{ _id: 's1', name: 'Asha Rao', email: 'asha@example.com' }]);
});

describe('AdminMeetings', () => {
  it('asks for the upcoming tab against this browser\'s clock, and shows how many each tab holds', async () => {
    render(<MemoryRouter><AdminMeetings /></MemoryRouter>);
    expect(await screen.findByText('Visa briefing')).toBeInTheDocument();
    expect(lastQuery()).toMatchObject({ when: 'upcoming', page: 1 });
    expect(lastQuery().now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(screen.getByRole('button', { name: /Upcoming\s*4/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Past\s*9/ })).toBeInTheDocument();
    expect(api.meetings.list).not.toHaveBeenCalled();
  });

  it('asks the server for the past tab and for a search', async () => {
    render(<MemoryRouter><AdminMeetings /></MemoryRouter>);
    await screen.findByText('Visa briefing');
    fireEvent.click(screen.getByRole('button', { name: /Past/ }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ when: 'past', page: 1 }));
    fireEvent.change(screen.getByPlaceholderText('Search meetings or participants…'), { target: { value: 'asha' } });
    await waitFor(() => expect(lastQuery()).toMatchObject({ when: 'past', q: 'asha' }));
  });

  it('loads the students only when the schedule dialog opens, and only once', async () => {
    render(<MemoryRouter><AdminMeetings /></MemoryRouter>);
    await screen.findByText('Visa briefing');
    expect(api.admin.students).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: /Schedule Meeting/ })[0]);
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getAllByRole('button', { name: /Schedule Meeting/ })[0]);
    await screen.findByText('Asha Rao');
    expect(api.admin.students).toHaveBeenCalledTimes(1);
  });
});
