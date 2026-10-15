import { describe, it, expect, vi, beforeEach } from 'vitest';
import './testSupport';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../../api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  return { ApiError, api: { soc: { search: vi.fn() } } };
});

import { api } from '../../api';
import GlobalSearch from './GlobalSearch';

const search = api.soc.search as unknown as ReturnType<typeof vi.fn>;

const results = {
  users: [{ id: 'u1', name: 'Ann Analyst', email: 'ann@example.com', role: 'counselor' }],
  ips: [], incidents: [], uploads: [],
};

function setup() {
  const handlers = { onOpenUser: vi.fn(), onOpenIp: vi.fn(), onOpenIncidents: vi.fn(), onOpenIncident: vi.fn(), onOpenUploads: vi.fn() };
  render(
    <>
      <GlobalSearch {...handlers} />
      <button type="button">Somewhere else</button>
    </>,
  );
  return handlers;
}

async function typeQuery(q = 'ann') {
  fireEvent.change(screen.getByLabelText('Search the SOC'), { target: { value: q } });
  return screen.findByRole('button', { name: /Ann Analyst/ });
}

describe('GlobalSearch', () => {
  beforeEach(() => { search.mockReset(); search.mockResolvedValue(results); });

  it('opens the person that was picked and clears the box', async () => {
    const h = setup();
    fireEvent.click(await typeQuery());
    expect(h.onOpenUser).toHaveBeenCalledWith('u1');
    expect(screen.getByLabelText('Search the SOC')).toHaveValue('');
    expect(screen.queryByRole('button', { name: /Ann Analyst/ })).toBeNull();
  });

  it('closes the results on Escape', async () => {
    setup();
    await typeQuery();
    fireEvent.keyDown(screen.getByLabelText('Search the SOC'), { key: 'Escape' });
    expect(screen.queryByRole('button', { name: /Ann Analyst/ })).toBeNull();
  });

  it('closes the results when keyboard focus moves elsewhere on the page', async () => {
    setup();
    await typeQuery();
    act(() => { screen.getByRole('button', { name: 'Somewhere else' }).focus(); });
    expect(screen.queryByRole('button', { name: /Ann Analyst/ })).toBeNull();
  });

  it('tells a screen reader how many results there are', async () => {
    setup();
    await typeQuery();
    expect(await screen.findByText('1 result.')).toBeInTheDocument();
  });

  it('keeps the row it gave focus to when the results re-render', async () => {
    setup();
    const row = await typeQuery();
    row.focus();
    // Typing another letter re-renders the box while the earlier results are still showing.
    fireEvent.change(screen.getByLabelText('Search the SOC'), { target: { value: 'anne' } });
    const after = screen.getByRole('button', { name: /Ann Analyst/ });
    expect(after).toBe(row);
    expect(after).toHaveFocus();
  });
});
