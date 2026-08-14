/* ============================================================
 *  Dashboard
 *
 *  Every editable field is described once in SCHEMA below and the
 *  forms are generated from it, so adding a field is a one-line
 *  change rather than new markup plus new wiring.
 *
 *  Sessions are an httpOnly cookie the browser sends automatically;
 *  writes additionally echo the readable csrf_token cookie in a
 *  header. Nothing is kept in localStorage.
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- tiny helpers ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, props, kids) => {
    const n = Object.assign(document.createElement(tag), props || {});
    (kids || []).forEach((k) => n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k));
    return n;
  };
  const clone = (v) => JSON.parse(JSON.stringify(v));

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => (o[k] = o[k] || {}), obj);
    target[last] = value;
  }

  function readCookie(name) {
    const hit = document.cookie.split(';')
      .map((s) => s.trim())
      .find((s) => s.indexOf(name + '=') === 0);
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : '';
  }

  /* ---------- show / hide password ---------- */
  const EYE_SHOW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
    + 'stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/>'
    + '<circle cx="12" cy="12" r="2.8"/></svg>';
  const EYE_HIDE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
    + 'stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M2 12s3.6-6.5 10-6.5c1.9 0 3.5.6 4.8 1.3M22 12s-3.6 6.5-10 6.5c-1.9 0-3.5-.6-4.8-1.3"/>'
    + '<path d="M4 20 20 4"/></svg>';

  // Wraps every password box in a relative container and drops a reveal button
  // into it. Safe to call repeatedly — already-wired inputs are skipped, which
  // matters because the Account panel is rebuilt whenever the draft reloads.
  function addPasswordToggles(root) {
    (root || document).querySelectorAll('input[type=password]:not([data-pw-wired])')
      .forEach((input) => {
        input.dataset.pwWired = '1';
        const wrap = el('div', { className: 'pw-wrap' });
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);

        const btn = el('button', { className: 'pw-toggle', type: 'button' });
        btn.innerHTML = EYE_SHOW;
        btn.setAttribute('aria-label', 'Show password');
        btn.title = 'Show password';

        btn.addEventListener('click', () => {
          const showing = input.type === 'text';
          input.type = showing ? 'password' : 'text';
          btn.innerHTML = showing ? EYE_SHOW : EYE_HIDE;
          const label = showing ? 'Show password' : 'Hide password';
          btn.setAttribute('aria-label', label);
          btn.title = label;
          // Keep the caret where it was rather than dropping to the start.
          const at = input.value.length;
          input.focus();
          try { input.setSelectionRange(at, at); } catch { /* type change race */ }
        });

        wrap.appendChild(btn);
      });
  }

  let toastTimer = null;
  function toast(message, bad) {
    const t = $('#toast');
    t.textContent = message;
    t.classList.toggle('bad', !!bad);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 3000);
  }

  /* ---------- API ---------- */
  async function api(method, url, body, isForm) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (method !== 'GET') opts.headers['x-csrf-token'] = readCookie('csrf_token');
    if (body !== undefined) {
      if (isForm) opts.body = body;
      else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    }
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch { /* empty body is fine */ }
    if (res.status === 401 && !/\/api\/login/.test(url)) {
      showAuth();
      throw new Error('Your session has expired — please sign in again.');
    }
    if (!res.ok) throw new Error((data && data.error) || 'Request failed');
    return data;
  }

  /* ============================================================
   *  What can be edited
   * ============================================================ */
  const SERVICE_ITEM = {
    label: 'Service',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'desc', label: 'Short description', type: 'textarea' },
      { key: 'list', label: "What's included (one per line)", type: 'strings' },
    ],
  };

  const SCHEMA = {
    brand: {
      title: 'Branding & navigation',
      blurb: 'Your name, the logo, the accent colour and the menu labels.',
      cards: [
        {
          title: 'Wordmark',
          fields: [
            { path: 'brand.text', label: 'Name', type: 'text' },
            { path: 'brand.role', label: 'Line underneath the name', type: 'text' },
            { path: 'brand.monogram', label: 'Monogram', type: 'text', hint: 'One or two letters. Used for the browser tab icon and the footer.' },
            {
              path: 'brand.mode', label: 'Show in the header as', type: 'select',
              options: [['text', 'Name and monogram'], ['image', 'Uploaded logo image']],
            },
            { path: 'brand.logo', label: 'Logo image', type: 'image', target: 'logo', wide: true, hint: 'Only used when "Uploaded logo image" is selected above.' },
            { path: 'brand.accent', label: 'Accent colour', type: 'color', hint: 'Buttons, links and highlights. Leave blank for the default blue.' },
          ],
        },
        {
          title: 'Menu labels',
          fields: [
            { path: 'nav.about', label: 'About', type: 'text' },
            { path: 'nav.services', label: 'Services', type: 'text' },
            { path: 'nav.approach', label: 'Approach', type: 'text' },
            { path: 'nav.engagements', label: 'Ways to work', type: 'text' },
            { path: 'nav.experience', label: 'Experience', type: 'text' },
            { path: 'nav.cta', label: 'Button', type: 'text' },
            { path: 'footer.role', label: 'Footer tagline', type: 'text' },
          ],
        },
      ],
    },

    hero: {
      title: 'Hero',
      blurb: 'The first thing a visitor reads.',
      cards: [
        {
          fields: [
            { path: 'hero.eyebrow', label: 'Small line above the headline', type: 'text' },
            { path: 'hero.title', label: 'Headline', type: 'textarea', hint: 'Wrap words in *asterisks* to colour them with the accent.' },
            { path: 'hero.lead', label: 'Opening paragraph', type: 'textarea' },
            { path: 'hero.ctaPrimary', label: 'Main button', type: 'text' },
            { path: 'hero.ctaSecondary', label: 'Second button', type: 'text' },
          ],
        },
        {
          title: 'Stat strip',
          fields: [{
            path: 'hero.stats', type: 'list', addLabel: 'Add a stat',
            item: {
              label: 'Stat',
              fields: [
                { key: 'value', label: 'Big text', type: 'text' },
                { key: 'label', label: 'Caption', type: 'text' },
              ],
            },
          }],
        },
      ],
    },

    why: {
      title: 'The problem',
      blurb: 'The section that names what you fix.',
      cards: [{
        fields: [
          { path: 'why.eyebrow', label: 'Small line', type: 'text' },
          { path: 'why.heading', label: 'Heading', type: 'textarea' },
          { path: 'why.lead', label: 'First paragraph', type: 'textarea' },
          { path: 'why.body', label: 'Second paragraph', type: 'textarea' },
        ],
      }],
    },

    about: {
      title: 'About',
      blurb: 'Your photo, bio and credentials.',
      cards: [
        {
          title: 'Photo',
          fields: [
            { path: 'about.image', label: 'Portrait', type: 'image', target: 'portrait', hint: 'A portrait-shaped photo works best. Without one, your monogram is shown.' },
            { path: 'about.note', label: 'Caption under the photo', type: 'text' },
          ],
        },
        {
          title: 'Bio',
          fields: [
            { path: 'about.eyebrow', label: 'Small line', type: 'text' },
            { path: 'about.heading', label: 'Heading', type: 'text' },
            { path: 'about.lead', label: 'Opening line', type: 'textarea' },
            { path: 'about.body1', label: 'Paragraph', type: 'textarea' },
            { path: 'about.body2', label: 'Paragraph', type: 'textarea' },
            { path: 'about.creds', label: 'Credentials (one per line)', type: 'strings' },
          ],
        },
      ],
    },

    services: {
      title: 'Services',
      blurb: 'The expandable list of what you offer.',
      cards: [
        {
          fields: [
            { path: 'services.eyebrow', label: 'Small line', type: 'text' },
            { path: 'services.heading', label: 'Heading', type: 'text' },
            { path: 'services.sub', label: 'Intro paragraph', type: 'textarea' },
            { path: 'services.hint', label: 'Hint above the list', type: 'text' },
          ],
        },
        {
          title: 'Services',
          fields: [{ path: 'services.items', type: 'list', addLabel: 'Add a service', item: SERVICE_ITEM }],
        },
      ],
    },

    approach: {
      title: 'Approach',
      blurb: 'The steps an engagement runs through. They are numbered automatically.',
      cards: [
        {
          fields: [
            { path: 'approach.eyebrow', label: 'Small line', type: 'text' },
            { path: 'approach.heading', label: 'Heading', type: 'text' },
            { path: 'approach.sub', label: 'Intro paragraph', type: 'textarea' },
          ],
        },
        {
          title: 'Steps',
          fields: [{
            path: 'approach.steps', type: 'list', addLabel: 'Add a step',
            item: {
              label: 'Step',
              fields: [
                { key: 'title', label: 'Title', type: 'text' },
                { key: 'body', label: 'Description', type: 'textarea' },
              ],
            },
          }],
        },
      ],
    },

    engagements: {
      title: 'Ways to work',
      blurb: 'The three engagement shapes on the dark band.',
      cards: [
        {
          fields: [
            { path: 'engagements.eyebrow', label: 'Small line', type: 'text' },
            { path: 'engagements.heading', label: 'Heading', type: 'text' },
          ],
        },
        {
          title: 'Options',
          fields: [{
            path: 'engagements.tiers', type: 'list', addLabel: 'Add an option',
            item: {
              label: 'Option',
              fields: [
                { key: 'title', label: 'Title', type: 'text' },
                { key: 'meta', label: 'Small line underneath', type: 'text' },
                { key: 'body', label: 'Description', type: 'textarea' },
                { key: 'flag', label: 'Badge', type: 'text', hint: 'e.g. "Most common". Leave empty for no badge — the badge also highlights the card.' },
              ],
            },
          }],
        },
      ],
    },

    experience: {
      title: 'Experience',
      blurb: 'Your career timeline and the tools you work in.',
      cards: [
        {
          fields: [
            { path: 'experience.eyebrow', label: 'Small line', type: 'text' },
            { path: 'experience.heading', label: 'Heading', type: 'text' },
          ],
        },
        {
          title: 'Timeline',
          fields: [{
            path: 'experience.items', type: 'list', addLabel: 'Add a role',
            item: {
              label: 'Role',
              fields: [
                { key: 'when', label: 'When', type: 'text', hint: 'e.g. "Now", "Previously", or a year range.' },
                { key: 'title', label: 'Role and organisation', type: 'text' },
                { key: 'body', label: 'What you did', type: 'textarea' },
              ],
            },
          }],
        },
        {
          title: 'Tools',
          fields: [{
            path: 'experience.toolGroups', type: 'list', addLabel: 'Add a group',
            item: {
              label: 'Group',
              fields: [
                { key: 'title', label: 'Group name', type: 'text' },
                { key: 'tools', label: 'Tools (one per line)', type: 'strings' },
              ],
            },
          }],
        },
      ],
    },

    testimonials: {
      title: 'Testimonials',
      blurb: 'Quotes you add yourself. Reviews left by visitors are approved separately, '
        + 'under Reviews, and appear in the same scrolling row.',
      cards: [
        {
          fields: [
            { path: 'testimonials.eyebrow', label: 'Small line', type: 'text' },
            { path: 'testimonials.heading', label: 'Heading', type: 'text' },
            { path: 'testimonials.sub', label: 'Intro paragraph', type: 'textarea', hint: 'Optional.' },
          ],
        },
        {
          title: 'Quotes',
          fields: [{
            path: 'testimonials.items', type: 'list', addLabel: 'Add a testimonial',
            item: {
              label: 'Testimonial',
              fields: [
                { key: 'quote', label: 'What they said', type: 'textarea' },
                { key: 'name', label: 'Their name', type: 'text' },
                { key: 'role', label: 'Their role', type: 'text' },
                { key: 'company', label: 'Company', type: 'text' },
                { key: 'rating', label: 'Stars out of 5', type: 'text', hint: 'Optional. Leave blank for no stars.' },
              ],
            },
          }],
        },
        {
          title: 'Let visitors leave a review',
          fields: [
            {
              path: 'testimonials.formEnabled', label: 'Review form', type: 'select',
              // Strings, not booleans: the <select> writes its value verbatim,
              // so a boolean would come back as "true"/"false" anyway.
              options: [['true', 'Shown on the website'], ['false', 'Hidden']],
              hint: 'When shown, anyone can submit a review. It reaches you under Reviews '
                + 'and stays off the website until you approve it.',
            },
            { path: 'testimonials.formHeading', label: 'Invitation heading', type: 'text' },
            { path: 'testimonials.formSub', label: 'Invitation line', type: 'textarea' },
          ],
        },
      ],
    },

    faq: {
      title: 'FAQ',
      blurb: 'The questions people ask before getting in touch.',
      cards: [
        {
          fields: [
            { path: 'faq.eyebrow', label: 'Small line', type: 'text' },
            { path: 'faq.heading', label: 'Heading', type: 'text' },
          ],
        },
        {
          title: 'Questions',
          fields: [{
            path: 'faq.items', type: 'list', addLabel: 'Add a question',
            item: {
              label: 'Question',
              fields: [
                { key: 'q', label: 'Question', type: 'text' },
                { key: 'a', label: 'Answer', type: 'textarea' },
              ],
            },
          }],
        },
      ],
    },

    contact: {
      title: 'Contact',
      blurb: 'Your contact details and the wording around the form.',
      cards: [
        {
          fields: [
            { path: 'contact.eyebrow', label: 'Small line', type: 'text' },
            { path: 'contact.heading', label: 'Heading', type: 'text' },
            { path: 'contact.lead', label: 'Paragraph', type: 'textarea' },
          ],
        },
        {
          title: 'Details',
          fields: [
            { path: 'contact.email', label: 'Email address', type: 'text', hint: 'Shown on the page. Enquiries are also emailed to you and kept in Messages.' },
            { path: 'contact.location', label: 'Location line', type: 'text' },
            { path: 'contact.replyTime', label: 'Reply-time line', type: 'text' },
            { path: 'contact.formNote', label: 'Note under the form button', type: 'text' },
            { path: 'contact.services', label: 'Form dropdown options (one per line)', type: 'strings' },
          ],
        },
      ],
    },

    seo: {
      title: 'SEO & indexing',
      blurb: 'How the site appears in search results and when shared.',
      cards: [
        {
          title: 'Visibility',
          fields: [{
            path: 'seo.allowIndexing', label: 'Search engines', type: 'select',
            options: [['false', 'Hidden — keep the site out of Google'], ['true', 'Visible — allow the site to be found']],
            hint: 'While hidden, the site still works for anyone with the link; it is only kept out of search results.',
          }],
        },
        {
          title: 'Search result',
          fields: [
            { path: 'seo.title', label: 'Search title', type: 'text', hint: 'Around 60 characters shows in full.' },
            { path: 'seo.description', label: 'Search description', type: 'textarea', hint: 'Around 155 characters shows in full.' },
          ],
        },
        {
          title: 'Sharing',
          fields: [
            { path: 'seo.ogDescription', label: 'Description when shared on social media', type: 'textarea' },
            { path: 'seo.image', label: 'Sharing image', type: 'image', target: 'ogimage', wide: true, hint: '1200 × 630 works best.' },
          ],
        },
        {
          title: 'Verification',
          fields: [{ path: 'seo.searchConsole', label: 'Google Search Console code', type: 'text', hint: 'The content value from the HTML tag Google gives you.' }],
        },
      ],
    },
  };

  const PAGE_ORDER = ['brand', 'hero', 'why', 'about', 'services', 'approach',
    'engagements', 'experience', 'testimonials', 'faq', 'contact', 'seo'];

  /* ============================================================
   *  State
   * ============================================================ */
  let content = {};
  let pending = {};
  let messages = [];
  let reviews = [];
  let reviewFilter = 'pending';
  let currentPanel = 'messages';

  /* ============================================================
   *  Field rendering
   * ============================================================ */

  // Every control writes straight back into `content` on input, so Save only
  // has to send what is already there.
  function bind(node, read, write) {
    node.value = read() == null ? '' : read();
    node.addEventListener('input', () => write(node.value));
    return node;
  }

  function fieldLabel(id, text) {
    return el('label', { htmlFor: id, textContent: text });
  }

  let uid = 0;
  const nextId = () => 'f' + (++uid);

  function renderField(spec, ctx) {
    // ctx = { get(key), set(key, value) } for list items, or null for paths.
    const read = () => (ctx ? ctx.get(spec.key) : getPath(content, spec.path));
    const write = (v) => { ctx ? ctx.set(spec.key, v) : setPath(content, spec.path, v); markDirty(); };

    if (spec.type === 'list') return renderList(spec);

    const wrap = el('div', { className: 'f' });
    const id = nextId();

    if (spec.type === 'strings') {
      wrap.appendChild(fieldLabel(id, spec.label));
      const ta = el('textarea', { id, rows: 5 });
      const list = read();
      ta.value = Array.isArray(list) ? list.join('\n') : '';
      ta.addEventListener('input', () => {
        write(ta.value.split('\n').map((s) => s.trim()).filter(Boolean));
      });
      wrap.appendChild(ta);
    } else if (spec.type === 'textarea') {
      wrap.appendChild(fieldLabel(id, spec.label));
      wrap.appendChild(bind(el('textarea', { id, rows: 4 }), read, write));
    } else if (spec.type === 'select') {
      wrap.appendChild(fieldLabel(id, spec.label));
      const sel = el('select', { id });
      (spec.options || []).forEach(([value, text]) => sel.appendChild(el('option', { value, textContent: text })));
      sel.value = read() == null ? '' : String(read());
      sel.addEventListener('change', () => write(sel.value));
      wrap.appendChild(sel);
    } else if (spec.type === 'color') {
      wrap.appendChild(fieldLabel(id, spec.label));
      const row = el('div', { className: 'f-color-row' });
      const swatch = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(read() || '') ? read() : '#2e73a8' });
      const text = el('input', { type: 'text', id, placeholder: '#2e73a8', value: read() || '' });
      swatch.addEventListener('input', () => { text.value = swatch.value; write(swatch.value); });
      text.addEventListener('input', () => {
        write(text.value.trim());
        if (/^#[0-9a-f]{6}$/i.test(text.value.trim())) swatch.value = text.value.trim();
      });
      row.appendChild(swatch);
      row.appendChild(text);
      wrap.appendChild(row);
    } else if (spec.type === 'image') {
      wrap.appendChild(fieldLabel(id, spec.label));
      wrap.appendChild(renderImage(spec, read, write));
    } else {
      wrap.appendChild(fieldLabel(id, spec.label));
      wrap.appendChild(bind(el('input', { type: 'text', id }), read, write));
    }

    if (spec.hint) wrap.appendChild(el('p', { className: 'f-hint', textContent: spec.hint }));
    return wrap;
  }

  function renderImage(spec, read, write) {
    const row = el('div', { className: 'img-field' });
    const box = el('div', { className: 'img-preview' + (spec.wide ? ' wide' : '') });

    function paint() {
      box.textContent = '';
      const url = read();
      if (url) box.appendChild(el('img', { src: url, alt: '' }));
      else box.textContent = 'None';
    }
    paint();

    const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
    const pick = el('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Choose image…' });
    const drop = el('button', { className: 'btn btn-danger btn-sm', type: 'button', textContent: 'Remove' });

    pick.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      if (!file.files || !file.files[0]) return;
      const body = new FormData();
      body.append('image', file.files[0]);
      pick.disabled = true;
      pick.textContent = 'Uploading…';
      try {
        const out = await api('POST', '/api/upload/' + spec.target, body, true);
        write(out.url);
        paint();
        toast('Image uploaded — publish this section to put it live.');
      } catch (err) {
        toast(err.message, true);
      } finally {
        pick.disabled = false;
        pick.textContent = 'Choose image…';
        file.value = '';
      }
    });
    drop.addEventListener('click', async () => {
      try {
        await api('DELETE', '/api/upload/' + spec.target);
        write('');
        paint();
      } catch (err) { toast(err.message, true); }
    });

    row.appendChild(box);
    row.appendChild(el('div', { className: 'img-actions' }, [pick, drop, file]));
    return row;
  }

  function renderList(spec) {
    const holder = el('div', { className: 'list' });

    function items() {
      let list = getPath(content, spec.path);
      if (!Array.isArray(list)) { list = []; setPath(content, spec.path, list); }
      return list;
    }

    function paint() {
      holder.textContent = '';
      const list = items();

      list.forEach((row, i) => {
        const card = el('div', { className: 'item' });
        const head = el('div', { className: 'item-head' });
        head.appendChild(el('span', { className: 'item-title', textContent: `${spec.item.label} ${i + 1}` }));

        const up = el('button', { className: 'item-btn', type: 'button', textContent: '↑', title: 'Move up' });
        const down = el('button', { className: 'item-btn', type: 'button', textContent: '↓', title: 'Move down' });
        const rm = el('button', { className: 'item-btn remove', type: 'button', textContent: '×', title: 'Remove' });
        up.disabled = i === 0;
        down.disabled = i === list.length - 1;

        up.addEventListener('click', () => { list.splice(i - 1, 0, list.splice(i, 1)[0]); markDirty(); paint(); });
        down.addEventListener('click', () => { list.splice(i + 1, 0, list.splice(i, 1)[0]); markDirty(); paint(); });
        rm.addEventListener('click', () => {
          if (!confirm(`Remove ${spec.item.label.toLowerCase()} ${i + 1}?`)) return;
          list.splice(i, 1); markDirty(); paint();
        });

        head.appendChild(up); head.appendChild(down); head.appendChild(rm);
        card.appendChild(head);

        const ctx = {
          get: (k) => row[k],
          set: (k, v) => { row[k] = v; },
        };
        spec.item.fields.forEach((f) => card.appendChild(renderField(f, ctx)));
        holder.appendChild(card);
      });

      if (!list.length) holder.appendChild(el('p', { className: 'empty', textContent: 'Nothing here yet.' }));

      const add = el('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: spec.addLabel || 'Add' });
      add.addEventListener('click', () => {
        const blank = {};
        spec.item.fields.forEach((f) => { blank[f.key] = f.type === 'strings' ? [] : ''; });
        items().push(blank);
        markDirty();
        paint();
      });
      holder.appendChild(add);
    }

    paint();
    return holder;
  }

  /* ============================================================
   *  Panels
   * ============================================================ */
  function pageBar(page) {
    const bar = el('div', { className: 'page-bar' });
    const state = el('p', { className: 'page-state', id: 'state-' + page });
    const save = el('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Save' });
    const publish = el('button', { className: 'btn btn-primary btn-sm', type: 'button', textContent: 'Publish' });
    const history = el('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'History' });

    save.addEventListener('click', () => savePage(page, save));
    publish.addEventListener('click', () => publishPage(page, publish));
    history.addEventListener('click', () => openHistory(page));

    bar.appendChild(state);
    bar.appendChild(history);
    bar.appendChild(save);
    bar.appendChild(publish);
    return bar;
  }

  function buildContentPanel(page) {
    const def = SCHEMA[page];
    const panel = el('section', { className: 'panel', id: 'panel-' + page });

    const head = el('div', { className: 'panel-head' });
    head.appendChild(el('h2', { textContent: def.title }));
    if (def.blurb) head.appendChild(el('p', { textContent: def.blurb }));
    panel.appendChild(head);
    panel.appendChild(pageBar(page));

    def.cards.forEach((card) => {
      const box = el('div', { className: 'card' });
      if (card.title) box.appendChild(el('h3', { textContent: card.title }));
      card.fields.forEach((f) => box.appendChild(renderField(f, null)));
      panel.appendChild(box);
    });

    return panel;
  }

  function buildMessagesPanel() {
    const panel = el('section', { className: 'panel', id: 'panel-messages' });
    const head = el('div', { className: 'panel-head' });
    head.appendChild(el('h2', { textContent: 'Messages' }));
    head.appendChild(el('p', { textContent: 'Enquiries sent through the contact form.' }));
    panel.appendChild(head);
    panel.appendChild(el('div', { id: 'messageList' }));
    return panel;
  }

  function buildReviewsPanel() {
    const panel = el('section', { className: 'panel', id: 'panel-reviews' });
    const head = el('div', { className: 'panel-head' });
    head.appendChild(el('h2', { textContent: 'Reviews' }));
    head.appendChild(el('p', {
      textContent: 'Reviews left by visitors. Nothing appears on the website until you approve it. '
        + 'Approving puts it live straight away — there is no separate publish step.',
    }));
    panel.appendChild(head);

    const filters = el('div', { className: 'rv-filters' });
    [['pending', 'Awaiting you'], ['approved', 'On the website'], ['rejected', 'Rejected'], ['all', 'All']]
      .forEach(([key, label]) => {
        const b = el('button', {
          className: 'rv-filter' + (key === 'pending' ? ' active' : ''),
          type: 'button', textContent: label,
        });
        b.dataset.filter = key;
        b.addEventListener('click', () => {
          reviewFilter = key;
          panel.querySelectorAll('.rv-filter').forEach((x) => x.classList.toggle('active', x.dataset.filter === key));
          renderReviews();
        });
        filters.appendChild(b);
      });
    panel.appendChild(filters);
    panel.appendChild(el('div', { id: 'reviewList' }));
    return panel;
  }

  function buildAccountPanel() {
    const panel = el('section', { className: 'panel', id: 'panel-account' });
    const head = el('div', { className: 'panel-head' });
    head.appendChild(el('h2', { textContent: 'Account' }));
    head.appendChild(el('p', { textContent: 'Change the password you sign in with.' }));
    panel.appendChild(head);

    const card = el('div', { className: 'card' });
    const cur = el('input', { type: 'password', id: 'pw-current', autocomplete: 'current-password' });
    const next = el('input', { type: 'password', id: 'pw-new', autocomplete: 'new-password', minLength: 10 });
    card.appendChild(el('div', { className: 'f' }, [fieldLabel('pw-current', 'Current password'), cur]));
    card.appendChild(el('div', { className: 'f' }, [
      fieldLabel('pw-new', 'New password'), next,
      el('p', { className: 'f-hint', textContent: 'At least 10 characters. Changing it signs you out everywhere.' }),
    ]));

    const go = el('button', { className: 'btn btn-primary', type: 'button', textContent: 'Change password' });
    go.addEventListener('click', async () => {
      go.disabled = true;
      try {
        await api('POST', '/api/change-password', { current: cur.value, password: next.value });
        toast('Password changed — please sign in again.');
        setTimeout(showAuth, 1200);
      } catch (err) { toast(err.message, true); }
      finally { go.disabled = false; }
    });
    card.appendChild(go);
    panel.appendChild(card);
    return panel;
  }

  /* ============================================================
   *  Navigation
   * ============================================================ */
  const NAV = [
    { group: 'Inbox', items: [['messages', 'Messages'], ['reviews', 'Reviews']] },
    { group: 'Page sections', items: PAGE_ORDER.filter((p) => p !== 'seo' && p !== 'brand').map((p) => [p, SCHEMA[p].title]) },
    { group: 'Site settings', items: [['brand', SCHEMA.brand.title], ['seo', SCHEMA.seo.title], ['account', 'Account']] },
  ];

  function buildNav() {
    const nav = $('#sideNav');
    nav.textContent = '';
    NAV.forEach((section) => {
      nav.appendChild(el('span', { className: 'side-group', textContent: section.group }));
      section.items.forEach(([key, label]) => {
        // dataset is a getter-only accessor, so it cannot go through el()'s
        // Object.assign — it has to be written afterwards.
        const a = el('a', { href: '#panel-' + key }, [label]);
        a.dataset.panel = key;
        if (key === 'messages') {
          a.appendChild(el('span', { className: 'badge', id: 'msgBadge', hidden: true }));
        } else if (key === 'reviews') {
          a.appendChild(el('span', { className: 'badge', id: 'rvBadge', hidden: true }));
        } else if (SCHEMA[key]) {
          a.appendChild(el('span', { className: 'dot', id: 'dot-' + key, hidden: true, title: 'Unpublished changes' }));
        }
        a.addEventListener('click', (e) => { e.preventDefault(); showPanel(key); });
        nav.appendChild(a);
      });
    });
  }

  function showPanel(key) {
    currentPanel = key;
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + key));
    document.querySelectorAll('.side-nav a').forEach((a) => a.classList.toggle('active', a.dataset.panel === key));
    if (location.hash !== '#panel-' + key) history.replaceState(null, '', '#panel-' + key);
    $('#sidebar').classList.remove('open');
    $('#drawerToggle').setAttribute('aria-expanded', 'false');
    if (key === 'messages') loadMessages();
    if (key === 'reviews') loadReviews();
    window.scrollTo(0, 0);
  }

  /* ============================================================
   *  Save / publish / history
   * ============================================================ */
  let dirty = false;
  function markDirty() {
    dirty = true;
    // The state line can't know which paths changed, so it just stops claiming
    // everything is published until the next save round-trip.
    const line = $('#state-' + currentPanel);
    if (line) setState(line, currentPanel, true, 'Unsaved changes');
  }

  function setState(line, page, isPending, text) {
    line.className = 'page-state ' + (isPending ? 'pending' : 'clean');
    line.textContent = text || (isPending ? 'Unpublished changes' : 'Published — up to date');
  }

  function paintPending() {
    Object.keys(SCHEMA).forEach((page) => {
      const dot = $('#dot-' + page);
      if (dot) dot.hidden = !pending[page];
      const line = $('#state-' + page);
      if (line) setState(line, page, !!pending[page]);
    });
  }

  async function savePage(page, button) {
    if (button) button.disabled = true;
    try {
      const out = await api('PUT', '/api/content', { page, content });
      pending = out.pending || pending;
      dirty = false;
      paintPending();
      toast(page === 'all' ? 'All changes saved.' : 'Saved. Publish to put it live.');
    } catch (err) { toast(err.message, true); }
    finally { if (button) button.disabled = false; }
  }

  async function publishPage(page, button) {
    if (dirty) await savePage(page);
    if (button) button.disabled = true;
    try {
      const out = await api('POST', '/api/content/publish', { page });
      pending = out.pending || pending;
      paintPending();
      toast('Published — it is live on the website now.');
    } catch (err) { toast(err.message, true); }
    finally { if (button) button.disabled = false; }
  }

  async function openHistory(page) {
    const modal = $('#historyModal');
    const body = $('#historyBody');
    $('#historyTitle').textContent = 'History — ' + (SCHEMA[page] ? SCHEMA[page].title : page);
    body.textContent = 'Loading…';
    modal.hidden = false;

    try {
      const rows = await api('GET', '/api/content/versions?page=' + encodeURIComponent(page));
      body.textContent = '';
      if (!rows.length) {
        body.appendChild(el('p', { className: 'empty', textContent: 'No history yet.' }));
        return;
      }
      rows.forEach((v) => {
        const when = new Date(v.created_at).toLocaleString();
        const line = el('div', { className: 'ver' });
        line.appendChild(el('span', { className: 'ver-when', textContent: when + (v.author ? ' · ' + v.author : '') }));
        line.appendChild(el('span', { className: 'ver-what', textContent: v.action }));
        const restore = el('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Restore' });
        restore.addEventListener('click', async () => {
          if (!confirm('Put this version back into your draft? The live site will not change until you publish.')) return;
          try {
            const out = await api('POST', '/api/content/versions/' + v.id + '/restore', { page });
            pending = out.pending || pending;
            await reload();
            modal.hidden = true;
            toast('Restored into your draft. Review it, then publish.');
          } catch (err) { toast(err.message, true); }
        });
        line.appendChild(restore);
        body.appendChild(line);
      });
    } catch (err) {
      body.textContent = '';
      body.appendChild(el('p', { className: 'empty', textContent: err.message }));
    }
  }

  /* ============================================================
   *  Messages
   * ============================================================ */
  async function loadMessages() {
    const list = $('#messageList');
    if (!list) return;
    try {
      messages = await api('GET', '/api/messages');
    } catch { return; }

    const unread = messages.filter((m) => !m.read).length;
    const badge = $('#msgBadge');
    if (badge) { badge.hidden = !unread; badge.textContent = String(unread); }

    list.textContent = '';
    if (!messages.length) {
      list.appendChild(el('p', { className: 'empty', textContent: 'No messages yet.' }));
      return;
    }

    messages.forEach((m) => {
      const card = el('div', { className: 'msg' + (m.read ? '' : ' unread') });
      const head = el('div', { className: 'msg-head' });
      head.appendChild(el('span', { className: 'msg-name', textContent: m.name || 'Someone' }));
      const meta = [m.company, m.service, new Date(m.created_at).toLocaleString()]
        .filter(Boolean).join(' · ');
      head.appendChild(el('span', { className: 'msg-meta', textContent: meta }));
      card.appendChild(head);
      card.appendChild(el('p', { className: 'msg-body', textContent: m.message || '' }));

      const actions = el('div', { className: 'msg-actions' });
      actions.appendChild(el('a', { className: 'btn btn-ghost btn-sm', href: 'mailto:' + m.email }, ['Reply to ' + m.email]));
      if (!m.read) {
        const mark = el('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Mark read' });
        mark.addEventListener('click', async () => {
          try { await api('POST', '/api/messages/' + m.id + '/read'); loadMessages(); }
          catch (err) { toast(err.message, true); }
        });
        actions.appendChild(mark);
      }
      const del = el('button', { className: 'btn btn-danger btn-sm', type: 'button', textContent: 'Delete' });
      del.addEventListener('click', async () => {
        if (!confirm('Delete this message?')) return;
        try { await api('DELETE', '/api/messages/' + m.id); loadMessages(); }
        catch (err) { toast(err.message, true); }
      });
      actions.appendChild(del);
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  /* ============================================================
   *  Reviews
   * ============================================================ */
  async function loadReviews() {
    try { reviews = await api('GET', '/api/reviews'); }
    catch { return; }
    const waiting = reviews.filter((r) => r.status === 'pending').length;
    const badge = $('#rvBadge');
    if (badge) { badge.hidden = !waiting; badge.textContent = String(waiting); }
    renderReviews();
  }

  function renderReviews() {
    const list = $('#reviewList');
    if (!list) return;
    const shown = reviewFilter === 'all' ? reviews : reviews.filter((r) => r.status === reviewFilter);

    list.textContent = '';
    if (!shown.length) {
      list.appendChild(el('p', {
        className: 'empty',
        textContent: reviewFilter === 'pending'
          ? 'Nothing waiting for you.'
          : 'Nothing here yet.',
      }));
      return;
    }

    shown.forEach((r) => {
      const card = el('div', { className: 'msg rv rv-' + r.status });

      const head = el('div', { className: 'msg-head' });
      head.appendChild(el('span', { className: 'msg-name', textContent: r.name || 'Someone' }));
      const meta = [r.role, r.company, new Date(r.created_at).toLocaleString()].filter(Boolean).join(' · ');
      head.appendChild(el('span', { className: 'msg-meta', textContent: meta }));
      card.appendChild(head);

      const tags = el('div', { className: 'rv-tags' });
      tags.appendChild(el('span', {
        className: 'rv-status rv-status-' + r.status,
        textContent: r.status === 'pending' ? 'Awaiting approval'
          : r.status === 'approved' ? 'On the website' : 'Rejected',
      }));
      if (r.rating) {
        tags.appendChild(el('span', {
          className: 'rv-rating',
          textContent: '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating),
          title: r.rating + ' out of 5',
        }));
      }
      card.appendChild(tags);

      card.appendChild(el('p', { className: 'msg-body', textContent: r.quote || '' }));

      const actions = el('div', { className: 'msg-actions' });
      const decide = (decision, label, cls) => {
        const b = el('button', { className: 'btn ' + cls + ' btn-sm', type: 'button', textContent: label });
        b.addEventListener('click', async () => {
          b.disabled = true;
          try {
            await api('POST', '/api/reviews/' + r.id + '/' + decision);
            toast(decision === 'approve'
              ? 'Approved — it is on the website now.'
              : decision === 'reject' ? 'Rejected — it stays off the website.'
                : 'Moved back to awaiting approval.');
            loadReviews();
          } catch (err) { toast(err.message, true); b.disabled = false; }
        });
        return b;
      };

      if (r.status !== 'approved') actions.appendChild(decide('approve', 'Approve', 'btn-primary'));
      if (r.status !== 'rejected') actions.appendChild(decide('reject', 'Reject', 'btn-ghost'));
      if (r.status !== 'pending') actions.appendChild(decide('pending', 'Undo', 'btn-ghost'));
      if (r.email) {
        actions.appendChild(el('a', { className: 'btn btn-ghost btn-sm', href: 'mailto:' + r.email }, ['Reply']));
      }

      const del = el('button', { className: 'btn btn-danger btn-sm', type: 'button', textContent: 'Delete' });
      del.addEventListener('click', async () => {
        if (!confirm('Delete this review permanently?')) return;
        try { await api('DELETE', '/api/reviews/' + r.id); loadReviews(); }
        catch (err) { toast(err.message, true); }
      });
      actions.appendChild(del);

      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  /* ============================================================
   *  Boot
   * ============================================================ */
  function showAuth() {
    document.body.classList.remove('booting');
    $('#app').hidden = true;
    $('#authScreen').hidden = false;
    $('#loginForm').hidden = false;
    $('#codeForm').hidden = true;
    $('#resetForm').hidden = true;
  }

  async function reload() {
    const out = await api('GET', '/api/content/draft');
    content = out.content || {};
    pending = out.pending || {};
    buildPanels();
    paintPending();
  }

  function buildPanels() {
    const holder = $('#panels');
    holder.textContent = '';
    holder.appendChild(buildMessagesPanel());
    holder.appendChild(buildReviewsPanel());
    PAGE_ORDER.forEach((page) => holder.appendChild(buildContentPanel(page)));
    holder.appendChild(buildAccountPanel());
    addPasswordToggles(holder);
    const wanted = (location.hash || '').replace('#panel-', '');
    showPanel(SCHEMA[wanted] || ['messages', 'reviews', 'account'].includes(wanted) ? wanted : 'messages');
  }

  async function startApp(email) {
    $('#authScreen').hidden = true;
    $('#app').hidden = false;
    document.body.classList.remove('booting');
    $('#sideUser').textContent = email || '';
    buildNav();
    await reload();
    loadMessages();
  }

  /* ---------- auth wiring ---------- */
  let pendingEmail = '';

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#loginMsg');
    msg.className = 'auth-msg';
    msg.textContent = 'Checking…';
    try {
      const out = await api('POST', '/api/login', {
        email: $('#li-email').value.trim(),
        password: $('#li-password').value,
      });
      pendingEmail = out.email;
      $('#loginForm').hidden = true;
      $('#codeForm').hidden = false;
      $('#codeSub').textContent = out.delivered
        ? `We sent a 6-digit code to ${out.email}.`
        : `Email is not configured, so here is the code: ${out.devCode}`;
      msg.textContent = '';
      $('#li-code').focus();
    } catch (err) {
      msg.textContent = err.message;
    }
  });

  $('#codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#codeMsg');
    msg.className = 'auth-msg';
    msg.textContent = 'Checking…';
    try {
      const out = await api('POST', '/api/login/verify', {
        email: pendingEmail,
        code: $('#li-code').value.trim(),
      });
      await startApp(out.email);
    } catch (err) {
      msg.textContent = err.message;
    }
  });

  $('#resendBtn').addEventListener('click', async () => {
    const msg = $('#codeMsg');
    try {
      const out = await api('POST', '/api/login/resend', { email: pendingEmail });
      msg.className = 'auth-msg ok';
      msg.textContent = out.delivered ? 'A new code is on its way.' : `Code: ${out.devCode}`;
    } catch (err) {
      msg.className = 'auth-msg';
      msg.textContent = err.message;
    }
  });

  const backToLogin = () => {
    $('#loginForm').hidden = false;
    $('#codeForm').hidden = true;
    $('#resetForm').hidden = true;
    $('#loginMsg').textContent = '';
  };
  $('#backToLogin').addEventListener('click', backToLogin);
  $('#backToLogin2').addEventListener('click', backToLogin);

  $('#forgotBtn').addEventListener('click', () => {
    $('#loginForm').hidden = true;
    $('#resetForm').hidden = false;
    $('#rs-email').value = $('#li-email').value;
  });

  $('#sendResetBtn').addEventListener('click', async () => {
    const msg = $('#resetMsg');
    try {
      await api('POST', '/api/request-reset', { email: $('#rs-email').value.trim() });
      msg.className = 'auth-msg ok';
      msg.textContent = 'If that address has an account, a code is on its way.';
    } catch (err) {
      msg.className = 'auth-msg';
      msg.textContent = err.message;
    }
  });

  $('#resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#resetMsg');
    msg.className = 'auth-msg';
    try {
      await api('POST', '/api/reset-password', {
        email: $('#rs-email').value.trim(),
        code: $('#rs-code').value.trim(),
        password: $('#rs-password').value,
      });
      msg.className = 'auth-msg ok';
      msg.textContent = 'Password changed — you can sign in now.';
      setTimeout(backToLogin, 1400);
    } catch (err) {
      msg.textContent = err.message;
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('POST', '/api/logout'); } catch { /* signing out anyway */ }
    showAuth();
  });

  $('#saveAllBtn').addEventListener('click', (e) => savePage('all', e.currentTarget));

  $('#drawerToggle').addEventListener('click', (e) => {
    const open = $('#sidebar').classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  $('#historyClose').addEventListener('click', () => { $('#historyModal').hidden = true; });
  $('#historyModal').addEventListener('click', (e) => {
    if (e.target === $('#historyModal')) $('#historyModal').hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $('#historyModal').hidden = true;
  });

  // Warn before losing edits that were never saved.
  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // The sign-in and reset forms are static markup, so they can be wired now.
  addPasswordToggles();

  // Resume from the session cookie if there is one; otherwise show sign-in.
  // A failure to authenticate and a failure to build the dashboard are kept
  // apart deliberately — lumping them together showed the sign-in screen for
  // what was really a rendering bug, which is impossible to diagnose.
  (async function boot() {
    let me;
    try {
      me = await api('GET', '/api/account');
    } catch {
      showAuth();
      return;
    }
    try {
      await startApp(me.email);
    } catch (err) {
      document.body.classList.remove('booting');
      $('#app').hidden = false;
      console.error('Dashboard failed to start:', err);
      toast('The dashboard could not load: ' + err.message, true);
    }
  })();
})();