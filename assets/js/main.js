// Mahavir Singh Memorial Trust — site interactions
(function () {
  'use strict';

  // Mobile menu
  const toggle = document.querySelector('.menu-toggle');
  const header = document.querySelector('.site-header');
  if (toggle && header) {
    toggle.addEventListener('click', () => {
      header.classList.toggle('mobile-open');
      toggle.classList.toggle('open');
    });
    document.querySelectorAll('.nav a').forEach(a => {
      a.addEventListener('click', () => {
        header.classList.remove('mobile-open');
        toggle.classList.remove('open');
      });
    });
  }

  // Header shadow on scroll
  const onScroll = () => {
    if (window.scrollY > 8) header && header.classList.add('scrolled');
    else header && header.classList.remove('scrolled');

    const bar = document.querySelector('.donate-bar');
    if (bar) {
      if (window.scrollY > 400) bar.classList.add('show');
      else bar.classList.remove('show');
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Scroll reveal
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  }

  // Counter animation
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const animateCount = (el) => {
    const target = parseFloat(el.dataset.count || '0');
    const dur = 1400;
    const start = performance.now();
    const decimals = (el.dataset.decimals && parseInt(el.dataset.decimals, 10)) || 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const v = target * easeOut(t);
      el.textContent = v.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if ('IntersectionObserver' in window) {
    const co = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          animateCount(e.target);
          co.unobserve(e.target);
        }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-count]').forEach(el => co.observe(el));
  }

  // Donation amount toggle (sample, non-functional)
  document.querySelectorAll('.amount-row').forEach(row => {
    row.addEventListener('click', (e) => {
      const btn = e.target.closest('.amount');
      if (!btn) return;
      row.querySelectorAll('.amount').forEach(a => a.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Year in footer
  document.querySelectorAll('[data-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });

  // ============================================================
  // ---- Form submission via Web3Forms (https://web3forms.com) ----
  // ============================================================
  //
  // HOW TO ACTIVATE:
  // 1. Go to https://web3forms.com/  (30-second signup, free for
  //    250 submissions/month, no credit card)
  // 2. Enter email: msmtrustbishnupur@gmail.com
  //    Click "Create your Access Key"
  // 3. Confirm via the email Web3Forms sends you
  // 4. Copy the access key shown on screen
  // 5. Paste it between the quotes on the WEB3FORMS_ACCESS_KEY line
  //    below
  // 6. git commit + git push  →  Vercel auto-deploys in ~30 seconds
  //    →  forms start working
  //
  // Until the key is filled in, forms fall back to a mailto: link
  // (which works for users who have a default mail client).
  //
  const WEB3FORMS_ACCESS_KEY = ''; // ← paste your Web3Forms key here
  const TRUST_EMAIL = 'msmtrustbishnupur@gmail.com';

  const labelFor = (name) => name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  const showSuccess = (form, message) => {
    const success = form.querySelector('.form-success');
    const fields = form.querySelector('.form-fields');
    if (success) {
      success.hidden = false;
      if (fields) fields.hidden = true;
    } else {
      alert(message || 'Thank you — your message has been sent.');
    }
  };

  const fallbackMailto = (form, to, subject) => {
    const lines = [];
    new FormData(form).forEach((v, k) => {
      if (k.startsWith('_')) return;
      const sv = String(v).trim();
      if (sv) lines.push(`${labelFor(k)}: ${sv}`);
    });
    lines.push('', '— from the mahavirtrust.org website —');
    const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
    window.location.href = url;
  };

  document.querySelectorAll('form[data-mailto]').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const to = form.dataset.mailto || TRUST_EMAIL;
      const subject = form.dataset.mailtoSubject || 'Message from mahavirtrust.org';

      const submitBtn = form.querySelector('button[type="submit"], button:not([type])');
      const originalLabel = submitBtn?.innerHTML;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Sending…';
      }

      // If no Web3Forms key is configured yet, skip the API and use mailto.
      if (!WEB3FORMS_ACCESS_KEY) {
        console.info('No WEB3FORMS_ACCESS_KEY set — using mailto fallback. See main.js for setup instructions.');
        fallbackMailto(form, to, subject);
        showSuccess(form);
        return;
      }

      const data = new FormData(form);
      data.set('access_key', WEB3FORMS_ACCESS_KEY);
      data.set('subject', subject);
      data.set('from_name', 'Mahavir Trust Website');
      // Use the donor's email (if they provided one) as reply-to so you can
      // reply directly from your inbox.
      const donorEmail = data.get('email');
      if (donorEmail) data.set('replyto', donorEmail);
      data.set('_source', 'mahavirtrust.org');

      try {
        const res = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          body: data,
          headers: { 'Accept': 'application/json' }
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
          throw new Error(json.message || ('HTTP ' + res.status));
        }
        showSuccess(form);
      } catch (err) {
        console.warn('Web3Forms failed, falling back to mailto:', err);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalLabel;
        }
        fallbackMailto(form, to, subject);
        showSuccess(form);
      }
    });
  });
})();
