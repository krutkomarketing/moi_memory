/* ═══════════════════════════════════════════════
   PERSON PAGE — медиа-карусель + расширенные
   воспоминания с типами (текст / фото / видео)
   ═══════════════════════════════════════════════ */

(function () {
  const main = document.getElementById('person-main');
  if (!main) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) { showNotFound(); return; }

  const personSVG = (typeof PERSON_SVG !== 'undefined') ? PERSON_SVG :
    `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="7" r="4"/>
      <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8"/>
    </svg>`;

  /* ── BREADCRUMBS ── */
  const breadcrumb = document.createElement('nav');
  breadcrumb.className = 'breadcrumb';
  breadcrumb.setAttribute('aria-label', 'Навигация');
  breadcrumb.innerHTML = `
    <ol class="breadcrumb__list">
      <li class="breadcrumb__item"><a href="index.html" class="breadcrumb__link">Главная</a></li>
      <li class="breadcrumb__item"><a href="memory.html" class="breadcrumb__link">Страницы памяти</a></li>
      <li class="breadcrumb__item"><span class="breadcrumb__current" id="breadcrumb-name">…</span></li>
    </ol>`;
  main.parentElement.insertBefore(breadcrumb, main);

  /* skeleton */
  main.innerHTML = `
    <section class="person-page" style="opacity:0.5">
      <div class="person-header">
        <div class="person-header__photo" style="background:#1a1a1a;"></div>
        <div class="person-header__info">
          <div class="skel-line skel-line--lg" style="margin-bottom:14px;"></div>
          <div class="skel-line" style="margin-bottom:10px;"></div>
          <div class="skel-line skel-line--sm"></div>
        </div>
      </div>
    </section>`;

  function showNotFound(msg) {
    document.title = 'Не найдено — Память';
    main.innerHTML = `
      <section class="person-notfound">
        <h1>Страница не найдена</h1>
        <p>${msg || 'Мы не смогли найти эту страницу памяти.'}</p>
        <a href="memory.html" class="btn btn--ghost">← Вернуться ко всем</a>
      </section>`;
  }

  /* ── LOAD ── */
  async function loadPerson() {
    // Если id выглядит как UUID — данные из бот-БД
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (isUUID) {
      // Сначала пробуем API (бот-БД)
      try {
        if (typeof API !== 'undefined') {
          const res = await API.get(`/api/profiles/${encodeURIComponent(id)}`);
          if (res && res.data) { render(res.data, 'api'); return; }
        }
      } catch (_) {}

      // Fallback: старый формат JSON-файлов
      try {
        const res = await fetch(`/bot-data/pages/${encodeURIComponent(id)}.json`);
        if (res.ok) {
          const doc = await res.json();
          const person = botPayloadToPerson(id, doc.payload);
          render(person, 'bot');
          return;
        }
      } catch (_) {}

      showNotFound('Страница не найдена или сервер недоступен.');
      return;
    }

    try {
      if (typeof API !== 'undefined') {
        const res = await API.get(`/api/people/${encodeURIComponent(id)}`);
        if (res && res.data) {
          // Подтягиваем quotes из PEOPLE если есть
          if (typeof PEOPLE !== 'undefined') {
            const local = PEOPLE.find(p => p.id === id);
            if (local && local.quotes) res.data.quotes = local.quotes;
          }
          render(res.data, 'api');
          return;
        }
      }
    } catch (_) {}

    if (typeof PEOPLE !== 'undefined') {
      const found = PEOPLE.find(p => p.id === id);
      if (found) {
        const person = { ...found };
        if (found.burial && typeof found.burial === 'object') {
          person.burial       = found.burial.place || '';
          person.burial_query = found.burial.query || found.burial.place || '';
        }
        /* merge localStorage reviews */
        const stored = (() => {
          try { return JSON.parse(localStorage.getItem(`reviews_${id}`) || '[]'); } catch { return []; }
        })();
        person.reviews = [...(found.reviews || []), ...stored];
        render(person, 'local');
        return;
      }
    }
    showNotFound();
  }

  /**
   * Преобразует payload бота в формат person.
   * payload: { hero: {full_name,dates,main_photo}, blocks: [{type,title,text}], gallery: [] }
   */
  function botPayloadToPerson(pageId, payload) {
    const hero    = payload?.hero    || {};
    const blocks  = payload?.blocks  || [];
    const gallery = payload?.gallery || [];

    const dateStr = hero.dates || '';
    const dateParts = dateStr.split(/[—–-]/).map(s => s.trim());
    const born = dateParts[0] || dateStr;
    const died = dateParts[1] || '';

    const toUrl = p => {
      if (!p) return '';
      if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) return p;
      if (p.startsWith('/uploads/') || p.startsWith('uploads/')) return API.resolveUrl(p);
      if (p.startsWith('/bot-data/') || p.startsWith('bot-data/')) return API.resolveUrl(p);
      return API.resolveUrl(`/bot-data/${p}`);
    };
    const galleryUrls = gallery.map(toUrl);

    // Заголовки бота → ключи 6-блочной схемы
    const TITLE_TO_KEY = {
      'Детство и юность':                 'childhood',
      'Образование':                      'education',
      'Профессиональный путь':            'career',
      'Семья':                            'family',
      'Хобби и увлечения':                'hobbies',
      'Каким мы его помним / Наследие':   'legacy',
      'Наследие':                         'legacy',
    };

    const sections = {};
    let photoIdx = 0;
    for (const b of blocks) {
      if (!b || !b.text || !b.text.trim()) continue;
      const key = TITLE_TO_KEY[b.title];
      if (!key) continue;
      const sec = { title: b.title, text: b.text.trim() };
      // Слот для фото — у каждого блока, берём из gallery по порядку
      sec.image = galleryUrls[photoIdx] || '';
      photoIdx++;
      sections[key] = sec;
    }

    const bio = blocks.find(b => b?.text?.trim())?.text?.trim() || '';
    const media = galleryUrls.map((src, i) => ({
      type: 'photo', src, caption: `Фото ${i + 1}`,
    }));

    return {
      id:    pageId,
      name:  hero.full_name || 'Без имени',
      born,
      died,
      city:  '',
      bio,
      sections,
      photo: toUrl(hero.main_photo),
      burial: '',
      burial_query: '',
      media,
      reviews: [],
    };
  }

  /**
   * Генерирует все 6 секций из person.bio + media.
   * Используется для slug-страниц где явных sections нет.
   * Если bio короткое — недостающие блоки заполняются плейсхолдер-текстом.
   */
  function autoSplitBioToSections(person) {
    const bio = (person?.bio ?? '').trim();
    const media = Array.isArray(person?.media) ? person.media : [];
    const photos = media
      .filter(m => m && (m.type === 'photo' || !m.type) && m.src && !String(m.src).startsWith('__placeholder'))
      .map(m => m.src);

    const PLACEHOLDER = {
      childhood: 'Информация о детстве и юности будет дополнена близкими.',
      education: 'Сведения об учёбе и становлении ждут наполнения.',
      career:    'История профессионального пути будет добавлена позже.',
      family:    'Воспоминания о семье соберут близкие.',
      hobbies:   'Любимые занятия и увлечения — раздел в разработке.',
      legacy:    'Близкие пока готовят слова о том, каким он остался в их памяти.',
    };

    const KEYS = ['childhood', 'education', 'career', 'family', 'hobbies', 'legacy'];

    const sentences = bio
      ? bio.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0)
      : [];

    const sections = {};
    KEYS.forEach((key, i) => {
      sections[key] = {
        text:  sentences[i] || PLACEHOLDER[key],
        image: photos[i] || '',
      };
    });

    return sections;
  }

  /* ════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════ */
  function render(person, source) {
    document.title = `${person.name} — Память`;

    // Если sections пусто — генерируем на лету из bio или создаем пустые заготовки
    const isEditMode = new URLSearchParams(window.location.search).get('edit') === '1';
    if (!person.sections || typeof person.sections !== 'object' || !Object.keys(person.sections).length) {
      if (person.bio && person.bio.trim()) {
        person.sections = autoSplitBioToSections(person);
      } else {
        person.sections = {};
      }
    }

    // В edit mode гарантируем наличие всех 6 стандартных секций, чтобы пользователь мог их заполнить
    if (isEditMode) {
      const KEYS = ['childhood', 'education', 'career', 'family', 'hobbies', 'legacy'];
      const TITLES = ['Детство и юность', 'Образование', 'Профессиональный путь', 'Семья', 'Хобби и увлечения', 'Наследие'];
      KEYS.forEach((key, i) => {
        if (!person.sections[key]) {
          person.sections[key] = { title: TITLES[i], text: '', image: '' };
        } else if (!person.sections[key].title) {
          person.sections[key].title = TITLES[i];
        }
      });
    }


    const bcName = document.getElementById('breadcrumb-name');
    if (bcName) bcName.textContent = person.name.split(' ').slice(0, 2).join(' ');

    const age = typeof calcAge === 'function' ? calcAge(person.born, person.died) : null;

    let reviews = Array.isArray(person.reviews) ? person.reviews : [];
    if (source === 'api') {
      try {
        const stored = JSON.parse(localStorage.getItem(`reviews_${id}`) || '[]');
        if (Array.isArray(stored)) reviews = [...reviews, ...stored];
      } catch {}
    }

    /* медиа-заглушки из data.js или пустой массив */
    const media = Array.isArray(person.media) ? person.media : [];

    const photoHtml = person.photo
      ? `<img src="${API.resolveUrl(person.photo)}" alt="${person.name}" style="width:100%;height:100%;object-fit:cover;border-radius:4px;" onerror="this.outerHTML='<div class=\'person-header__photo-inner\'>' + PERSON_SVG + '</div>'"/>`
      : `<div class="person-header__photo-inner">${personSVG}</div>`;

    const burialPlace = person.burial || '';
    const burialQuery = person.burial_query || burialPlace;

    main.innerHTML = `
      <section class="person-page">
        <a href="memory.html" class="person-back">ко всем страницам памяти</a>

        <!-- HEADER -->
        <div class="person-header">
          <div class="person-header__photo">${photoHtml}</div>
          <div class="person-header__info" data-gender="${person.gender || ''}">
            <p class="person-header__eyebrow">Страница памяти</p>
            <h1 class="person-header__name">${person.name}</h1>
            <p class="person-header__dates">${person.born}<span>—</span>${person.died || '...'}</p>
            ${age ? `<p class="person-header__age-badge">${age} лет</p>` : ''}
            ${person.city ? `<p class="person-header__city">${person.city}</p>` : ''}
          </div>
        </div>

        ${person.bio ? `
        <div class="person-bio">
          <p class="person-bio__text">${person.bio}</p>
        </div>` : ''}

        <!-- BIO BLOCKS (зебра-вёрстка, 6 секций) -->
        <div id="bio-blocks-container"></div>

        <!-- ВОСПОМИНАНИЯ -->
        <section class="memories-section" id="memories-section">
          <h2 class="person-sec-title">Воспоминания близких</h2>
          <div class="memories-grid" id="memories-grid"></div>
        </section>


        <!-- ФОТОГАЛЕРЕЯ (карусель) -->
        <section class="gallery-section" id="gallery-section">
          <h2 class="person-sec-title">Фотогалерея</h2>
          <div class="gallery-carousel" id="gallery-carousel">
            <button class="gallery-carousel__btn gallery-carousel__btn--prev" id="gallery-prev" aria-label="Назад">‹</button>
            <div class="gallery-carousel__track" id="gallery-track"></div>
            <button class="gallery-carousel__btn gallery-carousel__btn--next" id="gallery-next" aria-label="Вперёд">›</button>
          </div>
          <div class="gallery-carousel__dots" id="gallery-dots"></div>
        </section>

        <!-- ФОРМА ДОБАВЛЕНИЯ -->
        <section class="reviews-section" id="reviews-section">
          <h2 class="person-sec-title">Поделиться воспоминанием</h2>

          <!-- РАСШИРЕННАЯ ФОРМА -->
          <form class="review-form" id="review-form" enctype="multipart/form-data">
            <h3 class="review-form__title">Поделиться воспоминанием</h3>

            <!-- Тип воспоминания -->
            <div class="review-type-tabs" id="review-type-tabs">
              <button type="button" class="review-type-tab review-type-tab--active" data-type="text">
                <span class="review-type-tab__icon">✦</span> Текст
              </button>
              <button type="button" class="review-type-tab" data-type="photo">
                <span class="review-type-tab__icon">📷</span> Фото
              </button>
              <button type="button" class="review-type-tab" data-type="audio">
                <span class="review-type-tab__icon">🎙️</span> Аудио
              </button>
              <button type="button" class="review-type-tab" data-type="video">
                <span class="review-type-tab__icon">🎥</span> Видео
              </button>
              <button type="button" class="review-type-tab" data-type="quote">
                <span class="review-type-tab__icon">❧</span> Цитата
              </button>
              <button type="button" class="review-type-tab" data-type="memory">
                <span class="review-type-tab__icon">✿</span> Яркий момент
              </button>
            </div>

            <input type="hidden" name="reviewType" id="review-type-input" value="text"/>

            <!-- Поле загрузки фото (показывается при типе photo) -->
            <div class="review-media-field" id="review-media-field">
              <label class="review-media-upload">
                <input type="file" name="reviewPhoto" id="review-photo-input" accept="image/*"/>
                <span class="review-media-upload__icon">🖼</span>
                <span>
                  <div class="review-media-upload__text">Прикрепить фотографию</div>
                  <div class="review-media-upload__hint">JPG, PNG, WEBP — до 8 МБ</div>
                </span>
              </label>
              <div class="review-media-preview" id="review-media-preview">
                <img id="review-media-preview-img" src="" alt=""/>
                <button type="button" class="review-media-preview__remove" id="review-media-remove">×</button>
              </div>
            </div>

            <!-- Поле загрузки аудио (показывается при типе audio) -->
            <div class="review-media-field" id="review-audio-field">
              <label class="review-media-upload">
                <input type="file" name="reviewAudio" id="review-audio-input" accept="audio/*"/>
                <span class="review-media-upload__icon">🎙️</span>
                <span>
                  <div class="review-media-upload__text">Прикрепить аудиозапись</div>
                  <div class="review-media-upload__hint">MP3, WAV, M4A, WEBM — до 16 МБ</div>
                </span>
              </label>
              <div class="review-media-preview" id="review-audio-preview">
                <audio id="review-media-preview-audio" src="" controls style="max-width:100%;margin-top:8px;"></audio>
                <button type="button" class="review-media-preview__remove" id="review-audio-remove">×</button>
              </div>
            </div>

            <!-- Поле загрузки видео (показывается при типе video) -->
            <div class="review-media-field" id="review-video-field">
              <label class="review-media-upload">
                <input type="file" name="reviewVideo" id="review-video-input" accept="video/*"/>
                <span class="review-media-upload__icon">🎥</span>
                <span>
                  <div class="review-media-upload__text">Прикрепить видеоклип</div>
                  <div class="review-media-upload__hint">MP4, MOV, WEBM — до 16 МБ</div>
                </span>
              </label>
              <div class="review-media-preview" id="review-video-preview">
                <video id="review-media-preview-video" src="" controls style="max-width:100%;max-height:160px;margin-top:8px;"></video>
                <button type="button" class="review-media-preview__remove" id="review-video-remove">×</button>
              </div>
            </div>

            <div class="review-form__field">
              <input type="text" class="review-form__input" name="author"
                     placeholder="Ваше имя и кем приходитесь" required maxlength="120"/>
            </div>
            <div class="review-form__field">
              <textarea class="review-form__textarea" name="text" id="review-text"
                        placeholder="Ваше воспоминание..." required maxlength="2000"></textarea>
            </div>
            <button type="submit" class="review-form__submit">Сохранить воспоминание</button>
            <p class="review-form__status" id="review-status"
               style="display:none;text-align:center;margin-top:12px;font-family:var(--font-body);font-style:italic;"></p>
          </form>
        </section>

        ${burialPlace ? `
        <section class="burial-section">
          <h2 class="person-sec-title">Место захоронения</h2>
          <p class="burial-place">${burialPlace}</p>
          <div class="map-frame">
            <span class="map-frame__corner map-frame__corner--tl"></span>
            <span class="map-frame__corner map-frame__corner--tr"></span>
            <span class="map-frame__corner map-frame__corner--bl"></span>
            <span class="map-frame__corner map-frame__corner--br"></span>
            <iframe
              src="https://www.google.com/maps?q=${encodeURIComponent(burialQuery)}&output=embed"
              loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
          </div>
        </section>` : ''}
      </section>`;

    /* ── INIT ALL WIDGETS ── */
    // Зебра-блоки (6 секций) — рисуем после вставки разметки
    const bioContainer = document.getElementById('bio-blocks-container');
    if (bioContainer && person.sections && window.PersonBlocks) {
      window.PersonBlocks.render(bioContainer, { sections: person.sections, quotes: person.quotes });
    }

    initMemories(reviews);
    initGallery(media);
    initReviewForm(reviews, source);
  }

  /* ════════════════════════════════════════════
     ВОСПОМИНАНИЯ БЛИЗКИХ — аккуратный список/сетка
     ════════════════════════════════════════════ */
  function initMemories(reviews) {
    const gridEl = document.getElementById('memories-grid');
    if (!gridEl) return;

    const REVIEW_TYPE_LABELS = {
      text:   '✦ Текст',
      photo:  '📷 Фотография',
      audio:  '🎙️ Аудио',
      video:  '🎥 Видео',
      quote:  '❧ Цитата',
      memory: '✿ Яркий момент',
    };

    function buildMemoryCard(item) {
      const badge = item.reviewType && item.reviewType !== 'text'
        ? `<span class="memory-card__type-badge">${REVIEW_TYPE_LABELS[item.reviewType] || ''}</span>`
        : '';
      
      let inner = '';
      if (item.reviewType === 'audio' && item.photoDataUrl) {
        inner = `
          <div class="memory-card__text-only">
            ${badge}
            <p class="memory-card__text">${item.text}</p>
            <div class="memory-card__audio-wrapper" style="margin: 12px 0;">
              <audio src="${API.resolveUrl(item.photoDataUrl)}" controls style="width: 100%;"></audio>
            </div>
            <p class="memory-card__author">${item.author}</p>
          </div>`;
      } else if (item.reviewType === 'video' && item.photoDataUrl) {
        inner = `
          <div class="memory-card__video-layout" style="display: flex; flex-direction: column; gap: 10px; padding: 20px;">
            <div class="memory-card__video-wrapper" style="position: relative; width: 100%; overflow: hidden; border-radius: 4px; background: #000;">
              <video src="${API.resolveUrl(item.photoDataUrl)}" controls style="width: 100%; display: block; max-height: 240px; object-fit: contain;"></video>
            </div>
            <div class="memory-card__video-info">
              ${badge}
              <p class="memory-card__text" style="margin-top: 10px;">${item.text}</p>
              <p class="memory-card__author" style="margin-top: 10px;">${item.author}</p>
            </div>
          </div>`;
      } else if (item.photoDataUrl) {
        inner = `
          <div class="memory-card__split">
            <div class="memory-card__split-media">
              <img src="${API.resolveUrl(item.photoDataUrl)}" alt="фото" class="memory-card__split-img" loading="lazy"/>
            </div>
            <div class="memory-card__split-info">
              ${badge}
              <p class="memory-card__text">${item.text}</p>
              <p class="memory-card__author">${item.author}</p>
            </div>
          </div>`;
      } else {
        inner = `
          <div class="memory-card__text-only">
            ${badge}
            <p class="memory-card__text">${item.text}</p>
            <p class="memory-card__author">${item.author}</p>
          </div>`;
      }

      return `<div class="memory-card">${inner}</div>`;
    }

    if (!reviews.length) {
      gridEl.innerHTML = `<p class="memories-empty">Воспоминания пока не добавлены. Будьте первым.</p>`;
    } else {
      gridEl.innerHTML = reviews.map(r => buildMemoryCard(r)).join('');
    }

    /* Публичный метод — добавление новой карточки */
    window._addMemoryCard = function(review) {
      reviews.unshift(review);
      // Очищаем пустое состояние если было
      const emptyEl = gridEl.querySelector('.memories-empty');
      if (emptyEl) {
        gridEl.innerHTML = '';
      }
      gridEl.insertAdjacentHTML('afterbegin', buildMemoryCard(review));
      const newEl = gridEl.firstElementChild;
      if (newEl) {
        newEl.style.opacity = '0';
        newEl.style.transform = 'translateY(15px)';
        newEl.style.transition = 'all 0.6s ease';
        setTimeout(() => {
          newEl.style.opacity = '1';
          newEl.style.transform = 'translateY(0)';
        }, 50);
        newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
  }


  /* ════════════════════════════════════════════
     ФОТОГАЛЕРЕЯ (КАРУСЕЛЬ)
     ════════════════════════════════════════════ */
  function initGallery(media) {
    const section = document.getElementById('gallery-section');
    const track = document.getElementById('gallery-track');
    const prevBtn = document.getElementById('gallery-prev');
    const nextBtn = document.getElementById('gallery-next');
    const dotsEl = document.getElementById('gallery-dots');
    if (!section || !track) return;

    // Собираем только реальные фото (с src)
    const photos = media
      .filter(m => m && (m.type === 'photo' || !m.type) && m.src && !String(m.src).startsWith('__placeholder'))
      .map(m => ({ src: m.src, caption: m.caption || '' }));

    // Также собираем фото из sections (блоков)
    const bioContainer = document.getElementById('bio-blocks-container');
    if (bioContainer) {
      const blockImgs = bioContainer.querySelectorAll('.bio-block__photo img');
      blockImgs.forEach(img => {
        const src = img.getAttribute('src');
        if (src && !photos.find(p => p.src === src)) {
          photos.push({ src, caption: img.alt || '' });
        }
      });
    }

    // Если фото нет — скрываем галерею
    if (!photos.length) {
      section.style.display = 'none';
      return;
    }

    // Рендерим слайды (без клонов — виртуализация индексов)
    track.innerHTML = photos.map((p, i) => {
      return `
        <div class="gallery-slide" data-index="${i}">
          <img src="${API.resolveUrl(p.src)}" alt="${p.caption}" loading="lazy"/>
          ${p.caption ? `<p class="gallery-slide__caption">${p.caption}</p>` : ''}
        </div>`;
    }).join('');

    // Dots
    if (photos.length > 1) {
      dotsEl.innerHTML = photos.map((_, i) => `
        <button class="gallery-dot ${i === 0 ? 'gallery-dot--active' : ''}" data-index="${i}" aria-label="Фото ${i+1}"></button>
      `).join('');
    }

    let current = 0;
    const slides = track.querySelectorAll('.gallery-slide');
    const total = photos.length;

    // Вычисляет циклический индекс
    function mod(n, m) {
      return ((n % m) + m) % m;
    }

    function updateSlides() {
      const leftIdx  = total > 2 ? mod(current - 1, total) : -1;
      const rightIdx = total > 1 ? mod(current + 1, total) : -1;

      slides.forEach((slide, i) => {
        slide.classList.remove('gallery-slide--center', 'gallery-slide--left', 'gallery-slide--right', 'gallery-slide--hidden');

        if (i === current) {
          slide.classList.add('gallery-slide--center');
        } else if (i === leftIdx && leftIdx !== rightIdx) {
          slide.classList.add('gallery-slide--left');
        } else if (i === rightIdx) {
          slide.classList.add('gallery-slide--right');
        } else {
          slide.classList.add('gallery-slide--hidden');
        }
      });

      // Update dots
      dotsEl.querySelectorAll('.gallery-dot').forEach((d, i) => {
        d.classList.toggle('gallery-dot--active', i === current);
      });
    }

    function goTo(idx) {
      current = mod(idx, total);
      updateSlides();
    }

    // Начальное состояние
    updateSlides();

    prevBtn?.addEventListener('click', () => goTo(current - 1));
    nextBtn?.addEventListener('click', () => goTo(current + 1));

    dotsEl?.addEventListener('click', (e) => {
      const dot = e.target.closest('.gallery-dot');
      if (dot) goTo(parseInt(dot.dataset.index, 10));
    });

    // Swipe support
    let startX = 0;
    let isDragging = false;

    track.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isDragging = true;
    });

    track.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      isDragging = false;
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) goTo(current + 1);
        else goTo(current - 1);
      }
    });

    // Keyboard
    section.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') goTo(current - 1);
      if (e.key === 'ArrowRight') goTo(current + 1);
    });

    // Hide buttons if only 1 photo
    if (photos.length <= 1) {
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
    }
  }

  /* ════════════════════════════════════════════
     РАСШИРЕННАЯ ФОРМА
     ════════════════════════════════════════════ */
  function initReviewForm(reviews, source) {
    const form        = document.getElementById('review-form');
    const status      = document.getElementById('review-status');
    const typeInput   = document.getElementById('review-type-input');
    const mediaField  = document.getElementById('review-media-field');
    const photoInput  = document.getElementById('review-photo-input');
    const preview     = document.getElementById('review-media-preview');
    const previewImg  = document.getElementById('review-media-preview-img');
    const removeBtn   = document.getElementById('review-media-remove');
    const textarea    = document.getElementById('review-text');

    const audioField  = document.getElementById('review-audio-field');
    const audioInput  = document.getElementById('review-audio-input');
    const audioPreview= document.getElementById('review-audio-preview');
    const previewAudio= document.getElementById('review-media-preview-audio');
    const audioRemove = document.getElementById('review-audio-remove');

    const videoField  = document.getElementById('review-video-field');
    const videoInput  = document.getElementById('review-video-input');
    const videoPreview= document.getElementById('review-video-preview');
    const previewVideo= document.getElementById('review-media-preview-video');
    const videoRemove = document.getElementById('review-video-remove');

    if (!form) return;

    let selectedPhotoDataUrl = null;

    /* ── Тип-вкладки ── */
    const TYPE_PLACEHOLDERS = {
      text:   'Напишите своё воспоминание...',
      photo:  'Подпишите фотографию или расскажите что на ней...',
      audio:  'Добавьте описание или комментарий к аудиозаписи...',
      video:  'Добавьте описание или комментарий к видеозаписи...',
      quote:  'Любимое выражение или слова, которые вы запомнили...',
      memory: 'Расскажите о ярком моменте, который вы не забудете...',
    };

    document.querySelectorAll('.review-type-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.review-type-tab').forEach(t => t.classList.remove('review-type-tab--active'));
        tab.classList.add('review-type-tab--active');
        const type = tab.dataset.type;
        typeInput.value = type;
        
        /* Показываем/скрываем медиа поля */
        mediaField?.classList.toggle('is-visible', type === 'photo');
        audioField?.classList.toggle('is-visible', type === 'audio');
        videoField?.classList.toggle('is-visible', type === 'video');

        /* Сброс если переключились */
        if (type !== 'photo') {
          selectedPhotoDataUrl = null;
          if (photoInput) photoInput.value = '';
          preview?.classList.remove('is-visible');
        }
        if (type !== 'audio') {
          if (audioInput) audioInput.value = '';
          if (previewAudio) previewAudio.src = '';
          audioPreview?.classList.remove('is-visible');
        }
        if (type !== 'video') {
          if (videoInput) videoInput.value = '';
          if (previewVideo) previewVideo.src = '';
          videoPreview?.classList.remove('is-visible');
        }

        if (textarea) textarea.placeholder = TYPE_PLACEHOLDERS[type] || TYPE_PLACEHOLDERS.text;
      });
    });

    /* ── Превью фото ── */
    photoInput?.addEventListener('change', () => {
      const file = photoInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        selectedPhotoDataUrl = e.target.result;
        if (previewImg)  previewImg.src = selectedPhotoDataUrl;
        preview?.classList.add('is-visible');
      };
      reader.readAsDataURL(file);
    });

    removeBtn?.addEventListener('click', () => {
      selectedPhotoDataUrl = null;
      if (photoInput) photoInput.value = '';
      if (previewImg) previewImg.src = '';
      preview?.classList.remove('is-visible');
    });

    /* ── Превью аудио ── */
    audioInput?.addEventListener('change', () => {
      const file = audioInput.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      if (previewAudio) previewAudio.src = url;
      audioPreview?.classList.add('is-visible');
    });

    audioRemove?.addEventListener('click', () => {
      if (audioInput) audioInput.value = '';
      if (previewAudio) previewAudio.src = '';
      audioPreview?.classList.remove('is-visible');
    });

    /* ── Превью видео ── */
    videoInput?.addEventListener('change', () => {
      const file = videoInput.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      if (previewVideo) previewVideo.src = url;
      videoPreview?.classList.add('is-visible');
    });

    videoRemove?.addEventListener('click', () => {
      if (videoInput) videoInput.value = '';
      if (previewVideo) previewVideo.src = '';
      videoPreview?.classList.remove('is-visible');
    });

    /* ════════════════════════════════════════════
       МОДАЛКА ПАРОЛЯ — показывается ПЕРЕД сохранением
       ════════════════════════════════════════════ */

    /**
     * Показывает модальное окно с запросом пароля.
     * @returns {Promise<string>} резолвится с введённым паролем
     *                            или реджектится если пользователь закрыл.
     */
    function showCodeModal() {
      return new Promise((resolve, reject) => {
        /* Убираем старую если есть */
        document.getElementById('code-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.className = 'code-overlay';
        overlay.id        = 'code-overlay';
        overlay.innerHTML = `
          <div class="code-modal" role="dialog" aria-modal="true" aria-labelledby="code-title">
            <button class="code-modal__close" id="code-close" aria-label="Закрыть">×</button>
            <span class="code-modal__icon">🔒</span>
            <h2 class="code-modal__title" id="code-title">Код доступа</h2>
            <p class="code-modal__sub">
              Для сохранения воспоминания введите<br/>
              8-значный код, который вы получили.
            </p>
            <div class="code-modal__input-wrap">
              <input
                type="text"
                id="code-input"
                class="code-modal__input"
                placeholder="••••••••"
                maxlength="8"
                inputmode="text"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
            <p class="code-modal__error" id="code-error"></p>
            <p class="code-modal__hint">Введите <span id="code-len">0</span> / 8 символов</p>
            <button class="code-modal__submit" id="code-submit" disabled>
              Подтвердить
            </button>
            <p class="code-modal__footer">
              Ещё нет кода?
              <a href="mailto:admin@memory.site">Обратитесь к администратору</a>
            </p>
          </div>`;

        document.body.appendChild(overlay);

        const input    = document.getElementById('code-input');
        const errEl    = document.getElementById('code-error');
        const submitBtn= document.getElementById('code-submit');
        const lenEl    = document.getElementById('code-len');
        const closeBtn = document.getElementById('code-close');

        /* Фокус на поле */
        setTimeout(() => input?.focus(), 80);

        /* Обновляем счётчик и кнопку */
        input.addEventListener('input', () => {
          const len = input.value.trim().length;
          if (lenEl) lenEl.textContent = len;
          submitBtn.disabled = len < 8;
          /* сбрасываем ошибку при вводе */
          input.classList.remove('code-modal__input--error');
          errEl.textContent = '';
        });

        /* Закрытие — reject */
        function close() {
          overlay.remove();
          reject(new Error('cancelled'));
        }
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', function onEsc(e) {
          if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
        });

        /* Кнопка ripple */
        submitBtn.addEventListener('mousemove', e => {
          const r = submitBtn.getBoundingClientRect();
          submitBtn.style.setProperty('--mx', ((e.clientX - r.left) / r.width  * 100) + '%');
          submitBtn.style.setProperty('--my', ((e.clientY - r.top)  / r.height * 100) + '%');
        });

        /* ── Проверка пароля ── */
        async function tryCode() {
          const code = input.value.trim();
          if (code.length < 8) return;

          submitBtn.disabled = true;
          submitBtn.textContent = '';
          submitBtn.classList.add('code-modal__submit--loading');
          submitBtn.textContent = 'Проверяем';
          errEl.textContent = '';

          let valid = false;

          /* 1. Спрашиваем сервер */
          try {
            if (typeof API !== 'undefined') {
              const res = await API.post(
                `/api/people/${encodeURIComponent(id)}/verify-code`,
                { code }
              );
              valid = res && res.ok === true;
            }
          } catch (_) {
            /* Если сервер недоступен — пробуем локальный fallback */
          }

          /* 2. Оффлайн-фоллбэк: проверяем в localStorage (для демо) */
          if (!valid) {
            const localCode = localStorage.getItem(`person_code_${id}`) || 'MEMORYOK';
            valid = (code === localCode);
          }

          submitBtn.classList.remove('code-modal__submit--loading');

          if (valid) {
            /* Успех — анимация и закрытие */
            overlay.querySelector('.code-modal')?.classList.add('code-modal--success');
            submitBtn.textContent = '✓ Принято';
            submitBtn.style.background = 'linear-gradient(135deg,#3a8a5a,#5ab87a)';
            setTimeout(() => {
              overlay.remove();
              resolve(code);
            }, 600);
          } else {
            /* Ошибка */
            input.classList.add('code-modal__input--error');
            errEl.textContent = 'Неверный код. Попробуйте ещё раз.';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Подтвердить';
            input.focus();
            /* Убираем класс ошибки через 0.4s чтобы анимация могла снова сработать */
            setTimeout(() => input.classList.remove('code-modal__input--error'), 600);
          }
        }

        submitBtn.addEventListener('click', tryCode);
        input.addEventListener('keydown', e => { if (e.key === 'Enter' && !submitBtn.disabled) tryCode(); });
      });
    }

    /* ── Submit — сначала пароль, потом сохранение ── */
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd     = new FormData(form);
      const author = (fd.get('author') || '').toString().trim();
      const text   = (fd.get('text')   || '').toString().trim();
      const rType  = (fd.get('reviewType') || 'text').toString();
      if (!author || !text) return;

      /* ── Запрашиваем пароль ── */
      try {
        await showCodeModal();
      } catch (_) {
        /* Пользователь закрыл — просто выходим */
        return;
      }

      const btn = form.querySelector('.review-form__submit');
      btn.disabled    = true;
      btn.textContent = 'Сохраняем...';

      let photoDataUrl = null;
      if (rType === 'photo') {
        if (photoInput && photoInput.files && photoInput.files[0]) {
          try {
            const formData = new FormData();
            formData.append('photo', photoInput.files[0]);
            const uploadRes = await API.upload('/api/upload-photo', formData);
            if (uploadRes && uploadRes.ok && uploadRes.url) {
              photoDataUrl = uploadRes.url;
            }
          } catch (uploadErr) {
            console.error('Photo upload failed:', uploadErr);
          }
        }
        if (!photoDataUrl && selectedPhotoDataUrl) {
          photoDataUrl = selectedPhotoDataUrl;
        }
      } else if (rType === 'audio') {
        if (audioInput && audioInput.files && audioInput.files[0]) {
          try {
            const formData = new FormData();
            formData.append('audio', audioInput.files[0]);
            const uploadRes = await API.upload('/api/upload-audio', formData);
            if (uploadRes && uploadRes.ok && uploadRes.url) {
              photoDataUrl = uploadRes.url;
            }
          } catch (uploadErr) {
            console.error('Audio upload failed:', uploadErr);
          }
        }
      } else if (rType === 'video') {
        if (videoInput && videoInput.files && videoInput.files[0]) {
          try {
            const formData = new FormData();
            formData.append('video', videoInput.files[0]);
            const uploadRes = await API.upload('/api/upload-video', formData);
            if (uploadRes && uploadRes.ok && uploadRes.url) {
              photoDataUrl = uploadRes.url;
            }
          } catch (uploadErr) {
            console.error('Video upload failed:', uploadErr);
          }
        }
      }

      const newReview = {
        author,
        text,
        reviewType: rType,
        ...(photoDataUrl ? { photoDataUrl } : {}),
      };

      /* Try API */
      let saved = false;
      try {
        if (typeof API !== 'undefined') {
          const res = await API.post(`/api/reviews/${encodeURIComponent(id)}`, {
            author,
            text,
            reviewType: rType,
            photoDataUrl
          });
          if (res && res.data) {
            reviews.unshift({
              ...res.data,
              reviewType: res.data.reviewType || rType,
              photoDataUrl: res.data.photoDataUrl || photoDataUrl
            });
            saved = true;
          }
        }
      } catch (_) {}

      /* Fallback localStorage (включая фото как dataUrl) */
      if (!saved) {
        reviews.unshift(newReview);
        try {
          const stored = JSON.parse(localStorage.getItem(`reviews_${id}`) || '[]');
          stored.unshift(newReview);
          localStorage.setItem(`reviews_${id}`, JSON.stringify(stored));
        } catch {}
      }

      /* Сброс формы */
      form.reset();
      typeInput.value = 'text';
      selectedPhotoDataUrl = null;
      preview?.classList.remove('is-visible');
      mediaField?.classList.remove('is-visible');
      audioPreview?.classList.remove('is-visible');
      audioField?.classList.remove('is-visible');
      videoPreview?.classList.remove('is-visible');
      videoField?.classList.remove('is-visible');
      if (previewAudio) previewAudio.src = '';
      if (previewVideo) previewVideo.src = '';

      document.querySelectorAll('.review-type-tab').forEach((t, i) =>
        t.classList.toggle('review-type-tab--active', i === 0));
      if (textarea) textarea.placeholder = TYPE_PLACEHOLDERS.text;

      /* Перерендер воспоминаний */
      if (typeof window._addMemoryCard === 'function') {
        window._addMemoryCard(saved ? {
          ...newReview,
          photoDataUrl: photoDataUrl || selectedPhotoDataUrl
        } : newReview);
      }

      status.style.display = 'block';
      status.style.color   = 'var(--gold-light)';
      status.textContent   = 'Воспоминание сохранено ✦';
      setTimeout(() => { status.style.display = 'none'; }, 3500);

      document.getElementById('memories-section')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      btn.disabled    = false;
      btn.textContent = 'Сохранить воспоминание';
    });
  }

  loadPerson();
})();
