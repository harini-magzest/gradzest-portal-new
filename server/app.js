const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { verifyAccessToken, verifyFileToken } = require('./lib/tokens');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const { MongoRateLimitStore } = require('./lib/mongoRateLimitStore');
const cookieParser = require('cookie-parser');
const path = require('path');
// Load env file: .env.production or .env.development first, fall back to .env
const envFile = process.env.NODE_ENV === 'production' ? '.env.production'
  : process.env.NODE_ENV === 'development' ? '.env.development'
  : '.env';
require('dotenv').config({ path: path.join(__dirname, envFile) });
// Also load base .env for any missing keys
require('dotenv').config({ path: path.join(__dirname, '.env') });

if (!process.env.JWT_SECRET || !process.env.MONGODB_URI) {
  console.error('Missing required env vars: JWT_SECRET and MONGODB_URI must be set in server/.env');
  process.exit(1);
}
// A weak or placeholder signing secret would let anyone forge admin tokens: refuse it in production, warn elsewhere.
// FILE_URL_SECRET signs the short-lived /uploads links (lib/fileLinks.js). Outside production a missing one is derived
// from JWT_SECRET; production needs its own, so a leak of one secret does not give away the other.
{
  const { secretProblem } = require('./lib/tokens');
  const problems = [secretProblem(process.env.JWT_SECRET, 'JWT_SECRET')];
  if (process.env.FILE_URL_SECRET || process.env.NODE_ENV === 'production') {
    problems.push(secretProblem(process.env.FILE_URL_SECRET, 'FILE_URL_SECRET'));
    if (process.env.FILE_URL_SECRET === process.env.JWT_SECRET) problems.push('FILE_URL_SECRET must differ from JWT_SECRET');
  }
  const found = problems.filter(Boolean);
  if (found.length && process.env.NODE_ENV === 'production') {
    for (const problem of found) console.error(problem);
    console.error(`Generate a secret with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`);
    process.exit(1);
  }
  if (process.env.NODE_ENV !== 'test') for (const problem of found) console.warn(`[security] ${problem} (allowed outside production only)`);
}
if (!process.env.SMTP_PASS) {
  console.warn('[warn] SMTP_PASS is not set — emails will not be delivered. Set SMTP_PASS in server/.env to enable email features.');
}

const { initActivityLogger } = require('./middleware/logActivity');
const { initSecurityLogger } = require('./middleware/logSecurityEvent');
const requestLogger = require('./middleware/requestLogger');
const { ipBlockMiddleware, refreshBlockedIps } = require('./middleware/ipBlock');
const { wafQueryCheck, wafBodyCheck } = require('./middleware/wafRules');
const { skyload, isTrustedSocAdmin } = require('./middleware/skyload');
const { userIdFromToken, isAssetRequest } = require('./lib/clientKey');
const { ensureClamd } = require('./lib/ensureClamd');
const { markActive } = require('./lib/activeFeatures');

const app = express();
app.disable('x-powered-by');
// Required for req.ip to resolve the real client IP behind a reverse proxy/load balancer,
// and for rate limiters to key correctly by client rather than by proxy.
app.set('trust proxy', process.env.TRUST_PROXY || 1);
markActive('trust_proxy', `TRUST_PROXY=${process.env.TRUST_PROXY || 1}`);
const httpServer = createServer(app);

// Blocked IPs are rejected before anything else runs (CORS/helmet/rate-limiters
// included) — this depends on trust proxy being set above for req.ip to be correct.
app.use(ipBlockMiddleware);

// Only the verbs the API actually uses. TRACE/TRACK (cross-site tracing), CONNECT and any made-up method are refused
// before routing, so they can't slip past middleware that only expects the usual verbs.
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
app.use((req, res, next) => {
  if (ALLOWED_METHODS.has(req.method)) return next();
  res.set('Allow', [...ALLOWED_METHODS].join(', '));
  res.status(405).json({ message: 'Method not allowed' });
});
markActive('ip_block', 'server/middleware/ipBlock.js mounted before CORS/helmet');
refreshBlockedIps().catch(() => {});
if (process.env.NODE_ENV !== 'test') ensureClamd().catch((err) => console.error('[ensureClamd] Failed:', err.message));

// Real, self-hosted WAF-style signature check on the URL/query string — as
// early as possible, before CORS/helmet even run. Body-based check is
// mounted after express.json()/urlencoded() below, once there's a body to read.
app.use(wafQueryCheck);
markActive('waf', `server/middleware/wafRules.js — ${require('./middleware/wafRules').SIGNATURE_COUNT} signatures`);

// Skyload — connection throttling + bot/anomaly scoring, adaptive to each
// IP's growing/decaying reputation. Mounted early, same tier as the WAF.
app.use(skyload);
markActive('skyload', 'server/middleware/skyload.js — connection throttle + bot scoring + IP reputation');
const ALLOWED_ORIGINS = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    // In development, allow any localhost port (Vite may pick 5174, 5175, etc.)
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
};

const io = new Server(httpServer, {
  cors: corsOptions,
});

app.use(cors(corsOptions));

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-site' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));
markActive('helmet', 'helmet() with CSP default-src none, frameAncestors none');

// Strip $ and . from user input to block NoSQL injection
app.use(mongoSanitize());
markActive('nosql_sanitize', 'express-mongo-sanitize strips $/. from req.body/query/params');

// Log every /api request (method/path/status/latency/IP) for the SOC dashboard.
// Mounted before the rate limiters so 429s are captured too.
app.use('/api', requestLogger);

// Rate limiters — skipped in the test env so integration tests (which legitimately
// make many sequential auth calls from the same "IP") don't trip each other's quota.
// Rate-limiter behavior itself is covered by its own dedicated test instead.
const authLimiter = rateLimit({
  store: new MongoRateLimitStore('auth'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in 15 minutes.' },
});
// Login counts only failed attempts, so a correct password never uses up the budget.
// Failures are counted per IP + email: one person mistyping their password must not lock
// out colleagues on the same office network. The per-IP cap still stops password spraying.
const loginFailLimiter = rateLimit({
  store: new MongoRateLimitStore('login-fail'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${rateLimit.ipKeyGenerator(req.ip)}|${String(req.body?.email || '').toLowerCase()}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many failed login attempts. Please try again in 15 minutes.' },
});
const loginIpLimiter = rateLimit({
  store: new MongoRateLimitStore('login-ip'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => rateLimit.ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many failed login attempts from this network. Please try again in 15 minutes.' },
});
// Counted per signed-in user (anonymous: per IP): offices and campuses share one public IP, and a single dashboard
// load is dozens of requests, so an IP-wide budget locked colleagues out of each other. A forged token earns no key.
const limiterKey = (req) => {
  const id = userIdFromToken(req);
  return id ? `user:${id}` : rateLimit.ipKeyGenerator(req.ip);
};
const generalLimiter = rateLimit({
  store: new MongoRateLimitStore('general'),
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  skip: (req) => isTrustedSocAdmin(req) || isAssetRequest(req), // logo/favicon images have their own limiter below
  keyGenerator: limiterKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
});
// University logos and favicons: a list page loads one per card, so the cap is generous, but still bounded because
// these routes fetch from third-party sites on a cache miss.
const assetLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  keyGenerator: limiterKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
});
// Public marketing-form submissions (routes/forms.js). Generous enough for an education fair where many visitors
// share the venue Wi-Fi, low enough to stop a script flooding the Students list with fake leads.
const formSubmitLimiter = rateLimit({
  store: new MongoRateLimitStore('form-submit'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  skip: (req) => req.method !== 'POST',
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many submissions from this network. Please try again in a few minutes.' },
});

if (process.env.NODE_ENV !== 'test') {
  // /login is limited after the body parsers below (it needs req.body.email).
  // /refresh and /logout are deliberately not limited: every expired access token (15 min)
  // triggers a refresh, so counting them would lock out active users behind a shared IP.
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/auth/reset-password', authLimiter);
  app.use('/api/auth/resend-verification', authLimiter);
  app.use('/api/auth/facebook', authLimiter);
  app.use('/api/auth/github', authLimiter);
  app.use('/api/auth/github/callback', authLimiter);
  app.use('/api/forms/public', formSubmitLimiter);
  app.use('/api/zest/public/lead', formSubmitLimiter);
  app.use('/api/subscribe', formSubmitLimiter);
  app.use('/api', generalLimiter);
  app.use(['/api/unilogo', '/api/favicon'], assetLimiter);
  markActive('rate_limit_auth', '10 req / 15 min on auth endpoints');
  markActive('rate_limit_general', '120 req / min on /api');
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(wafBodyCheck);
app.use(cookieParser());
if (process.env.NODE_ENV !== 'test') {
  app.use('/api/auth/login', loginIpLimiter, loginFailLimiter);
  // The second sign-in step takes the same failure budget: a wrong code counts, a right one does not.
  app.use('/api/auth/2fa/login', loginIpLimiter, loginFailLimiter);
}

// Uploaded files: a signed-in user is not enough. Each download is resolved to its owner (a chat room, a student's
// or counselor's document, an offer letter) and checked — see lib/fileAccess.js. Unknown files are admin-only.
// The app opens a file with a short-lived signed link (POST /api/files/:name/link, lib/fileLinks.js). An Authorization
// header with the access token works too. ?token= carries only a download-only file token (lib/tokens.js), never the
// access token (URLs end up in history, proxy logs and Referer headers), and only while ALLOW_LEGACY_UPLOAD_TOKENS
// allows it: off in production unless turned on while browsers still run a frontend that sends it.
app.use('/uploads', async (req, res, next) => {
  const { isBlocked, tokenRevoked, currentAccess } = require('./lib/accountState');
  const { checkSignedUpload, legacyUploadTokensAllowed } = require('./lib/fileLinks');
  try {
    const name = decodeURIComponent(req.path).replace(/^\/+/, '');
    let user;
    if (req.query.sig !== undefined) {
      const link = checkSignedUpload(name, req.query);
      if (link.error === 'expired') return res.status(403).json({ message: 'This link has expired. Open the file again from the app.' });
      if (link.error) return res.status(403).json({ message: 'Invalid link' });
      // The account's current role, not one captured when the link was made; and "sign out everywhere" ends links too
      user = await currentAccess(link.userId);
      if (!user || await tokenRevoked({ id: link.userId, iatMs: link.issuedAt })) {
        return res.status(401).json({ message: 'This account is no longer active.' });
      }
    } else {
      const headerToken = req.headers.authorization?.split(' ')[1];
      const queryToken = legacyUploadTokensAllowed() && typeof req.query.token === 'string' ? req.query.token : '';
      if (!headerToken && !queryToken) return res.status(401).json({ message: 'Authentication required' });
      try {
        user = headerToken ? verifyAccessToken(headerToken) : verifyFileToken(queryToken);
      } catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
      }
      if (await isBlocked(user.id) || await tokenRevoked(user)) return res.status(401).json({ message: 'This account is no longer active.' });
    }
    if (!(await require('./lib/fileAccess').canAccessUpload(user, name))) return res.status(404).json({ message: 'File not found' });
    next();
  } catch {
    res.status(404).json({ message: 'File not found' });
  }
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Share io and userSockets with route handlers
const userSockets = new Map(); // userId -> Set<socketId>
app.set('io', io);
app.set('userSockets', userSockets);
// userId -> ISO time their last connection closed (in memory; resets on restart)
const lastSeen = new Map();
app.set('lastSeen', lastSeen);

// Nodemailer transporter — configure SMTP credentials in server/.env
const nodemailer = require('nodemailer');
const mailer = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT)  || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

// Record every email sent to a student (shown on the student record's Emails tab)
require('./lib/emailLog').withEmailLog(mailer);
app.set('mailer', mailer);
require('./lib/criticalAlert').initCriticalAlert(mailer);
markActive('critical_alert', 'server/lib/criticalAlert.js — emails admins on new critical-severity incidents');

// Public email subscription / free registration
const Subscriber = require('./models/Subscriber');
app.post('/api/subscribe', async (req, res) => {
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const email = str(req.body.email, 254).toLowerCase();
  const name  = str(req.body.name, 100);
  const phone = str(req.body.phone, 30);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Invalid email address' });
  }
  try {
    const existing = await Subscriber.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Already subscribed' });

    const sub = await Subscriber.create({ name, email, phone });

    // Notify all connected admin sockets
    io.to('full-admin-room').emit('admin:new_subscriber', {
      name:         sub.name,
      email:        sub.email,
      phone:        sub.phone,
      subscribedAt: sub.subscribedAt,
    });

    // Send thank-you email to the new subscriber
    // The name is whatever a visitor typed — escape it so it can't inject markup or links into our email.
    const safeName = sub.name.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const greeting = safeName ? `Hi ${safeName},` : 'Hello,';
    mailer.sendMail({
      from:    `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to:      sub.email,
      subject: 'Thank you for registering with Gradzest!',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
          <div style="background:#3b0764;padding:32px 24px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:1px;">Gradzest</h1>
            <p style="color:#e9d5ff;margin:8px 0 0;font-size:13px;">Your Global Education Partner</p>
          </div>
          <div style="background:#fff;padding:32px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
            <p style="font-size:16px;">${greeting}</p>
            <p style="font-size:15px;line-height:1.6;">
              Thank you for registering with <strong>Gradzest</strong>! We're thrilled to have you on board.
            </p>
            <p style="font-size:15px;line-height:1.6;">
              Our team will reach out to you shortly to discuss how we can help you achieve your study-abroad goals.
            </p>
            <div style="margin:28px 0;padding:20px;background:#f5f3ff;border-left:4px solid #7c3aed;border-radius:4px;">
              <p style="margin:0;font-size:14px;color:#5b21b6;">
                <strong>What happens next?</strong><br/>
                A Gradzest counselor will contact you to understand your preferences and guide you through the best university options worldwide.
              </p>
            </div>
            <p style="font-size:14px;color:#6b7280;">
              If you have any questions, simply reply to this email — we're always happy to help.
            </p>
            <p style="font-size:15px;margin-top:24px;">
              Warm regards,<br/>
              <strong>The Gradzest Team</strong>
            </p>
          </div>
          <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px;">
            © ${new Date().getFullYear()} Gradzest · ${process.env.SMTP_USER || 'info@gradzest.com'}
          </p>
        </div>
      `,
    }).catch(err => console.error('[mailer] thank-you email failed:', err.message));

    res.status(201).json({ message: 'Subscribed successfully' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Give the activity/security loggers access to the socket server
initActivityLogger(io);
initSecurityLogger(io);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/account', require('./routes/account'));
app.use('/api/countries', require('./routes/countries'));
app.use('/api/universities', require('./routes/universities'));
app.use('/api/students', require('./routes/students'));
app.use('/api/counselors', require('./routes/counselors'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/events',   require('./routes/events'));
app.use('/api/referrals', require('./routes/referrals'));
app.use('/api/privacy', require('./routes/privacy'));
app.use('/api/parent-links', require('./routes/parent').manage);
app.use('/api/parent', require('./routes/parent').view);
app.use('/api/favicon', require('./routes/favicon'));
app.use('/api/unilogo', require('./routes/unilogo'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/ui-trail', require('./routes/uiTrail'));
app.use('/api/soc', require('./routes/soc'));
app.use('/api/soc', require('./routes/socExtras'));
app.use('/api/tasks',         require('./routes/tasks'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/onboarding',    require('./routes/onboarding'));
app.use('/api/automation',    require('./routes/automation'));
app.use('/api/roles',         require('./routes/roles'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/zest',          require('./routes/zest'));
 app.use('/api/dashboards',    require('./routes/dashboards'));
app.use('/api/forms',         require('./routes/forms'));
app.use('/api/files',         require('./routes/files'));

// Health check — no auth required, used by hosting platforms and monitoring. Says only whether the service is up:
// no environment name, versions or uptime for an unauthenticated caller.
const mongoose = require('mongoose');
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';
  const ok = dbState === 1;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    db: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// Verify JWT on every socket connection — rejects unauthenticated clients
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized'));
  try {
    const decoded = verifyAccessToken(token);
    const { isBlocked, tokenRevoked } = require('./lib/accountState');
    if (await isBlocked(decoded.id) || await tokenRevoked(decoded)) return next(new Error('Unauthorized'));
    socket.data.userId = String(decoded.id);
    socket.data.role = decoded.role;
    socket.data.isAppTeam = !!decoded.isAppTeam;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

// Room membership is decided when a socket connects, so an owner who is later demoted, deactivated, locked or removed from
// SOC_OWNER_EMAILS would keep receiving live security events and PII until the tab closed. Re-check the members of
// admin-room regularly and drop anyone who is no longer an owner.
const OWNER_RECHECK_MS = Math.max(200, parseInt(process.env.SOC_OWNER_RECHECK_MS || '60000', 10) || 60000);
const ownerRecheck = setInterval(async () => {
  try {
    const sockets = await io.in('admin-room').fetchSockets();
    if (!sockets.length) return;
    const { isSocOwnerEmail } = require('./lib/socOwners');
    const { isBlocked } = require('./lib/accountState');
    const users = await require('./models/User').find({ _id: { $in: [...new Set(sockets.map((s) => s.data.userId))] } }).select('email').lean();
    const emailOf = new Map(users.map((u) => [String(u._id), u.email]));
    for (const s of sockets) {
      const uid = String(s.data.userId);
      if (!isSocOwnerEmail(emailOf.get(uid)) || await isBlocked(uid)) s.leave('admin-room');
    }
  } catch { /* try again next tick */ }
}, OWNER_RECHECK_MS);
if (ownerRecheck.unref) ownerRecheck.unref();

// WebRTC signaling
io.on('connection', (socket) => {
  // Rooms are joined on connection, not only on 'register': the SOC tabs open their own socket and never send
  // 'register', so without this their live feeds would say "Live" but never receive an event.
  const doJoinRooms = async () => {
    const uid = socket.data.userId;
    if (!uid) return true;
    // Rooms decide who is pushed what:
    //   user:<id>        one person (targeted activity)
    //   activity-room    admins + Application Team (the business activity feed)
    //   full-admin-room  full admins only (e.g. new-subscriber alerts)
    //   admin-room       the SOC OWNER(S) ONLY — it carries every security event, incident, PII access, upload and
    //                    activity row with names and devices. Being an admin is not enough; the REST API applies the
    //                    same rule (lib/socOwners.js), so the live feed can't be a side door around it.
    socket.join(`user:${uid}`);
    if (socket.data.role === 'admin') {
      socket.join('activity-room');
      if (!socket.data.isAppTeam) {
        socket.join('full-admin-room');
        try {
          const me = await require('./models/User').findById(uid).select('email').lean();
          if (me && require('./lib/socOwners').isSocOwnerEmail(me.email)) socket.join('admin-room');
        } catch { return false; /* no owner room on a lookup failure: fail closed (a later 'register' retries) */ }
      }
    }
    return true;
  };
  // Runs once per connection (it is called on connect and again on 'register'); only a failed owner lookup is retried.
  let joining = null;
  const joinRooms = () => {
    if (!joining) joining = doJoinRooms().then((ok) => { if (!ok) joining = null; });
    return joining;
  };
  void joinRooms();

  socket.on('register', async () => {
    const uid = socket.data.userId;
    if (!uid) return;
    const wasOffline = !userSockets.has(uid);
    if (wasOffline) userSockets.set(uid, new Set());
    userSockets.get(uid).add(socket.id);
    await joinRooms();
    // Presence: first open connection -> online
    if (wasOffline) io.emit('presence:update', { userId: uid, online: true });
  });

  const relay = (event, to, payload) => {
    const sids = userSockets.get(String(to));
    if (sids) sids.forEach(sid => io.to(sid).emit(event, payload));
  };

  // Call signalling. The caller's identity comes from the verified socket, never from the message: previously a
  // signed-in user could ring anyone while claiming to be anyone (and the receiving screen showed that claimed name).
  const identityCache = new Map(); // userId -> { name, role, at }
  const identityOf = async (uid) => {
    const hit = identityCache.get(uid);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit;
    const u = await require('./models/User').findById(uid).select('name role').lean().catch(() => null);
    const entry = u ? { name: u.name || '', role: u.role || '', at: Date.now() } : null;
    if (entry) identityCache.set(uid, entry);
    return entry;
  };
  let inviteWindow = [];
  const allowInvite = () => {
    const now = Date.now();
    inviteWindow = inviteWindow.filter((t) => now - t < 60 * 1000);
    if (inviteWindow.length >= 10) return false; // ring spam
    inviteWindow.push(now);
    return true;
  };
  const asId = (v) => (typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v) ? v : null);

  socket.on('call:invite', async ({ to, callType } = {}) => {
    try {
      const target = asId(to);
      if (!target || !allowInvite()) return;
      const [me, them] = await Promise.all([identityOf(socket.data.userId), identityOf(target)]);
      if (!me || !them) return;
      if (me.role === 'student' && them.role === 'student') return; // students may only call staff
      relay('call:incoming', target, { from: socket.data.userId, fromName: me.name, fromRole: me.role, callType: callType === 'audio' ? 'audio' : 'video' });
    } catch { /* never let a malformed signal crash the socket */ }
  });
  socket.on('call:accept', ({ to } = {}) => { const t = asId(to); if (t) relay('call:accepted', t, { from: socket.data.userId }); });
  socket.on('call:reject', ({ to } = {}) => { const t = asId(to); if (t) relay('call:rejected', t, {}); });
  socket.on('call:end', ({ to } = {}) => { const t = asId(to); if (t) relay('call:ended', t, {}); });
  socket.on('call:offer', ({ to, offer } = {}) => { const t = asId(to); if (t) relay('call:offer', t, { offer, from: socket.data.userId }); });
  socket.on('call:answer', ({ to, answer } = {}) => { const t = asId(to); if (t) relay('call:answer', t, { answer }); });
  socket.on('call:ice', ({ to, candidate } = {}) => { const t = asId(to); if (t) relay('call:ice', t, { candidate }); });
  socket.on('chat:call-logged', ({ to } = {}) => { const t = asId(to); if (t) relay('chat:call-logged', t, {}); });

  socket.on('disconnect', () => {
    if (socket.data.userId) {
      const sids = userSockets.get(socket.data.userId);
      if (sids) {
        sids.delete(socket.id);
        if (sids.size === 0) {
          userSockets.delete(socket.data.userId);
          // Presence: last connection closed -> offline
          const at = new Date().toISOString();
          lastSeen.set(socket.data.userId, at);
          io.emit('presence:update', { userId: socket.data.userId, online: false, lastSeen: at });
        }
      }
    }
  });
});

// Unknown API paths (or a known path with a method it doesn't support) get a plain JSON 404, not Express's HTML page
// naming the method and path
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

// Global error handler — catches anything thrown in routes
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';
  if (status >= 500) console.error(`[error] ${req.method} ${req.path}`, err);
  res.status(status).json({ message });
});

module.exports = { app, io, httpServer, userSockets, mailer };
