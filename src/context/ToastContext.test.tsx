import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { ToastProvider, useToast } from './ToastContext';

describe('ToastProvider', () => {
  it('hands out the same `toast` object on every render, so effects that list it do not re-run', () => {
    // Pages put `toast` in their effect dependencies. If it were a new object each time a toast appears, every such
    // effect would run again and refetch its data.
    const seen: unknown[] = [];
    let latest!: ReturnType<typeof useToast>;
    function Probe() {
      latest = useToast();
      seen.push(latest.toast);
      return null;
    }
    render(<ToastProvider><Probe /></ToastProvider>);

    act(() => { latest.toast.success('Saved'); });
    act(() => { latest.toast.error('Failed'); });
    act(() => { latest.dismiss(latest.toasts[0].id); });

    expect(seen.length).toBeGreaterThan(2); // the provider did re-render as the toasts changed
    expect(new Set(seen).size).toBe(1);
  });

  it('still shows and dismisses toasts', () => {
    let latest!: ReturnType<typeof useToast>;
    function Probe() { latest = useToast(); return null; }
    render(<ToastProvider><Probe /></ToastProvider>);

    act(() => { latest.toast.info('Hello'); });
    expect(latest.toasts.map(t => t.message)).toEqual(['Hello']);
    expect(latest.toasts[0].type).toBe('info');

    act(() => { latest.dismiss(latest.toasts[0].id); });
    expect(latest.toasts).toEqual([]);
  });
});
