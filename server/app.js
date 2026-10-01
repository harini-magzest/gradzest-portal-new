const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
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
if (!process.env.SMTP_PASS) {
  console.warn('[warn] SMTP_PASS is not set — emails will not be delivered. Set SMTP_PASS in server/.env to enable email features.');
}

const { initActivityLogger } = require('./middleware/logActivity');
const { initSecurityLogger } = require('./middleware/logSecurityEvent');
const requestLogger = require('./middleware/requestLogger');
const { ipBlockMiddleware, refreshBlockedIps } = require('./middleware/ipBlock');
const { wafQueryCheck, wafBodyCheck } = require('./middleware/wafRules');
const { skyload } = require('./middleware/skyload');
const { ensureClamd } = require('./lib/ensureClamd');
const { markActive } = require('./lib/activeFeatures');

const app = express();
// Required for req.ip to resolve the real client IP behind a reverse proxy/load balancer,
// and for rate limiters to key correctly by client rather than by proxy.
app.set('trust proxy', process.env.TRUST_PROXY || 1);
markActive('trust_proxy', `TRUST_PROXY=${process.env.TRUST_PROXY || 1}`);
const httpServer = createServer(app);

// Blocked IPs are rejected before anything else runs (CORS/helmet/rate-limiters
// included) — this depends on trust proxy being set above for req.ip to be correct.
app.use(ipBlockMiddleware);
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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in 15 minutes.' },
});
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
});

if (process.env.NODE_ENV !== 'test') {
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/auth/reset-password', authLimiter);
  app.use('/api/auth/resend-verification', authLimiter);
  app.use('/api/auth/refresh', authLimiter);
  app.use('/api/auth/logout', authLimiter);
  app.use('/api/auth/facebook', authLimiter);
  app.use('/api/auth/github', authLimiter);
  app.use('/api/auth/github/callback', authLimiter);
  app.use('/api', generalLimiter);
  markActive('rate_limit_auth', '10 req / 15 min on auth endpoints');
  markActive('rate_limit_general', '120 req / min on /api');
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(wafBodyCheck);
app.use(cookieParser());

// Protect uploaded files — only authenticated users can access them
app.use('/uploads', (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
    || req.query.token; // allow ?token= for direct <img src> links
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
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
  const email = (req.body.email || '').trim().toLowerCase();
  const name  = (req.body.name  || '').trim();
  const phone = (req.body.phone || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Invalid email address' });
  }
  try {
    const existing = await Subscriber.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Already subscribed' });

    const sub = await Subscriber.create({ name, email, phone });

    // Notify all connected admin sockets
    io.to('admin-room').emit('admin:new_subscriber', {
      name:         sub.name,
      email:        sub.email,
      phone:        sub.phone,
      subscribedAt: sub.subscribedAt,
    });

    // Send thank-you email to the new subscriber
    const greeting = sub.name ? `Hi ${sub.name},` : 'Hello,';
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
app.use('/api/countries', require('./routes/countries'));
app.use('/api/universities', require('./routes/universities'));
app.use('/api/students', require('./routes/students'));
app.use('/api/counselors', require('./routes/counselors'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/favicon', require('./routes/favicon'));
app.use('/api/unilogo', require('./routes/unilogo'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/ui-trail', require('./routes/uiTrail'));
app.use('/api/soc', require('./routes/soc'));
app.use('/api/tasks',         require('./routes/tasks'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/onboarding',    require('./routes/onboarding'));
app.use('/api/automation',    require('./routes/automation'));
app.use('/api/roles',         require('./routes/roles'));
app.use('/api/users',         require('./routes/users'));

// Health check — no auth required, used by hosting platforms and monitoring
const mongoose = require('mongoose');
const startTime = Date.now();
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';
  const uptimeMs = Date.now() - startTime;
  const h = Math.floor(uptimeMs / 3600000);
  const m = Math.floor((uptimeMs % 3600000) / 60000);
  const s = Math.floor((uptimeMs % 60000) / 1000);
  const uptime = `${h}h ${m}m ${s}s`;
  const ok = dbState === 1;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    db: dbStatus,
    uptime,
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// Verify JWT on every socket connection — rejects unauthenticated clients
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.data.userId = String(decoded.id);
    socket.data.role = decoded.role;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

// WebRTC signaling
io.on('connection', (socket) => {
  socket.on('register', () => {
    const uid = socket.data.userId;
    if (!uid) return;
    const wasOffline = !userSockets.has(uid);
    if (wasOffline) userSockets.set(uid, new Set());
    userSockets.get(uid).add(socket.id);
    if (socket.data.role === 'admin') socket.join('admin-room');
    // Presence: first open connection -> online
    if (wasOffline) io.emit('presence:update', { userId: uid, online: true });
  });

  const relay = (event, to, payload) => {
    const sids = userSockets.get(String(to));
    if (sids) sids.forEach(sid => io.to(sid).emit(event, payload));
  };

  socket.on('call:invite',  ({ to, from, fromName, fromRole, callType }) => relay('call:incoming', to, { from, fromName, fromRole, callType }));
  socket.on('call:accept',  ({ to, from })           => relay('call:accepted', to, { from }));
  socket.on('call:reject',  ({ to })                 => relay('call:rejected', to, {}));
  socket.on('call:end',     ({ to })                 => relay('call:ended',    to, {}));
  socket.on('call:offer',   ({ to, offer })           => relay('call:offer',   to, { offer, from: socket.data.userId }));
  socket.on('call:answer',  ({ to, answer })          => relay('call:answer',  to, { answer }));
  socket.on('call:ice',         ({ to, candidate })   => relay('call:ice',         to, { candidate }));
  socket.on('chat:call-logged', ({ to })              => relay('chat:call-logged', to, {}));

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

// Global error handler — catches anything thrown in routes
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';
  if (status >= 500) console.error(`[error] ${req.method} ${req.path}`, err);
  res.status(status).json({ message });
});

module.exports = { app, io, httpServer, userSockets, mailer };
