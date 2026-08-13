# Iman Hindawi — Project Coordination Consulting

The business website for **Iman Hindawi**, independent project coordination consultant,
plus a dashboard for editing every word of it without touching code.

Live: https://iman-hindawi-consultancy.vercel.app
Dashboard: https://iman-hindawi-consultancy.vercel.app/admin/

---

## How it works

The page is **rendered on the server from a content document held in Postgres**, so the
HTML that reaches a visitor (and Google, and a link preview) is already filled in. Nothing
waits on JavaScript.

```
server.js     Express app — the whole API and the public page. One serverless function.
render.js     Turns the content document into the finished HTML page.
db.js         Neon Postgres: schema, seed, and the shared query helper.
data/         content.json — the seed a fresh database starts from.
public/       styles.css and script.js (served as static files).
admin/        The dashboard: index.html, admin.css, admin.js.
vercel.json   Routing and the security headers for CDN-served assets.
```

### Draft and publish

Two documents live side by side. `data` is the published website; `draft` is what the
dashboard edits.

- **Save** writes the draft. The live site does not change.
- **Preview draft** shows you the draft at `/?preview=1` — visible only to you, signed in.
- **Publish** copies *that section's* fields into the published document.

Sections publish independently, so a half-finished edit to About can never be pushed out
by publishing the FAQ.

**History** keeps the last 30 versions per section. Restoring puts the old values back into
your draft, never straight onto the live site, so you can still look before publishing.

### What you can edit

Every section: hero, the problem, about, services, approach, ways to work, experience,
testimonials, FAQ and contact — including adding, reordering and removing individual
services, steps, timeline entries, tools, questions and testimonials.

Also branding (name, monogram, logo image, accent colour, menu labels), your portrait, the
contact details, and SEO.

> **Testimonials start empty on purpose.** The whole section is left out of the page until
> you add at least one, so nothing invented ever ships. Add real ones from the dashboard.

### SEO

The **SEO & indexing** panel holds the search title and description, the sharing image, the
Search Console code, and a **Hidden / Visible** switch.

The site currently ships **Hidden**: it works for anyone with the link, but carries
`noindex` and `robots.txt` disallows everything. Switch it to Visible and publish when
you're ready to be found.

### Contact form

Enquiries are stored in the database, shown in **Messages**, and emailed to you. A hidden
honeypot field catches most bots, and submissions are rate limited per IP.

---

## Security

- Sign-in is **two-step**: password, then a 6-digit code emailed to you. No session is
  issued until the code checks out.
- Passwords are **scrypt with a per-user salt**, compared in constant time.
- The session is a **JWT in an httpOnly cookie** — page scripts cannot read it.
  `SameSite=Strict`, and `Secure` in production.
- Writes carry a **CSRF token** (double-submit: a readable cookie echoed in a header).
- Changing a password **invalidates every existing session** via a token version.
- **Rate limits** on sign-in, code checks, resets, uploads and the contact form. They live
  in the database, so the limit holds across serverless instances rather than per process.
- A strict **Content-Security-Policy** (no inline script), HSTS, `X-Frame-Options: DENY`,
  `nosniff`, COOP/CORP and a locked-down `Permissions-Policy`. Set in **both** `server.js`
  and `vercel.json` — **keep the two in step**, since static assets never touch the function.
- All content is **escaped on output**, so text typed into the dashboard can never become
  markup. Uploads are checked for a real PNG/JPEG/WebP signature, not a claimed type.
- `/admin` and `/api` are excluded in `robots.txt`.

---

## Environment variables

Set these in **Vercel → Project → Settings → Environment Variables**, and locally in `.env`
(which is gitignored and never committed).

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | **yes** | Neon Postgres connection string. |
| `AUTH_SECRET` | **yes** | Signs session cookies. Changing it signs everyone out. |
| `ADMIN_EMAIL` | **yes** | The owner account. |
| `ADMIN_PASSWORD` | first run | Only read when the database is empty, to seed the owner. Change your password in the dashboard afterwards; editing this later does nothing. |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | for sign-in | Sends the 2FA and reset codes, and enquiry notifications. Without them codes are printed to the server log instead (local development only). |
| `NOTIFY_EMAIL` | no | Where enquiries go. Defaults to the owner's email. |
| `BLOB_READ_WRITE_TOKEN` | for uploads | Vercel Blob. Alternatively connect a Blob store to the project and the OIDC path is used automatically. |
| `SITE_URL` | no | Canonical and sitemap URLs. Defaults to the Vercel domain. |

> Changing any environment variable in Vercel needs a **redeploy** to take effect.

---

## Running locally

```powershell
cd C:\Users\USER\iman-consulting
npm install      # only needed on a machine with network access
npm start        # http://localhost:3000
```

The database schema and seed are created automatically on the first request.

With no `GMAIL_*` set, sign-in codes are printed to the terminal instead of emailed, so you
can sign in locally without sending yourself mail.

---

## Deploying

The Vercel project builds from GitHub, so:

```powershell
git push
```

Check the deployment in the Vercel dashboard afterwards.

---

## Things worth knowing

- **The seed only runs once.** `data/content.json` populates an *empty* database. After
  that the database is the source of truth and editing that file changes nothing live — it
  is only the starting point for a fresh database.
- **`ADMIN_PASSWORD` is seed-only** for the same reason.
- **Uploads land in the draft**, like any other edit, so a new photo appears on the site
  only after you publish.
- The dashboard keeps **nothing in localStorage**; a session lives entirely in the cookie.