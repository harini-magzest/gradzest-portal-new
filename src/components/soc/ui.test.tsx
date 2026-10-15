import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, renderHook } from '@testing-library/react';

vi.mock('../../api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  return { ApiError };
});

import { Modal, formatEventTime, useLatestRequest, errorText } from './ui';
import { ApiError } from '../../api';

describe('Modal', () => {
  it('is announced as a dialog with a name, and takes focus', () => {
    render(<Modal label="Quarantine file" onClose={() => {}}><button type="button">Confirm</button></Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Quarantine file' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
  });

  it('leaves focus where the content asked for it', () => {
    render(<Modal label="Note" onClose={() => {}}><input aria-label="Note text" autoFocus /></Modal>);
    expect(screen.getByLabelText('Note text')).toHaveFocus();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Modal label="Note" onClose={onClose}><button type="button">OK</button></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gives focus back to what opened it', () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          {open && <Modal label="Dialog" onClose={() => setOpen(false)}><button type="button">Close</button></Modal>}
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab inside the dialog', () => {
    render(
      <Modal label="Two buttons" onClose={() => {}}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>,
    );
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('closes on a press on the backdrop, but not on a press inside the box', () => {
    const onClose = vi.fn();
    render(<Modal label="Note" onClose={onClose}><p>Body</p></Modal>);
    fireEvent.mouseDown(screen.getByText('Body'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('useLatestRequest', () => {
  it('says only the newest request is current', () => {
    const { result } = renderHook(() => useLatestRequest());
    const first = result.current();
    expect(first()).toBe(true);
    const second = result.current();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });
});

describe('formatEventTime', () => {
  const now = new Date('2026-10-14T20:00:00');
  it('shows only the clock for something from today', () => {
    expect(formatEventTime('2026-10-14T09:05:03', now)).toBe('09:05:03');
  });
  it('adds the date for an earlier day, so an old row does not look like it just happened', () => {
    expect(formatEventTime('2026-10-13T09:05:03', now)).toMatch(/^13 Oct, 09:05:03$/);
  });
  it('returns nothing for a value that is not a date', () => {
    expect(formatEventTime('not a date', now)).toBe('');
  });
});

describe('errorText', () => {
  it('turns a rate-limit into advice, and a network failure into plain words', () => {
    expect(errorText(new ApiError('Too many requests', 429))).toMatch(/rate-limiting/);
    expect(errorText(new Error('Failed to fetch'))).toMatch(/Cannot reach the server/);
  });
});
