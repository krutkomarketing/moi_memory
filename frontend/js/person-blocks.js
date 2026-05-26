/* ═══════════════════════════════════════════════
   PERSON-BLOCKS.JS — зебра-блочный рендер биографии
   Универсальный конструктор из 6 смысловых блоков:
     1. childhood   — Детство и юность
     2. education   — Образование
     3. career      — Профессиональный путь
     4. family      — Семья
     5. hobbies     — Хобби и увлечения
     6. legacy      — Наследие
   Все блоки поддерживают слот для фото.
   Если блок не заполнен — он не рендерится (нет пустых дыр).
   ═══════════════════════════════════════════════ */

(function () {
  /** Список блоков в фиксированном порядке + дефолтные заголовки */
  const BLOCK_SCHEMA = [
    { key: 'childhood', title: 'Детство и юность'      },
    { key: 'education', title: 'Образование'           },
    { key: 'career',    title: 'Профессиональный путь' },
    { key: 'family',    title: 'Семья'                 },
    { key: 'hobbies',   title: 'Хобби и увлечения'     },
    { key: 'legacy',    title: 'Наследие'              },
  ];

  /**
   * @param {HTMLElement} container - куда вставить блоки
   * @param {Object} data - { sections: { childhood, education, career, family, hobbies, legacy }, quotes?: [{text, after?}] }
   *   Каждая секция: { title?, text, image? }
   *   quotes: массив цитат, after — ключ блока после которого вставить (childhood, education и т.д.)
   */
  function renderBioBlocks(container, data) {
    if (!container) return;

    let blocks;
    if (data?.sections && typeof data.sections === 'object') {
      const isEditMode = new URLSearchParams(window.location.search).get('edit') === '1';

      // Сначала фиксированные блоки в правильном порядке
      blocks = BLOCK_SCHEMA
        .map(meta => {
          const sec = data.sections[meta.key];
          if (!sec) return null;
          const text = (sec.text ?? '').trim();
          // В edit mode показываем даже пустые блоки
          if (!text && !isEditMode) return null;
          return {
            key:   meta.key,
            title: sec.title || meta.title,
            text:  text || '',
            image: sec.image || '',
          };
        })
        .filter(Boolean);

      // Затем кастомные блоки (ключи начинаются с custom_)
      Object.keys(data.sections).forEach(key => {
        if (!key.startsWith('custom_')) return;
        const sec = data.sections[key];
        const text = (sec.text ?? '').trim();
        if (!text) return;
        blocks.push({
          key,
          title: sec.title || 'Без названия',
          text,
          image: sec.image || '',
        });
      });
    } else {
      const arr = Array.isArray(data?.blocks) ? data.blocks : [];
      blocks = arr
        .filter(b => b && (b.text ?? '').trim())
        .map(b => ({
          title: (b.title ?? '').trim(),
          text:  b.text.trim(),
          image: b.image || '',
        }));
    }

    if (!blocks.length) return;

    // Цитаты: массив {text, after}
    const quotes = Array.isArray(data?.quotes) ? data.quotes : [];

    const wrap = document.createElement('div');
    wrap.className = 'bio-blocks';

    blocks.forEach((block, i) => {
      wrap.appendChild(renderBlock(block, i));

      // Вставляем цитату после этого блока если есть
      const quoteAfter = quotes.find(q => q.after === block.key);
      if (quoteAfter) {
        wrap.appendChild(renderQuote(quoteAfter.text));
      }
    });

    // Цитаты без привязки к блоку — вставляем в конец
    quotes.filter(q => !q.after || !blocks.find(b => b.key === q.after)).forEach(q => {
      wrap.appendChild(renderQuote(q.text));
    });

    container.appendChild(wrap);
  }

  function renderQuote(text) {
    const el = document.createElement('blockquote');
    el.className = 'bio-quote';
    el.innerHTML = `
      <span class="bio-quote__mark">"</span>
      <p class="bio-quote__text">${escapeHtml(text)}</p>
      <span class="bio-quote__mark">"</span>
    `;
    return el;
  }

  function renderBlock(block, i) {
    const text  = block.text;
    const title = block.title;
    const hasImage = !!block.image;
    const isReverse = i % 2 === 1; // 0,2,4 — текст слева; 1,3,5 — фото слева

    const section = document.createElement('section');
    section.className = 'bio-block' + (isReverse ? ' bio-block--reverse' : '');
    if (block.key) section.dataset.block = block.key;

    const titleHtml = title ? `<h2 class="bio-block__title">${escapeHtml(title)}</h2>` : '';

    const textHtml = `
      <div class="bio-block__text">
        ${text.split('\n').filter(Boolean).map(p => `<p>${escapeHtml(p)}</p>`).join('')}
      </div>
    `;

    // Слот для фото — показываем ТОЛЬКО если фото есть
    const photoHtml = hasImage
      ? `
        <div class="bio-block__photo">
          <img src="${escapeAttr(typeof API !== 'undefined' && typeof API.resolveUrl === 'function' ? API.resolveUrl(block.image) : block.image)}" alt="${escapeAttr(title)}" loading="lazy"/>
        </div>
      `
      : '';

    // Если нет фото — текст по центру на всю ширину
    if (!hasImage) {
      section.classList.add('bio-block--text-only');
    }

    section.innerHTML = `
      ${titleHtml}
      <div class="bio-block__row">
        ${textHtml}
        ${photoHtml}
      </div>
    `;

    return section;
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  // Экспорт
  window.PersonBlocks = {
    render: renderBioBlocks,
    SCHEMA: BLOCK_SCHEMA,
  };
})();
