/* ============================================================
 *  Neon Postgres — schema, seed and the shared query helper.
 *  Ported from the personal-portfolio site, which runs the same
 *  stack on this account.
 * ============================================================ */
const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

// Built lazily so the module can be required without DATABASE_URL — it only
// throws if a query actually runs without a connection string.
let _client = null;
function client() {
  if (!_client) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — provide a Neon Postgres connection string.');
    }
    _client = neon(process.env.DATABASE_URL);
  }
  return _client;
}
const sql = (strings, ...values) => client()(strings, ...values);

// The seed is the JSON shipped in the repo, so a fresh database comes up with
// the site exactly as it is committed.
const DEFAULT_CONTENT = require('./data/content.json');

let initPromise = null;
function init() {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

async function doInit() {
  // `data` is the published website. `draft` is what the dashboard edits;
  // NULL means "never edited", which reads as a copy of what is published.
  await sql`CREATE TABLE IF NOT EXISTS content (
    id int PRIMARY KEY DEFAULT 1,
    data jsonb NOT NULL,
    draft jsonb
  )`;

  await sql`CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    email text UNIQUE NOT NULL,
    role text NOT NULL,
    salt text NOT NULL,
    hash text NOT NULL,
    token_version int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  // Contact-form submissions.
  await sql`CREATE TABLE IF NOT EXISTS messages (
    id uuid PRIMARY KEY,
    name text,
    email text,
    company text,
    service text,
    message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    read boolean NOT NULL DEFAULT false
  )`;

  // Emailed 6-digit codes: one table for password resets, one for the
  // second factor at sign-in.
  await sql`CREATE TABLE IF NOT EXISTS reset_codes (
    email text PRIMARY KEY,
    code text NOT NULL,
    expires bigint NOT NULL,
    attempts int NOT NULL DEFAULT 0
  )`;
  await sql`CREATE TABLE IF NOT EXISTS login_codes (
    email text PRIMARY KEY,
    code text NOT NULL,
    expires bigint NOT NULL,
    attempts int NOT NULL DEFAULT 0
  )`;

  // One row per save/publish/restore, holding the whole document as it stood
  // after the action, so any past state of a section can be put back.
  await sql`CREATE TABLE IF NOT EXISTS content_versions (
    id uuid PRIMARY KEY,
    page text NOT NULL,
    action text NOT NULL,
    label text,
    author text,
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS content_versions_page_ts
            ON content_versions (page, created_at DESC)`;

  // Rate-limit events live in the database so the limit holds across
  // serverless instances rather than per-process.
  await sql`CREATE TABLE IF NOT EXISTS rate_events (k text NOT NULL, ts bigint NOT NULL)`;
  await sql`CREATE INDEX IF NOT EXISTS rate_events_k_ts ON rate_events (k, ts)`;

  // Seed the content row once.
  const c = await sql`SELECT 1 FROM content WHERE id = 1`;
  if (c.length === 0) {
    await sql`INSERT INTO content (id, data) VALUES (1, ${JSON.stringify(DEFAULT_CONTENT)}::jsonb)`;
    console.log('  Seeded content from data/content.json');
  }

  // Seed the owner account once. ADMIN_PASSWORD is only read here, on first
  // run — changing it later does nothing; use the dashboard instead.
  const u = await sql`SELECT 1 FROM users LIMIT 1`;
  if (u.length === 0) {
    const email = (process.env.ADMIN_EMAIL || 'i.alhindawi5@gmail.com').toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
      console.warn('  No ADMIN_PASSWORD set — skipping owner seed. Set it and restart.');
      return;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    await sql`INSERT INTO users (id, email, role, salt, hash)
              VALUES (${crypto.randomUUID()}, ${email}, 'owner', ${salt}, ${hash})`;
    console.log(`  Seeded admin owner: ${email}`);
  }
}

module.exports = { sql, init, DEFAULT_CONTENT };