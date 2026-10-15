import { describe, it, expect, vi, beforeEach } from 'vitest';
import './testSupport';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('./AlertChannelsCard', () => ({ default: () => null }));
vi.mock('../../api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  return { ApiError, api: { soc: { posture: vi.fn() } } };
});

import { api, ApiError } from '../../api';
import PostureTab from './PostureTab';

const posture = api.soc.posture as unknown as ReturnType<typeof vi.fn>;

const ok = {
  cached: false, checkedAt: '2026-10-14T08:00:00Z', knownGaps: [], activeFeatures: [],
  dependencyAudit: { frontend: { total: 0 }, backend: { total: 0 } }, codeAnalysis: { codeFlags: [] },
};

describe('PostureTab', () => {
  beforeEach(() => posture.mockReset());

  it('says the check failed, rather than leaving the tab blank', async () => {
    posture.mockRejectedValueOnce(new ApiError('audit crashed', 500));
    render(<PostureTab />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/audit crashed/);
  });

  it('recovers when the check is run again', async () => {
    posture.mockRejectedValueOnce(new ApiError('audit crashed', 500));
    render(<PostureTab />);
    await screen.findByRole('alert');

    posture.mockResolvedValueOnce(ok);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Frontend dependencies')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(posture).toHaveBeenLastCalledWith(true);
  });
});
