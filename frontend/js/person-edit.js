/* ═══════════════════════════════════════════════
   PERSON-EDIT.JS — режим редактирования страницы памяти
   Кнопка «Редактировать» → инпуты → «Сохранить» → PUT /api/profiles/:id
   ═══════════════════════════════════════════════ */

(function () {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const autoEdit = params.get('edit') === '1';

  // Только для UUID-страниц (из бота)
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;

  let isEditing = false;
  let originalData = null; // сохраняем данные для отката

  // Ждём загрузки страницы
  if (document.readyState === 'complete') {
    setTimeout(() => {
      initEditPanel();
      if (autoEdit) setTimeout(() => enterEditMode(), 300);
    }, 500);
  } else {
    window.addEventListener('load', () => {
      setTimeout(() => {
        initEditPanel();
        if (autoEdit) setTimeout(() => enterEditMode(), 300);
      }, 500);
    });
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
      bioEl.outerHTML = `<textarea class="edit-textarea" data-field="bio" placeholder="Краткий текст о человеке — эпитафия, несколько тёплых слов...">${escHtml(val)}</textarea>`;
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
        textEl.innerHTML = `<textarea class="edit-textarea" data-block="${key}" data-field="text" placeholder="${hint}">${escHtml(cleanVal)}</textarea>`;
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
      q.outerHTML = `<textarea class="edit-textarea edit-textarea--quote" data-field="quote" data-index="${i}">${escHtml(val)}</textarea>`;
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
          <textarea class="edit-textarea" data-block="${form.dataset.block}" data-field="text" placeholder="Текст блока..."></textarea>
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
      <textarea class="edit-textarea edit-textarea--quote" data-field="quote" placeholder="Введите цитату..."></textarea>
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

  function escAttr(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  }
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
})();
