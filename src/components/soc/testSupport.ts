// Shared by the SOC component tests. Not imported by the app.
import { vi } from 'vitest';
import { configure } from '@testing-library/react';

// These tabs debounce their searches (250-300 ms) and the first render in a file also pays for loading the module graph,
// so the stock 1 s wait for an element and 5 s per test sit right at what a quiet machine needs; a busy one (the whole
// suite running in parallel, a browser open) fails them for being slow, not for being wrong. These limits are about
// telling a hung test from a slow machine.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 20000 });

/** A stand-in for the dashboard's socket: components subscribe with on/off, and a test pushes an event with emit. */
export function fakeSocket() {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  return {
    on(event: string, fn: (...args: any[]) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
    },
    off(event: string, fn: (...args: any[]) => void) { handlers.get(event)?.delete(fn); },
    emit(event: string, ...args: any[]) { handlers.get(event)?.forEach(fn => fn(...args)); },
  };
}

/** A promise that settles when the test says so, to hold a request in flight. */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let seq = 0;
/** A minimal incident, with whatever the test needs overridden. */
export function incident(over: Record<string, unknown> = {}) {
  seq += 1;
  return {
    _id: `inc${seq}`, type: 'brute_force', severity: 'high', status: 'open', title: `Incident ${seq}`,
    notes: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...over,
  };
}
