import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionTimeout, type SessionTimeoutOptions } from './useSessionTimeout';

const MIN = 60_000;
const IDLE = 30 * MIN;

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const touch = (type = 'keydown') => act(() => { window.dispatchEvent(new Event(type)); });

function setup(over: Partial<SessionTimeoutOptions> = {}) {
  const cbs = { onIdleTimeout: vi.fn(), onExpired: vi.fn(), onKeepAlive: vi.fn() };
  const props: SessionTimeoutOptions = {
    enabled: true,
    idleMs: IDLE,
    expiresAt: new Date(Date.now() + 12 * 60 * MIN).toISOString(),
    ...cbs,
    ...over,
  };
  const hook = renderHook((p: SessionTimeoutOptions) => useSessionTimeout(p), { initialProps: props });
  return { ...hook, ...cbs };
}

describe('useSessionTimeout', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T09:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('stays quiet while there is plenty of idle time left', () => {
    const { result, onIdleTimeout, onExpired } = setup();
    advance(20 * MIN);
    expect(result.current.warning).toBeNull();
    expect(onIdleTimeout).not.toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('warns one minute before the idle limit, counting down in seconds', () => {
    const { result } = setup();
    advance(IDLE - 61_000);
    expect(result.current.warning).toBeNull();
    advance(2_000); // 59 s left
    expect(result.current.warning).toEqual({ kind: 'idle', secondsLeft: 59 });
    advance(9_000);
    expect(result.current.warning).toEqual({ kind: 'idle', secondsLeft: 50 });
  });

  it('signs out once, when the idle limit is reached', () => {
    const { onIdleTimeout, onExpired } = setup();
    advance(IDLE + 1_000);
    expect(onIdleTimeout).toHaveBeenCalledTimes(1);
    advance(30_000); // more ticks must not repeat it
    expect(onIdleTimeout).toHaveBeenCalledTimes(1);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('activity before the warning restarts the idle clock', () => {
    const { result, onIdleTimeout } = setup();
    advance(25 * MIN);
    touch('pointerdown');
    advance(25 * MIN); // 50 minutes after the start, but only 25 since the click
    expect(result.current.warning).toBeNull();
    expect(onIdleTimeout).not.toHaveBeenCalled();
  });

  it('once the warning shows, moving around does not cancel it: only the button does', () => {
    const { result, onIdleTimeout } = setup();
    advance(IDLE - 30_000);
    expect(result.current.warning?.kind).toBe('idle');
    touch('keydown');
    touch('wheel');
    advance(31_000);
    expect(onIdleTimeout).toHaveBeenCalledTimes(1);
  });

  it('"stay signed in" clears the warning, restarts the clock and asks for a renewal', () => {
    const { result, onIdleTimeout, onKeepAlive } = setup();
    advance(IDLE - 30_000);
    expect(result.current.warning?.kind).toBe('idle');
    onKeepAlive.mockClear();

    act(() => result.current.stayActive());
    expect(result.current.warning).toBeNull();
    expect(onKeepAlive).toHaveBeenCalledTimes(1);

    advance(IDLE - 60_000 - 1_000); // a full period, minus the warning window
    expect(result.current.warning).toBeNull();
    expect(onIdleTimeout).not.toHaveBeenCalled();
  });

  it('warns that the session is ending five minutes before its hard end, then expires it', () => {
    const { result, onExpired, onIdleTimeout } = setup({ expiresAt: new Date(Date.now() + 4 * MIN).toISOString() });
    advance(1_000);
    expect(result.current.warning).toEqual({ kind: 'ending', secondsLeft: 239 });

    advance(4 * MIN);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(onIdleTimeout).not.toHaveBeenCalled();
  });

  it('reports the hard end ahead of the idle limit when both have passed', () => {
    const { onExpired, onIdleTimeout } = setup({ expiresAt: new Date(Date.now() + 10_000).toISOString() });
    advance(IDLE + MIN);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(onIdleTimeout).not.toHaveBeenCalled();
  });

  it('keeps the server session alive while the person is working, but not while they are away', () => {
    const { onKeepAlive } = setup();
    advance(9 * MIN);
    touch('scroll');
    advance(MIN + 1_000); // 10 minutes in, with activity a minute ago
    expect(onKeepAlive).toHaveBeenCalledTimes(1);

    advance(10 * MIN); // no activity for 11 minutes now: no renewal
    expect(onKeepAlive).toHaveBeenCalledTimes(1);
  });

  it('judges the elapsed time straight away when the tab becomes visible again', () => {
    const { onIdleTimeout } = setup();
    // The timers were frozen (laptop asleep): the clock jumps without any tick running
    vi.setSystemTime(Date.now() + IDLE + 5 * MIN);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(onIdleTimeout).toHaveBeenCalledTimes(1);
  });

  it('does nothing when nobody is signed in', () => {
    const { result, onIdleTimeout, onExpired, onKeepAlive } = setup({ enabled: false });
    advance(13 * 60 * MIN);
    expect(result.current.warning).toBeNull();
    expect(onIdleTimeout).not.toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
    expect(onKeepAlive).not.toHaveBeenCalled();
  });

  it('stops watching when it is unmounted', () => {
    const { unmount, onIdleTimeout } = setup();
    unmount();
    advance(IDLE + 5 * MIN);
    expect(onIdleTimeout).not.toHaveBeenCalled();
  });
});
