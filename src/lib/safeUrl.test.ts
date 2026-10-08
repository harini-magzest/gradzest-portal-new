import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeRedirectPath, httpUrl, openExternal } from './safeUrl';

describe('safeRedirectPath', () => {
  it('keeps same-site paths, with their query and hash', () => {
    expect(safeRedirectPath('/student')).toBe('/student');
    expect(safeRedirectPath('/admin/students/abc?tab=notes#top')).toBe('/admin/students/abc?tab=notes#top');
  });

  it('refuses anything that could leave the site', () => {
    for (const bad of [
      'https://evil.com', 'http://evil.com/x', '//evil.com', '///evil.com', '/\\evil.com', '\\\\evil.com',
      'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,hi', 'evil.com', 'student',
      '/ok\nhttps://evil.com', '/ok\thttps://evil.com', '/%0d%0a//evil.com'.replace('%0d%0a', '\r\n'),
    ]) {
      expect(safeRedirectPath(bad, '/fallback'), bad).toBe('/fallback');
    }
  });

  it('uses the fallback for missing or non-string values', () => {
    expect(safeRedirectPath(null, '/x')).toBe('/x');
    expect(safeRedirectPath(undefined)).toBe('');
    expect(safeRedirectPath(42 as any, '/x')).toBe('/x');
  });
});

describe('httpUrl and openExternal', () => {
  afterEach(() => vi.restoreAllMocks());

  it('accepts only absolute http(s) URLs', () => {
    expect(httpUrl('https://meet.jit.si/Room')).toBe('https://meet.jit.si/Room');
    expect(httpUrl('  http://example.com/a  ')).toBe('http://example.com/a');
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'vbscript:x', '/relative', 'meet.jit.si', '', null, undefined]) {
      expect(httpUrl(bad as any), String(bad)).toBeNull();
    }
  });

  it('opens a safe link without access to the opener, and does nothing for an unsafe one', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openExternal('https://zoom.us/j/1')).toBe(true);
    expect(open).toHaveBeenCalledWith('https://zoom.us/j/1', '_blank', 'noopener,noreferrer');
    open.mockClear();
    expect(openExternal('javascript:alert(document.cookie)')).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
