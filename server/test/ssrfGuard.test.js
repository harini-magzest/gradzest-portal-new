const { assertPublicHttpUrl } = require('../lib/ssrfGuard');

describe('ssrfGuard — blocks SSRF via admin-supplied or scraped image URLs', () => {
  it('rejects a non-http(s) scheme', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow(/http\/https/);
    await expect(assertPublicHttpUrl('ftp://example.com/x.png')).rejects.toThrow(/http\/https/);
  });

  it('rejects an invalid URL outright', async () => {
    await expect(assertPublicHttpUrl('not a url')).rejects.toThrow(/Invalid URL/);
  });

  it('rejects "localhost" without needing a DNS lookup', async () => {
    const lookup = vi.fn();
    await expect(assertPublicHttpUrl('http://localhost/admin', lookup)).rejects.toThrow(/not allowed/);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects a literal cloud-metadata IP with no DNS lookup needed', async () => {
    const lookup = vi.fn();
    await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/', lookup)).rejects.toThrow(/private address/);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects literal private-range IPs (loopback, RFC1918, CGNAT)', async () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.1.1', '100.64.0.1']) {
      await expect(assertPublicHttpUrl(`http://${ip}/x.png`)).rejects.toThrow(/private address/);
    }
  });

  it('rejects a literal private IPv6 address', async () => {
    await expect(assertPublicHttpUrl('http://[::1]/x.png')).rejects.toThrow(/private address/);
    await expect(assertPublicHttpUrl('http://[fe80::1]/x.png')).rejects.toThrow(/private address/);
  });

  it('rejects a hostname that resolves to a private address (the real-world DNS-rebinding-adjacent case)', async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(assertPublicHttpUrl('http://internal.example/x.png', lookup)).rejects.toThrow(/private address/);
    expect(lookup).toHaveBeenCalledWith('internal.example', { all: true });
  });

  it('rejects a hostname that fails to resolve', async () => {
    const lookup = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertPublicHttpUrl('http://no-such-host.example/x.png', lookup)).rejects.toThrow(/Could not resolve/);
  });

  it('allows a normal public URL whose hostname resolves to a public address', async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    await expect(assertPublicHttpUrl('https://example.com/logo.png', lookup)).resolves.toBeUndefined();
  });

  it('allows a literal public IP with no DNS lookup needed', async () => {
    const lookup = vi.fn();
    await expect(assertPublicHttpUrl('http://93.184.216.34/logo.png', lookup)).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });
});
