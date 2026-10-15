// Launch readiness: the generated robots.txt / sitemap.xml, and the "Manage email notifications" footer on the reminder
// emails that the email toggle controls (and only those).
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const seo = require('../../scripts/generate-seo.mjs');
const { preferencesUrl, withPreferencesFooter, withReminderFooter } = require('../lib/notificationChannels');
const { runDeadlineCheck } = require('../jobs/deadlineReminders');
const { runDocumentReminders } = require('../jobs/documentReminders');
const { runEventReminderCheck } = require('../jobs/eventReminders');

describe('normalizeSiteUrl', () => {
  it('defaults to the address index.html already uses, and drops a trailing slash', () => {
    expect(seo.normalizeSiteUrl()).toBe('https://gradzest.com');
    expect(seo.normalizeSiteUrl('https://www.example.org/')).toBe('https://www.example.org');
  });

  it.each(['gradzest.com', 'ftp://gradzest.com', 'https://gradzest.com/app', 'https://gradzest.com/?a=1', ''])(
    'rejects %j', (bad) => {
      // an empty string falls back to the default, so only the others must throw
      if (bad === '') expect(seo.normalizeSiteUrl(bad || undefined)).toBe('https://gradzest.com');
      else expect(() => seo.normalizeSiteUrl(bad)).toThrow(/SITE_URL/);
    },
  );
});

describe('readBlogPosts', () => {
  it('pairs each slug with its own date and ignores the interface declaration', () => {
    const source = `export interface BlogPost { slug: string; publishedAt: string; }
      export const blogPosts = [
        { id: '1', slug: 'first-post', title: 'A', content: \`long\`, publishedAt: '2025-05-10', tags: [] },
        { id: '2', slug: 'second-post', title: 'B', content: \`long\`, publishedAt: '2025-04-22', tags: [] },
      ];`;
    expect(seo.readBlogPosts(source)).toEqual([
      { slug: 'first-post', publishedAt: '2025-05-10' },
      { slug: 'second-post', publishedAt: '2025-04-22' },
    ]);
  });

  it('never lends a post the next post\'s date', () => {
    const source = `{ slug: 'no-date', title: 'x' }, { slug: 'dated', publishedAt: '2024-01-02' }`;
    expect(seo.readBlogPosts(source)).toEqual([
      { slug: 'no-date', publishedAt: null },
      { slug: 'dated', publishedAt: '2024-01-02' },
    ]);
  });
});

describe('sitemap.xml and robots.txt', () => {
  const siteUrl = 'https://gradzest.com';

  it('lists the static pages and every post, with lastmod only where a date is known', () => {
    const xml = seo.buildSitemap({
      siteUrl, posts: [{ slug: 'a-post', publishedAt: '2025-05-10' }, { slug: 'undated', publishedAt: null }],
    });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    for (const p of ['/', '/universities', '/resources', '/privacy', '/terms']) {
      expect(xml).toContain(`<loc>${siteUrl}${p}</loc>`);
    }
    expect(xml).toContain('<loc>https://gradzest.com/resources/a-post</loc>\n    <lastmod>2025-05-10</lastmod>');
    expect(xml).toContain('<loc>https://gradzest.com/resources/undated</loc>\n    <changefreq>'); // no lastmod line
    expect((xml.match(/<url>/g) || []).length).toBe(7);
    expect(xml).not.toMatch(/\/admin|\/student|\/login|\/api/);
  });

  it('escapes XML-significant characters in a location', () => {
    const xml = seo.buildSitemap({ siteUrl, posts: [{ slug: 'a&b', publishedAt: null }] });
    expect(xml).toContain('/resources/a&amp;b</loc>');
  });

  it('keeps signed-in areas out of search results and points at the sitemap', () => {
    const robots = seo.buildRobots({ siteUrl });
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
    for (const p of ['/api/', '/admin', '/student', '/counselor', '/soc', '/login', '/reset-password']) {
      expect(robots).toContain(`Disallow: ${p}`);
    }
    expect(robots).not.toMatch(/^Disallow: \/$/m); // must not block the whole site
    expect(robots).toContain('Sitemap: https://gradzest.com/sitemap.xml');
  });
});

describe('generate()', () => {
  let dist;
  beforeEach(() => { dist = fs.mkdtempSync(path.join(os.tmpdir(), 'gz-seo-')); });
  afterEach(() => { fs.rmSync(dist, { recursive: true, force: true }); });

  it('writes both files for the real blog data, using SITE_URL', () => {
    const result = seo.generate({ dist, env: { SITE_URL: 'https://staging.gradzest.com' } });
    expect(result.siteUrl).toBe('https://staging.gradzest.com');
    expect(result.posts).toBeGreaterThan(0);

    const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
    const robots = fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8');
    expect(robots).toContain('Sitemap: https://staging.gradzest.com/sitemap.xml');
    expect((sitemap.match(/\/resources\/[a-z0-9-]+<\/loc>/g) || []).length).toBe(result.posts);
    expect(sitemap).not.toContain('https://gradzest.com'); // nothing hard-coded to the production host
  });

  it('stops the build with a clear message when dist/ is missing or the blog format changed', () => {
    expect(() => seo.generate({ dist: path.join(dist, 'nope'), env: {} })).toThrow(/does not exist/);
    expect(() => seo.generate({ dist, env: {}, blogSource: 'export const blogPosts = [];' })).toThrow(/no blog posts/);
  });
});

describe('preferencesUrl and the footer helpers', () => {
  it('points a student and a counselor at the profile page that holds the toggle', () => {
    expect(preferencesUrl('student', 'https://gradzest.com')).toBe('https://gradzest.com/student/profile');
    expect(preferencesUrl('counselor', 'https://gradzest.com/')).toBe('https://gradzest.com/counselor/profile');
  });

  it('gives no link where there is no page (admin, guest) or no usable address', () => {
    expect(preferencesUrl('admin', 'https://gradzest.com')).toBeNull();
    expect(preferencesUrl(undefined, 'https://gradzest.com')).toBeNull();
    expect(preferencesUrl('student', '')).toBeNull();
    expect(preferencesUrl('student', 'not a url')).toBeNull();
  });

  it('adds the footer to html and to text, and only to the parts that exist', () => {
    const both = withPreferencesFooter({ html: '<p>Hi</p>', text: 'Hi' }, 'student', 'https://gradzest.com');
    expect(both.html).toContain('<p>Hi</p><p');
    expect(both.html).toContain('href="https://gradzest.com/student/profile"');
    expect(both.html).toContain('Manage email notifications');
    expect(both.text).toBe('Hi\n\n--\nYou get this email because reminders are switched on in your notification settings.\nManage email notifications: https://gradzest.com/student/profile');

    const htmlOnly = withPreferencesFooter({ html: '<p>Hi</p>' }, 'student', 'https://gradzest.com');
    expect(Object.keys(htmlOnly)).toEqual(['html']);
  });

  it('leaves the email exactly as it was when there is no page to link to', () => {
    expect(withPreferencesFooter({ html: '<p>Hi</p>', text: 'Hi' }, 'admin', 'https://gradzest.com'))
      .toEqual({ html: '<p>Hi</p>', text: 'Hi' });
  });

  it('keeps the rest of the mail options', () => {
    const out = withReminderFooter({ from: 'a', to: 'b', subject: 's', text: 't' }, 'counselor', 'https://gradzest.com');
    expect(out).toMatchObject({ from: 'a', to: 'b', subject: 's' });
    expect(out.text).toContain('https://gradzest.com/counselor/profile');
  });
});

// ---- the jobs, end to end --------------------------------------------------------------------------------------
const DAY = 86400000;
let n = 0;
const uniq = (p) => `${p}-${Date.now()}-${n++}`;
const isoIn = (days) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const fakeMailer = () => { const sent = []; return { sent, sendMail: async (m) => { sent.push(m); } }; };

describe('reminder emails carry the footer', () => {
  it('deadline reminder', async () => {
    const email = `${uniq('dl')}@example.com`;
    await User.create({
      name: 'Deadline Student', email, password: 'x', role: 'student', status: 'application',
      applications: [{ universityName: 'Some University', courseName: 'MSc', status: 'submitted', intake: isoIn(7) }],
    });
    const mailer = fakeMailer();
    await runDeadlineCheck(null, null, mailer);

    const mail = mailer.sent.find((m) => m.to === email);
    expect(mail, 'a deadline email was sent').toBeTruthy();
    expect(mail.html).toContain('Manage email notifications');
    expect(mail.html).toContain(`${process.env.FRONTEND_URL}/student/profile`);
  });

  it('document reminder', async () => {
    const email = `${uniq('doc')}@example.com`;
    await User.create({
      name: 'Doc Student', email, password: 'x', role: 'student', status: 'application',
      applications: [{ universityName: 'Some University', courseName: 'MSc', status: 'submitted', intake: isoIn(200) }],
    });
    const mailer = fakeMailer();
    await runDocumentReminders(null, null, mailer);

    const mail = mailer.sent.find((m) => m.to === email);
    expect(mail, 'a document email was sent').toBeTruthy();
    expect(mail.html).toContain('Manage email notifications');
    expect(mail.html).toContain('/student/profile');
  });

  it('event reminder (text-only email): a registered student gets the link', async () => {
    const mk = async (role) => {
      const email = `${uniq(`evt-${role}`)}@example.com`;
      await request(app).post('/api/auth/register').send({ name: `E ${role}`, email, password: 'TestPass123!' });
      await User.findOneAndUpdate({ email }, { emailVerified: true, role });
      const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
      return { token: res.body.token, email };
    };
    const as = (u) => ({ Authorization: `Bearer ${u.token}` });
    const admin = await mk('admin');
    const student = await mk('student');
    const { body: ev } = await request(app).post('/api/events').set(as(admin)).send({
      title: 'Study in the UK', startsAt: new Date(Date.now() + 20 * 3600000).toISOString(), link: 'https://zoom.us/j/123',
    });
    await request(app).post(`/api/events/${ev.id}/register`).set(as(student));

    const mailer = fakeMailer();
    await runEventReminderCheck(null, null, mailer);

    const mail = mailer.sent.find((m) => m.to === student.email);
    expect(mail, 'an event email was sent').toBeTruthy();
    expect(mail.html).toBeUndefined();
    expect(mail.text).toContain('Manage email notifications: ');
    expect(mail.text).toContain(`${process.env.FRONTEND_URL}/student/profile`);
  });
});
