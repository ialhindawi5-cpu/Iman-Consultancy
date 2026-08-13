/* ============================================================
   Iman Hindawi — Project Coordination Consulting
   No dependencies. Everything degrades gracefully without JS.
   ============================================================ */

(function () {
  'use strict';

  var CONTACT_EMAIL = 'i.alhindawi5@gmail.com';

  // Panels are collapsed only once we know JS is running, so a visitor
  // without it still sees every service in full.
  document.documentElement.classList.remove('no-js');

  /* ── current year ───────────────────────────────────────── */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ── header shadow on scroll ────────────────────────────── */
  var header = document.getElementById('siteHeader');
  function onScroll() {
    if (header) header.classList.toggle('scrolled', window.scrollY > 8);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ── mobile menu ────────────────────────────────────────── */
  var toggle = document.getElementById('menuToggle');
  var nav = document.getElementById('siteNav');

  function closeMenu() {
    if (!nav || !toggle) return;
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  }

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });

    // Reset the mobile panel state when we grow past the breakpoint.
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) closeMenu();
    });
  }

  /* ── reveal on scroll ───────────────────────────────────── */
  var revealables = document.querySelectorAll('.reveal');

  if (!('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('in'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add('in');
        revealObserver.unobserve(el);

        // Drop the stagger once it has played, or it would also delay
        // every later transition on the element (card hover, for one).
        var delay = parseFloat(el.style.transitionDelay) * 1000 || 0;
        setTimeout(function () { el.style.transitionDelay = ''; }, delay + 700);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    revealables.forEach(function (el) {
      // Small stagger inside a group so cards don't all pop at once.
      var siblings = el.parentElement ? el.parentElement.children : [];
      var index = Array.prototype.indexOf.call(siblings, el);
      el.style.transitionDelay = Math.min(index, 4) * 0.07 + 's';
      revealObserver.observe(el);
    });
  }

  /* ── expandable service cards ───────────────────────────── */
  var cardGrid = document.getElementById('serviceCards');

  if (cardGrid) {
    var heads = Array.prototype.slice.call(cardGrid.querySelectorAll('.card-head'));

    var instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function setCard(head, open, animate) {
      var card = head.closest('.card');
      var panel = document.getElementById(head.getAttribute('aria-controls'));
      if (!card || !panel) return;

      var inner = panel.firstElementChild;
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      card.classList.toggle('open', open);

      // Snap instead of animate on first paint (a deep link) — the layout
      // isn't reliably settled yet, so a measured height can come back 0.
      if (instant || animate === false) {
        panel.style.height = open ? 'auto' : '0px';
        return;
      }

      // Animate from wherever the panel is now to its target height. Pin the
      // start value first, otherwise there's nothing for 'auto' to travel from.
      var from = panel.getBoundingClientRect().height;
      var to = open ? inner.getBoundingClientRect().height : 0;

      panel.style.height = from + 'px';
      void panel.offsetHeight;                       // force the reflow
      panel.style.height = to + 'px';
    }

    heads.forEach(function (head) {
      var panel = document.getElementById(head.getAttribute('aria-controls'));

      head.addEventListener('click', function () {
        setCard(head, head.getAttribute('aria-expanded') !== 'true');
      });

      // Once open, hand the height back to the content so it can reflow on
      // resize or a font swap without being pinned to a stale pixel value.
      if (panel) {
        panel.addEventListener('transitionend', function (e) {
          if (e.propertyName !== 'height' || e.target !== panel) return;
          if (head.getAttribute('aria-expanded') === 'true') panel.style.height = 'auto';
        });
      }
    });

    // Deep link: /#services?open=2 or a #svc-2 hash opens that card.
    var hash = window.location.hash;
    if (hash && /^#svc-\d+$/.test(hash)) {
      var target = cardGrid.querySelector('.card-head[aria-controls="' + hash.slice(1) + '"]');
      if (target) {
        setCard(target, true, false);

        // The browser aims at the panel, which parks the card's own heading
        // under the sticky header. Re-aim at the card, clearing the header.
        // The fragment jump is async, so this has to run after it — hence the
        // load listener as well as the timeout.
        var card = target.closest('.card');
        var settle = function () {
          if (!card) return;
          var top = card.getBoundingClientRect().top + window.pageYOffset;
          var clear = (header ? header.offsetHeight : 0) + 12;
          window.scrollTo(0, Math.max(0, top - clear));
        };
        window.addEventListener('load', settle);
        setTimeout(settle, 80);
      }
    }
  }

  /* ── nav scrollspy ──────────────────────────────────────── */
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.site-nav a[href^="#"]:not(.btn)')
  );
  var sections = navLinks
    .map(function (link) { return document.querySelector(link.getAttribute('href')); })
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    var visible = new Map();

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
      });

      var bestId = null;
      var bestRatio = 0;
      visible.forEach(function (ratio, id) {
        if (ratio > bestRatio) { bestRatio = ratio; bestId = id; }
      });

      navLinks.forEach(function (link) {
        link.classList.toggle('active', bestId !== null && link.getAttribute('href') === '#' + bestId);
      });
    }, {
      rootMargin: '-45% 0px -45% 0px',
      threshold: [0, 0.25, 0.5, 1]
    });

    sections.forEach(function (section) { spy.observe(section); });
  }

  /* ── contact form ───────────────────────────────────────── */
  var form = document.getElementById('contactForm');
  var note = document.getElementById('formNote');

  function setFieldError(input, message) {
    var field = input.closest('.field');
    if (!field) return;
    field.classList.toggle('invalid', Boolean(message));
    var err = field.querySelector('.err');
    if (err) err.textContent = message || '';
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  if (form) {
    // Clear an error as soon as the user starts fixing it.
    form.addEventListener('input', function (e) {
      if (e.target.matches('input, textarea')) setFieldError(e.target, '');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var name = form.elements.name;
      var email = form.elements.email;
      var company = form.elements.company;
      var service = form.elements.service;
      var message = form.elements.message;

      var firstInvalid = null;

      if (!name.value.trim()) {
        setFieldError(name, 'Please add your name.');
        firstInvalid = firstInvalid || name;
      }
      if (!validEmail(email.value.trim())) {
        setFieldError(email, 'Please add a valid email address.');
        firstInvalid = firstInvalid || email;
      }
      if (message.value.trim().length < 10) {
        setFieldError(message, 'A sentence or two about the project, please.');
        firstInvalid = firstInvalid || message;
      }

      if (firstInvalid) {
        firstInvalid.focus();
        if (note) { note.classList.remove('ok'); note.textContent = 'Please fix the highlighted fields.'; }
        return;
      }

      var subject = 'Project enquiry — ' + service.value;
      var bodyLines = [
        'Name: ' + name.value.trim(),
        'Email: ' + email.value.trim(),
        'Company: ' + (company.value.trim() || '—'),
        'Service: ' + service.value,
        '',
        message.value.trim()
      ];

      var href = 'mailto:' + CONTACT_EMAIL +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(bodyLines.join('\n'));

      window.location.href = href;

      if (note) {
        note.classList.add('ok');
        note.textContent = 'Opening your email app… if nothing happens, write to ' + CONTACT_EMAIL;
      }
    });
  }

  /* ── custom cursor ──────────────────────────────────────────
     A solid dot that tracks the pointer exactly, plus a ring that
     eases in behind it. Desktop pointers only — touch devices and
     anyone who asked for reduced motion keep the native cursor.
     ────────────────────────────────────────────────────────── */

  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var stillMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (finePointer && !stillMotion) {
    var dot = document.createElement('div');
    var ring = document.createElement('div');
    dot.className = 'cursor-dot';
    ring.className = 'cursor-ring';
    dot.setAttribute('aria-hidden', 'true');
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dot);
    document.body.appendChild(ring);
    document.body.classList.add('cursor-on');

    var mouseX = window.innerWidth / 2;
    var mouseY = window.innerHeight / 2;
    var ringX = mouseX;
    var ringY = mouseY;
    var frame = null;

    var HOT = 'a, button, summary, label, .card-head, input, textarea, select';
    var TEXT_FIELD = 'input, textarea, select';
    var DARK = '.section-dark, .site-footer';

    function render() {
      // Ease the ring toward the pointer; the dot stays glued to it.
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;

      dot.style.transform = 'translate3d(' + mouseX + 'px,' + mouseY + 'px,0)';
      ring.style.transform = 'translate3d(' + ringX + 'px,' + ringY + 'px,0)';

      var settled = Math.abs(mouseX - ringX) < 0.1 && Math.abs(mouseY - ringY) < 0.1;
      frame = settled ? null : requestAnimationFrame(render);
    }

    function kick() {
      if (frame === null) frame = requestAnimationFrame(render);
    }

    document.addEventListener('mousemove', function (e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      kick();

      var el = e.target;
      var overText = el.closest && el.closest(TEXT_FIELD);

      // Give text fields their caret back and get out of the way.
      document.body.classList.toggle('cursor-hide', Boolean(overText));

      var interactive = !overText && el.closest && el.closest(HOT);
      ring.classList.toggle('hot', Boolean(interactive));

      var onDark = el.closest && el.closest(DARK);
      dot.classList.toggle('on-dark', Boolean(onDark));
      ring.classList.toggle('on-dark', Boolean(onDark));
    }, { passive: true });

    document.addEventListener('mousedown', function () { ring.classList.add('down'); });
    document.addEventListener('mouseup', function () { ring.classList.remove('down'); });

    // Leaving the window (or tabbing away) shouldn't strand the cursor.
    document.addEventListener('mouseleave', function () { document.body.classList.add('cursor-hide'); });
    document.addEventListener('mouseenter', function () { document.body.classList.remove('cursor-hide'); });
    window.addEventListener('blur', function () { document.body.classList.add('cursor-hide'); });

    render();
  }
})();