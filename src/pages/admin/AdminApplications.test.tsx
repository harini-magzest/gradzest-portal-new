// Application Reports reads applications and subscribers a page at a time (GET /api/admin/applications?page=…,
// /api/admin/subscribers?page=…); the server filters, sorts and counts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminApplications from './AdminApplications';
import { exportRowsToCsv } from '../../utils/exportCsv';

const admin = vi.hoisted(() => ({
  applicationsPage: vi.fn(), applicationStudentIds: vi.fn(), applicationsExport: vi.fn(),
  subscribersPage: vi.fn(), subscribersExport: vi.fn(), markSubscribersSeen: vi.fn(),
  applications: vi.fn(), subscribers: vi.fn(),
}));
vi.mock('../../api', async (importOriginal) => ({ ...(await importOriginal<any>()), api: { admin } }));
vi.mock('../../hooks/usePortalName', () => ({ usePortalName: () => ({ portal: 'Admin Portal' }) }));
vi.mock('../../utils/exportCsv', () => ({ exportRowsToCsv: vi.fn() }));

const app = { _id: 'a1', studentId: 's1', studentName: 'Asha Rao', universityName: 'University of Leeds', courseName: 'MSc', status: 'submitted' };
const sub = { _id: 'n1', name: 'Priya', email: 'priya@example.com', leadStatus: 'new', subscribedAt: '2026-10-10T10:00:00Z' };

beforeEach(() => {
  vi.clearAllMocks();
  admin.applicationsPage.mockResolvedValue({ items: [app], total: 120, page: 1, limit: 50, statusCounts: { submitted: 70, rejected: 50 } });
  admin.subscribersPage.mockResolvedValue({
    items: [sub], total: 1, page: 1, limit: 50,
    stats: { total: 40, thisWeek: 5, withPhone: 30, unread: 3 }, statusCounts: { new: 25, contacted: 15 },
  });
  admin.markSubscribersSeen.mockResolvedValue({ seenAt: new Date().toISOString() });
});

const renderPage = () => render(<MemoryRouter><AdminApplications /></MemoryRouter>);
const lastApps = () => admin.applicationsPage.mock.calls[admin.applicationsPage.mock.calls.length - 1][0];

describe('AdminApplications', () => {
  it('shows a page of applications with counts over every application, and never loads the whole lists', async () => {
    renderPage();
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('120 results')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All Statuses (120)' })).toBeInTheDocument();
    expect(screen.getByText(/Showing 1–50 of 120/)).toBeInTheDocument();
    expect(admin.applications).not.toHaveBeenCalled();
    expect(admin.subscribers).not.toHaveBeenCalled();
  });

  it('asks the server for a status, a search and the next page', async () => {
    renderPage();
    await screen.findByText('Asha Rao');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(lastApps()).toMatchObject({ page: 2 }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by status' }), { target: { value: 'rejected' } });
    await waitFor(() => expect(lastApps()).toMatchObject({ status: 'rejected', page: 1 }));
    fireEvent.change(screen.getByPlaceholderText('Search by student, university or course…'), { target: { value: 'leeds' } });
    await waitFor(() => expect(lastApps()).toMatchObject({ q: 'leeds', status: 'rejected', page: 1 }));
  });

  it('exports every matching application', async () => {
    admin.applicationsExport.mockResolvedValue({ items: [app, { ...app, studentName: 'Zed' }] });
    renderPage();
    await screen.findByText('Asha Rao');
    fireEvent.click(screen.getAllByRole('button', { name: /Download Excel/ })[0]);
    await waitFor(() => expect(exportRowsToCsv).toHaveBeenCalled());
    expect((exportRowsToCsv as any).mock.calls[0][1].map((r: any) => r['Student Name'])).toEqual(['Asha Rao', 'Zed']);
  });

  it('shows unread subscribers on the tab, and opening it marks them read', async () => {
    renderPage();
    await screen.findByText('Asha Rao');
    expect(screen.getByTitle('3 new since you last looked')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New Subscribers/ }));
    expect(await screen.findByText('Priya')).toBeInTheDocument();
    await waitFor(() => expect(admin.markSubscribersSeen).toHaveBeenCalledTimes(1));
    expect(screen.queryByTitle('3 new since you last looked')).not.toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument(); // total registrations
  });
});
