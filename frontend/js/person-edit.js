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
        if (confirm('Удалить этот блок?')) block.remove();
      });
      block.appendChild(delBtn);
    });

    // Цитаты → textarea
    document.querySelectorAll('.bio-quote__text').forEach((q, i) => {
      const val = q.textContent.trim();
      q.outerHTML = `<div class="edit-textarea-wrapper">
        <textarea class="edit-textarea edit-textarea--quote" data-field="quote" data-index="${i}">${escHtml(val)}</textarea>
        <button type="button" class="ai-assistant-btn" title="AI помощник">AI</button>
      </div>`;
    });

    // Добавляем кнопки «+ Блок» / «+ Цитата» между блоками
    addInsertButtons();

    // Добавляем кнопку «+ Фото в галерею»
    addGalleryUploadBtn();
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
    delBtn.addEventListener('click', () => form.remove());
    form.appendChild(delBtn);

    panel.after(form);
  }

  function insertNewQuote(panel, position) {
    const quote = document.createElement('blockquote');
    quote.className = 'bio-quote bio-quote--new';
    quote.dataset.isNew = 'true';
    quote.dataset.position = position;
    quote.innerHTML = `
      <div class="edit-textarea-wrapper">
        <textarea class="edit-textarea edit-textarea--quote" data-field="quote" placeholder="Введите цитату..."></textarea>
        <button type="button" class="ai-assistant-btn" title="AI помощник">AI</button>
      </div>
      <button type="button" class="edit-insert-btn edit-insert-btn--delete">🗑 Удалить</button>
    `;

    quote.querySelector('.edit-insert-btn--delete').addEventListener('click', () => quote.remove());
    panel.after(quote);
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

  // Event delegation to catch clicks on AI assistant buttons (both static and dynamic)
  document.body.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('ai-assistant-btn')) {
      const wrapper = e.target.closest('.edit-textarea-wrapper');
      if (!wrapper) return;
      const textarea = wrapper.querySelector('textarea');
      if (!textarea) return;
      openAiAssistantModal(textarea);
    }
  });

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
      
      const base = window.location.port === '3000' ? '' : 'http://localhost:3000';
      try {
        const res = await fetch(`${base}/api/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messages,
            context: contextData
          })
        });
        
        const json = await res.json();
        removeThinkingIndicator();

        if (json.ok) {
          if (json.chatResponse) {
            addMessage('assistant', json.chatResponse);
          }
          if (json.proposedText) {
            addPreviewBox(json.proposedText);
          }
          return json;
        } else {
          addMessage('assistant', '⚠️ Произошла ошибка при генерации. Пожалуйста, попробуйте еще раз.');
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
