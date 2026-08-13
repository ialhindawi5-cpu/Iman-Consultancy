/* ============================================================
 *  Server-side rendering of the public page from the content
 *  document. The page ships fully populated, so crawlers and link
 *  previews see real copy rather than an empty shell.
 * ============================================================ */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Content is escaped first, then the *asterisk* marker becomes the accent
// emphasis — so an editor can highlight words without being handed raw HTML.
const emphasise = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

// Multi-paragraph fields: blank lines become separate <p>s.
const paras = (s, cls) => String(s || '')
  .split(/\n\s*\n/)
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => `<p${cls ? ` class="${cls}"` : ''}>${esc(p).replace(/\n/g, '<br>')}</p>`)
  .join('\n        ');

const arr = (v) => (Array.isArray(v) ? v : []);
const num2 = (i) => String(i + 1).padStart(2, '0');

// Images may be a Blob URL (absolute) or a local dev path — anything else is
// dropped rather than written into an attribute.
function safeImg(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https:\/\/[\w.-]+\.public\.blob\.vercel-storage\.com\//.test(s)) return s;
  if (/^assets\/uploads\/[\w.-]+$/.test(s)) return s;
  return '';
}

// Mix a hex colour toward black, for the darker hover shade of the accent.
function darken(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const f = (c) => Math.max(0, Math.round(c * (1 - amount)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

function faviconFor(content) {
  const mark = esc((content.brand && content.brand.monogram) || 'IH').slice(0, 3);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>`
    + `<rect width='64' height='64' rx='14' fill='%230e2438'/>`
    + `<text x='32' y='43' font-family='Segoe UI,Arial,sans-serif' font-size='27' `
    + `font-weight='600' letter-spacing='1' fill='%23ffffff' text-anchor='middle'>${mark}</text></svg>`;
  return 'data:image/svg+xml,' + svg.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23');
}

/* ---------- head ---------- */

function renderHead(c, opts) {
  const seo = c.seo || {};
  const brand = c.brand || {};
  const indexable = String(seo.allowIndexing) === 'true' && !opts.preview;
  const title = seo.title || 'Iman Hindawi';
  const desc = seo.description || '';
  const ogDesc = seo.ogDescription || desc;
  const image = safeImg(seo.image);
  const accent = /^#[0-9a-f]{6}$/i.test(String(brand.accent || '')) ? brand.accent : null;

  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${indexable ? 'index, follow' : 'noindex, nofollow'}">
${seo.searchConsole ? `<meta name="google-site-verification" content="${esc(seo.searchConsole)}">` : ''}
<link rel="canonical" href="${esc(opts.siteUrl)}/">

<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(ogDesc)}">
<meta property="og:site_name" content="${esc(brand.text || 'Iman Hindawi')}">
<meta property="og:url" content="${esc(opts.siteUrl)}/">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">

<link rel="icon" href="${faviconFor(c)}">
<link rel="stylesheet" href="/styles.css">
${accent ? `<style>:root{--accent:${accent};--accent-dark:${darken(accent, 0.18)};}</style>` : ''}`;
}

/* ---------- header ---------- */

function renderBrand(c) {
  const b = c.brand || {};
  const logo = safeImg(b.logo);
  if (b.mode === 'image' && logo) {
    return `<img class="brand-logo" src="${esc(logo)}" alt="${esc(b.text || 'Iman Hindawi')}">`;
  }
  return `<span class="brand-mark" aria-hidden="true">${esc(b.monogram || 'IH')}</span>
      <span class="brand-text">
        <span class="brand-name">${esc(b.text || 'Iman Hindawi')}</span>
        <span class="brand-role">${esc(b.role || '')}</span>
      </span>`;
}

function renderHeader(c) {
  const n = c.nav || {};
  return `<header class="site-header" id="siteHeader">
  <div class="wrap header-inner">
    <a class="brand" href="#top">
      ${renderBrand(c)}
    </a>

    <nav class="site-nav" id="siteNav" aria-label="Main">
      <a href="#about">${esc(n.about || 'About')}</a>
      <a href="#services">${esc(n.services || 'Services')}</a>
      <a href="#approach">${esc(n.approach || 'Approach')}</a>
      <a href="#engagements">${esc(n.engagements || 'Ways to work')}</a>
      <a href="#experience">${esc(n.experience || 'Experience')}</a>
      <a class="btn btn-sm btn-primary nav-cta" href="#contact">${esc(n.cta || 'Get in touch')}</a>
    </nav>

    <button class="menu-toggle" id="menuToggle" aria-expanded="false" aria-controls="siteNav" aria-label="Open menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>`;
}

/* ---------- sections ---------- */

function renderHero(c) {
  const h = c.hero || {};
  const stats = arr(h.stats).map((s) => `
        <li><strong>${esc(s.value)}</strong><span>${esc(s.label)}</span></li>`).join('');
  return `  <section class="hero" id="top">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="wrap hero-inner">
      <p class="eyebrow reveal">${esc(h.eyebrow)}</p>
      <h1 class="reveal">${emphasise(h.title)}</h1>
      <p class="hero-lead reveal">${esc(h.lead)}</p>
      <div class="hero-actions reveal">
        <a class="btn btn-primary" href="#contact">${esc(h.ctaPrimary)}</a>
        <a class="btn btn-ghost" href="#approach">${esc(h.ctaSecondary)}</a>
      </div>
    </div>
${stats ? `
    <div class="wrap">
      <ul class="stats reveal">${stats}
      </ul>
    </div>` : ''}
  </section>`;
}

function renderWhy(c) {
  const w = c.why || {};
  return `  <section class="section section-tight" id="why">
    <div class="wrap">
      <div class="split">
        <div class="split-side reveal">
          <p class="eyebrow">${esc(w.eyebrow)}</p>
          <h2>${esc(w.heading)}</h2>
        </div>
        <div class="split-main reveal">
          ${paras(w.lead, 'lead')}
          ${paras(w.body)}
        </div>
      </div>
    </div>
  </section>`;
}

function renderAbout(c) {
  const a = c.about || {};
  const img = safeImg(a.image);
  const portrait = img
    ? `<img src="${esc(img)}" alt="${esc(a.heading || 'Portrait')}">`
    : `<span aria-hidden="true">${esc((c.brand && c.brand.monogram) || 'IH')}</span>`;
  const creds = arr(a.creds).map((x) => `<li>${esc(x)}</li>`).join('\n            ');

  return `  <section class="section section-alt" id="about">
    <div class="wrap">
      <div class="about">
        <div class="about-portrait reveal">
          <div class="portrait" id="portrait">
            ${portrait}
          </div>
          <p class="portrait-note">${esc(a.note)}</p>
        </div>

        <div class="about-copy reveal">
          <p class="eyebrow">${esc(a.eyebrow)}</p>
          <h2>${esc(a.heading)}</h2>
          ${paras(a.lead, 'lead')}
          ${paras(a.body1)}
          ${paras(a.body2)}
${creds ? `          <ul class="creds">
            ${creds}
          </ul>` : ''}
        </div>
      </div>
    </div>
  </section>`;
}

function renderServices(c) {
  const s = c.services || {};
  const cards = arr(s.items).map((item, i) => {
    const id = `svc-${i + 1}`;
    const list = arr(item.list).map((x) => `<li>${esc(x)}</li>`).join('\n                  ');
    return `        <article class="card">
          <h3 class="card-heading">
            <button class="card-head" type="button" aria-expanded="false" aria-controls="${id}">
              <span class="card-num">${num2(i)}</span>
              <span class="card-h">${esc(item.title)}</span>
              <span class="card-chev" aria-hidden="true"></span>
            </button>
          </h3>
          <div class="card-panel" id="${id}">
            <div class="card-panel-inner">
              <div class="card-panel-content">
                <p>${esc(item.desc)}</p>
${list ? `                <ul>
                  ${list}
                </ul>` : ''}
              </div>
            </div>
          </div>
        </article>`;
  }).join('\n\n');

  return `  <section class="section" id="services">
    <div class="wrap">
      <header class="section-head reveal">
        <p class="eyebrow">${esc(s.eyebrow)}</p>
        <h2>${esc(s.heading)}</h2>
        <p class="section-sub">${esc(s.sub)}</p>
      </header>

      <p class="cards-hint reveal">${esc(s.hint)}</p>

      <div class="cards reveal" id="serviceCards">
${cards}
      </div>
    </div>
  </section>`;
}

function renderApproach(c) {
  const a = c.approach || {};
  const steps = arr(a.steps).map((s, i) => `        <li class="step reveal">
          <span class="step-num">${num2(i)}</span>
          <h3>${esc(s.title)}</h3>
          <p>${esc(s.body)}</p>
        </li>`).join('\n');

  return `  <section class="section section-alt" id="approach">
    <div class="wrap">
      <header class="section-head reveal">
        <p class="eyebrow">${esc(a.eyebrow)}</p>
        <h2>${esc(a.heading)}</h2>
        <p class="section-sub">${esc(a.sub)}</p>
      </header>

      <ol class="steps">
${steps}
      </ol>
    </div>
  </section>`;
}

function renderEngagements(c) {
  const e = c.engagements || {};
  const tiers = arr(e.tiers).map((t) => `        <article class="tier${t.flag ? ' tier-feature' : ''} reveal">
${t.flag ? `          <span class="tier-flag">${esc(t.flag)}</span>` : ''}
          <h3>${esc(t.title)}</h3>
          <p class="tier-meta">${esc(t.meta)}</p>
          <p>${esc(t.body)}</p>
        </article>`).join('\n');

  return `  <section class="section section-dark" id="engagements">
    <div class="wrap">
      <header class="section-head reveal">
        <p class="eyebrow">${esc(e.eyebrow)}</p>
        <h2>${esc(e.heading)}</h2>
      </header>

      <div class="tiers">
${tiers}
      </div>
    </div>
  </section>`;
}

function renderExperience(c) {
  const x = c.experience || {};
  const items = arr(x.items).map((it) => `        <article class="tl-item reveal">
          <div class="tl-when">${esc(it.when)}</div>
          <div class="tl-body">
            <h3>${esc(it.title)}</h3>
            <p>${esc(it.body)}</p>
          </div>
        </article>`).join('\n\n');

  const groups = arr(x.toolGroups).map((g) => `        <div class="tool-group">
          <h4>${esc(g.title)}</h4>
          <ul>${arr(g.tools).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        </div>`).join('\n');

  return `  <section class="section" id="experience">
    <div class="wrap">
      <header class="section-head reveal">
        <p class="eyebrow">${esc(x.eyebrow)}</p>
        <h2>${esc(x.heading)}</h2>
      </header>

      <div class="timeline">
${items}
      </div>

${groups ? `      <div class="tools reveal">
${groups}
      </div>` : ''}
    </div>
  </section>`;
}

// Renders nothing until at least one testimonial exists, so an empty section
// never ships as a hollow heading.
function renderTestimonials(c) {
  const t = c.testimonials || {};
  const items = arr(t.items).filter((x) => x && String(x.quote || '').trim());
  if (!items.length) return '';

  const cards = items.map((x) => {
    const meta = [x.role, x.company].map((s) => String(s || '').trim()).filter(Boolean).join(', ');
    const initial = String(x.name || '').trim().charAt(0).toUpperCase();
    return `        <figure class="quote reveal">
          <blockquote>${paras(x.quote)}</blockquote>
          <figcaption>
            ${initial ? `<span class="quote-avatar" aria-hidden="true">${esc(initial)}</span>` : ''}
            <span class="quote-who">
              <span class="quote-name">${esc(x.name)}</span>
${meta ? `              <span class="quote-role">${esc(meta)}</span>` : ''}
            </span>
          </figcaption>
        </figure>`;
  }).join('\n\n');

  return `  <section class="section section-alt" id="testimonials">
    <div class="wrap">
      <header class="section-head reveal">
        <p class="eyebrow">${esc(t.eyebrow)}</p>
        <h2>${esc(t.heading)}</h2>
${t.sub ? `        <p class="section-sub">${esc(t.sub)}</p>` : ''}
      </header>

      <div class="quotes${items.length === 1 ? ' quotes-single' : ''}">
${cards}
      </div>
    </div>
  </section>`;
}

function renderFaq(c) {
  const f = c.faq || {};
  const items = arr(f.items).map((it) => `        <details class="reveal">
          <summary>${esc(it.q)}</summary>
          ${paras(it.a)}
        </details>`).join('\n');

  return `  <section class="section" id="faq">
    <div class="wrap wrap-narrow">
      <header class="section-head reveal">
        <p class="eyebrow">${esc(f.eyebrow)}</p>
        <h2>${esc(f.heading)}</h2>
      </header>

      <div class="faq">
${items}
      </div>
    </div>
  </section>`;
}

const ICON_MAIL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3 7 9 6 9-6"/></svg>`;
const ICON_PIN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>`;
const ICON_CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3 2"/></svg>`;

function renderContact(c) {
  const k = c.contact || {};
  const email = String(k.email || '').trim();
  const options = arr(k.services).map((s) => `              <option>${esc(s)}</option>`).join('\n');

  return `  <section class="section section-contact" id="contact">
    <div class="wrap">
      <div class="contact">
        <div class="contact-copy reveal">
          <p class="eyebrow">${esc(k.eyebrow)}</p>
          <h2>${esc(k.heading)}</h2>
          ${paras(k.lead, 'lead')}

          <ul class="contact-list">
            <li>
              <span class="ci" aria-hidden="true">${ICON_MAIL}</span>
              <a href="mailto:${esc(email)}">${esc(email)}</a>
            </li>
            <li>
              <span class="ci" aria-hidden="true">${ICON_PIN}</span>
              <span>${esc(k.location)}</span>
            </li>
            <li>
              <span class="ci" aria-hidden="true">${ICON_CLOCK}</span>
              <span>${esc(k.replyTime)}</span>
            </li>
          </ul>
        </div>

        <form class="contact-form reveal" id="contactForm" novalidate>
          <div class="field">
            <label for="cf-name">Your name</label>
            <input id="cf-name" name="name" type="text" autocomplete="name" required>
            <p class="err" data-for="cf-name"></p>
          </div>
          <div class="field">
            <label for="cf-email">Email</label>
            <input id="cf-email" name="email" type="email" autocomplete="email" required>
            <p class="err" data-for="cf-email"></p>
          </div>
          <div class="field">
            <label for="cf-company">Company <span class="opt">(optional)</span></label>
            <input id="cf-company" name="company" type="text" autocomplete="organization">
          </div>
          <div class="field">
            <label for="cf-service">What do you need?</label>
            <select id="cf-service" name="service">
${options}
            </select>
          </div>
          <div class="field field-hp" aria-hidden="true">
            <label for="cf-website">Website</label>
            <input id="cf-website" name="website" type="text" tabindex="-1" autocomplete="off">
          </div>
          <div class="field">
            <label for="cf-message">About the project</label>
            <textarea id="cf-message" name="message" rows="5" required></textarea>
            <p class="err" data-for="cf-message"></p>
          </div>
          <button class="btn btn-primary btn-block" type="submit">Send message</button>
          <p class="form-note" id="formNote">${esc(k.formNote)}</p>
        </form>
      </div>
    </div>
  </section>`;
}

function renderFooter(c) {
  const b = c.brand || {};
  const f = c.footer || {};
  const n = c.nav || {};
  return `<footer class="site-footer">
  <div class="wrap footer-inner">
    <div class="footer-brand">
      <span class="brand-mark" aria-hidden="true">${esc(b.monogram || 'IH')}</span>
      <div>
        <p class="footer-name">${esc(b.text || 'Iman Hindawi')}</p>
        <p class="footer-role">${esc(f.role || '')}</p>
      </div>
    </div>
    <nav class="footer-nav" aria-label="Footer">
      <a href="#services">${esc(n.services || 'Services')}</a>
      <a href="#approach">${esc(n.approach || 'Approach')}</a>
      <a href="#experience">${esc(n.experience || 'Experience')}</a>
      <a href="#contact">Contact</a>
    </nav>
    <p class="footer-legal">© <span id="year">${new Date().getFullYear()}</span> ${esc(b.text || 'Iman Hindawi')}. All rights reserved.</p>
  </div>
</footer>`;
}

/* ---------- structured data ---------- */

function personJsonLd(c, siteUrl) {
  const b = c.brand || {};
  const k = c.contact || {};
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: b.text || 'Iman Hindawi',
    jobTitle: b.role || 'Project Coordination',
    email: k.email ? `mailto:${k.email}` : undefined,
    url: siteUrl,
    description: (c.about && c.about.lead) || undefined,
    address: k.location ? { '@type': 'PostalAddress', addressLocality: k.location } : undefined,
  };
  // A JSON-LD block is not executable script, so the strict CSP allows it.
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

/* ---------- page ---------- */

function renderPage(content, opts) {
  const o = Object.assign({ preview: false, siteUrl: '' }, opts || {});
  const c = content || {};

  return `<!DOCTYPE html>
<html lang="en" class="no-js">
<head>
${renderHead(c, o)}
</head>
<body>

<a class="skip-link" href="#main">Skip to content</a>

${renderHeader(c)}

<main id="main">

${renderHero(c)}

${renderWhy(c)}

${renderAbout(c)}

${renderServices(c)}

${renderApproach(c)}

${renderEngagements(c)}

${renderExperience(c)}

${renderTestimonials(c)}

${renderFaq(c)}

${renderContact(c)}

</main>

${renderFooter(c)}
${o.preview ? `<div class="preview-banner">You are previewing unpublished changes. <a href="/admin/">Back to the dashboard</a></div>` : ''}
${personJsonLd(c, o.siteUrl)}
<script src="/script.js"></script>
</body>
</html>
`;
}

module.exports = { renderPage, esc, safeImg };