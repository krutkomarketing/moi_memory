/* ═══════════════════════════════════════════════
   Shared scroll-reveal + button ripple
   NAV SCROLL is handled exclusively by nav.js
   ═══════════════════════════════════════════════ */
(function () {
  const revealSelectors = [
    '.section-title',
    '.memory-grid',
    '.pagination',
    '.memory-hero__title',
    '.memory-hero__sub',
    '.tree-hero__title',
    '.tree-hero__sub',
    '.tree-legend',
    '.timeline-hero__title',
    '.timeline-hero__sub',
    '.person-header',
    '.person-bio',
    '.reviews-carousel',
    '.review-form',
    '.burial-section',
    '.pullquote',
  ];

  revealSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      el.classList.add(sel === '.memory-grid' ? 'fx-stagger' : 'fx-reveal');
    });
  });

  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.fx-reveal, .fx-stagger').forEach(el => io.observe(el));

  /* Button ripple */
  document.querySelectorAll('.btn, .review-form__submit').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty('--mx', ((e.clientX - r.left) / r.width  * 100) + '%');
      btn.style.setProperty('--my', ((e.clientY - r.top)  / r.height * 100) + '%');
    });
  });
})();
