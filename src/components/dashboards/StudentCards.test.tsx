import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NextStepCard from './NextStepCard';
import DataAccessLog from './DataAccessLog';

vi.mock('../../api', () => ({
  api: {
    students: {
      nextStep: vi.fn(), dataAccess: vi.fn(),
    },
  },
}));
import { api } from '../../api';

beforeEach(() => vi.clearAllMocks());

describe('NextStepCard', () => {
  it('shows the step and links to where to act on it', async () => {
    (api.students.nextStep as any).mockResolvedValue({ kind: 'upload_document', title: 'Upload your passport', detail: '2 documents are still needed.', action: { label: 'Upload now', to: '/student/profile' } });
    render(<MemoryRouter><NextStepCard /></MemoryRouter>);
    expect(await screen.findByText('Upload your passport')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /upload now/i })).toHaveAttribute('href', '/student/profile');
  });

  it('renders nothing when the step cannot be loaded', async () => {
    (api.students.nextStep as any).mockRejectedValue(new Error('down'));
    const { container } = render(<MemoryRouter><NextStepCard /></MemoryRouter>);
    await waitFor(() => expect(api.students.nextStep).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('DataAccessLog', () => {
  it('says so when nobody has looked', async () => {
    (api.students.dataAccess as any).mockResolvedValue({ accesses: [] });
    render(<DataAccessLog />);
    expect(await screen.findByText(/nobody has viewed your details yet/i)).toBeInTheDocument();
  });

  it('lists who looked, and folds a long list behind "Show all"', async () => {
    const accesses = Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, at: new Date(2026, 0, i + 1).toISOString(), role: 'counselor', name: `Asha ${i}`, kind: 'view' }));
    (api.students.dataAccess as any).mockResolvedValue({ accesses });
    render(<DataAccessLog />);
    expect(await screen.findByText('Asha 0')).toBeInTheDocument();
    expect(screen.queryByText('Asha 6')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show all 7/i }));
    expect(screen.getByText('Asha 6')).toBeInTheDocument();
  });

  it('shows an error instead of failing silently', async () => {
    (api.students.dataAccess as any).mockRejectedValue(new Error('boom'));
    render(<DataAccessLog />);
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });
});
