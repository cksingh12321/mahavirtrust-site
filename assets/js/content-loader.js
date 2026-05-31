// content-loader.js
// Fetches CMS-managed entries (from /content/*.json) and renders them
// as cards, prepended to the existing static grid on news.html /
// blog.html / press.html. The seeded static cards in the HTML stay
// as a baseline — CMS entries are additive, never destructive.
//
// Each page wires itself by setting window.CMS_CONFIG before this
// script runs (see the inline <script> at the bottom of news.html etc).

(function () {
  'use strict';

  const cfg = window.CMS_CONFIG;
  if (!cfg || !cfg.source || !cfg.gridSelector) return;

  // -----------------------------------------------------------------
  // tiny HTML-safe helpers
  // -----------------------------------------------------------------
  const esc = (s) =>
    String(s == null ? '' : s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  // Format date as "DD Mon YYYY" (e.g. "23 Mar 2025")
  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Render Markdown -> very basic HTML (paragraphs + bold + italic + links).
  // Decap CMS markdown widget may produce richer markdown; this covers
  // the common cases. For anything more, the body still renders readably.
  const md = (s) => {
    if (!s) return '';
    let html = esc(s);
    // **bold**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // *italic*
    html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    // [link](url)
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" style="text-decoration: underline;">$1</a>'
    );
    // paragraphs from double newlines
    return html
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
  };

  // -----------------------------------------------------------------
  // renderers per collection type
  // -----------------------------------------------------------------
  const renderers = {
    news: (e) => {
      const cat = (e.category || 'event').toLowerCase();
      const catLabels = { event: 'Event', milestone: 'Milestone', story: 'Story' };
      const body = e.body
        ? `<details><summary class="news-readmore">Read more <span class="arrow">→</span></summary><div class="news-full">${md(e.body)}</div></details>`
        : '';
      const photo = e.image
        ? `<img src="${esc(e.image)}" alt="${esc(e.title)}" onerror="this.style.display='none'">`
        : '';
      return `
        <article class="news-card" lang="${esc(e.lang || 'en')}">
          <div class="news-photo">
            <span class="ph-fallback">${esc(e.title)}</span>
            ${photo}
          </div>
          <div class="news-body">
            <div class="news-meta">
              <span class="cat ${esc(cat)}">${esc(catLabels[cat] || cat)}</span>
              <span>${esc(fmtDate(e.date))}</span>
            </div>
            <h3 class="news-title">${esc(e.title)}</h3>
            <p class="news-excerpt">${esc(e.excerpt)}</p>
            ${body}
          </div>
        </article>`;
    },

    blog: (e) => {
      const cat = (e.category || 'essay').toLowerCase();
      const catLabels = { essay: 'Essay', 'field-note': 'Field note', story: 'Story' };
      const body = e.body
        ? `<details><summary class="news-readmore">Read full essay <span class="arrow">→</span></summary><div class="news-full">${md(e.body)}</div></details>`
        : '';
      const photo = e.image
        ? `<img src="${esc(e.image)}" alt="${esc(e.title)}" onerror="this.style.display='none'">`
        : '';
      return `
        <article class="news-card" lang="${esc(e.lang || 'en')}">
          <div class="news-photo">
            <span class="ph-fallback">${esc(e.title)}</span>
            ${photo}
          </div>
          <div class="news-body">
            <div class="news-meta">
              <span class="cat story">${esc(catLabels[cat] || cat)}</span>
              ${e.author ? `<span>By ${esc(e.author)}</span>` : ''}
              <span>·</span>
              <span>${esc(fmtDate(e.date))}</span>
            </div>
            <h3 class="news-title">${esc(e.title)}</h3>
            <p class="news-excerpt">${esc(e.excerpt)}</p>
            ${body}
          </div>
        </article>`;
    },

    press: (e) => {
      const photo = e.image
        ? `<img src="${esc(e.image)}" alt="${esc(e.title)}" onerror="this.style.display='none'">`
        : '';
      const link = e.url
        ? `<a href="${esc(e.url)}" class="press-link" target="_blank" rel="noopener">Read full article <span class="arrow">→</span></a>`
        : '';
      return `
        <article class="press-card" lang="${esc(e.lang || 'en')}">
          <div class="press-clipping">
            <span class="ph-fallback">${esc(e.publication)}<br>${esc(fmtDate(e.date))}</span>
            ${photo}
          </div>
          <div class="press-body">
            <div class="press-meta">
              <span>${esc(e.publication)}</span>
              <span class="pub-dot"></span>
              <span>${esc(fmtDate(e.date))}</span>
            </div>
            <h3 class="press-title">${esc(e.title)}</h3>
            <p class="press-excerpt">${esc(e.excerpt)}</p>
            ${link}
          </div>
        </article>`;
    },
  };

  // -----------------------------------------------------------------
  // fetch JSON, render entries, prepend to the grid
  // -----------------------------------------------------------------
  fetch(cfg.source, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { entries: [] }))
    .then((data) => {
      const entries = (data && data.entries) || [];
      if (!entries.length) return;

      // Sort newest-first by `date`
      entries.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

      const renderer = renderers[cfg.type];
      if (!renderer) return;

      const grid = document.querySelector(cfg.gridSelector);
      if (!grid) return;

      const html = entries.map(renderer).join('\n');
      // Prepend so newest CMS entries appear first
      grid.insertAdjacentHTML('afterbegin', html);
    })
    .catch((err) => {
      // Silent failure — the static seeded cards still render
      console.warn('[content-loader] could not load', cfg.source, err);
    });
})();
