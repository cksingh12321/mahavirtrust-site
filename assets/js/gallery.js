// Gallery filter + lightbox
(function () {
  'use strict';

  // ---- Filter chips ----
  const chips = document.querySelectorAll('.filter-chip');
  const items = document.querySelectorAll('.gallery-item[data-cat]');
  chips.forEach(c => {
    c.addEventListener('click', () => {
      const cat = c.dataset.filter;
      chips.forEach(x => x.classList.toggle('active', x === c));
      items.forEach(it => {
        const match = cat === 'all' || it.dataset.cat === cat;
        it.classList.toggle('hide', !match);
      });
    });
  });

  // ---- Lightbox ----
  const lb = document.querySelector('.lightbox');
  if (!lb) return;
  const lbImg = lb.querySelector('img');
  const lbCap = lb.querySelector('.lb-cap');
  const visibleItems = () =>
    [...document.querySelectorAll('.gallery-item[data-cat]:not(.hide)')];
  let currentIdx = -1;

  const open = (idx) => {
    const list = visibleItems();
    if (!list.length) return;
    currentIdx = (idx + list.length) % list.length;
    const it = list[currentIdx];
    const img = it.querySelector('img');
    const cap = it.querySelector('.cap');
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    lbCap.textContent = cap ? cap.textContent : img.alt;
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    currentIdx = -1;
  };

  document.querySelectorAll('.gallery-item').forEach((it) => {
    it.addEventListener('click', (e) => {
      const list = visibleItems();
      const idx = list.indexOf(it);
      if (idx >= 0) open(idx);
    });
  });

  lb.querySelector('.lb-close').addEventListener('click', close);
  lb.querySelector('.lb-prev').addEventListener('click', () => open(currentIdx - 1));
  lb.querySelector('.lb-next').addEventListener('click', () => open(currentIdx + 1));
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') open(currentIdx - 1);
    if (e.key === 'ArrowRight') open(currentIdx + 1);
  });
})();
