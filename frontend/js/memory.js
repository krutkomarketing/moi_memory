/* ═══════════════════════════════════════════════
   MEMORY PAGE — поиск + API с fallback на data.js
   Uses PERSON_SVG + calcAge from data.js
   ═══════════════════════════════════════════════ */

(function () {
  const PER_PAGE = 9;
  let currentPage = 1;
  let totalPages  = 1;
  let allPeople   = [];
  let filtered    = [];
  let searchQuery = '';

  const grid = document.getElementById('memory-grid');
  const pag  = document.getElementById('pagination');
  if (!grid || !pag) return;

  /* ── INJECT SEARCH BAR ── */
  const section = document.querySelector('.memory-section__inner');
  if (section) {
    const searchWrap = document.createElement('div');
    searchWrap.className = 'memory-search';
    searchWrap.innerHTML = `
      <div class="memory-search__inner">
        <span class="memory-search__icon">⌕</span>
        <input type="search" id="memory-search-input" class="memory-search__input"
               placeholder="Поиск по имени или городу…" autocomplete="off"/>
        <button class="memory-search__clear" id="memory-search-clear" aria-label="Очистить" style="display:none">×</button>
      </div>
      <button class="memory-create-btn" id="memory-create-btn">+ Создать страницу</button>`;
    section.insertBefore(searchWrap, section.firstChild);

    const input    = document.getElementById('memory-search-input');
    const clearBtn = document.getElementById('memory-search-clear');

    input.addEventListener('input', () => {
      searchQuery = input.value.trim().toLowerCase();
      clearBtn.style.display = searchQuery ? 'flex' : 'none';
      applyFilter();
    });
    clearBtn.addEventListener('click', () => {
      input.value = ''; searchQuery = '';
      clearBtn.style.display = 'none';
      input.focus(); applyFilter();
    });

    // Кнопка "Создать страницу" — создаёт пустой профиль и открывает редактор
    document.getElementById('memory-create-btn').addEventListener('click', async () => {
      const btn = document.getElementById('memory-create-btn');
      btn.disabled = true;
      btn.textContent = '⏳ Создаю...';

      try {
        const base = window.location.port === '3000' ? '' : 'http://localhost:3000';
        const res = await fetch(`${base}/api/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: '',
            dates: '',
            main_text: '',
          }),
        });
        const json = await res.json();

        if (json.ok && json.data?.id) {
          window.location.href = `person.html?id=${json.data.id}&edit=1`;
        } else {
          alert('Ошибка: ' + (json.error || 'Не удалось создать'));
          btn.disabled = false;
          btn.textContent = '+ Создать страницу';
        }
      } catch (err) {
        alert('Сервер недоступен: ' + err.message);
        btn.disabled = false;
        btn.textContent = '+ Создать страницу';
      }
    });
  }

  function applyFilter() {
    filtered = searchQuery
      ? allPeople.filter(p =>
          p.name.toLowerCase().includes(searchQuery) ||
          (p.city || '').toLowerCase().includes(searchQuery))
      : [...allPeople];
    renderSlice(1);  /* always reset to page 1 on filter change */
  }

  function photoEl(p) {
    if (p.photo) return `<img src="${API.resolveUrl(p.photo)}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.outerHTML='<div class=\'person-card__photo-inner\'>' + PERSON_SVG + '</div>'"/>`;
    return `<div class="person-card__photo-inner">${PERSON_SVG}</div>`;
  }

  function buildCard(p) {
    const age = typeof calcAge === 'function' ? calcAge(p.born, p.died) : null;
    return `
      <a class="person-card" href="person.html?id=${encodeURIComponent(p.id)}">
        <div class="person-card__photo">${photoEl(p)}</div>
        <div class="person-card__body">
          <h3 class="person-card__name">${p.name}</h3>
          <p class="person-card__dates">${p.born} — ${p.died || '...'}${age ? ` <span class="person-card__age">${age} л.</span>` : ''}</p>
          ${p.city ? `<p class="person-card__city">${p.city}</p>` : ''}
        </div>
      </a>`;
  }

  function showSkeleton() {
    grid.innerHTML = Array(PER_PAGE).fill(`
      <div class="person-card person-card--skeleton">
        <div class="person-card__photo skel-block"></div>
        <div class="person-card__body">
          <div class="skel-line skel-line--lg"></div>
          <div class="skel-line"></div>
          <div class="skel-line skel-line--sm"></div>
        </div>
      </div>`).join('');
  }

  function showEmpty(msg) {
    grid.innerHTML = `
      <div class="memory-empty">
        <span class="memory-empty__icon">✦</span>
        <p class="memory-empty__text">${msg}</p>
      </div>`;
  }

  function renderSlice(page) {
    currentPage = page;
    totalPages  = Math.ceil(filtered.length / PER_PAGE);
    const slice = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    grid.style.opacity = '0'; grid.style.transform = 'translateY(12px)';
    setTimeout(() => {
      grid.innerHTML = slice.length ? slice.map(buildCard).join('') : '';
      if (!slice.length) showEmpty(searchQuery ? `Никого не нашли по запросу «${searchQuery}»` : 'Страниц памяти пока нет.');
      grid.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      grid.style.opacity    = '1';
      grid.style.transform  = 'translateY(0)';
    }, 150);

    renderPagination();
    /* Only scroll when user explicitly changes page, not on filter */
    if (page > 1) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderPagination() {
    if (totalPages <= 1) { pag.innerHTML = ''; return; }
    let html = `<button class="pagination__btn" id="pag-prev" ${currentPage===1?'disabled':''}>‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i===1 || i===totalPages || (i>=currentPage-1 && i<=currentPage+1))
        html += `<button class="pagination__btn ${i===currentPage?'pagination__btn--active':''}" data-page="${i}">${i}</button>`;
      else if (i===currentPage-2 || i===currentPage+2)
        html += `<span class="pagination__dots">···</span>`;
    }
    html += `<button class="pagination__btn" id="pag-next" ${currentPage===totalPages?'disabled':''}>›</button>`;
    pag.innerHTML = html;
    pag.querySelectorAll('[data-page]').forEach(btn => btn.addEventListener('click', () => renderSlice(+btn.dataset.page)));
    pag.querySelector('#pag-prev')?.addEventListener('click', () => { if (currentPage>1) renderSlice(currentPage-1); });
    pag.querySelector('#pag-next')?.addEventListener('click', () => { if (currentPage<totalPages) renderSlice(currentPage+1); });
  }

  async function init() {
    showSkeleton();

    let people = [];
    let botProfiles = [];

    // Загружаем профили из бот-БД
    try {
      if (typeof API !== 'undefined') {
        const profilesRes = await API.get('/api/profiles');
        if (profilesRes?.data?.length) {
          // Фильтруем пустые/незаполненные профили
          botProfiles = profilesRes.data.filter(p => p.name && p.name !== 'Новая страница');
        }
      }
    } catch (_) {}

    // Загружаем людей из основной БД
    try {
      if (typeof API !== 'undefined') {
        const data = await API.get('/api/people?page=1&limit=100');
        if (data?.data?.length) {
          people = data.data;
        }
      }
    } catch (_) {}

    // Если есть профили из бота — они замещают заглушки из основной БД
    if (botProfiles.length) {
      const botIds = new Set(botProfiles.map(p => p.id));
      const remaining = people.filter(p => !botIds.has(p.id));
      allPeople = [...botProfiles, ...remaining];
    } else if (people.length) {
      allPeople = people;
    } else if (typeof PEOPLE !== 'undefined' && PEOPLE.length) {
      allPeople = PEOPLE;
    }

    // Перемешиваем случайным образом
    for (let i = allPeople.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allPeople[i], allPeople[j]] = [allPeople[j], allPeople[i]];
    }

    if (allPeople.length) {
      filtered = [...allPeople];
      renderSlice(1);
    } else {
      showEmpty('Страниц памяти пока нет.');
    }
  }

  init();
})();
