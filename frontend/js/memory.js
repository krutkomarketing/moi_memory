'use strict';

/* ═══════════════════════════════════════════════
   MEMORY PAGE — серверные фильтры + пагинация
   GET /api/profiles?q=&bornYearFrom=&bornYearTo=&mine=1&page=N&limit=9
   ═══════════════════════════════════════════════ */

(function () {
  const PER_PAGE = 9;
  const grid = document.getElementById('memory-grid');
  const pag  = document.getElementById('pagination');
  if (!grid || !pag) return;

  const STATE = {
    q: '', bornFrom: '', bornTo: '', diedFrom: '', diedTo: '',
    mine: true, page: 1, total: 0, rows: [], loading: false,
  };

  function $ (sel) { return document.querySelector(sel); }
  function esc (s) {
    return String(s ?? '').replace(/[&<>"']/g, m => (
      { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]
    ));
  }

  function readUrl () {
    const p = new URLSearchParams(location.search);
    STATE.q        = p.get('q') || '';
    STATE.bornFrom = p.get('bornYearFrom') || '';
    STATE.bornTo   = p.get('bornYearTo')   || '';
    STATE.diedFrom = p.get('diedYearFrom') || '';
    STATE.diedTo   = p.get('diedYearTo')   || '';
    STATE.gender     = p.get('gender')     || '';
    STATE.visibility = p.get('visibility') || '';
    STATE.mine     = p.has('mine') ? p.get('mine') === '1' : true;
    STATE.page     = Math.max(1, parseInt(p.get('page') || '1', 10));
  }
  function writeUrl () {
    const p = new URLSearchParams();
    if (STATE.q)        p.set('q', STATE.q);
    if (STATE.bornFrom) p.set('bornYearFrom', STATE.bornFrom);
    if (STATE.bornTo)   p.set('bornYearTo',   STATE.bornTo);
    if (STATE.diedFrom) p.set('diedYearFrom', STATE.diedFrom);
    if (STATE.diedTo)   p.set('diedYearTo',   STATE.diedTo);
    if (STATE.gender)     p.set('gender',     STATE.gender);
    if (STATE.visibility) p.set('visibility', STATE.visibility);
    p.set('mine', STATE.mine ? '1' : '0');
    if (STATE.page > 1) p.set('page', STATE.page);
    const qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  function injectFilters () {
    const section = document.querySelector('.memory-section__inner');
    if (!section) return;

    const isAuth = (typeof API !== 'undefined') && API.isLoggedIn && API.isLoggedIn();
    const wrap = document.createElement('div');
    wrap.className = 'memory-filters';
    wrap.innerHTML =
      '<div class="memory-filters__row">' +
        '<div class="memory-filters__search">' +
          '<span class="memory-filters__icon">⌕</span>' +
          '<input type="search" id="mf-q" class="memory-filters__input" ' +
                 'placeholder="Поиск по имени, городу, биографии…" autocomplete="off" value="' + esc(STATE.q) + '"/>' +
          '<button class="memory-filters__clear" id="mf-q-clear" aria-label="Очистить" style="display:' + (STATE.q ? 'flex' : 'none') + '">×</button>' +
        '</div>' +
        '<button class="memory-create-btn" id="memory-create-btn">+ Создать страницу</button>' +
      '</div>' +
      '<div class="memory-filters__row memory-filters__row--secondary">' +
        '<div class="memory-filters__group">' +
          '<label class="memory-filters__label">Годы жизни:</label>' +
          '<input type="number" id="mf-born-from" class="memory-filters__year" placeholder="от" min="1" max="2999" value="' + esc(STATE.bornFrom) + '"/>' +
          '<span class="memory-filters__dash">—</span>' +
          '<input type="number" id="mf-born-to" class="memory-filters__year" placeholder="до" min="1" max="2999" value="' + esc(STATE.bornTo) + '"/>' +
        '</div>' +
        '<div class="memory-filters__group">' +
          '<label class="memory-filters__label">Годы смерти:</label>' +
          '<input type="number" id="mf-died-from" class="memory-filters__year" placeholder="от" min="1" max="2999" value="' + esc(STATE.diedFrom) + '"/>' +
          '<span class="memory-filters__dash">—</span>' +
          '<input type="number" id="mf-died-to" class="memory-filters__year" placeholder="до" min="1" max="2999" value="' + esc(STATE.diedTo) + '"/>' +
        '</div>' +
        '<div class="memory-filters__group">' +
          '<label class="memory-filters__label">Пол:</label>' +
          '<select id="mf-gender" class="memory-filters__select">' +
            '<option value=""'        + (STATE.gender === ''        ? ' selected' : '') + '>любой</option>' +
            '<option value="MALE"'    + (STATE.gender === 'MALE'    ? ' selected' : '') + '>мужской</option>' +
            '<option value="FEMALE"'  + (STATE.gender === 'FEMALE'  ? ' selected' : '') + '>женский</option>' +
            '<option value="UNKNOWN"' + (STATE.gender === 'UNKNOWN' ? ' selected' : '') + '>не указан</option>' +
          '</select>' +
        '</div>' +
        (isAuth ?
          '<div class="memory-filters__group">' +
            '<label class="memory-filters__label">Видимость:</label>' +
            '<select id="mf-visibility" class="memory-filters__select">' +
              '<option value=""'         + (STATE.visibility === ''         ? ' selected' : '') + '>любая</option>' +
              '<option value="PUBLIC"'   + (STATE.visibility === 'PUBLIC'   ? ' selected' : '') + '>публичные</option>' +
              '<option value="UNLISTED"' + (STATE.visibility === 'UNLISTED' ? ' selected' : '') + '>по ссылке</option>' +
              '<option value="PRIVATE"'  + (STATE.visibility === 'PRIVATE'  ? ' selected' : '') + '>приватные</option>' +
              '<option value="PASSWORD"' + (STATE.visibility === 'PASSWORD' ? ' selected' : '') + '>с паролем</option>' +
            '</select>' +
          '</div>' : '') +
        (isAuth ?
          '<label class="memory-filters__checkbox">' +
            '<input type="checkbox" id="mf-mine"' + (STATE.mine ? ' checked' : '') + '/>' +
            '<span>Только мои</span>' +
          '</label>' : '') +
        '<button class="memory-filters__reset" id="mf-reset" type="button">Сбросить</button>' +
      '</div>';
    section.insertBefore(wrap, section.firstChild);

    const qInput   = $('#mf-q');
    const qClear   = $('#mf-q-clear');
    const bFrom    = $('#mf-born-from');
    const bTo      = $('#mf-born-to');
    const dFrom    = $('#mf-died-from');
    const dTo      = $('#mf-died-to');
    const genderEl = $('#mf-gender');
    const visEl    = $('#mf-visibility');
    const mineEl   = $('#mf-mine');
    const resetEl  = $('#mf-reset');
    const createBtn= $('#memory-create-btn');

    let debounce = null;
    function schedule () {
      clearTimeout(debounce);
      debounce = setTimeout(() => { STATE.page = 1; load(); }, 350);
    }

    qInput.addEventListener('input', () => {
      STATE.q = qInput.value.trim();
      qClear.style.display = STATE.q ? 'flex' : 'none';
      schedule();
    });
    qClear.addEventListener('click', () => {
      qInput.value = ''; STATE.q = '';
      qClear.style.display = 'none';
      qInput.focus(); STATE.page = 1; load();
    });
    bFrom.addEventListener('input', () => { STATE.bornFrom = bFrom.value.trim(); schedule(); });
    bTo.addEventListener('input',   () => { STATE.bornTo   = bTo.value.trim();   schedule(); });
    dFrom.addEventListener('input', () => { STATE.diedFrom = dFrom.value.trim(); schedule(); });
    dTo.addEventListener('input',   () => { STATE.diedTo   = dTo.value.trim();   schedule(); });
    genderEl.addEventListener('change', () => { STATE.gender = genderEl.value; STATE.page = 1; load(); });
    if (visEl) visEl.addEventListener('change', () => { STATE.visibility = visEl.value; STATE.page = 1; load(); });
    if (mineEl) mineEl.addEventListener('change', () => { STATE.mine = mineEl.checked; STATE.page = 1; load(); });
    resetEl.addEventListener('click', () => {
      STATE.q = STATE.bornFrom = STATE.bornTo = STATE.diedFrom = STATE.diedTo = '';
      STATE.gender = STATE.visibility = '';
      STATE.mine = true; STATE.page = 1;
      qInput.value = ''; qClear.style.display = 'none';
      bFrom.value = ''; bTo.value = '';
      dFrom.value = ''; dTo.value = '';
      genderEl.value = '';
      if (visEl) visEl.value = '';
      if (mineEl) mineEl.checked = true;
      load();
    });

    createBtn.addEventListener('click', async () => {
      createBtn.disabled = true;
      const originalText = createBtn.textContent;
      createBtn.textContent = '⏳ Создаю...';
      try {
        const r = await API.post('/api/profiles', { fullName: 'Новая страница' });
        const idOrSlug = r?.data?.slug || r?.data?.id || r?.slug || r?.id;
        if (idOrSlug) {
          window.location.href = 'person.html?id=' + encodeURIComponent(idOrSlug) + '&edit=1';
        } else {
          alert('Не удалось создать страницу');
          createBtn.disabled = false;
          createBtn.textContent = originalText;
        }
      } catch (e) {
        const msg = String(e?.message || '');
        if (msg.includes('401') || msg.toLowerCase().includes('auth')) {
          alert('Войдите в аккаунт, чтобы создать страницу.');
        } else {
          alert('Ошибка: ' + (msg || 'неизвестная'));
        }
        createBtn.disabled = false;
        createBtn.textContent = originalText;
      }
    });
  }

  function photoEl (p) {
    if (p.photo) return '<img src="' + API.resolveUrl(p.photo) + '" alt="' + esc(p.name) + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy" data-mem-avatar="1"/>';
    return '<div class="person-card__photo-inner">' + (typeof PERSON_SVG !== 'undefined' ? PERSON_SVG : '') + '</div>';
  }
  function buildCard (p) {
    const age = typeof calcAge === 'function' ? calcAge(p.born, p.died) : null;
    const href = '/p/' + encodeURIComponent(p.slug || p.id);
    const datesText = p.years || ((p.born || '') + ' — ' + (p.died || '...'));
    return '<a class="person-card" href="' + href + '">' +
      '<div class="person-card__photo">' + photoEl(p) + '</div>' +
      '<div class="person-card__body">' +
        '<h3 class="person-card__name">' + esc(p.name || 'Без имени') + '</h3>' +
        '<p class="person-card__dates">' + esc(datesText) +
          (age ? ' <span class="person-card__age">' + age + ' л.</span>' : '') +
        '</p>' +
        (p.city ? '<p class="person-card__city">' + esc(p.city) + '</p>' : '') +
      '</div>' +
    '</a>';
  }
  function showSkeleton () {
    grid.innerHTML = Array(PER_PAGE).fill(
      '<div class="person-card person-card--skeleton">' +
        '<div class="person-card__photo skel-block"></div>' +
        '<div class="person-card__body">' +
          '<div class="skel-line skel-line--lg"></div>' +
          '<div class="skel-line"></div>' +
          '<div class="skel-line skel-line--sm"></div>' +
        '</div>' +
      '</div>'
    ).join('');
  }
  function showEmpty (msg) {
    grid.innerHTML = '<div class="memory-empty"><span class="memory-empty__icon">✦</span><p class="memory-empty__text">' + esc(msg) + '</p></div>';
  }
  function renderRows () {
    grid.style.opacity = '0'; grid.style.transform = 'translateY(12px)';
    setTimeout(() => {
      grid.innerHTML = STATE.rows.length ? STATE.rows.map(buildCard).join('') : '';
      if (!STATE.rows.length) {
        const hasFilter = STATE.q || STATE.bornFrom || STATE.bornTo || STATE.mine;
        showEmpty(hasFilter ? 'Никого не нашли. Попробуйте изменить фильтры.' : 'Страниц памяти пока нет.');
      }
      grid.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      grid.style.opacity   = '1';
      grid.style.transform = 'translateY(0)';
    }, 100);
  }
  function renderPagination () {
    const totalPages = Math.max(1, Math.ceil(STATE.total / PER_PAGE));
    if (totalPages <= 1) { pag.innerHTML = ''; return; }
    const cur = STATE.page;
    let html = '<button class="pagination__btn" data-nav="prev"' + (cur===1?' disabled':'') + '>‹</button>';
    for (let i = 1; i <= totalPages; i++) {
      if (i===1 || i===totalPages || (i>=cur-1 && i<=cur+1))
        html += '<button class="pagination__btn ' + (i===cur?'pagination__btn--active':'') + '" data-page="' + i + '">' + i + '</button>';
      else if (i===cur-2 || i===cur+2)
        html += '<span class="pagination__dots">···</span>';
    }
    html += '<button class="pagination__btn" data-nav="next"' + (cur===totalPages?' disabled':'') + '>›</button>';
    pag.innerHTML = html;
    pag.querySelectorAll('[data-page]').forEach(btn => btn.addEventListener('click', () => goto(+btn.dataset.page)));
    pag.querySelector('[data-nav="prev"]')?.addEventListener('click', () => { if (STATE.page > 1) goto(STATE.page - 1); });
    pag.querySelector('[data-nav="next"]')?.addEventListener('click', () => { if (STATE.page < totalPages) goto(STATE.page + 1); });
  }
  function goto (page) { STATE.page = page; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  async function load () {
    if (STATE.loading) return;
    STATE.loading = true;
    showSkeleton();
    writeUrl();

    const qs = new URLSearchParams();
    qs.set('page',  String(STATE.page));
    qs.set('limit', String(PER_PAGE));
    if (STATE.q)        qs.set('q', STATE.q);
    if (STATE.bornFrom) qs.set('bornYearFrom', STATE.bornFrom);
    if (STATE.bornTo)   qs.set('bornYearTo',   STATE.bornTo);
    if (STATE.diedFrom) qs.set('diedYearFrom', STATE.diedFrom);
    if (STATE.diedTo)   qs.set('diedYearTo',   STATE.diedTo);
    if (STATE.gender)     qs.set('gender',     STATE.gender);
    if (STATE.visibility) qs.set('visibility', STATE.visibility);
    if (STATE.mine)     qs.set('mine', '1');

    try {
      const r = await API.get('/api/profiles?' + qs.toString());
      // listHandler: ok(res, { data: items, total, page, ... })  → spread в корень
      // ⇒ r.data это МАССИВ items, r.total отдельно
      const items = Array.isArray(r?.data) ? r.data
                  : (Array.isArray(r?.data?.items) ? r.data.items
                  : (Array.isArray(r?.items) ? r.items : []));
      const total = (typeof r?.total === 'number') ? r.total
                  : (typeof r?.data?.total === 'number') ? r.data.total
                  : items.length;
      STATE.rows  = items;
      STATE.total = total;
      renderRows();
      renderPagination();
    } catch (e) {
      console.error('[memory] load error:', e);
      showEmpty('Не удалось загрузить: ' + (e.message || 'ошибка сети'));
      pag.innerHTML = '';
    } finally {
      STATE.loading = false;
    }
  }

  readUrl();
  injectFilters();
  load();
})();

document.addEventListener('error', function (ev) {
  const t = ev.target;
  if (!t || !t.matches) return;
  if (!t.matches('img[data-mem-avatar]')) return;
  t.outerHTML = '<div class="memory-card__photo--empty"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:48px;height:48px;fill:currentColor;opacity:0.3"><circle cx="12" cy="7" r="4"/><path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8"/></svg></div>';
}, true);
