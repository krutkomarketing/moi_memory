/* ═══════════════════════════════════════════════
   NAV — burger menu + page fade transitions
   + scroll-to-top button + progress bar
   ═══════════════════════════════════════════════ */
(function () {

  /* ── FIX: body starts invisible, reveal immediately ──
     CSS sets body { opacity:0 } so page doesn't flash.
     We add .page-loaded as early as possible. */
  document.documentElement.classList.add('js');
  // Use requestAnimationFrame so first paint is after styles applied
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.add('page-loaded');
    });
  });

  /* ── PROGRESS BAR ── */
  const bar = document.createElement('div');
  bar.id = 'page-progress';
  document.body.appendChild(bar);

  // Fake load progress on DOMContentLoaded → complete
  let prog = 0;
  const tick = setInterval(() => {
    prog = Math.min(prog + Math.random() * 18, 85);
    bar.style.width = prog + '%';
  }, 120);
  window.addEventListener('load', () => {
    clearInterval(tick);
    bar.style.width = '100%';
    setTimeout(() => { bar.style.opacity = '0'; }, 400);
  });

  /* ── BURGER MENU ── */
  const navInner = document.querySelector('.nav__inner');
  if (navInner) {
    const burger = document.createElement('button');
    burger.className = 'nav__burger';
    burger.setAttribute('aria-label', 'Меню');
    burger.setAttribute('aria-expanded', 'false');
    burger.innerHTML = `<span></span><span></span><span></span>`;
    navInner.appendChild(burger);

    const links = document.querySelector('.nav__links');
    burger.addEventListener('click', () => {
      const open = links.classList.toggle('nav__links--open');
      burger.classList.toggle('nav__burger--open', open);
      burger.setAttribute('aria-expanded', String(open));
    });

    links?.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        links.classList.remove('nav__links--open');
        burger.classList.remove('nav__burger--open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('click', e => {
      if (!navInner.contains(e.target)) {
        links?.classList.remove('nav__links--open');
        burger.classList.remove('nav__burger--open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });

    /* Nav scroll darkening — single listener, nav.js is the authority */
    const navEl = navInner.closest('.nav');
    const onScroll = () => navEl?.classList.toggle('is-scrolled', window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ── PAGE FADE TRANSITIONS ── */
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (
      !href ||
      href.startsWith('#') ||
      href.startsWith('http') ||
      href.startsWith('//') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:') ||
      a.target === '_blank' ||
      a.hasAttribute('download')
    ) return;

    a.addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      document.body.classList.remove('page-loaded');
      document.body.classList.add('page-leaving');
      setTimeout(() => { window.location.href = href; }, 260);
    });
  });

  /* ── SCROLL TO TOP ── */
  const scrollBtn = document.createElement('button');
  scrollBtn.id = 'scroll-top';
  scrollBtn.setAttribute('aria-label', 'Наверх');
  scrollBtn.innerHTML = '↑';
  document.body.appendChild(scrollBtn);

  const onScrollTop = () => {
    scrollBtn.classList.toggle('scroll-top--visible', window.scrollY > 400);
  };
  window.addEventListener('scroll', onScrollTop, { passive: true });
  scrollBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

})();
