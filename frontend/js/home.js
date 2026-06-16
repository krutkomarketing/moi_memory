/* ═══════════════════════════════════════════════
   HOME PAGE — Stats, Candle, Featured person,
   Last added. Uses PERSON_SVG + calcAge from data.js
   ═══════════════════════════════════════════════ */

(function () {
  /* ── PARALLAX POLYGONS ── */
  document.addEventListener('mousemove', (e) => {
    const polygons = document.querySelectorAll('.hero__polygon');
    if (!polygons.length) return;
    const x = (e.clientX - window.innerWidth / 2);
    const y = (e.clientY - window.innerHeight / 2);
    
    polygons.forEach(poly => {
      const speed = parseFloat(poly.dataset.parallax) || 0;
      // We apply a custom variable to let CSS animations continue working smoothly if we combine them
      // But for now, setting translate directly. To preserve CSS animations, we can use margin or left/top.
      // Better yet, we can set CSS custom properties and use them in CSS animations!
      poly.style.marginLeft = `${x * speed}px`;
      poly.style.marginTop = `${y * speed}px`;
    });
  });

  /* ── STATS ── */
  function getPlural(number, one, two, five) {
    let n = Math.abs(number);
    n %= 100;
    if (n >= 5 && n <= 20) return five;
    n %= 10;
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return two;
    return five;
  }

  const plurals = {
    'people': ['страница памяти', 'страницы памяти', 'страниц памяти'],
    'generations': ['поколение', 'поколения', 'поколений'],
    'cities': ['город', 'города', 'городов'],
    'reviews': ['воспоминание', 'воспоминания', 'воспоминаний']
  };

  function initCounters() {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const el = en.target;
        const target = parseInt(el.dataset.count, 10) || 0;
        const labelEl = el.closest('.stat')?.querySelector('.stat__label');
        const dur = 1400, start = performance.now();
        const tick = now => {
          const p = Math.min((now - start) / dur, 1);
          const currentCount = Math.round(target * (1 - Math.pow(1 - p, 3)));
          el.textContent = currentCount;
          if (labelEl && plurals[el.dataset.stat]) {
            const [one, two, five] = plurals[el.dataset.stat];
            labelEl.textContent = getPlural(currentCount, one, two, five);
          }
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        io.unobserve(el);
      });
    }, { threshold: 0.4 });
    document.querySelectorAll('.stat__num').forEach(n => io.observe(n));
  }

  if (typeof API !== 'undefined') {
    API.get('/api/stats').then(res => {
      if (!res?.data) return;
      const isEmpty = !res.data.people || res.data.people === 0;
      const map = {
        'people': isEmpty ? 74 : res.data.people,
        'reviews': isEmpty ? 86 : res.data.reviews,
        'cities': isEmpty ? 23 : res.data.cities,
        'generations': isEmpty ? 18 : res.data.generations,
      };
      for (const [key, val] of Object.entries(map)) {
        if (val != null) document.querySelectorAll(`.stat__num[data-stat="${key}"]`).forEach(el => el.dataset.count = val);
      }
    }).catch(() => {
      /* fallback from data.js/predefined defaults */
      document.querySelectorAll('.stat__num[data-stat="people"]').forEach(el => el.dataset.count = 74);
      document.querySelectorAll('.stat__num[data-stat="cities"]').forEach(el => el.dataset.count = 23);
      document.querySelectorAll('.stat__num[data-stat="generations"]').forEach(el => el.dataset.count = 18);
      document.querySelectorAll('.stat__num[data-stat="reviews"]').forEach(el => el.dataset.count = 86);
    }).finally(initCounters);
  } else {
    document.querySelectorAll('.stat__num[data-stat="people"]').forEach(el => el.dataset.count = 74);
    document.querySelectorAll('.stat__num[data-stat="cities"]').forEach(el => el.dataset.count = 23);
    document.querySelectorAll('.stat__num[data-stat="generations"]').forEach(el => el.dataset.count = 18);
    document.querySelectorAll('.stat__num[data-stat="reviews"]').forEach(el => el.dataset.count = 86);
    initCounters();
  }

  /* ── CANDLE ── */
  const candle  = document.getElementById('candle');
  const countEl = document.getElementById('candle-count');
  const scene   = candle?.closest('.candle-scene');
  const STORE   = 'candle_count';
  const LIT_BY_ME = 'candle_lit_by_me';

  if (countEl) {
    (typeof API !== 'undefined'
      ? API.get('/api/candles').then(r => { if (r?.count != null) countEl.textContent = r.count; })
      : Promise.reject()
    ).catch(() => { countEl.textContent = localStorage.getItem(STORE) || '237'; });
  }

  if (candle && countEl) {
    const isLitByMe = localStorage.getItem(LIT_BY_ME) === 'true';
    if (isLitByMe) {
      candle.classList.add('is-lit');
      scene?.classList.add('is-lit');
    } else {
      candle.classList.remove('is-lit');
      scene?.classList.remove('is-lit');
    }

    let busy = false;
    async function toggleCandle() {
      if (busy) return; busy = true;
      if (candle.classList.contains('is-lit')) {
        // Потушить свечу
        candle.classList.add('is-blowing');
        scene?.classList.remove('is-lit');
        localStorage.setItem(LIT_BY_ME, 'false');
        setTimeout(() => { candle.classList.remove('is-lit', 'is-blowing'); busy = false; }, 700);
      } else {
        // Зажечь свечу
        candle.classList.add('is-lit');
        scene?.classList.add('is-lit');
        localStorage.setItem(LIT_BY_ME, 'true');
        try {
          const r = await API.post('/api/candles/light');
          if (r?.count != null) {
            countEl.textContent = r.count;
            localStorage.setItem(STORE, r.count);
          }
        } catch (err) {
          console.warn('[candle] Failed to save on server, falling back to local counter:', err);
          const c = parseInt(countEl.textContent || '237') + 1;
          countEl.textContent = c;
          localStorage.setItem(STORE, c);
        }
        countEl.classList.remove('is-bumped');
        void countEl.offsetWidth;
        countEl.classList.add('is-bumped');
        busy = false;
      }
    }

    candle.addEventListener('click', toggleCandle);
    candle.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCandle(); }
    });
  }

  /* ── FEATURED PERSON — race-condition-free ── */
  const featuredSection = document.getElementById('featured-person');
  const lastGrid = document.getElementById('last-added-grid');

  if (!API.isLoggedIn()) {
    // Render promo inside featuredSection
    if (featuredSection) {
      featuredSection.innerHTML = `
        <div class="featured-person__inner" style="display: flex; flex-direction: column; align-items: center; text-align: center;">
          <p class="hero__eyebrow">Личный Кабинет</p>
          <div class="featured-person__card" style="width: 100%; max-width: 420px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2.2rem 1.8rem; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; backdrop-filter: blur(15px); box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);">
            <div style="font-size: 1.6rem; color: #c8a84b; margin-bottom: 0.75rem; text-shadow: 0 0 15px rgba(200, 168, 75, 0.3);">✦</div>
            <h2 class="featured-person__name" style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem; color: #fff;">Создайте Свою Семейную Летопись</h2>
            <p style="font-size: 0.88rem; color: rgba(255, 255, 255, 0.7); max-width: 100%; line-height: 1.6; margin-bottom: 1.8rem;">
              Сохраните историю вашего рода, стройте семейные древа и создавайте страницы памяти. Ваши данные полностью конфиденциальны.
            </p>
            <div style="display: flex; gap: 14px; width: 100%; justify-content: center;">
              <button onclick="window.openAuthModal('register')" class="btn btn--primary" style="padding: 12px 26px; font-size: 0.9rem; font-weight: 600; border-radius: 8px; border: none; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 0 20px rgba(200, 168, 75, 0.35);">Создать аккаунт</button>
              <button onclick="window.openAuthModal('login')" class="btn btn--secondary" style="padding: 12px 26px; font-size: 0.9rem; font-weight: 500; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.15); color: #fff; border-radius: 8px; cursor: pointer; transition: all 0.3s ease;">Войти</button>
            </div>
          </div>
        </div>
      `;
    }
  } else {
    // If logged in, load and render standard content
    if (featuredSection) {
      let rendered = false;

      function renderFeatured(people) {
        if (rendered) return;
        rendered = true;
        const withReviews = people.filter(p => Array.isArray(p.reviews) && p.reviews.length);
        const pool = withReviews.length ? withReviews : people;
        const p = pool[Math.floor(Math.random() * pool.length)];
        if (!p) return;
        const review = p.reviews?.[0];
        const age = typeof calcAge === 'function' ? calcAge(p.born, p.died) : null;
        featuredSection.innerHTML = `
          <div class="featured-person__inner">
            <p class="hero__eyebrow">Одна из историй</p>
            <div class="featured-person__card">
              <div class="featured-person__photo">
                ${p.photo ? `<img src="${API.resolveUrl(p.photo)}" alt="${p.name}" data-h-fb="featured-person"/>`
                          : `<div class="featured-person__avatar">${PERSON_SVG}</div>`}
              </div>
              <div class="featured-person__content">
                <h2 class="featured-person__name">${p.name}</h2>
                <p class="featured-person__meta">${p.born} — ${p.died || '...'}${age ? ` · ${age} лет` : ''} · ${p.city}</p>
                ${p.bio ? `<p class="featured-person__bio">${p.bio.slice(0, 160)}…</p>` : ''}
                ${review ? `<blockquote class="featured-person__quote"><p>"${review.text}"</p><cite>${review.author}</cite></blockquote>` : ''}
                <a href="/p/${encodeURIComponent(p.slug || p.id)}" class="featured-person__link">Читать историю →</a>
              </div>
            </div>
          </div>`;
      }

      /* Try API first — merge bot profiles */
      if (typeof API !== 'undefined') {
        Promise.all([
          API.get('/api/profiles').catch(() => ({ data: [] })),
          API.get('/api/people?page=1&limit=100').catch(() => ({ data: [] })),
        ]).then(([profilesRes, peopleRes]) => {
          const botProfiles = profilesRes?.data || [];
          const people = peopleRes?.data || [];
          const merged = botProfiles.length ? [...botProfiles, ...people] : people;
          if (merged.length) renderFeatured(merged);
        }).catch(() => {});
      }
      /* Fallback after 700ms if API didn't render */
      setTimeout(() => {
        if (!rendered && typeof PEOPLE !== 'undefined' && PEOPLE.length) renderFeatured(PEOPLE);
      }, 700);
    }
  }

  // Render lastAdded always (outside of login checks)
  if (lastGrid) {
    function renderLastAdded(people) {
      lastGrid.innerHTML = people.map(p => `
        <a class="person-card" href="/p/${encodeURIComponent(p.slug || p.id)}">
          <div class="person-card__photo">
            ${p.photo
              ? `<img src="${API.resolveUrl(p.photo)}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" data-h-fb="person-card"/>`
              : `<div class="person-card__photo-inner">${PERSON_SVG}</div>`}
          </div>
          <div class="person-card__body">
            <h3 class="person-card__name">${p.name}</h3>
            <p class="person-card__dates">${p.born} — ${p.died || '...'}</p>
            <p class="person-card__city">${p.city}</p>
          </div>
        </a>`).join('');
    }

    let apiOk = false;
    if (typeof API !== 'undefined') {
      API.get('/api/profiles?ownerRole=ADMIN&hasPhoto=true&visibility=PUBLIC&sortBy=createdAt&limit=3')
        .then(profilesRes => {
          const profiles = profilesRes?.data || [];
          if (profiles.length) {
            renderLastAdded(profiles);
            apiOk = true;
          }
        })
        .catch(() => {});
    }
    setTimeout(() => {
      if (!apiOk && typeof PEOPLE !== 'undefined' && PEOPLE.length) {
        renderLastAdded(PEOPLE.slice(-3).reverse());
      }
    }, 800);
  }

  /* ── SCROLL REVEALS (home page only) ── */
  const revealSelectors = [
    '.featured-person__card', '.stats__inner', '.candle-scene',
    '.candle-section__sub', '.last-added__grid', '.pullquote',
  ];
  revealSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      el.classList.add(sel.includes('grid') || sel.includes('stats') ? 'fx-stagger' : 'fx-reveal');
    });
  });

  const revIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('is-visible'); revIO.unobserve(en.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.fx-reveal, .fx-stagger').forEach(el => revIO.observe(el));

  /* Button ripple */
  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty('--mx', ((e.clientX - r.left) / r.width  * 100) + '%');
      btn.style.setProperty('--my', ((e.clientY - r.top)  / r.height * 100) + '%');
    });
  });

  /* ── VIDEO HOVER / INTERSECTION PLAY ── */
  const isDesktop = window.matchMedia('(hover: hover)').matches;

  const videoIo = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!isDesktop) {
        if (e.isIntersecting) {
          e.target.dataset.isIntersecting = 'true';
          e.target.play().catch(() => {});
        } else {
          e.target.dataset.isIntersecting = 'false';
          e.target.pause();
        }
      }
    });
  }, { threshold: 0.25 });

  document.querySelectorAll('video.bg').forEach(video => {
    video.loop = false;
    video.removeAttribute('loop');

    if (isDesktop) {
      video.removeAttribute('autoplay');
      video.pause();

      // Триггер — весь блок (текст + превью), а не только само видео.
      const hoverTarget = video.closest('.showcase__item') || video;
      hoverTarget.addEventListener('mouseenter', () => {
        if (video.ended) video.currentTime = 0; // доиграл → запуск с начала
        if (video.paused) video.play().catch(() => {});
        // если уже играет — ничего не делаем (без рывков при движении курсора)
      });
      // Намеренно НЕ ставим на паузу при mouseleave: ролик доигрывает
      // до конца и замирает на последнем кадре; повторное наведение
      // на блок запускает его заново (в рамках сессии — сколько угодно раз).
    } else {
      videoIo.observe(video);

      const unlock = () => {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            if (video.dataset.isIntersecting !== 'true') {
              video.pause();
            }
          }).catch(() => {});
        }
        document.removeEventListener('touchstart', unlock);
        document.removeEventListener('click', unlock);
      };
      document.addEventListener('touchstart', unlock, { passive: true });
      document.addEventListener('click', unlock, { passive: true });
    }
   });
})();

/* ═══════════════════════════════════════════════
   Image error fallback delegation (заменяет inline onerror)
   ═══════════════════════════════════════════════ */
(function () {
  function getSvg () {
    try { if (typeof PERSON_SVG !== 'undefined') return PERSON_SVG; } catch (e) {}
    return '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:48px;height:48px;fill:currentColor;opacity:0.3"><circle cx="12" cy="7" r="4"/><path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8"/></svg>';
  }
  document.addEventListener('error', function (ev) {
    const t = ev.target;
    if (!t || !t.matches) return;
    if (!t.matches('img[data-h-fb]')) return;
    const kind = t.getAttribute('data-h-fb');
    const svg = getSvg();
    if (kind === 'tree-node')            { t.outerHTML = '<div class="tree-node__avatar">' + svg + '</div>'; }
    else if (kind === 'person-card')     { t.outerHTML = '<div class="person-card__photo-inner">' + svg + '</div>'; }
    else if (kind === 'person-header')   { t.outerHTML = '<div class="person-header__photo-inner">' + svg + '</div>'; }
    else if (kind === 'featured-person') { t.outerHTML = '<div class="featured-person__avatar">' + svg + '</div>'; }
    else if (kind === 'emoji-32')        { t.outerHTML = '<span style="font-size:32px;">👤</span>'; }
    else if (kind === 'hide-show-next')  { t.style.display = 'none'; const n = t.nextElementSibling; if (n) n.style.display = 'inline'; }
    else                                 { t.outerHTML = '<div>' + svg + '</div>'; }
  }, true);
})();
