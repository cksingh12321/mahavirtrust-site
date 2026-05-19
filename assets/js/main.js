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
})();
