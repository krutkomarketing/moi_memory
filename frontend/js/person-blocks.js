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

  function extractYear(block) {
    const yearRegex = /\b(18\d{2}|19\d{2}|20\d{2})\b/;
    
    // Check title first
    if (block.title) {
      const match = block.title.match(yearRegex);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    
    // Check text/body
    if (block.text) {
      const match = block.text.match(yearRegex);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    
    return null;
  }

  function getDefaultAge(block) {
    const key = block.key || '';
    const title = (block.title || '').toLowerCase();
    const text = (block.text || '').toLowerCase();

    if (key === 'childhood' || title.includes('детство') || title.includes('юность') || title.includes('родил')) return 5;
    if (key === 'education' || title.includes('учеб') || title.includes('образов') || title.includes('школ') || title.includes('институт') || title.includes('универ')) return 15;
    if (key === 'career' || title.includes('работ') || title.includes('карьер') || title.includes('служб') || title.includes('професси')) return 25;
    if (key === 'family' || title.includes('семь') || title.includes('жен') || title.includes('муж') || title.includes('дет') || title.includes('брак')) return 35;
    if (key === 'hobbies' || title.includes('хобб') || title.includes('увлеч') || title.includes('любил')) return 45;
    if (key === 'legacy' || title.includes('наслед') || title.includes('память') || title.includes('смерт') || title.includes('умер')) return 75;

    // Check text contents
    if (text.includes('детство') || text.includes('родился') || text.includes('родилась')) return 5;
    if (text.includes('школа') || text.includes('учился') || text.includes('училась') || text.includes('образование')) return 15;
    if (text.includes('работал') || text.includes('работала') || text.includes('служба') || text.includes('карьера')) return 25;
    if (text.includes('женился') || text.includes('вышла замуж') || text.includes('дети') || text.includes('семья')) return 35;
    if (text.includes('увлекался') || text.includes('увлекалась') || text.includes('хобби')) return 45;
    if (text.includes('умер') || text.includes('скончался') || text.includes('похоронен')) return 75;

    const ages = {
      childhood: 5,
      education: 15,
      career: 25,
      family: 35,
      hobbies: 45,
      legacy: 75
    };
    if (ages[key] !== undefined) return ages[key];

    return 40;
  }

  function sortBlocksChronologically(blocksArray) {
    let birthYearSum = 0;
    let birthYearCount = 0;

    blocksArray.forEach(b => {
      const y = extractYear(b);
      if (y !== null) {
        birthYearSum += (y - getDefaultAge(b));
        birthYearCount++;
      }
    });

    const birthYear = birthYearCount > 0 ? Math.round(birthYearSum / birthYearCount) : 1900;

    const blockMeta = blocksArray.map((block, index) => {
      const explicitYear = extractYear(block);
      const year = explicitYear !== null ? explicitYear : (birthYear + getDefaultAge(block));
      return {
        block,
        year,
        originalIndex: index
      };
    });

    blockMeta.sort((a, b) => {
      if (a.year !== b.year) {
        return a.year - b.year;
      }
      return a.originalIndex - b.originalIndex;
    });

    // Write back sorted blocks
    for (let i = 0; i < blocksArray.length; i++) {
      blocksArray[i] = blockMeta[i].block;
    }
  }

  /**
   * @param {HTMLElement} container - куда вставить блоки
   * @param {Object} data - { sections: { childhood, education, career, family, hobbies, legacy }, quotes?: [{text, after?}] }
   *   Каждая секция: { title?, text, image? }
   *   quotes: массив цитат, after — ключ блока после которого вставить (childhood, education и т.д.)
   */
  function renderBioBlocks(container, data) {
    if (!container) return;

    const isEditMode = new URLSearchParams(window.location.search).get('edit') === '1';
    let blocks = [];

    // Если есть sections, или если мы в режиме редактирования (тогда форсируем 6 базовых блоков)
    if ((data && data.sections && typeof data.sections === 'object') || isEditMode) {
      const sectionsData = data?.sections || {};

      // Сначала фиксированные блоки в правильном порядке
      blocks = BLOCK_SCHEMA
        .map(meta => {
          const sec = sectionsData[meta.key] || {};
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
      Object.keys(sectionsData).forEach(key => {
        if (!key.startsWith('custom_')) return;
        const sec = sectionsData[key];
        const text = (sec.text ?? '').trim();
        if (!text && !isEditMode) return;
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

    if (!isEditMode) {
      sortBlocksChronologically(blocks);
    }

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
