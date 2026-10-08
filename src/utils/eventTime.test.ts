import { describe, it, expect } from 'vitest';
import { eventStart } from './eventTime';

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).getTime();

describe('eventStart', () => {
  it('reads 12-hour times, as meetings and calls store them', () => {
    expect(eventStart({ date: '2026-06-05', time: '09:20 PM' })).toBe(at(2026, 6, 5, 21, 20));
    expect(eventStart({ date: '2026-06-05', time: '10:00 AM' })).toBe(at(2026, 6, 5, 10, 0));
    expect(eventStart({ date: '2026-06-05', time: '12:00 AM' })).toBe(at(2026, 6, 5, 0, 0));
    expect(eventStart({ date: '2026-06-05', time: '12:30 PM' })).toBe(at(2026, 6, 5, 12, 30));
  });

  it('reads 24-hour times, as the Add Event form stores them', () => {
    expect(eventStart({ date: '2026-10-08', time: '14:05' })).toBe(at(2026, 10, 8, 14, 5));
  });

  it('treats an event without a time as all day, so it stays upcoming until the day ends', () => {
    expect(eventStart({ date: '2026-10-08', time: '' })).toBe(at(2026, 10, 8, 23, 59));
  });

  it('cannot place an event without a proper date', () => {
    expect(eventStart({ date: 'Tomorrow', time: '10:00 AM' })).toBeNaN();
  });
});
