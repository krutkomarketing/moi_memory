/* ═══════════════════════════════════════════════
   PERSON-EDIT.JS — режим редактирования страницы памяти
   Кнопка «Редактировать» → инпуты → «Сохранить» → PUT /api/profiles/:id
   ═══════════════════════════════════════════════ */

(function () {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const autoEdit = params.get('edit') === '1';

  // Edit-режим работает для любого id/slug — бэк сам резолвит через OR:[{id},{slug}]
  if (!id) return;

  let isEditing = false;
  let originalData = null; // сохраняем данные для отката

  function checkReadyAndInit() {
    if (document.querySelector('.person-header__name')) {
      initEditPanel();
      if (autoEdit) {
        // Добавляем небольшую задержку, чтобы убедиться, что все скрипты завершили работу (вкл. person-blocks)
        setTimeout(() => enterEditMode(), 100);
      }
    } else {
      setTimeout(checkReadyAndInit, 100);
    }
  }

  if (document.readyState === 'complete') {
    checkReadyAndInit();
  } else {
    window.addEventListener('load', checkReadyAndInit);
  }

  function initEditPanel() {
    const panel = document.createElement('div');
    panel.className = 'edit-panel';
    panel.id = 'edit-panel';
    panel.innerHTML = `<button class="edit-panel__btn" id="edit-toggle-btn">✏️ Редактировать</button>`;
    document.body.appendChild(panel);

    document.getElementById('edit-toggle-btn').addEventListener('click', toggleEdit);
  }

  function toggleEdit() {
    if (!isEditing) {
      window.location.href = `person.html?id=${id}&edit=1`;
    } else {
      exitEditMode();
    }
  }

  function enterEditMode() {
    isEditing = true;
    originalData = collectCurrentData();

    // Меняем кнопки
    const panel = document.getElementById('edit-panel');
    panel.innerHTML = `
      <button class="edit-panel__btn edit-panel__btn--save" id="edit-save-btn">💾 Сохранить</button>
      <button class="edit-panel__btn edit-panel__btn--cancel" id="edit-cancel-btn">✕ Отмена</button>
    `;
    document.getElementById('edit-save-btn').addEventListener('click', saveChanges);
    document.getElementById('edit-cancel-btn').addEventListener('click', cancelEdit);

    // Трансформируем блоки в инпуты
    transformToInputs();

    // === НОВАЯ ФИЧА: единая диктовка всей истории ===
    // Большой блок вверху редактора: человек надиктовывает длинный текст один раз,
    // ИИ сам создаёт, называет и заполняет все тематические блоки.
    initFullStoryDictationUI();
  }

  function exitEditMode() {
    isEditing = false;
    const panel = document.getElementById('edit-panel');
    panel.innerHTML = `<button class="edit-panel__btn" id="edit-toggle-btn">✏️ Редактировать</button>`;
    document.getElementById('edit-toggle-btn').addEventListener('click', toggleEdit);
  }

  function cancelEdit() {
    // Убираем ?edit=1 из URL и перезагружаем
    window.location.href = `person.html?id=${id}`;
  }

  /* ── Собираем текущие данные со страницы ── */
  function collectCurrentData() {
    const data = { sections: {}, quotes: [] };

    // Hero
    const nameEl = document.querySelector('.person-header__name');
    const datesEl = document.querySelector('.person-header__dates');
    const bioEl = document.querySelector('.person-bio__text');
    const photoEl = document.querySelector('.person-header__photo img');
    const cityEl = document.querySelector('.person-header__city');

    data.name = nameEl?.textContent?.trim() || '';
    data.dates = datesEl?.textContent?.replace(/[—–]/g, '-').trim() || '';
    data.bio = bioEl?.textContent?.trim() || '';
    data.photo = photoEl?.src || '';
    data.city = cityEl?.textContent?.trim().replace(/^◎\s*/, '') || '';

    // Блоки
    document.querySelectorAll('.bio-block').forEach(block => {
      const key = block.dataset.block;
      if (!key) return;
      const titleEl = block.querySelector('.bio-block__title');
      const textEl = block.querySelector('.bio-block__text');
      const imgEl = block.querySelector('.bio-block__photo img');

      data.sections[key] = {
        title: titleEl?.textContent?.trim() || '',
        text: textEl?.innerText?.trim() || '',
        image: imgEl?.src || '',
      };
    });

    // Цитаты
    document.querySelectorAll('.bio-quote').forEach(q => {
      const textEl = q.querySelector('.bio-quote__text');
      if (textEl) {
        data.quotes.push({ text: textEl.textContent.trim(), after: '' });
      }
    });

    return data;
  }

  /* ── Превращаем текст в инпуты ── */
  function transformToInputs() {
    // Hero name
    const nameEl = document.querySelector('.person-header__name');
    if (nameEl) {
      const val = nameEl.textContent.trim();
      const isPlaceholder = val === 'Новая страница' || !val;
      nameEl.innerHTML = `<input class="edit-input" data-field="name" value="${isPlaceholder ? '' : escAttr(val)}" placeholder="Фамилия Имя Отчество"/>`;
    }

    // Hero dates
    const datesEl = document.querySelector('.person-header__dates');
    if (datesEl) {
      const val = datesEl.textContent.trim();
      const isPlaceholder = val === '—' || val === '——...' || val === '—...' || !val;
      datesEl.innerHTML = `<input class="edit-input" data-field="dates" value="${isPlaceholder ? '' : escAttr(val)}" placeholder="01.01.1930 — 15.06.2000"/>`;
    }

    // Город — вставляем инпут (или создаём если города нет)
    let cityEl = document.querySelector('.person-header__city');
    const infoBlock = document.querySelector('.person-header__info');
    if (!cityEl && infoBlock) {
      cityEl = document.createElement('p');
      cityEl.className = 'person-header__city';
      const datesParent = document.querySelector('.person-header__dates');
      const ageBadge = document.querySelector('.person-header__age-badge');
      // Вставляем после плашки возраста или после дат
      if (ageBadge) ageBadge.after(cityEl);
      else if (datesParent) datesParent.after(cityEl);
      else infoBlock.appendChild(cityEl);
    }
    if (cityEl) {
      const val = cityEl.textContent.trim().replace(/^◎\s*/, '');
      cityEl.innerHTML = `<input class="edit-input" data-field="city" placeholder="Город" value="${escAttr(val)}"/>`;
        // Видимость
        const visWrap = document.createElement("div");
        visWrap.className = "edit-visibility";
        const currentVis = (originalData && originalData.visibility) ? String(originalData.visibility) : "";
        visWrap.innerHTML = `
          <label class="edit-visibility__label">Видимость:</label>
          <select class="edit-input edit-input--select" data-field="visibility">
            <option value="PUBLIC"   ${currentVis==="PUBLIC"   ? "selected":""}>Публичная</option>
            <option value="UNLISTED" ${currentVis==="UNLISTED" ? "selected":""}>По ссылке</option>
            <option value="PRIVATE"  ${currentVis==="PRIVATE"  ? "selected":""}>Приватная</option>
            <option value="PASSWORD"${currentVis==="PASSWORD"? "selected":""}>С паролем</option>
          </select>
          <div class="edit-visibility__hint">Для “С паролем” используйте “Коды доступа” на странице.</div>
        `;
        cityEl.after(visWrap);
      cityEl.style.cssText = 'display:block;';
    }

    // Пол — вставляем после города
    const headerInfo = document.querySelector('.person-header__info');
    if (headerInfo) {
      const currentGender = headerInfo.dataset.gender || '';
      const genderWrap = document.createElement('div');
      genderWrap.className = 'edit-gender';
      genderWrap.innerHTML = `
        <label class="edit-gender__label">Пол:</label>
        <div class="edit-gender__options">
          <button type="button" class="edit-gender__btn ${currentGender === 'male' ? 'edit-gender__btn--active' : ''}" data-gender="male">♂ Мужской</button>
          <button type="button" class="edit-gender__btn ${currentGender === 'female' ? 'edit-gender__btn--active' : ''}" data-gender="female">♀ Женский</button>
        </div>
      `;
      // Вставляем после города
      const cityParent = document.querySelector('.person-header__city');
      if (cityParent) {
        cityParent.after(genderWrap);
      } else {
        const datesParent = document.querySelector('.person-header__dates');
        if (datesParent) datesParent.after(genderWrap);
        else headerInfo.appendChild(genderWrap);
      }

      genderWrap.querySelectorAll('.edit-gender__btn').forEach(btn => {
        btn.addEventListener('click', () => {
          genderWrap.querySelectorAll('.edit-gender__btn').forEach(b => b.classList.remove('edit-gender__btn--active'));
          btn.classList.add('edit-gender__btn--active');
        });
      });
    }

    // Bio text
    const bioEl = document.querySelector('.person-bio__text');
    if (bioEl) {
      const val = bioEl.textContent.trim();
      bioEl.outerHTML = `<div class="edit-textarea-wrapper">
        <textarea class="edit-textarea" data-field="bio" placeholder="Краткий текст о человеке — эпитафия, несколько тёплых слов...">${escHtml(val)}</textarea>
        <button type="button" class="ai-voice-btn" title="Голосовой ИИ-помощник">🎙️</button>
        <button type="button" class="ai-assistant-btn" title="AI помощник">AI</button>
      </div>`;
    }

    // Hero photo — кнопка загрузки
    const photoWrap = document.querySelector('.person-header__photo');
    if (photoWrap) {
      addPhotoUploadBtn(photoWrap, 'photo', '');
    }

    // Блоки контента
    document.querySelectorAll('.bio-block').forEach(block => {
      const key = block.dataset.block;
      if (!key) return;

      // Текст → textarea
      const textEl = block.querySelector('.bio-block__text');
      if (textEl) {
        const val = textEl.innerText.trim();
        const BLOCK_HINTS = {
          childhood: 'Расскажите о детстве и юности или удалите блок',
          education: 'Расскажите об учёбе и становлении или удалите блок',
          career:    'Расскажите о профессиональном пути или удалите блок',
          family:    'Расскажите о семье и близких или удалите блок',
          hobbies:   'Расскажите о хобби и увлечениях или удалите блок',
          legacy:    'Расскажите, каким запомнился человек, или удалите блок',
        };
        const hint = BLOCK_HINTS[key] || 'Напишите текст или удалите блок';
        // Если текст — это placeholder из autoSplit, очищаем
        const isAutoText = val.includes('будет дополнен') || val.includes('ждут наполнения') || val.includes('будет добавлен') || val.includes('соберут близкие') || val.includes('в разработке') || val.includes('готовят слова');
        const cleanVal = isAutoText ? '' : val;
        textEl.innerHTML = `<div class="edit-textarea-wrapper">
          <textarea class="edit-textarea" data-block="${key}" data-field="text" placeholder="${hint}">${escHtml(cleanVal)}</textarea>
          <button type="button" class="ai-voice-btn" title="Голосовой ИИ-помощник">🎙️</button>
          <button type="button" class="ai-assistant-btn" title="AI помощник">AI</button>
        </div>`;
      }

      // Фото — кнопка загрузки (или замены)
      let photoDiv = block.querySelector('.bio-block__photo');
      if (!photoDiv) {
        // Нет фото-блока — создаём слот для загрузки
        const row = block.querySelector('.bio-block__row');
        if (row) {
          photoDiv = document.createElement('div');
          photoDiv.className = 'bio-block__photo bio-block__photo--empty-edit';
          row.appendChild(photoDiv);
        }
      }
      if (photoDiv) {
        addPhotoUploadBtn(photoDiv, 'block-photo', key);
      }

      // Кнопка удаления блока
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'edit-block-delete';
      delBtn.innerHTML = '🗑 Удалить блок';
      delBtn.addEventListener('click', () => {
        if (confirm('Удалить этот блок?')) animateRemove(block);
      });
      block.appendChild(delBtn);
    });

    // Цитаты → textarea
    document.querySelectorAll('.bio-quote__text').forEach((q, i) => {
      const val = q.textContent.trim();
      q.outerHTML = `<div class="edit-textarea-wrapper">
        <textarea class="edit-textarea edit-textarea--quote" data-field="quote" data-index="${i}">${escHtml(val)}</textarea>
        <button type="button" class="ai-voice-btn" title="Голосовой ИИ-помощник">🎙️</button>
        <button type="button" class="ai-assistant-btn" title="AI помощник">AI</button>
      </div>`;
    });

    // Добавляем кнопки «+ Блок» / «+ Цитата» между блоками
    addInsertButtons();

    // Добавляем кнопку «+ Фото в галерею»
    addGalleryUploadBtn();
  }

  /* ── Плавные анимации добавления/удаления карточек (GSAP) ──
     Принципы Emil Kowalski: ease-out на входе, выход быстрее входа,
     старт не из scale(0), длительности <300–450ms, уважение reduced-motion. */
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Появление новой карточки: соседи плавно расступаются (height+opacity+scale)
  function animateInsert(el) {
    if (!el) return;
    if (typeof gsap === 'undefined' || prefersReducedMotion()) {
      const f = el.querySelector('.edit-input, .edit-textarea');
      if (f) setTimeout(() => f.focus({ preventScroll: true }), 0);
      return;
    }
    const cs = getComputedStyle(el);
    const target = {
      height: el.offsetHeight,
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
      marginTop: cs.marginTop,
      marginBottom: cs.marginBottom,
      opacity: 1,
      scale: 1
    };
    gsap.set(el, { overflow: 'hidden' });
    gsap.fromTo(el,
      { height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, marginBottom: 0, opacity: 0, scale: 0.985, transformOrigin: 'top center' },
      Object.assign({}, target, {
        duration: 0.42,
        ease: 'power3.out',
        clearProps: 'height,overflow,opacity,transform,paddingTop,paddingBottom,marginTop,marginBottom'
      })
    );
    // лёгкий каскад внутренних полей
    const inner = el.querySelectorAll('.edit-input, .edit-textarea-wrapper, .bio-block__photo, .edit-insert-btn--delete');
    if (inner.length) {
      gsap.from(inner, { opacity: 0, y: 8, duration: 0.32, stagger: 0.05, ease: 'power2.out', delay: 0.1, clearProps: 'opacity,transform' });
    }
    // фокус на первое поле — сразу можно печатать (без рывка прокрутки)
    const firstField = el.querySelector('.edit-input, .edit-textarea');
    if (firstField) setTimeout(() => firstField.focus({ preventScroll: true }), 140);
  }

  // Удаление карточки: схлопывание (выход быстрее входа)
  function animateRemove(el, after) {
    if (!el) return;
    const done = () => { el.remove(); if (typeof after === 'function') after(); };
    if (typeof gsap === 'undefined' || prefersReducedMotion()) { done(); return; }
    gsap.set(el, { overflow: 'hidden' });
    gsap.to(el, {
      height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, marginBottom: 0,
      opacity: 0, scale: 0.985, transformOrigin: 'top center',
      duration: 0.26,
      ease: 'power2.in',
      onComplete: done
    });
  }

  // Появление загруженного фото
  function animatePhotoIn(img) {
    if (!img || typeof gsap === 'undefined' || prefersReducedMotion()) return;
    gsap.fromTo(img, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'power3.out', clearProps: 'opacity,transform' });
  }

  /* ── Кнопки вставки между блоками ── */
  function addInsertButtons() {
    const container = document.getElementById('bio-blocks-container');
    if (!container) return;
    let bioBlocks = container.querySelector('.bio-blocks');

    // Если .bio-blocks нет (пустая страница) — создаём
    if (!bioBlocks) {
      bioBlocks = document.createElement('div');
      bioBlocks.className = 'bio-blocks';
      container.appendChild(bioBlocks);
    }

    const children = Array.from(bioBlocks.children);

    // Вставляем панель кнопок ПЕРЕД первым блоком и ПОСЛЕ каждого элемента
    const positions = []; // перед первым
    children.forEach((child, i) => positions.push({ after: child, index: i }));

    // Вставляем перед первым
    const firstPanel = createInsertPanel(0);
    bioBlocks.insertBefore(firstPanel, bioBlocks.firstChild);

    // Вставляем после каждого элемента
    children.forEach((child, i) => {
      const panel = createInsertPanel(i + 1);
      child.after(panel);
    });
  }

  function createInsertPanel(position) {
    const panel = document.createElement('div');
    panel.className = 'edit-insert-panel';
    panel.dataset.position = position;
    panel.innerHTML = `
      <button type="button" class="edit-insert-btn" data-action="add-block" data-pos="${position}">+ Блок</button>
      <button type="button" class="edit-insert-btn edit-insert-btn--quote" data-action="add-quote" data-pos="${position}">+ Цитата</button>
    `;

    panel.querySelector('[data-action="add-block"]').addEventListener('click', () => insertNewBlock(panel, position));
    panel.querySelector('[data-action="add-quote"]').addEventListener('click', () => insertNewQuote(panel, position));

    return panel;
  }

  function insertNewBlock(panel, position) {
    const form = document.createElement('section');
    form.className = 'bio-block bio-block--custom-new';
    form.dataset.block = 'custom_' + Date.now();
    form.dataset.isNew = 'true';
    form.innerHTML = `
      <input class="edit-input edit-input--block-title" data-field="custom-title" placeholder="Название блока" value=""/>
      <div class="bio-block__row">
        <div class="bio-block__text">
          <div class="edit-textarea-wrapper">
            <textarea class="edit-textarea" data-block="${form.dataset.block}" data-field="text" placeholder="Текст блока..."></textarea>
            <button type="button" class="ai-voice-btn" title="Голосовой ИИ-помощник">🎙️</button>
            <button type="button" class="ai-assistant-btn" title="AI помощник">AI</button>
          </div>
        </div>
        <div class="bio-block__photo bio-block__photo--empty-edit" style="position:relative;"></div>
      </div>
    `;

    // Кнопка загрузки фото
    const photoDiv = form.querySelector('.bio-block__photo');
    addPhotoUploadBtn(photoDiv, 'block-photo', form.dataset.block);

    // Кнопка удаления
    const delBtn = document.createElement('button');
    delBtn.className = 'edit-insert-btn edit-insert-btn--delete';
    delBtn.textContent = '🗑 Удалить блок';
    delBtn.addEventListener('click', () => animateRemove(form));
    form.appendChild(delBtn);

    panel.after(form);
    animateInsert(form);
  }

  function insertNewQuote(panel, position) {
    const quote = document.createElement('blockquote');
    quote.className = 'bio-quote bio-quote--new';
    quote.dataset.isNew = 'true';
    quote.dataset.position = position;
    quote.innerHTML = `
      <div class="edit-textarea-wrapper">
        <textarea class="edit-textarea edit-textarea--quote" data-field="quote" placeholder="Введите цитату..."></textarea>
        <button type="button" class="ai-voice-btn" title="Голосовой ИИ-помощник">🎙️</button>
        <button type="button" class="ai-assistant-btn" title="AI помощник">AI</button>
      </div>
      <button type="button" class="edit-insert-btn edit-insert-btn--delete">🗑 Удалить</button>
    `;

    quote.querySelector('.edit-insert-btn--delete').addEventListener('click', () => animateRemove(quote));
    panel.after(quote);
    animateInsert(quote);
  }

  /* ── Кнопка добавления фото в галерею ── */
  function addGalleryUploadBtn() {
    const section = document.getElementById('gallery-section');
    if (!section) return;

    // Считаем текущие фото
    const slides = section.querySelectorAll('.gallery-slide');
    const currentCount = slides.length;

    if (currentCount >= 10) return; // лимит

    const panel = document.createElement('div');
    panel.className = 'edit-gallery-add';
    panel.innerHTML = `
      <label class="edit-gallery-add__label">
        <input type="file" accept="image/*" multiple class="edit-gallery-add__input" hidden/>
        <span class="edit-gallery-add__btn">📷 Добавить фото в галерею (${currentCount}/10)</span>
      </label>
      <span class="edit-gallery-add__status"></span>
    `;

    section.appendChild(panel);

    const fileInput = panel.querySelector('input[type="file"]');
    fileInput.addEventListener('change', () => handleGalleryUpload(fileInput, panel, section));
  }

  async function handleGalleryUpload(input, panel, section) {
    const files = Array.from(input.files);
    if (!files.length) return;

    const slides = section.querySelectorAll('.gallery-slide');
    const currentCount = slides.length;
    const remaining = 10 - currentCount;

    if (remaining <= 0) {
      alert('Галерея уже содержит 10 фото (максимум)');
      return;
    }

    const toUpload = files.slice(0, remaining);
    const status = panel.querySelector('.edit-gallery-add__status');
    status.textContent = `⏳ Загружаю ${toUpload.length} фото...`;

    const base = window.location.port === '3000' ? '' : 'http://localhost:3000';
    const uploadedUrls = [];

    for (const file of toUpload) {
      const formData = new FormData();
      formData.append('photo', file);

      try {
        const res = await fetch(`${base}/api/upload-photo`, { method: 'POST', body: formData });
        const json = await res.json();
        if (json.ok && json.url) {
          uploadedUrls.push(json.url);
        }
      } catch (_) {}
    }

    if (uploadedUrls.length) {
      status.textContent = `✅ Загружено ${uploadedUrls.length} фото. Сохраните чтобы применить.`;
      // Сохраняем URL в data-атрибут для сбора при сохранении
      const existing = panel.dataset.newPhotos ? JSON.parse(panel.dataset.newPhotos) : [];
      panel.dataset.newPhotos = JSON.stringify([...existing, ...uploadedUrls]);

      // Обновляем счётчик
      const btn = panel.querySelector('.edit-gallery-add__btn');
      const newTotal = currentCount + uploadedUrls.length;
      btn.textContent = `📷 Добавить фото в галерею (${newTotal}/10)`;

      // лёгкое подтверждение загрузки
      if (typeof gsap !== 'undefined' && !prefersReducedMotion()) {
        gsap.fromTo(btn, { scale: 1 }, { scale: 1.05, duration: 0.13, ease: 'power2.out', yoyo: true, repeat: 1, clearProps: 'transform' });
        gsap.from(status, { opacity: 0, y: 6, duration: 0.3, ease: 'power2.out' });
      }

      if (newTotal >= 10) {
        input.disabled = true;
        btn.style.opacity = '0.5';
      }
    } else {
      status.textContent = '❌ Не удалось загрузить';
    }

    input.value = '';
  }

  /* ── Кнопка загрузки фото ── */
  function addPhotoUploadBtn(container, type, blockKey) {
    const wrapper = document.createElement('div');
    wrapper.className = 'edit-photo-upload';
    wrapper.innerHTML = `
      <label class="edit-photo-upload__label">
        <input type="file" accept="image/*" class="edit-photo-upload__input" data-type="${type}" data-block="${blockKey}" hidden/>
        <span class="edit-photo-upload__btn">📷 ${container.querySelector('img') ? 'Заменить фото' : 'Добавить фото'}</span>
      </label>
      <span class="edit-photo-upload__status"></span>
    `;
    container.appendChild(wrapper);

    const fileInput = wrapper.querySelector('input[type="file"]');
    fileInput.addEventListener('change', () => handleFileSelect(fileInput, container, blockKey));
  }

  /* ── Загрузка файла на сервер ── */
  async function handleFileSelect(input, container, blockKey) {
    const file = input.files[0];
    if (!file) return;

    const status = input.closest('.edit-photo-upload').querySelector('.edit-photo-upload__status');
    status.textContent = '⏳ Загружаю...';

    const formData = new FormData();
    formData.append('photo', file);

    try {
      const base = window.location.port === '3000' ? '' : 'http://localhost:3000';
      const res = await fetch(`${base}/api/upload-photo`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();

      if (json.ok && json.url) {
        status.textContent = '✅ Загружено';
        // Обновляем превью
        let img = container.querySelector('img');
        if (!img) {
          img = document.createElement('img');
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;border-radius:6px;';
          container.insertBefore(img, container.firstChild);
        }
        img.src = json.url;
        animatePhotoIn(img);

        // Сохраняем URL в data-атрибут для сбора при сохранении
        container.dataset.uploadedUrl = json.url;
      } else {
        status.textContent = '❌ ' + (json.error || 'Ошибка');
      }
    } catch (err) {
      status.textContent = '❌ Сервер недоступен';
    }
  }

  /* ── Собираем данные из инпутов и отправляем PUT ── */
  async function saveChanges() {
    const saveBtn = document.getElementById('edit-save-btn');
    saveBtn.textContent = '⏳ Сохраняю...';
    saveBtn.disabled = true;

    const data = {
      name: '',
      dates: '',
      bio: '',
      photo: '',
      sections: {},
      quotes: [],
    };

    // Hero
    const nameInput = document.querySelector('[data-field="name"]');
    const datesInput = document.querySelector('[data-field="dates"]');
    const bioInput = document.querySelector('[data-field="bio"]');
    const photoWrap = document.querySelector('.person-header__photo');

    data.name = nameInput?.value?.trim() || originalData.name;
    data.dates = datesInput?.value?.trim() || originalData.dates;
    data.bio = bioInput?.value?.trim() || originalData.bio;
    data.photo = photoWrap?.dataset?.uploadedUrl || photoWrap?.querySelector('img')?.src || originalData.photo;

    // Пол
    const activeGenderBtn = document.querySelector('.edit-gender__btn--active');
    data.gender = activeGenderBtn?.dataset?.gender || '';

    // Город
    const cityInput = document.querySelector('[data-field="city"]');
    data.city = cityInput?.value?.trim() || '';

      // Видимость
      const visSelect = document.querySelector('[data-field="visibility"]');
      data.visibility = visSelect?.value || originalData.visibility || '';

    // Блоки — собираем ВСЕ в порядке DOM (включая кастомные)
    const bioBlocksContainer = document.getElementById('bio-blocks-container');
    const allBlockElements = bioBlocksContainer ? bioBlocksContainer.querySelectorAll('.bio-block') : [];
    const orderedBlocks = [];

    allBlockElements.forEach((block) => {
      const key = block.dataset.block || '';
      const isNew = block.dataset.isNew === 'true';

      // Кастомный блок — берём title из инпута
      let title = '';
      if (isNew) {
        const titleInput = block.querySelector('[data-field="custom-title"]');
        title = titleInput?.value?.trim() || 'Без названия';
      } else {
        title = originalData.sections[key]?.title || '';
      }

      const textArea = block.querySelector('[data-field="text"]');
      const photoDiv = block.querySelector('.bio-block__photo');

      const text = textArea?.value?.trim() || '';
      const image = photoDiv?.dataset?.uploadedUrl || photoDiv?.querySelector('img')?.src || '';

      if (text) {
        orderedBlocks.push({ key: isNew ? 'custom' : key, title, text, image });
      }
    });

    data.orderedBlocks = orderedBlocks;

    // Цитаты — собираем все (старые + новые) в порядке DOM
    const allQuotes = bioBlocksContainer ? bioBlocksContainer.querySelectorAll('.bio-quote textarea, [data-field="quote"]') : [];
    allQuotes.forEach(el => {
      const text = el.value?.trim();
      if (text) data.quotes.push({ text, after: '' });
    });

    // Новые фото галереи
    const galleryPanel = document.querySelector('.edit-gallery-add');
    if (galleryPanel && galleryPanel.dataset.newPhotos) {
      try {
        data.newGalleryPhotos = JSON.parse(galleryPanel.dataset.newPhotos);
      } catch (_) {}
    }

    // PUT запрос
    try {
      const base = window.location.port === '3000' ? '' : 'http://localhost:3000';
      const res = await fetch(`${base}/api/profiles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      if (json.ok) {
        // Убираем ?edit=1 из URL и перезагружаем
        const cleanUrl = `person.html?id=${id}`;
        window.location.href = cleanUrl;
      } else {
        alert('Ошибка сохранения: ' + (json.error || 'Неизвестная ошибка'));
        saveBtn.textContent = '💾 Сохранить';
        saveBtn.disabled = false;
      }
    } catch (err) {
      alert('Сервер недоступен: ' + err.message);
      saveBtn.textContent = '💾 Сохранить';
      saveBtn.disabled = false;
    }
  }

  // Event delegation to catch clicks on AI assistant and voice assistant buttons (both static and dynamic)
  document.body.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('ai-assistant-btn')) {
      const wrapper = e.target.closest('.edit-textarea-wrapper');
      if (!wrapper) return;
      const textarea = wrapper.querySelector('textarea');
      if (!textarea) return;
      openAiAssistantModal(textarea);
    } else if (e.target && e.target.classList.contains('ai-voice-btn')) {
      const wrapper = e.target.closest('.edit-textarea-wrapper');
      if (!wrapper) return;
      const textarea = wrapper.querySelector('textarea');
      if (!textarea) return;
      openAiVoiceModal(textarea);
    }
  });

  /* ============================================================
     ЕДИНАЯ ДИКТОВКА ИСТОРИИ + АВТО-СТРУКТУРИРОВАНИЕ ИИ
     ============================================================ */

  function initFullStoryDictationUI() {
    // Добавляем красивый блок в начало страницы (сразу после шапки редактирования)
    const main = document.getElementById('person-main');
    if (!main) return;

    // Не дублируем, если уже есть
    if (document.getElementById('full-story-dictation')) return;

    const container = document.createElement('div');
    container.id = 'full-story-dictation';
    container.className = 'full-story-dictation';
    container.innerHTML = `
      <div class="full-story-card">
        <div class="full-story-header">
          <div class="full-story-icon">🎙️</div>
          <div>
            <h3 class="full-story-title">Расскажите историю целиком</h3>
            <p class="full-story-subtitle">Нажмите на микрофон и наговорите всё, что помните. ИИ сам разобьёт текст на разделы, придумает названия и заполнит блоки страницы памяти.</p>
          </div>
        </div>

        <div class="full-story-controls">
          <button id="full-story-mic" class="ai-voice-mic-circle" title="Начать/остановить запись">
            🎙️
          </button>
          <div class="full-story-status">
            <span id="full-story-status-text">Нажмите микрофон и расскажите историю жизни</span>
            <div id="full-story-waves" class="ai-voice-waves-container" style="display:none;">
              <div class="ai-voice-wave-bar"></div>
              <div class="ai-voice-wave-bar"></div>
              <div class="ai-voice-wave-bar"></div>
              <div class="ai-voice-wave-bar"></div>
            </div>
          </div>
        </div>

        <div class="full-story-transcript-wrapper">
          <textarea id="full-story-transcript" class="edit-textarea full-story-transcript" placeholder="Здесь появится расшифровка вашего рассказа. Можно править вручную перед отправкой в ИИ."></textarea>
        </div>

        <div class="full-story-actions">
          <button id="full-story-process" class="ai-btn ai-btn--primary" disabled>
            ✨ Обработать с помощью ИИ и заполнить блоки
          </button>
          <button id="full-story-clear" class="ai-btn ai-btn--secondary">Очистить</button>
        </div>

        <div id="full-story-result" class="full-story-result" style="display:none;">
          <div class="full-story-result-text"></div>
        </div>
      </div>
    `;

    // Вставляем в самое начало редактируемой области
    const firstChild = main.firstElementChild;
    if (firstChild) {
      main.insertBefore(container, firstChild);
    } else {
      main.appendChild(container);
    }

    // Привязываем логику
    bindFullStoryDictation(container);
  }

  function bindFullStoryDictation(container) {
    const micBtn = container.querySelector('#full-story-mic');
    const statusText = container.querySelector('#full-story-status-text');
    const waves = container.querySelector('#full-story-waves');
    const transcriptEl = container.querySelector('#full-story-transcript');
    const processBtn = container.querySelector('#full-story-process');
    const clearBtn = container.querySelector('#full-story-clear');
    const resultBox = container.querySelector('#full-story-result');

    // === LocalStorage draft persistence for the full story dictation ===
    const storageKey = `full_story_transcript_${id || 'unknown'}`;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && !transcriptEl.value) {
        transcriptEl.value = saved;
        if (saved.trim().length > 30) processBtn.disabled = false;
      }
    } catch (e) {}

    transcriptEl.addEventListener('input', () => {
      try {
        localStorage.setItem(storageKey, transcriptEl.value);
      } catch (e) {}
    });

    let recognition = null;
    let isRecording = false;
    let finalTranscript = '';

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.lang = 'ru-RU';
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        transcriptEl.value = (finalTranscript + interim).trim();
      };

      recognition.onerror = (e) => {
        statusText.textContent = 'Ошибка распознавания: ' + (e.error || 'неизвестная');
        stopRecording();
      };

      recognition.onend = () => {
        stopRecording();
      };
    }

    function startRecording() {
      if (!recognition) {
        alert('Голосовой ввод поддерживается только в Chrome, Edge или Safari.');
        return;
      }
      finalTranscript = transcriptEl.value.trim() + ' ';
      try {
        recognition.start();
        isRecording = true;
        micBtn.classList.add('ai-voice-mic-circle--listening');
        statusText.textContent = 'Слушаю... говорите';
        statusText.classList.add('ai-voice-status-text--listening');
        waves.style.display = 'flex';
        processBtn.disabled = true;
      } catch (e) {
        console.error(e);
      }
    }

    function stopRecording() {
      if (recognition && isRecording) {
        try { recognition.stop(); } catch (_) {}
      }
      isRecording = false;
      micBtn.classList.remove('ai-voice-mic-circle--listening');
      statusText.classList.remove('ai-voice-status-text--listening');
      waves.style.display = 'none';
      statusText.textContent = 'Запись остановлена. Отредактируйте текст при необходимости.';

      const hasText = transcriptEl.value.trim().length > 30;
      processBtn.disabled = !hasText;
    }

    micBtn.addEventListener('click', () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });

    transcriptEl.addEventListener('input', () => {
      const hasText = transcriptEl.value.trim().length > 30;
      processBtn.disabled = !hasText || isRecording;
    });

    clearBtn.addEventListener('click', () => {
      transcriptEl.value = '';
      finalTranscript = '';
      processBtn.disabled = true;
      resultBox.style.display = 'none';
      statusText.textContent = 'Нажмите микрофон и расскажите историю жизни';
    });

    // === Главная магия: отправляем в ИИ и применяем блоки ===
    processBtn.addEventListener('click', async () => {
      const text = transcriptEl.value.trim();
      if (text.length < 30) return;

      processBtn.disabled = true;
      processBtn.textContent = '⏳ ИИ структурирует историю...';
      resultBox.style.display = 'none';

      try {
        // Собираем контекст человека (имя и даты)
        const nameEl = document.querySelector('.person-header__name');
        const datesEl = document.querySelector('.person-header__dates');
        const context = {
          name: nameEl ? nameEl.textContent.trim() : '',
          dates: datesEl ? datesEl.textContent.trim() : ''
        };

        const res = await API.post('/api/ai/structure-bio', { text, context });

        if (res && res.ok) {
          applyStructuredBlocksToEditor(res);

          resultBox.style.display = 'block';
          resultBox.querySelector('.full-story-result-text').innerHTML = `
            <strong>Готово!</strong> ИИ создал ${res.blocks?.length || 0} блоков (включая возможные дополнительные).
            Ниже можно точно настроить, какие части рассказа в какие блоки попали.
          `;

          // === Интерактивное сопоставление источника (докрутка фичи) ===
          const originalTranscript = transcriptEl.value.trim();
          renderRefinementMapping(resultBox, originalTranscript, res);

          statusText.textContent = 'Блоки заполнены. Используйте панель ниже для точной подгонки.';
        } else {
          throw new Error(res?.error || 'Не удалось структурировать');
        }
      } catch (err) {
        alert('Ошибка обработки ИИ: ' + (err.message || err));
        statusText.textContent = 'Произошла ошибка. Попробуйте ещё раз.';
      } finally {
        processBtn.textContent = '✨ Обработать с помощью ИИ и заполнить блоки';
        processBtn.disabled = false;
      }
    });
  }

  /**
   * Применяет результат /api/ai/structure-bio к текущим редактируемым полям.
   * Заполняет короткое bio + стандартные и кастомные блоки.
   * Дополнительно: сохраняет excerpts для отображения источника.
   */
  let lastStructuredResult = null; // храним для refinement UI

  function applyStructuredBlocksToEditor(structured) {
    if (!structured) return;
    lastStructuredResult = structured;

    // 1. Короткая биография (hero)
    if (structured.bio) {
      const bioTextarea = document.querySelector('textarea[data-field="bio"]');
      if (bioTextarea) bioTextarea.value = structured.bio;
    }

    const blocks = Array.isArray(structured.blocks) ? structured.blocks : [];
    const blockElements = Array.from(document.querySelectorAll('.bio-block'));

    blocks.forEach((b) => {
      if (!b || !b.text) return;

      const key = (b.key || '').toLowerCase();
      const desiredTitle = b.title || '';
      const desiredText = b.text;

      let targetBlock = null;

      if (key && !key.startsWith('custom')) {
        targetBlock = blockElements.find(el => {
          const blockAttr = el.dataset.block || '';
          const titleInput = el.querySelector('.edit-input--block-title');
          return blockAttr.includes(key) ||
                 (titleInput && titleInput.value.toLowerCase().includes(key));
        });
      }

      if (!targetBlock) {
        targetBlock = blockElements.find(el => {
          const titleInput = el.querySelector('.edit-input--block-title');
          return titleInput && titleInput.value.trim() === '' && el.classList.contains('bio-block--custom-new');
        }) || blockElements.find(el => {
          const titleInput = el.querySelector('.edit-input--block-title');
          return titleInput && desiredTitle &&
                 titleInput.value.toLowerCase().includes(desiredTitle.toLowerCase().slice(0, 6));
        });
      }

      if (targetBlock) {
        const titleInput = targetBlock.querySelector('.edit-input--block-title');
        if (titleInput && desiredTitle) titleInput.value = desiredTitle;

        const textArea = targetBlock.querySelector('textarea[data-field="text"], textarea[data-block]');
        if (textArea) textArea.value = desiredText;

        // Добавляем маленькую подсказку-источник (excerpt), если пришла от ИИ
        if (b.excerpt) {
          let note = targetBlock.querySelector('.ai-source-note');
          if (!note) {
            note = document.createElement('div');
            note.className = 'ai-source-note';
            note.style.cssText = 'font-size:11px;opacity:0.6;margin-top:4px;font-style:italic;';
            targetBlock.appendChild(note);
          }
          note.textContent = 'Основано на: «' + b.excerpt.slice(0, 110) + (b.excerpt.length > 110 ? '...' : '') + '»';
        }
      } else {
        const container = document.getElementById('bio-blocks-container');
        if (container) {
          const bioBlocks = container.querySelector('.bio-blocks') || container;
          const newBlock = createCustomBlockElement(desiredTitle, desiredText);
          bioBlocks.appendChild(newBlock);
        }
      }
    });
  }

  function createCustomBlockElement(title, text) {
    const esc = (s) => String(s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
    const section = document.createElement('section');
    section.className = 'bio-block bio-block--custom-new';
    section.dataset.block = 'custom_' + Date.now();
    section.innerHTML = `
      <input class="edit-input edit-input--block-title" data-field="custom-title" value="${esc(title || 'Дополнительный раздел')}">
      <div class="bio-block__row">
        <div class="bio-block__text">
          <div class="edit-textarea-wrapper">
            <textarea class="edit-textarea" data-field="text">${esc(text || '')}</textarea>
            <button type="button" class="ai-voice-btn" title="Голосовой ИИ-помощник">🎙️</button>
            <button type="button" class="ai-assistant-btn" title="AI помощник">AI</button>
          </div>
        </div>
        <div class="bio-block__photo bio-block__photo--empty-edit" style="position:relative;"></div>
      </div>
    `;

    const delBtn = document.createElement('button');
    delBtn.className = 'edit-insert-btn edit-insert-btn--delete';
    delBtn.textContent = '🗑 Удалить блок';
    delBtn.addEventListener('click', () => section.remove());
    section.appendChild(delBtn);

    return section;
  }

  /**
   * Интерактивная панель сопоставления источника (одна из ключевых докруток).
   * Позволяет пользователю видеть, какие части рассказа куда попали,
   * и вручную "добавить этот кусок в блок".
   */
  function renderRefinementMapping(resultContainer, originalText, structured) {
    if (!originalText || !structured) return;

    let mappingArea = resultContainer.querySelector('.refinement-mapping');
    if (mappingArea) mappingArea.remove();

    mappingArea = document.createElement('div');
    mappingArea.className = 'refinement-mapping';
    mappingArea.style.cssText = 'margin-top:18px;border-top:1px solid rgba(200,168,75,0.15);padding-top:16px;';

    const blocks = structured.blocks || [];
    const blockTitles = blocks.map(b => b.title || b.key).filter(Boolean);

    // Разбиваем оригинальный текст на осмысленные куски
    const chunks = originalText
      .split(/\n\s*\n|(?<=[\.\!\?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 12);

    let html = `<div style="font-weight:600;margin-bottom:8px;font-size:0.95rem;">Точная подгонка источника</div>`;
    html += `<div style="font-size:0.8rem;opacity:0.7;margin-bottom:10px;">Нажмите кнопку под куском текста, чтобы добавить его в нужный блок (или создать новый custom).</div>`;

    html += `<div class="source-chunks">`;

    chunks.forEach((chunk, idx) => {
      const safeChunk = chunk.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      html += `
        <div class="source-chunk" style="margin-bottom:10px;padding:8px 10px;background:rgba(255,255,255,0.02);border-radius:8px;">
          <div style="font-size:13px;line-height:1.4;margin-bottom:6px;">${safeChunk}</div>
          <div class="chunk-actions" style="display:flex;flex-wrap:wrap;gap:4px;">
      `;

      // Кнопки для существующих блоков от ИИ
      blocks.forEach((b, bIdx) => {
        const label = (b.title || b.key || 'Блок').slice(0, 22);
        html += `<button class="chunk-assign-btn" data-chunk="${idx}" data-target="${bIdx}" style="font-size:11px;padding:2px 7px;border-radius:6px;border:1px solid rgba(200,168,75,0.3);background:transparent;cursor:pointer;">${label}</button>`;
      });

      // Кнопка для нового custom
      html += `<button class="chunk-assign-btn new-custom" data-chunk="${idx}" style="font-size:11px;padding:2px 7px;border-radius:6px;border:1px dashed rgba(200,168,75,0.5);background:transparent;cursor:pointer;">+ Новый блок</button>`;

      html += `</div></div>`;
    });

    html += `</div>`;
    mappingArea.innerHTML = html;
    resultContainer.appendChild(mappingArea);

    // Привязываем обработчики назначения кусков
    mappingArea.querySelectorAll('.chunk-assign-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const chunkIdx = parseInt(btn.dataset.chunk);
        const chunkText = chunks[chunkIdx];
        if (!chunkText) return;

        if (btn.classList.contains('new-custom')) {
          // Создаём новый custom блок и добавляем туда текст
          const container = document.getElementById('bio-blocks-container');
          if (container) {
            const bioBlocks = container.querySelector('.bio-blocks') || container;
            const newBlock = createCustomBlockElement('Дополнительный эпизод', chunkText);
            bioBlocks.appendChild(newBlock);
            btn.textContent = '✓ Добавлено';
            btn.disabled = true;
          }
        } else {
          const targetBlockIdx = parseInt(btn.dataset.target);
          const targetBlockData = blocks[targetBlockIdx];
          if (!targetBlockData) return;

          // Ищем соответствующий редактируемый блок на странице и дописываем текст
          const allBlocks = Array.from(document.querySelectorAll('.bio-block'));
          let found = false;

          allBlocks.forEach(el => {
            const titleInput = el.querySelector('.edit-input--block-title');
            const textArea = el.querySelector('textarea[data-field="text"], textarea[data-block]');

            if (titleInput && textArea) {
              const currentTitle = (titleInput.value || '').toLowerCase();
              const targetTitle = (targetBlockData.title || '').toLowerCase();

              if (currentTitle.includes(targetTitle.slice(0, 8)) || currentTitle.includes(targetBlockData.key)) {
                const separator = textArea.value.trim() ? '\n\n' : '';
                textArea.value = (textArea.value + separator + chunkText).trim();
                found = true;
                btn.textContent = '✓ Добавлено';
                btn.disabled = true;
              }
            }
          });

          if (!found) {
            // Fallback: создаём custom
            const container = document.getElementById('bio-blocks-container');
            if (container) {
              const bioBlocks = container.querySelector('.bio-blocks') || container;
              const newBlock = createCustomBlockElement(targetBlockData.title || 'Из рассказа', chunkText);
              bioBlocks.appendChild(newBlock);
              btn.textContent = '✓ В новый блок';
              btn.disabled = true;
            }
          }
        }
      });
    });
  }

  /* ── AI Voice Assistant Popup Modal ── */
  function openAiVoiceModal(textarea) {
    const originalText = textarea.value.trim();
    const field = textarea.dataset.block || textarea.dataset.field || 'text';
    
    // Check if the overlay already exists
    let overlay = document.querySelector('.ai-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.className = 'ai-overlay';
    
    overlay.innerHTML = `
      <div class="ai-modal">
        <button class="ai-modal__close" title="Закрыть">✕</button>
        <div class="ai-modal__header">
          <h3 class="ai-modal__title">🎙️ Голосовой ввод ИИ</h3>
        </div>
        <div class="ai-modal__body" id="ai-voice-body"></div>
        <div class="ai-modal__footer" id="ai-voice-footer"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    const voiceBody = overlay.querySelector('#ai-voice-body');
    const voiceFooter = overlay.querySelector('#ai-voice-footer');
    const closeBtn = overlay.querySelector('.ai-modal__close');

    // Initialize Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let isRecording = false;
    let finalTranscript = '';
    let voiceMessages = [];
    let lastProposedText = '';
    let timerInterval = null;
    let recordStartTime = 0;
    const MAX_RECORD_TIME_MS = 3 * 60 * 1000; // 3 minutes maximum
    const CIRCLE_CIRCUMFERENCE = 276.46; // 2 * PI * 44

    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.lang = 'ru-RU';
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onstart = () => {
        isRecording = true;
        recordStartTime = Date.now();
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(updateProgress, 100);
        updateRecordingUI(true);
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        const box = voiceBody.querySelector('.ai-voice-transcript-box');
        if (box) {
          box.textContent = finalTranscript + interimTranscript;
          box.scrollTop = box.scrollHeight;
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        const statusTextEl = voiceBody.querySelector('.ai-voice-status-text');
        if (statusTextEl) {
          if (event.error === 'not-allowed') {
            statusTextEl.textContent = 'Доступ к микрофону заблокирован';
            statusTextEl.classList.remove('ai-voice-status-text--listening');
          } else {
            statusTextEl.textContent = 'Ошибка ввода: ' + event.error;
          }
        }
      };

      recognition.onend = () => {
        isRecording = false;
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        updateRecordingUI(false);
      };
    }

    // Cleanup & Close Handlers
    function cleanup() {
      if (recognition && isRecording) {
        try { recognition.stop(); } catch(e){}
      }
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      overlay.remove();
    }

    closeBtn.addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup();
    });

    // Start in phase 1 (Recording)
    showPhase1Recording();

    // --- PHASE 1: Recording UI ---
    function showPhase1Recording() {
      finalTranscript = '';
      
      voiceBody.innerHTML = `
        <div class="ai-voice-container">
          <div class="ai-voice-mic-wrapper">
            <button class="ai-voice-mic-circle" id="ai-mic-trigger">🎙️</button>
            <svg class="ai-voice-progress-svg" width="96" height="96" viewBox="0 0 96 96">
              <circle class="ai-voice-progress-bg" cx="48" cy="48" r="44" stroke-width="4" fill="transparent" />
              <circle class="ai-voice-progress-bar" cx="48" cy="48" r="44" stroke-width="4" fill="transparent" stroke-dasharray="276.46" stroke-dashoffset="276.46" stroke-linecap="round" />
            </svg>
            <div class="ai-voice-mic-pulse-ring"></div>
          </div>
          <h4 class="ai-voice-status-text" id="ai-voice-status">Нажмите на микрофон, чтобы говорить</h4>
          
          <div class="ai-voice-waves-container">
            <div class="ai-voice-wave-bar"></div>
            <div class="ai-voice-wave-bar"></div>
            <div class="ai-voice-wave-bar"></div>
            <div class="ai-voice-wave-bar"></div>
            <div class="ai-voice-wave-bar"></div>
            <div class="ai-voice-wave-bar"></div>
            <div class="ai-voice-wave-bar"></div>
            <div class="ai-voice-wave-bar"></div>
            <div class="ai-voice-wave-bar"></div>
          </div>

          <div class="ai-voice-transcript-box" id="ai-voice-live-transcript"></div>
          <p class="ai-voice-instruction">Скажите вашу историю или воспоминание в микрофон.</p>
        </div>
      `;

      voiceFooter.innerHTML = `
        <div class="ai-action-buttons">
          <button class="ai-btn ai-btn--secondary" id="ai-btn-voice-cancel">Отмена</button>
          <button class="ai-btn ai-btn--primary" id="ai-btn-voice-done" disabled>⏹️ Готово</button>
        </div>
      `;

      const micBtn = voiceBody.querySelector('#ai-mic-trigger');
      const doneBtn = voiceFooter.querySelector('#ai-btn-voice-done');
      const cancelBtn = voiceFooter.querySelector('#ai-btn-voice-cancel');

      if (!recognition) {
        const statusEl = voiceBody.querySelector('#ai-voice-status');
        statusEl.textContent = 'Голосовой ввод не поддерживается вашим браузером';
        micBtn.disabled = true;
        micBtn.style.opacity = '0.5';
        const box = voiceBody.querySelector('#ai-voice-live-transcript');
        box.innerHTML = '<span style="color: #ff6666;">Используйте Google Chrome или Safari для работы голосового ввода.</span>';
      }

      micBtn.addEventListener('click', () => {
        if (!recognition) return;
        if (isRecording) {
          recognition.stop();
        } else {
          finalTranscript = '';
          const box = voiceBody.querySelector('#ai-voice-live-transcript');
          if (box) box.textContent = '';
          try {
            recognition.start();
          } catch(e) {
            console.error('Failed to start recognition', e);
          }
        }
      });

      doneBtn.addEventListener('click', () => {
        if (recognition && isRecording) {
          recognition.stop();
        }
        const text = voiceBody.querySelector('#ai-voice-live-transcript').textContent.trim();
        showPhase2Verification(text);
      });

      cancelBtn.addEventListener('click', cleanup);
    }

    function updateRecordingUI(active) {
      const micBtn = voiceBody.querySelector('#ai-mic-trigger');
      const statusEl = voiceBody.querySelector('#ai-voice-status');
      const doneBtn = voiceFooter.querySelector('#ai-btn-voice-done');

      if (!micBtn || !statusEl) return;

      if (active) {
        micBtn.classList.add('ai-voice-mic-circle--listening');
        statusEl.textContent = 'Слушаю вас...';
        statusEl.classList.add('ai-voice-status-text--listening');
        if (doneBtn) doneBtn.disabled = false;
      } else {
        micBtn.classList.remove('ai-voice-mic-circle--listening');
        statusEl.textContent = 'Запись остановлена. Нажмите Готово.';
        statusEl.classList.remove('ai-voice-status-text--listening');
        
        // Reset progress bar on stop
        const progressBar = voiceBody.querySelector('.ai-voice-progress-bar');
        if (progressBar) {
          progressBar.style.strokeDashoffset = CIRCLE_CIRCUMFERENCE;
        }
      }
    }

    function updateProgress() {
      if (!isRecording) return;
      const elapsed = Date.now() - recordStartTime;
      const pct = Math.min(elapsed / MAX_RECORD_TIME_MS, 1);
      const offset = CIRCLE_CIRCUMFERENCE - (pct * CIRCLE_CIRCUMFERENCE);
      
      const progressBar = voiceBody.querySelector('.ai-voice-progress-bar');
      if (progressBar) {
        progressBar.style.strokeDashoffset = offset;
      }
      
      const statusEl = voiceBody.querySelector('#ai-voice-status');
      if (statusEl) {
        const remainingMs = Math.max(MAX_RECORD_TIME_MS - elapsed, 0);
        const remainingSecs = Math.ceil(remainingMs / 1000);
        const mins = Math.floor(remainingSecs / 60);
        const secs = remainingSecs % 60;
        const formattedSecs = secs < 10 ? '0' + secs : secs;
        statusEl.textContent = `Слушаю вас... (${mins}:${formattedSecs})`;
      }
      
      if (elapsed >= MAX_RECORD_TIME_MS) {
        if (recognition && isRecording) {
          recognition.stop();
        }
      }
    }

    // --- PHASE 2: Verification UI ---
    function showPhase2Verification(text) {
      voiceBody.innerHTML = `
        <div class="ai-initial-panel">
          <div class="ai-initial-panel__icon">📝</div>
          <h4 style="font-family: var(--font-display); font-size: 18px; color: var(--gold-light); margin-bottom: 0px; text-align: center;">Правильно ли записан текст?</h4>
          <div class="ai-initial-panel__text" style="text-align: center; margin-bottom: 12px;">
            Вы можете отредактировать распознанный текст ниже, если заметили неточности.
          </div>
          <textarea class="edit-textarea" id="ai-voice-verify-text" placeholder="Здесь будет записанный текст..." style="width: 100%; min-height: 120px; font-size: 14px; line-height: 1.6;">${escHtml(text)}</textarea>
        </div>
      `;

      voiceFooter.innerHTML = `
        <div class="ai-action-buttons">
          <button class="ai-btn ai-btn--secondary" id="ai-btn-voice-retry">🎙️ Записать заново</button>
          <button class="ai-btn ai-btn--primary" id="ai-btn-voice-verify-next">Да, всё верно →</button>
        </div>
      `;

      const verifyTextarea = voiceBody.querySelector('#ai-voice-verify-text');
      const retryBtn = voiceFooter.querySelector('#ai-btn-voice-retry');
      const nextBtn = voiceFooter.querySelector('#ai-btn-voice-verify-next');

      retryBtn.addEventListener('click', () => {
        showPhase1Recording();
      });

      nextBtn.addEventListener('click', () => {
        const editedText = verifyTextarea.value.trim();
        if (!editedText) {
          alert('Пожалуйста, введите или наговорите текст.');
          return;
        }
        showPhase3BeautifyPrompt(editedText);
      });
    }

    // --- PHASE 3: Beautify Choice UI ---
    function showPhase3BeautifyPrompt(verifiedText) {
      voiceBody.innerHTML = `
        <div class="ai-initial-panel" style="text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px;">
          <div class="ai-initial-panel__icon" style="font-size: 42px; margin-bottom: 5px;">✨</div>
          <h4 style="font-family: var(--font-display); font-size: 19px; color: var(--gold-light); margin: 0;">Сделать текст красивее?</h4>
          <div class="ai-initial-panel__text" style="max-width: 90%; line-height: 1.6; color: rgba(255,255,255,0.75);">
            ИИ может исправить речевые ошибки, придать тексту красивый, гладкий, уважительный литературный слог, сохраняя все детали вашей истории.
          </div>
          <div class="ai-preview-box" style="text-align: left; width: 100%; max-height: 100px; overflow-y: auto; font-size: 13.5px; border-color: rgba(200, 168, 75, 0.2);">
            ${escHtml(verifiedText)}
          </div>
        </div>
      `;

      voiceFooter.innerHTML = `
        <div class="ai-action-buttons" style="width: 100%; display: flex; gap: 10px;">
          <button class="ai-btn ai-btn--secondary" id="ai-btn-voice-skip-beautify" style="flex: 1;">Нет, вставить как есть</button>
          <button class="ai-btn ai-btn--primary" id="ai-btn-voice-beautify" style="flex: 1;">✨ Сделать красивее</button>
        </div>
      `;

      const skipBtn = voiceFooter.querySelector('#ai-btn-voice-skip-beautify');
      const beautifyBtn = voiceFooter.querySelector('#ai-btn-voice-beautify');

      skipBtn.addEventListener('click', () => {
        textarea.value = verifiedText;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        cleanup();
      });

      beautifyBtn.addEventListener('click', async () => {
        voiceMessages = [
          { role: 'user', content: `Пожалуйста, улучши этот текст (сделай его более связным, грамотным, красивым и литературным), сохраняя все факты:\n\n${verifiedText}` }
        ];
        showPhase4BeautifyLoading(verifiedText);
      });
    }

    // --- PHASE 4: Loading Screen ---
    function showPhase4BeautifyLoading(verifiedText) {
      voiceBody.innerHTML = `
        <div class="ai-initial-panel" style="text-align: center; padding: 30px 10px;">
          <div class="ai-thinking" style="font-size: 16px; justify-content: center; display: flex; align-items: center; gap: 8px;">
            ИИ делает текст красивее
            <div class="ai-thinking__dots">
              <div class="ai-thinking__dot"></div>
              <div class="ai-thinking__dot"></div>
              <div class="ai-thinking__dot"></div>
            </div>
          </div>
          <p style="color: rgba(255,255,255,0.4); font-size: 12px; margin-top: 15px;">Это займёт всего несколько секунд...</p>
        </div>
      `;
      voiceFooter.innerHTML = '';

      triggerBeautifyRequest(verifiedText);
    }

    async function triggerBeautifyRequest(verifiedText) {
      const personName = document.querySelector('.person-header__name')?.textContent?.trim() || '';
      const personDates = document.querySelector('.person-header__dates')?.textContent?.trim() || '';
      const fullContext = { name: personName, dates: personDates, originalText: verifiedText, field: field };

      const base = window.location.port === '3000' ? '' : 'http://localhost:3000';
      try {
        const res = await fetch(`${base}/api/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: voiceMessages,
            context: fullContext
          })
        });

        const json = await res.json().catch(() => ({}));
        if (res.status === 429) {
          const sec = json.retryAfter || 60;
          alert(`⏳ Слишком много генераций. Подождите ${sec} секунд.`);
          showPhase3BeautifyPrompt(verifiedText);
          return;
        }

        if (res.ok && json.ok) {
          const polishedText = json.proposedText || json.chatResponse || '';
          // Push assistant response to conversational messages
          voiceMessages.push({ role: 'assistant', content: polishedText });
          showPhase5ReviewPolished(verifiedText, polishedText);
        } else {
          alert('Ошибка ИИ: ' + (json.error || 'Не удалось обработать текст.'));
          showPhase3BeautifyPrompt(verifiedText);
        }
      } catch (err) {
        alert('Не удалось связаться с сервером: ' + err.message);
        showPhase3BeautifyPrompt(verifiedText);
      }
    }

    // --- PHASE 5: Review & Refinement UI ---
    function showPhase5ReviewPolished(verifiedText, polishedText) {
      lastProposedText = polishedText;

      voiceBody.innerHTML = `
        <div class="ai-voice-diff-container">
          <div class="ai-voice-diff-item">
            <div class="ai-voice-diff-label">🎙️ Было записано:</div>
            <div class="ai-voice-diff-text" style="opacity: 0.75; font-size: 13px;">${escHtml(verifiedText)}</div>
          </div>
          
          <div class="ai-voice-diff-item" style="border-color: rgba(16, 185, 129, 0.2); background: rgba(16, 185, 129, 0.02);">
            <div class="ai-voice-diff-label" style="color: #10b981;">✨ Вариант от ИИ:</div>
            <textarea class="edit-textarea" id="ai-voice-polished-text" style="width: 100%; min-height: 100px; font-size: 13.5px; line-height: 1.6; margin-top: 5px; padding: 8px; border-color: rgba(16, 185, 129, 0.3);">${escHtml(polishedText)}</textarea>
          </div>
        </div>
      `;

      voiceFooter.innerHTML = `
        <div class="ai-footer-refinement" style="width: 100%; display: flex; flex-direction: column; gap: 8px;">
          <div class="ai-input-row" style="display: flex; gap: 6px;">
            <textarea class="ai-textarea" id="ai-voice-chat-input" placeholder="Хотите подправить? (например: 'сделай короче', 'убери упоминание Москвы')"></textarea>
            <button class="ai-btn ai-btn--send" id="ai-btn-voice-refine-send" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          </div>
          <div class="ai-action-buttons">
            <button class="ai-btn ai-btn--secondary" id="ai-btn-voice-back-to-original">⬅️ К оригиналу</button>
            <button class="ai-btn ai-btn--primary" id="ai-btn-voice-apply">💾 Вставить текст</button>
          </div>
        </div>
      `;

      const polishedTextarea = voiceBody.querySelector('#ai-voice-polished-text');
      const refineInput = voiceFooter.querySelector('#ai-voice-chat-input');
      const refineSendBtn = voiceFooter.querySelector('#ai-btn-voice-refine-send');
      const backBtn = voiceFooter.querySelector('#ai-btn-voice-back-to-original');
      const applyBtn = voiceFooter.querySelector('#ai-btn-voice-apply');

      // Enable send button based on text
      refineInput.addEventListener('input', () => {
        refineSendBtn.disabled = !refineInput.value.trim();
      });

      backBtn.addEventListener('click', () => {
        showPhase2Verification(verifiedText);
      });

      applyBtn.addEventListener('click', () => {
        const finalVal = polishedTextarea.value.trim();
        textarea.value = finalVal;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        cleanup();
      });

      async function handleRefinement() {
        const query = refineInput.value.trim();
        if (!query) return;

        refineInput.value = '';
        refineSendBtn.disabled = true;

        // Push refinement instruction to conversation history
        voiceMessages.push({ role: 'user', content: query });
        
        // Show loading spinner
        voiceBody.innerHTML = `
          <div class="ai-initial-panel" style="text-align: center; padding: 35px 10px;">
            <div class="ai-thinking" style="font-size: 16px; justify-content: center; display: flex; align-items: center; gap: 8px;">
              ИИ переписывает текст
              <div class="ai-thinking__dots">
                <div class="ai-thinking__dot"></div>
                <div class="ai-thinking__dot"></div>
                <div class="ai-thinking__dot"></div>
              </div>
            </div>
            <p style="color: rgba(255,255,255,0.4); font-size: 12px; margin-top: 15px;">Пожелание: "${escHtml(query)}"</p>
          </div>
        `;
        voiceFooter.innerHTML = '';

        const personName = document.querySelector('.person-header__name')?.textContent?.trim() || '';
        const personDates = document.querySelector('.person-header__dates')?.textContent?.trim() || '';
        const fullContext = { name: personName, dates: personDates, originalText: verifiedText, field: field };

        const base = window.location.port === '3000' ? '' : 'http://localhost:3000';
        try {
          const res = await fetch(`${base}/api/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: voiceMessages,
              context: fullContext
            })
          });

          const json = await res.json().catch(() => ({}));
          if (res.ok && json.ok) {
            const nextPolished = json.proposedText || json.chatResponse || '';
            voiceMessages.push({ role: 'assistant', content: nextPolished });
            showPhase5ReviewPolished(verifiedText, nextPolished);
          } else {
            alert('Ошибка ИИ: ' + (json.error || 'Не удалось применить правку.'));
            showPhase5ReviewPolished(verifiedText, polishedText);
          }
        } catch (err) {
          alert('Не удалось связаться с сервером: ' + err.message);
          showPhase5ReviewPolished(verifiedText, polishedText);
        }
      }

      refineSendBtn.addEventListener('click', handleRefinement);
      refineInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleRefinement();
        }
      });
    }
  }

  /* ── AI Assistant Popup Modal ── */
  function openAiAssistantModal(textarea) {
    const originalText = textarea.value.trim();
    const field = textarea.dataset.block || textarea.dataset.field || 'text';
    
    // Check if the overlay already exists
    let overlay = document.querySelector('.ai-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.className = 'ai-overlay';
    
    overlay.innerHTML = `
      <div class="ai-modal">
        <button class="ai-modal__close" title="Закрыть">✕</button>
        <div class="ai-modal__header">
          <h3 class="ai-modal__title">✨ ИИ-помощник «Память»</h3>
        </div>
        <div class="ai-modal__body" id="ai-modal-body"></div>
        <div class="ai-modal__footer" id="ai-modal-footer"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    const modalBody = overlay.querySelector('#ai-modal-body');
    const modalFooter = overlay.querySelector('#ai-modal-footer');
    const closeBtn = overlay.querySelector('.ai-modal__close');

    // Close handlers
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    let messages = []; // Chat history
    let lastProposedText = '';

    // Initialize state
    if (originalText) {
      // Scenario 1: Text already entered
      showScenario1InitialState();
    } else {
      // Scenario 2: Text is empty
      showScenario2Step1();
    }

    function addMessage(role, content) {
      const bubble = document.createElement('div');
      bubble.className = `ai-chat-bubble ai-chat-bubble--${role === 'assistant' ? 'assistant' : 'user'}`;
      bubble.innerText = content;
      modalBody.appendChild(bubble);
      modalBody.scrollTop = modalBody.scrollHeight;
      
      messages.push({ role, content });
    }

    function addThinkingIndicator() {
      const thinking = document.createElement('div');
      thinking.className = 'ai-thinking';
      thinking.id = 'ai-thinking-indicator';
      thinking.innerHTML = `ИИ подбирает слова<div class="ai-thinking__dots"><div class="ai-thinking__dot"></div><div class="ai-thinking__dot"></div><div class="ai-thinking__dot"></div></div>`;
      modalBody.appendChild(thinking);
      modalBody.scrollTop = modalBody.scrollHeight;
    }

    function removeThinkingIndicator() {
      const indicator = document.getElementById('ai-thinking-indicator');
      if (indicator) indicator.remove();
    }

    function addPreviewBox(text) {
      // Remove any existing preview box
      const existing = modalBody.querySelector('.ai-preview-box-container');
      if (existing) existing.remove();

      const container = document.createElement('div');
      container.className = 'ai-preview-box-container';
      container.innerHTML = `
        <div class="ai-preview-title">📝 Предпросмотр текста:</div>
        <div class="ai-preview-box">${escHtml(text)}</div>
      `;
      modalBody.appendChild(container);
      modalBody.scrollTop = modalBody.scrollHeight;
      
      lastProposedText = text;
    }

    async function sendChatRequest(contextData) {
  addThinkingIndicator();

  // Доп. контекст: имя и даты человека со страницы — помогает ИИ писать точнее
  const personName = document.querySelector('.person-header__name')?.textContent?.trim() || '';
  const personDates = document.querySelector('.person-header__dates')?.textContent?.trim() || '';
  const fullContext = Object.assign({ name: personName, dates: personDates }, contextData || {});

  const base = window.location.port === '3000' ? '' : 'http://localhost:3000';
  try {
    const res = await fetch(`${base}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages,
        context: fullContext
      })
    });

    const json = await res.json().catch(() => ({}));
    removeThinkingIndicator();

    // Антирерол: 3 генерации, затем минута кулдауна
    if (res.status === 429) {
      const sec = json.retryAfter || 60;
      addMessage('assistant', `⏳ Слишком много генераций подряд. Подождите ${sec} сек. и попробуйте снова.`);
      return null;
    }

    if (res.ok && json.ok) {
      if (json.chatResponse) {
        addMessage('assistant', json.chatResponse);
      }
      if (json.proposedText) {
        addPreviewBox(json.proposedText);
      }
      return json;
    } else {
      addMessage('assistant', '⚠️ ' + (json.error || 'Произошла ошибка при генерации. Пожалуйста, попробуйте еще раз.'));
      return null;
    }
  } catch (err) {
    removeThinkingIndicator();
    addMessage('assistant', '⚠️ Не удалось связаться с ИИ. Проверьте соединение с сервером.');
    return null;
  }
}

    // --- Scenario 1 Screens ---
    function showScenario1InitialState() {
      modalBody.innerHTML = `
        <div class="ai-initial-panel">
          <div class="ai-initial-panel__icon">✍️</div>
          <div class="ai-initial-panel__text">
            В этом текстовом блоке уже есть написанный вами текст. 
            Я могу помочь улучшить его стиль, исправить ошибки, дополнить содержание или изменить тон.
          </div>
          <div class="ai-preview-title" style="width: 100%; text-align: left;">Текущий текст:</div>
          <div class="ai-preview-box" style="width: 100%; text-align: left;">${escHtml(originalText)}</div>
          <button class="ai-btn ai-btn--primary ai-btn-large" id="ai-btn-improve-start">✨ Улучшить текст</button>
        </div>
      `;
      modalFooter.innerHTML = '';

      modalBody.querySelector('#ai-btn-improve-start').addEventListener('click', () => {
        modalBody.innerHTML = ''; // Clear initial screen
        messages = [];
        addMessage('assistant', 'Здравствуйте! Я готов поработать над улучшением вашего текста. Напишите, какие изменения вы хотите внести (например: «сделай более эмоциональным», «исправь ошибки», «сократи» или напишите конкретные пожелания).');
        
        // Show chat controls
        showChatInterface({ originalText, field });
        
        // Trigger first automatic improvement
        sendChatRequest({ originalText, field });
      });
    }

    function showChatInterface(contextData) {
      modalFooter.innerHTML = `
        <div class="ai-input-row">
          <textarea class="ai-textarea" id="ai-chat-input" placeholder="Напишите пожелание по улучшению... (например, 'сделай душевнее')"></textarea>
          <button class="ai-btn ai-btn--send" id="ai-btn-send-chat" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
        <div class="ai-action-buttons">
          <button class="ai-btn ai-btn--secondary" id="ai-btn-cancel-chat">✕ Отмена</button>
          <button class="ai-btn ai-btn--primary" id="ai-btn-apply-text" disabled>💾 Применить текст</button>
        </div>
      `;

      const input = modalFooter.querySelector('#ai-chat-input');
      const sendBtn = modalFooter.querySelector('#ai-btn-send-chat');
      const applyBtn = modalFooter.querySelector('#ai-btn-apply-text');
      const cancelBtn = modalFooter.querySelector('#ai-btn-cancel-chat');

      // Enable/disable send button based on input
      input.addEventListener('input', () => {
        sendBtn.disabled = !input.value.trim();
      });

      // Enable apply button once we have proposed text
      const checkProposedText = setInterval(() => {
        if (!overlay.parentNode) {
          clearInterval(checkProposedText);
          return;
        }
        if (lastProposedText) {
          applyBtn.disabled = false;
        }
      }, 500);

      // Send message
      async function handleSend() {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        sendBtn.disabled = true;
        
        addMessage('user', text);
        await sendChatRequest(contextData);
      }

      sendBtn.addEventListener('click', handleSend);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      });

      // Apply action
      applyBtn.addEventListener('click', () => {
        if (lastProposedText) {
          textarea.value = lastProposedText;
          // Dispatch input event to notify any validation/save listeners
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          overlay.remove();
        }
      });

      cancelBtn.addEventListener('click', () => overlay.remove());
    }

    // --- Scenario 2 Screens (Text is empty) ---
    let writeTopic = '';
    let writeKeywords = '';

    function showScenario2Step1() {
      modalBody.innerHTML = `
        <div class="ai-initial-panel">
          <div class="ai-initial-panel__icon">🪄</div>
          <h4 style="font-family: var(--font-display); font-size: 18px; color: var(--gold-light); margin-bottom: -10px;">Давайте напишем текст вместе</h4>
          <div class="ai-initial-panel__text">
            Этот текстовый блок пуст. Напишите тему или краткую идею, о чём должен быть этот текст (например: «О детстве в деревне» или «Жизненные ценности и наследие»).
          </div>
          <textarea class="edit-textarea" id="ai-topic-input" placeholder="Укажите тему текста..." style="width: 100%; min-height: 80px;"></textarea>
          <button class="ai-btn ai-btn--primary ai-btn-large" id="ai-btn-topic-next" disabled>Продолжить →</button>
        </div>
      `;
      modalFooter.innerHTML = '';

      const topicInput = modalBody.querySelector('#ai-topic-input');
      const nextBtn = modalBody.querySelector('#ai-btn-topic-next');

      topicInput.addEventListener('input', () => {
        nextBtn.disabled = !topicInput.value.trim();
      });

      nextBtn.addEventListener('click', () => {
        writeTopic = topicInput.value.trim();
        showScenario2Step2();
      });
    }

    function showScenario2Step2() {
      modalBody.innerHTML = `
        <div class="ai-initial-panel">
          <div class="ai-initial-panel__icon">📝</div>
          <h4 style="font-family: var(--font-display); font-size: 18px; color: var(--gold-light); margin-bottom: -10px;">Детали и ключевые слова</h4>
          <div class="ai-initial-panel__text">
            Укажите ключевые слова, даты, имена, важные факты или ваши пожелания, которые обязательно нужно упомянуть в тексте.
          </div>
          <textarea class="edit-textarea" id="ai-keywords-input" placeholder="Например: родился в Минске, любил рыбалку, собака Дружок, 1965 год... (или оставьте пустым)" style="width: 100%; min-height: 80px;"></textarea>
          <div class="ai-action-buttons" style="width: 100%; margin-top: 10px;">
            <button class="ai-btn ai-btn--secondary" id="ai-btn-keywords-skip" style="flex: 1;">Пропустить</button>
            <button class="ai-btn ai-btn--primary" id="ai-btn-keywords-generate" style="flex: 1;">Создать текст ✨</button>
          </div>
        </div>
      `;
      modalFooter.innerHTML = '';

      const keywordsInput = modalBody.querySelector('#ai-keywords-input');
      const skipBtn = modalBody.querySelector('#ai-btn-keywords-skip');
      const genBtn = modalBody.querySelector('#ai-btn-keywords-generate');

      skipBtn.addEventListener('click', () => {
        writeKeywords = 'пропустить';
        generateTextFromInputs();
      });

      genBtn.addEventListener('click', () => {
        writeKeywords = keywordsInput.value.trim() || 'пропустить';
        generateTextFromInputs();
      });
    }

    async function generateTextFromInputs() {
      modalBody.innerHTML = ''; // Clear for chat/preview layout
      
      messages = [];
      addMessage('user', `Создать текст на тему: "${writeTopic}".`);
      if (writeKeywords && writeKeywords !== 'пропустить') {
        addMessage('user', `Использовать ключевые слова: ${writeKeywords}.`);
      } else {
        addMessage('user', `Ключевые слова отсутствуют.`);
      }

      showScenario2ResultInterface();
      
      await sendChatRequest({ field });
    }

    function showScenario2ResultInterface() {
      modalFooter.innerHTML = `
        <div class="ai-input-row" id="ai-redo-input-container">
          <textarea class="ai-textarea" id="ai-redo-input" placeholder="Что изменить? (например: 'сделай длиннее', 'добавь тепла')"></textarea>
          <button class="ai-btn ai-btn--send" id="ai-btn-redo" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
        <div class="ai-action-buttons">
          <button class="ai-btn ai-btn--danger" id="ai-btn-discard-scratch">✕ Отмена</button>
          <button class="ai-btn ai-btn--primary" id="ai-btn-save-scratch" disabled>💾 Сохранить текст</button>
        </div>
      `;

      const redoInput = modalFooter.querySelector('#ai-redo-input');
      const redoBtn = modalFooter.querySelector('#ai-btn-redo');
      const saveBtn = modalFooter.querySelector('#ai-btn-save-scratch');
      const discardBtn = modalFooter.querySelector('#ai-btn-discard-scratch');

      redoInput.addEventListener('input', () => {
        redoBtn.disabled = !redoInput.value.trim();
      });

      // Enable save button once we have proposed text
      const checkProposedText = setInterval(() => {
        if (!overlay.parentNode) {
          clearInterval(checkProposedText);
          return;
        }
        if (lastProposedText) {
          saveBtn.disabled = false;
        }
      }, 500);

      // Redo generation
      async function handleRedo() {
        const text = redoInput.value.trim();
        if (!text) return;
        redoInput.value = '';
        redoBtn.disabled = true;
        
        addMessage('user', text);
        await sendChatRequest({ field });
      }

      redoBtn.addEventListener('click', handleRedo);
      redoInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleRedo();
        }
      });

      // Save action
      saveBtn.addEventListener('click', () => {
        if (lastProposedText) {
          textarea.value = lastProposedText;
          // Dispatch input event to notify any validation/save listeners
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          overlay.remove();
        }
      });

      discardBtn.addEventListener('click', () => overlay.remove());
    }
  }

  function escAttr(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  }
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
})();
