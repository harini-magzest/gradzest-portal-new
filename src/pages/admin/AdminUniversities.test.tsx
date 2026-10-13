// The admin Universities list renders, and a university being deleted cannot be deleted twice (its button is
// disabled until the first delete finishes).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminUniversities from './AdminUniversities';

const admin = vi.hoisted(() => ({ universities: vi.fn(), students: vi.fn(), deleteUniversity: vi.fn() }));
vi.mock('../../api', async (importOriginal) => ({ ...(await importOriginal<any>()), api: { admin, universities: { autofill: vi.fn() } } }));
vi.mock('../../hooks/usePortalName', () => ({ usePortalName: () => ({ portal: 'Admin Portal' }) }));
const toastContext = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toastContext }));

beforeEach(() => {
  vi.clearAllMocks();
  admin.universities.mockResolvedValue([{ _id: 'u1', id: 'u1', name: 'University of Leeds', country: 'United Kingdom', courses: [] }]);
  admin.students.mockResolvedValue([]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AdminUniversities', () => {
  it('lists the universities, and a delete in progress cannot be started again', async () => {
    let finish: (v: unknown) => void = () => {};
    admin.deleteUniversity.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<MemoryRouter><AdminUniversities /></MemoryRouter>);

    expect(await screen.findByText('University of Leeds')).toBeInTheDocument();
    const remove = screen.getByRole('button', { name: /^Delete$/ });
    fireEvent.click(remove);
    await waitFor(() => expect(remove).toBeDisabled());
    fireEvent.click(remove);
    expect(admin.deleteUniversity).toHaveBeenCalledTimes(1);

    finish({});
    await waitFor(() => expect(screen.queryByText('University of Leeds')).not.toBeInTheDocument());
  });
});
