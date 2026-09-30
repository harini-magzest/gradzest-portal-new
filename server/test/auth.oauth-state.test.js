const request = require('supertest');
const { app } = require('../app');

describe('GitHub OAuth CSRF state', () => {
  const origEnv = { ...process.env };

  beforeAll(() => {
    process.env.GITHUB_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
  });

  afterAll(() => {
    process.env = origEnv;
  });

  it('sets an httpOnly, SameSite=Lax state cookie and includes it in the redirect', async () => {
    const res = await request(app).get('/api/auth/github');
    expect(res.status).toBe(302);

    const setCookie = res.headers['set-cookie'] || [];
    const stateCookie = setCookie.find((c) => c.startsWith('github_oauth_state='));
    expect(stateCookie).toBeDefined();
    expect(stateCookie.toLowerCase()).toContain('httponly');
    expect(stateCookie.toLowerCase()).toContain('samesite=lax');

    const stateValue = stateCookie.split(';')[0].split('=')[1];
    expect(res.headers.location).toContain(`state=${stateValue}`);
  });

  it('rejects the callback when the state does not match the cookie, without calling GitHub', async () => {
    const res = await request(app)
      .get('/api/auth/github/callback')
      .query({ code: 'irrelevant', state: 'wrong-state' })
      .set('Cookie', ['github_oauth_state=correct-state']);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=oauth_state_mismatch');
  });

  it('rejects the callback when no state cookie was ever set', async () => {
    const res = await request(app)
      .get('/api/auth/github/callback')
      .query({ code: 'irrelevant', state: 'anything' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=oauth_state_mismatch');
  });
});
