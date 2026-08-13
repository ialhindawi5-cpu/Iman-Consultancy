/* ============================================================
 *  Iman Hindawi — project coordination consulting
 *  Express app: server-rendered public page + admin dashboard API.
 *
 *  Runs as a single serverless function on Vercel (see vercel.json),
 *  so everything here must be stateless: sessions are JWTs in cookies
 *  and rate-limit counters live in Postgres, not in memory.
 * ============================================================ */
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { SignJWT, jwtVerify } = require('jose');
const { sql, init } = require('./db');
const { renderPage, renderErrorPage, esc } = require('./render');

const app = express();
const PORT = process.env.PORT || 3000;

const OWNER_EMAIL = process.env.ADMIN_EMAIL || 'i.alhindawi5@gmail.com';
const UPLOAD_DIR = path.join(__dirname, 'public', 'assets', 'uploads');
const SITE_URL = (process.env.SITE_URL || 'https://iman-hindawi-consultancy.vercel.app').replace(/\/$/, '');
const AUTH_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'dev-insecure-secret-change-me'
);

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

/* ============================================================
 *  Security headers
 *  Mirrored in vercel.json, which covers static assets served
 *  straight from the CDN without touching this function. Keep the
 *  two in step.
 * ============================================================ */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://*.public.blob.vercel-storage.com",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  next();
});

// Static assets are served before the database is touched. They do not need it,
// and the 500 page below links to /styles.css — if that request also had to get
// past a dead database, the error page would render unstyled exactly when it
// matters most.
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Make sure the schema exists before anything touches it (cached after the first call).
app.use(async (req, res, next) => {
  try { await init(); next(); }
  catch (err) {
    console.error('DB init failed:', err.message);
    // An unreachable database is the most likely 500 there is, so a browser
    // must get the real error page here rather than a wall of JSON.
    if (wantsJson(req)) return res.status(500).json({ error: 'Database unavailable' });
    res.status(500).type('html').send(renderErrorPage({ status: 500, siteUrl: SITE_URL }));
  }
});

/* ============================================================
 *  Rate limiting — database-backed, so it holds across instances
 * ============================================================ */
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function rateLimit(name, max, windowMs) {
  return async (req, res, next) => {
    try {
      const key = `${name}:${clientIp(req)}`;
      const now = Date.now();
      const rows = await sql`SELECT count(*)::int AS n FROM rate_events
                             WHERE k = ${key} AND ts > ${now - windowMs}`;
      if (rows[0].n >= max) {
        res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
      }
      await sql`INSERT INTO rate_events (k, ts) VALUES (${key}, ${now})`;
      // Occasional opportunistic sweep, rather than a cron job for one table.
      if (Math.random() < 0.05) await sql`DELETE FROM rate_events WHERE ts < ${now - 24 * 60 * 60 * 1000}`;
      next();
    } catch (err) {
      // Fail open: a database hiccup must not lock the owner out of their own site.
      console.error('rate-limit error:', err.message);
      next();
    }
  };
}

/* ============================================================
 *  Passwords, tokens, sessions
 * ============================================================ */
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(test, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function signToken(user) {
  return new SignJWT({ email: user.email, tv: user.token_version })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('2d')
    .sign(AUTH_SECRET);
}

const SESSION_COOKIE = 'admin_session';
const CSRF_COOKIE = 'csrf_token';
const SESSION_MAX_AGE = 2 * 24 * 60 * 60 * 1000; // matches the JWT expiry
const cookieSecure = () => !!process.env.VERCEL;  // https in prod, plain http on localhost

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
}

// The session JWT is httpOnly, so page scripts cannot read it. The CSRF token
// is a second, readable cookie that the dashboard must echo in a header on
// every write — double-submit, on top of SameSite=Strict.
function issueSession(res, token) {
  const secure = cookieSecure();
  const csrf = crypto.randomBytes(32).toString('hex');
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: SESSION_MAX_AGE,
  });
  res.cookie(CSRF_COOKIE, csrf, {
    httpOnly: false, secure, sameSite: 'strict', path: '/', maxAge: SESSION_MAX_AGE,
  });
}
function clearSession(res) {
  const opts = { secure: cookieSecure(), sameSite: 'strict', path: '/' };
  res.clearCookie(SESSION_COOKIE, { ...opts, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...opts, httpOnly: false });
}

async function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (!safeEqual(req.get('x-csrf-token'), cookies[CSRF_COOKIE])) {
      return res.status(403).json({ error: 'Invalid or missing CSRF token' });
    }
  }
  try {
    const { payload } = await jwtVerify(token, AUTH_SECRET, { algorithms: ['HS256'] });
    // token_version lets a password change invalidate every existing session.
    const rows = await sql`SELECT id, email, role, token_version FROM users WHERE id = ${payload.sub}`;
    const user = rows[0];
    if (!user || Number(payload.tv) !== user.token_version) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { userId: user.id, email: user.email, role: user.role };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Same check, but it answers instead of rejecting — for the public page, which
// only behaves differently (draft preview) when an admin is signed in.
async function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, AUTH_SECRET, { algorithms: ['HS256'] });
    const rows = await sql`SELECT id, email, role, token_version FROM users WHERE id = ${payload.sub}`;
    const user = rows[0];
    if (!user || Number(payload.tv) !== user.token_version) return null;
    return { userId: user.id, email: user.email, role: user.role };
  } catch {
    return null;
  }
}

const findUserByEmail = async (email) => {
  const rows = await sql`SELECT * FROM users WHERE email = ${String(email || '').toLowerCase().trim()}`;
  return rows[0] || null;
};

/* ============================================================
 *  Email
 * ============================================================ */
function getTransport() {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  return null;
}

const codeMail = (code) =>
  `<p style="font-size:26px;letter-spacing:4px;font-weight:700;color:#2e73a8">${code}</p>`;

async function sendCode(email, code, kind) {
  const transport = getTransport();
  if (!transport) {
    // Local development without mail configured: print it instead.
    console.log(`\n  [DEV] ${kind} code for ${email}: ${code}\n`);
    return { delivered: false };
  }
  const signIn = kind === 'sign-in';
  await transport.sendMail({
    from: `"Iman Hindawi Admin" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: signIn ? 'Your admin sign-in code' : 'Your admin password reset code',
    text: `Your ${kind} code is ${code}.\nIt expires in 10 minutes.`,
    html: `<p>Your ${kind} code is:</p>${codeMail(code)}<p>It expires in 10 minutes.</p>`
      + (signIn
        ? `<p style="color:#888">If you did not just try to sign in, someone may have your password — change it right away.</p>`
        : `<p style="color:#888">If you did not request this, you can ignore this email.</p>`),
  });
  return { delivered: true };
}

async function getNotifyEmail() {
  if (process.env.NOTIFY_EMAIL) return process.env.NOTIFY_EMAIL;
  const rows = await sql`SELECT email FROM users WHERE role = 'owner' LIMIT 1`;
  return rows[0] ? rows[0].email : OWNER_EMAIL;
}

async function sendContactNotification(msg) {
  const transport = getTransport();
  if (!transport) {
    console.log(`\n  [DEV] Contact message from ${msg.email}: ${msg.message}\n`);
    return;
  }
  const to = await getNotifyEmail();
  const row = (k, v) => `<tr><td style="padding:4px 12px 4px 0;color:#888">${k}</td><td>${esc(v || '—')}</td></tr>`;
  await transport.sendMail({
    from: `"Website enquiry" <${process.env.GMAIL_USER}>`,
    to,
    replyTo: msg.email,
    subject: `New enquiry — ${msg.service || 'Project'}`,
    text: `Name: ${msg.name}\nEmail: ${msg.email}\nCompany: ${msg.company || '—'}\n`
      + `Service: ${msg.service || '—'}\n\n${msg.message}`,
    html: `<table>${row('Name', msg.name)}${row('Email', msg.email)}`
      + `${row('Company', msg.company)}${row('Service', msg.service)}</table>`
      + `<p style="white-space:pre-wrap;margin-top:16px">${esc(msg.message)}</p>`,
  });
}

/* ============================================================
 *  Content: published document, draft, pages, versions
 * ============================================================ */
async function getContent() {
  const rows = await sql`SELECT data FROM content WHERE id = 1`;
  return rows[0] ? rows[0].data : null;
}
async function saveContent(data) {
  await sql`UPDATE content SET data = ${JSON.stringify(data)}::jsonb WHERE id = 1`;
}
// A site that has never been edited has no draft row; that reads as a copy of
// what is published, so nothing starts out looking "pending".
async function getDraft() {
  const rows = await sql`SELECT data, draft FROM content WHERE id = 1`;
  if (!rows[0]) return null;
  return rows[0].draft || rows[0].data;
}
async function saveDraft(data) {
  await sql`UPDATE content SET draft = ${JSON.stringify(data)}::jsonb WHERE id = 1`;
}

// A "page" is a named set of paths into the content document. Publishing one
// copies exactly those paths, so a half-finished edit to the hero can never be
// pushed out by publishing the FAQ.
const CONTENT_PAGES = {
  brand: { label: 'Branding & navigation', paths: ['brand', 'nav', 'footer'] },
  hero: { label: 'Hero', paths: ['hero'] },
  why: { label: 'The problem', paths: ['why'] },
  about: { label: 'About', paths: ['about'] },
  services: { label: 'Services', paths: ['services'] },
  approach: { label: 'Approach', paths: ['approach'] },
  engagements: { label: 'Ways to work', paths: ['engagements'] },
  experience: { label: 'Experience', paths: ['experience'] },
  testimonials: { label: 'Testimonials', paths: ['testimonials'] },
  faq: { label: 'FAQ', paths: ['faq'] },
  contact: { label: 'Contact', paths: ['contact'] },
  seo: { label: 'SEO & indexing', paths: ['seo'] },
};
const ALL_PAGES = 'all';

function pagePaths(page) {
  if (page === ALL_PAGES) {
    return Object.values(CONTENT_PAGES).reduce((all, p) => all.concat(p.paths), []);
  }
  return CONTENT_PAGES[page] ? CONTENT_PAGES[page].paths : null;
}
function readPath(obj, p) {
  return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function writePath(obj, p, value) {
  const keys = p.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] = o[k] || {}), obj);
  if (value === undefined) delete target[last];
  else target[last] = value;
}
// Both sides are plain JSON written by the same code, so structural equality is
// enough to answer "is there anything to publish?".
function samePath(a, b, p) {
  return JSON.stringify(readPath(a, p) ?? null) === JSON.stringify(readPath(b, p) ?? null);
}
function pendingPages(draft, published) {
  const pending = {};
  Object.keys(CONTENT_PAGES).forEach((page) => {
    pending[page] = CONTENT_PAGES[page].paths.some((p) => !samePath(draft, published, p));
  });
  return pending;
}
function mergePage(into, from, page) {
  const paths = pagePaths(page);
  if (!paths) return null;
  const next = JSON.parse(JSON.stringify(into));
  paths.forEach((p) => writePath(next, p, readPath(from, p)));
  return next;
}

const VERSIONS_KEPT = 30;
// Each row is the whole document as it stood after the action; a restore takes
// only the page's paths back out of it. Trimming stops the table growing without
// bound on a site that is saved many times a day.
async function recordVersion({ page, action, data, author, label }) {
  await sql`INSERT INTO content_versions (id, page, action, label, author, data)
            VALUES (${crypto.randomUUID()}, ${page}, ${action}, ${label || null},
                    ${author || null}, ${JSON.stringify(data)}::jsonb)`;
  await sql`DELETE FROM content_versions
            WHERE page = ${page} AND id NOT IN (
              SELECT id FROM content_versions WHERE page = ${page}
              ORDER BY created_at DESC LIMIT ${VERSIONS_KEPT}
            )`;
}

/* ============================================================
 *  Image uploads — Vercel Blob in production, local disk in dev
 * ============================================================ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    /^image\//.test(file.mimetype) ? cb(null, true) : cb(new Error('Only image files are allowed')),
});

const BLOB_STORE_ID = process.env.BLOB_STORE_ID || process.env.ImanBlob_STORE_ID;

// Inside a function the OIDC token arrives as a per-request header; the env var
// is only populated during builds. Pass whichever exists to put() explicitly.
function getOidcToken(req) {
  return process.env.VERCEL_OIDC_TOKEN || (req && req.headers['x-vercel-oidc-token']) || null;
}

// Reject anything that is not actually an image, regardless of what the
// declared content-type claims.
function looksLikeImage(b) {
  if (!b || b.length < 12) return false;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const webp = b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP';
  return png || jpg || webp;
}

async function storeImageBuffer(baseName, buffer, contentType, req) {
  const ext = contentType === 'image/png' ? '.png'
    : contentType === 'image/webp' ? '.webp'
      : '.jpg';
  const filename = `${String(baseName).replace(/[^a-z0-9_-]/gi, '')}-${Date.now()}${ext}`;
  const oidcToken = getOidcToken(req);

  if (oidcToken && BLOB_STORE_ID) {
    const { put } = require('@vercel/blob');
    const blob = await put(`uploads/${filename}`, buffer, {
      access: 'public', contentType, storeId: BLOB_STORE_ID, oidcToken,
    });
    return blob.url;
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = require('@vercel/blob');
    const blob = await put(`uploads/${filename}`, buffer, { access: 'public', contentType });
    return blob.url;
  }
  if (process.env.VERCEL) {
    throw new Error('Image storage is not configured. In Vercel: Storage → Blob → Connect to Project, then redeploy.');
  }
  // Local dev only — Vercel's filesystem is read-only at runtime.
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return `assets/uploads/${filename}`;
}

// Which content path each upload target writes to.
const IMAGE_TARGETS = {
  portrait: 'about.image',
  logo: 'brand.logo',
  ogimage: 'seo.image',
};

/* ============================================================
 *  Auth routes
 * ============================================================ */

// Step 1 — password. On success a 6-digit code is emailed; no session yet.
app.post('/api/login', rateLimit('login', 8, 10 * 60 * 1000), async (req, res) => {
  const { email, password } = req.body || {};
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password || '', user.salt, user.hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  const code = String(crypto.randomInt(100000, 1000000));
  const expires = Date.now() + 10 * 60 * 1000;
  await sql`INSERT INTO login_codes (email, code, expires, attempts)
            VALUES (${user.email}, ${code}, ${expires}, 0)
            ON CONFLICT (email) DO UPDATE SET code = ${code}, expires = ${expires}, attempts = 0`;
  try {
    const { delivered } = await sendCode(user.email, code, 'sign-in');
    // devCode is only ever returned when mail is unconfigured, i.e. local dev.
    res.json({ mfaRequired: true, email: user.email, delivered, devCode: delivered ? undefined : code });
  } catch (err) {
    console.error('Login code email failed:', err.message);
    res.status(500).json({ error: 'Could not send your sign-in code. Please try again in a moment.' });
  }
});

// Step 2 — exchange the emailed code for a session.
app.post('/api/login/verify', rateLimit('login-verify', 12, 10 * 60 * 1000), async (req, res) => {
  const { email, code } = req.body || {};
  const user = await findUserByEmail(email);
  if (!user) return res.status(400).json({ error: 'Start again from the sign-in screen.' });

  const rows = await sql`SELECT * FROM login_codes WHERE email = ${user.email}`;
  const entry = rows[0];
  if (!entry) return res.status(400).json({ error: 'No code found — sign in again to get a new one.' });
  if (Date.now() > Number(entry.expires)) {
    await sql`DELETE FROM login_codes WHERE email = ${user.email}`;
    return res.status(400).json({ error: 'Code expired — sign in again to get a new one.' });
  }
  if (entry.attempts >= 5) {
    await sql`DELETE FROM login_codes WHERE email = ${user.email}`;
    return res.status(429).json({ error: 'Too many attempts — sign in again to get a new code.' });
  }
  if (!safeEqual(String(code || ''), entry.code)) {
    await sql`UPDATE login_codes SET attempts = attempts + 1 WHERE email = ${user.email}`;
    return res.status(400).json({ error: 'Invalid code' });
  }
  await sql`DELETE FROM login_codes WHERE email = ${user.email}`;
  issueSession(res, await signToken(user));
  res.json({ ok: true, email: user.email, role: user.role });
});

// Only works when a code was already issued, so it cannot skip the password step.
app.post('/api/login/resend', rateLimit('login-resend', 5, 10 * 60 * 1000), async (req, res) => {
  const user = await findUserByEmail(req.body?.email);
  if (user) {
    const rows = await sql`SELECT 1 FROM login_codes WHERE email = ${user.email}`;
    if (rows[0]) {
      const code = String(crypto.randomInt(100000, 1000000));
      const expires = Date.now() + 10 * 60 * 1000;
      await sql`UPDATE login_codes SET code = ${code}, expires = ${expires}, attempts = 0
                WHERE email = ${user.email}`;
      try {
        const { delivered } = await sendCode(user.email, code, 'sign-in');
        return res.json({ ok: true, delivered, devCode: delivered ? undefined : code });
      } catch (err) {
        console.error('Login code resend failed:', err.message);
        return res.status(500).json({ error: 'Could not resend the code. Please try again in a moment.' });
      }
    }
  }
  // Never reveal whether that address exists.
  res.json({ ok: true, delivered: true });
});

app.post('/api/logout', requireAuth, (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.get('/api/account', requireAuth, async (req, res) => {
  res.json({ email: req.user.email, role: req.user.role });
});

app.post('/api/request-reset', rateLimit('reset', 5, 15 * 60 * 1000), async (req, res) => {
  const user = await findUserByEmail(req.body?.email);
  if (user) {
    const code = String(crypto.randomInt(100000, 1000000));
    const expires = Date.now() + 10 * 60 * 1000;
    await sql`INSERT INTO reset_codes (email, code, expires, attempts)
              VALUES (${user.email}, ${code}, ${expires}, 0)
              ON CONFLICT (email) DO UPDATE SET code = ${code}, expires = ${expires}, attempts = 0`;
    try { await sendCode(user.email, code, 'password reset'); }
    catch (err) { console.error('Reset email failed:', err.message); }
  }
  // Same answer either way, so the endpoint cannot be used to enumerate accounts.
  res.json({ ok: true });
});

app.post('/api/reset-password', rateLimit('reset-verify', 10, 15 * 60 * 1000), async (req, res) => {
  const { email, code, password } = req.body || {};
  if (!password || String(password).length < 10) {
    return res.status(400).json({ error: 'Choose a password of at least 10 characters.' });
  }
  const user = await findUserByEmail(email);
  if (!user) return res.status(400).json({ error: 'Invalid code' });

  const rows = await sql`SELECT * FROM reset_codes WHERE email = ${user.email}`;
  const entry = rows[0];
  if (!entry || Date.now() > Number(entry.expires) || entry.attempts >= 5) {
    if (entry) await sql`DELETE FROM reset_codes WHERE email = ${user.email}`;
    return res.status(400).json({ error: 'That code has expired — request a new one.' });
  }
  if (!safeEqual(String(code || ''), entry.code)) {
    await sql`UPDATE reset_codes SET attempts = attempts + 1 WHERE email = ${user.email}`;
    return res.status(400).json({ error: 'Invalid code' });
  }
  const { salt, hash } = hashPassword(String(password));
  // Bumping token_version signs every existing session out.
  await sql`UPDATE users SET salt = ${salt}, hash = ${hash}, token_version = token_version + 1
            WHERE id = ${user.id}`;
  await sql`DELETE FROM reset_codes WHERE email = ${user.email}`;
  clearSession(res);
  res.json({ ok: true });
});

app.post('/api/change-password', requireAuth, async (req, res) => {
  const { current, password } = req.body || {};
  if (!password || String(password).length < 10) {
    return res.status(400).json({ error: 'Choose a password of at least 10 characters.' });
  }
  const rows = await sql`SELECT * FROM users WHERE id = ${req.user.userId}`;
  const user = rows[0];
  if (!user || !verifyPassword(String(current || ''), user.salt, user.hash)) {
    return res.status(401).json({ error: 'Your current password is not correct.' });
  }
  const { salt, hash } = hashPassword(String(password));
  await sql`UPDATE users SET salt = ${salt}, hash = ${hash}, token_version = token_version + 1
            WHERE id = ${user.id}`;
  clearSession(res);
  res.json({ ok: true });
});

/* ============================================================
 *  Content API
 * ============================================================ */

// Public: the published document. An admin may ask for the draft instead.
app.get('/api/content', async (req, res) => {
  const preview = req.query.preview === '1' && (await currentUser(req));
  const data = preview ? await getDraft() : await getContent();
  if (preview) res.setHeader('X-Preview', '1');
  res.setHeader('Cache-Control', preview ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=86400');
  res.json(data || {});
});

app.get('/api/content/draft', requireAuth, async (_req, res) => {
  const [draft, published] = await Promise.all([getDraft(), getContent()]);
  res.json({
    content: draft || {},
    pending: pendingPages(draft || {}, published || {}),
    pages: Object.fromEntries(Object.entries(CONTENT_PAGES).map(([k, v]) => [k, v.label])),
  });
});

// Saving only ever writes the draft — the live site is untouched until Publish.
app.put('/api/content', requireAuth, async (req, res) => {
  const { page, content } = req.body || {};
  if (!content || typeof content !== 'object') return res.status(400).json({ error: 'Invalid content' });
  if (page !== ALL_PAGES && !CONTENT_PAGES[page]) return res.status(400).json({ error: 'Unknown page' });

  const current = (await getDraft()) || {};
  const next = mergePage(current, content, page);
  await saveDraft(next);
  await recordVersion({ page, action: 'save', data: next, author: req.user.email });
  const published = (await getContent()) || {};
  res.json({ ok: true, pending: pendingPages(next, published) });
});

app.post('/api/content/publish', requireAuth, async (req, res) => {
  const { page } = req.body || {};
  if (page !== ALL_PAGES && !CONTENT_PAGES[page]) return res.status(400).json({ error: 'Unknown page' });

  const [draft, published] = await Promise.all([getDraft(), getContent()]);
  const next = mergePage(published || {}, draft || {}, page);
  await saveContent(next);
  await recordVersion({ page, action: 'publish', data: next, author: req.user.email });
  res.json({ ok: true, pending: pendingPages(draft || {}, next) });
});

app.get('/api/content/versions', requireAuth, async (req, res) => {
  const page = String(req.query.page || ALL_PAGES);
  if (page !== ALL_PAGES && !CONTENT_PAGES[page]) return res.status(400).json({ error: 'Unknown page' });
  // Whole-site saves are filed under "all" and are relevant to every page.
  const rows = await sql`SELECT id, page, action, label, author, created_at
                         FROM content_versions
                         WHERE page = ${page} OR page = ${ALL_PAGES}
                         ORDER BY created_at DESC LIMIT ${VERSIONS_KEPT}`;
  res.json(rows);
});

app.get('/api/content/versions/:id', requireAuth, async (req, res) => {
  const rows = await sql`SELECT * FROM content_versions WHERE id = ${req.params.id}`;
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// Restoring puts the old values into the draft, never straight onto the live
// site — so a restore can still be reviewed before it goes out.
app.post('/api/content/versions/:id/restore', requireAuth, async (req, res) => {
  const page = String(req.body?.page || '');
  if (!CONTENT_PAGES[page] && page !== ALL_PAGES) return res.status(400).json({ error: 'Unknown page' });

  const rows = await sql`SELECT * FROM content_versions WHERE id = ${req.params.id}`;
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });

  const draft = (await getDraft()) || {};
  const next = mergePage(draft, rows[0].data, page);
  await saveDraft(next);
  await recordVersion({ page, action: 'restore', data: next, author: req.user.email });
  const published = (await getContent()) || {};
  res.json({ ok: true, pending: pendingPages(next, published) });
});

/* ============================================================
 *  Image uploads
 * ============================================================ */
app.post('/api/upload/:target', requireAuth, rateLimit('upload', 40, 10 * 60 * 1000),
  upload.single('image'), async (req, res) => {
    const target = req.params.target;
    const contentPath = IMAGE_TARGETS[target];
    if (!contentPath) return res.status(400).json({ error: 'Unknown upload target' });
    if (!req.file) return res.status(400).json({ error: 'No image received' });
    if (!looksLikeImage(req.file.buffer)) {
      return res.status(400).json({ error: 'That file is not a PNG, JPEG or WebP image.' });
    }
    try {
      const type = /png$/i.test(req.file.originalname) ? 'image/png'
        : /webp$/i.test(req.file.originalname) ? 'image/webp'
          : req.file.mimetype;
      const url = await storeImageBuffer(target, req.file.buffer, type, req);
      // Uploads land in the draft, like every other edit.
      const draft = (await getDraft()) || {};
      writePath(draft, contentPath, url);
      await saveDraft(draft);
      res.json({ ok: true, url });
    } catch (err) {
      console.error('Upload failed:', err.message);
      res.status(500).json({ error: err.message || 'Upload failed' });
    }
  });

app.delete('/api/upload/:target', requireAuth, async (req, res) => {
  const contentPath = IMAGE_TARGETS[req.params.target];
  if (!contentPath) return res.status(400).json({ error: 'Unknown upload target' });
  const draft = (await getDraft()) || {};
  writePath(draft, contentPath, '');
  await saveDraft(draft);
  res.json({ ok: true });
});

/* ============================================================
 *  Contact form + messages
 * ============================================================ */
app.post('/api/contact', rateLimit('contact', 5, 15 * 60 * 1000), async (req, res) => {
  const { name, email, company, service, message, website } = req.body || {};
  // Honeypot: a real person never fills a hidden field.
  if (website) return res.json({ ok: true });

  const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const msg = {
    name: clean(name, 120),
    email: clean(email, 200),
    company: clean(company, 160),
    service: clean(service, 120),
    message: clean(message, 5000),
  };
  if (!msg.name || !msg.message) return res.status(400).json({ error: 'Please add your name and a message.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(msg.email)) {
    return res.status(400).json({ error: 'Please add a valid email address.' });
  }

  await sql`INSERT INTO messages (id, name, email, company, service, message)
            VALUES (${crypto.randomUUID()}, ${msg.name}, ${msg.email},
                    ${msg.company}, ${msg.service}, ${msg.message})`;
  // The message is already stored, so a mail failure must not fail the request.
  try { await sendContactNotification(msg); }
  catch (err) { console.error('Contact notification failed:', err.message); }

  res.json({ ok: true });
});

app.get('/api/messages', requireAuth, async (_req, res) => {
  const rows = await sql`SELECT * FROM messages ORDER BY created_at DESC LIMIT 200`;
  res.json(rows);
});

app.post('/api/messages/:id/read', requireAuth, async (req, res) => {
  await sql`UPDATE messages SET read = true WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

app.delete('/api/messages/:id', requireAuth, async (req, res) => {
  await sql`DELETE FROM messages WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

/* ============================================================
 *  Public page, robots, sitemap
 * ============================================================ */
const seoAllowsIndexing = (c) => String(c && c.seo && c.seo.allowIndexing) === 'true';

app.get('/robots.txt', async (_req, res) => {
  const c = await getContent();
  res.type('text/plain');
  if (!seoAllowsIndexing(c)) return res.send('User-agent: *\nDisallow: /\n');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

app.get('/sitemap.xml', async (_req, res) => {
  const c = await getContent();
  res.type('application/xml');
  if (!seoAllowsIndexing(c)) return res.send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>
</urlset>
`);
});

app.get('/', async (req, res) => {
  try {
    const wantsPreview = req.query.preview === '1';
    const admin = wantsPreview ? await currentUser(req) : null;
    const preview = !!admin;
    const content = preview ? await getDraft() : await getContent();

    res.type('html');
    res.setHeader('Cache-Control', preview
      ? 'no-store'
      : 'public, s-maxage=300, stale-while-revalidate=86400');
    if (preview) res.setHeader('X-Preview', '1');
    res.send(renderPage(content || {}, { preview, siteUrl: SITE_URL }));
  } catch (err) {
    console.error('Render failed:', err.message);
    res.status(500).type('html').send(renderErrorPage({ status: 500, siteUrl: SITE_URL }));
  }
});

// A request from the dashboard's fetch() wants JSON; a browser address bar
// wants a page. Anything under /api is always JSON regardless of headers.
function wantsJson(req) {
  if (req.path.startsWith('/api/')) return true;
  return !String(req.get('accept') || '').includes('text/html');
}

// Unknown address. This used to bounce silently to the home page, which hid
// broken links from anyone who followed one.
app.use(async (req, res) => {
  if (wantsJson(req)) return res.status(404).json({ error: 'Not found' });
  let content = null;
  try { content = await getContent(); } catch { /* branding falls back to defaults */ }
  res.status(404).type('html').send(renderErrorPage({ status: 404, content, siteUrl: SITE_URL }));
});

// eslint-disable-next-line no-unused-vars
app.use(async (err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  const tooBig = err && err.code === 'LIMIT_FILE_SIZE';
  const status = tooBig ? 413 : 500;

  if (wantsJson(req)) {
    return res.status(status).json({
      error: tooBig ? 'That image is larger than 8 MB.' : 'Something went wrong.',
    });
  }
  // No database lookup here — the usual reason for a 500 is that the database
  // is unreachable, and a failing error page is worse than a plain one.
  res.status(status).type('html').send(renderErrorPage({ status, siteUrl: SITE_URL }));
});

// Vercel imports the app; only listen when run directly.
if (require.main === module) {
  app.listen(PORT, () => console.log(`  Running on http://localhost:${PORT}`));
}

module.exports = app;