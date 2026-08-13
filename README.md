# Iman Hindawi — Project Coordination Consulting

A professional one-page business website for **Iman Hindawi**, freelance project
coordination consultant. Built as plain HTML/CSS/JS — **no build step, no npm install,
no internet connection required.**

## Running it

Just double-click `index.html`, or open it in your browser.

If you'd rather serve it over `http://` (recommended once you start adding a backend):

```powershell
cd C:\Users\USER\iman-consulting
python -m http.server 8080
# then open http://localhost:8080
```

## Files

| File | What's in it |
|---|---|
| `index.html` | All page content — this is the file you edit for wording |
| `styles.css` | Design system (colours, type, layout, responsive rules) |
| `script.js` | Mobile menu, scroll animations, nav highlighting, contact form |

## Interactions

**Expandable services.** The four services are a click-to-expand accordion: each row
shows its number and title, and clicking (or pressing Enter/Space on) the row slides open
a panel with the description and what's included. Any number can be open at once, and
clicking an open row closes it again.

- Each row is a real `<button>` with `aria-expanded` / `aria-controls`, so keyboard and
  screen-reader users get the same behaviour.
- You can link straight to an open service: `index.html#svc-3` opens *Data Analysis &
  Reporting* and scrolls to it. The ids are `svc-1` … `svc-4`.
- **Adding a fifth service?** Copy an existing `<article class="card">` block and change
  three things together: the button's `aria-controls`, the panel's `id`, and the `01`
  number. They must match, or that row won't open.
- With JavaScript off, every panel is simply shown open — nothing is hidden.

**Approach steps fill on hover.** Hovering one of the four steps fills it to a white
card with a soft lift, and its big number and title go solid blue. The dividers either
side fade out so the card edge stays clean.

Because the Approach band is tinted, the fill is **white**. If you ever move that section
onto a white background, change `.step:hover` in `styles.css` to use
`var(--accent-soft)` instead, or the fill will disappear.

**Custom cursor.** On desktop, the arrow is replaced by a small blue dot that tracks the
pointer exactly plus a ring that eases in behind it. The ring grows and tints over
anything clickable, shrinks while the mouse is held down, and turns white over the navy
band and the footer. Text fields keep the normal caret so typing still feels right.

It's switched off automatically on touchscreens, and for anyone whose system is set to
*reduce motion*. To remove it entirely, delete the `custom cursor` block at the bottom of
`script.js`.

## Sections

1. **Hero** — name, positioning line, two calls to action, stat strip
2. **The problem** — why projects slip, framed as what you fix
3. **About** — bio, credentials, portrait slot
4. **Services** — the four offerings as an expandable accordion
5. **Approach** — Discover → Plan → Coordinate → Report
6. **Ways to work together** — project / retainer / setup sprint
7. **Experience** — career timeline + tools
8. **FAQ** — the four questions clients always ask
9. **Contact** — email, details, and a message form

Sections alternate white / tinted down the page. If you reorder them, keep that
alternating so two tinted bands never end up side by side — the classes are
`section` (white) and `section section-alt` (tinted).

---

## ⚠️ Things you should check or replace

These are placeholders or details I inferred — please review before this goes public.

**1. Add your photo.** The About section shows an `IH` monogram tile. To use a real
photo, drop the image in this folder and replace the contents of the `.portrait` div in
`index.html`:

```html
<div class="portrait" id="portrait">
  <img src="iman.jpg" alt="Iman Hindawi">
</div>
```

**2. The "Recently" timeline entry** currently says *"Project Manager — technology &
product delivery"* without naming an employer. If you're happy naming your current
company, add it; if not, leave as is.

**3. No dates in the timeline** — I don't know your exact employment dates, so entries
read "Now / Recently / Previously". Swap in real years if you'd like it to read like a CV.

**4. Tools list** — I listed tools from your portfolio (MS Project, Jira, Zoho, Power BI,
Tableau, Power Query, Activity Info) plus common ones (Asana, Odoo, Trello, Confluence,
SharePoint, Notion). **Delete anything you don't actually use.**

**5. No testimonials or client logos.** I deliberately did not invent any. When you have
real ones, they belong between the *Experience* and *About* sections.

**6. No prices.** The "Ways to work together" tiers describe engagement shapes, not
rates — add pricing when you've decided on it.

**7. LinkedIn link.** Not added because I don't have your profile URL. To add it, drop a
line into the `.contact-list` in `index.html`.

---

## Contact form

The form validates in the browser and then opens the visitor's email app with everything
pre-filled (a `mailto:` link) — **it does not send anything by itself and stores nothing.**

That's fine for launch, but a `mailto:` form loses visitors who don't have a mail client
configured. When you want real submissions, the options are:

- A form service (Formspree / Web3Forms) — one line of HTML, no backend
- A small backend endpoint, like the one your portfolio site already has

The email address lives in **two** places — keep them in sync:
- `script.js` → `CONTACT_EMAIL` at the top
- `index.html` → the `mailto:` link in the contact list

Currently set to **i.alhindawi5@gmail.com** (the same address as your portfolio site).

## Search engines

`index.html` currently carries `<meta name="robots" content="noindex, nofollow">` so the
site stays invisible while it's a draft. **Delete that line when you're ready to be found.**

## Publishing later

The site is fully static, so it will deploy as-is to Vercel, Netlify or GitHub Pages with
no configuration. On Vercel that's `vercel --prod` from this folder — but per your usual
rule, ask before deploying anything live.