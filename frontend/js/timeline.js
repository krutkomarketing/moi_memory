/* ═══════════════════════════════════════════════
   TIMELINE — Family chronicle
   • Auto-events from PEOPLE data
   • Historical events of Russia/USSR
   • User custom events (localStorage)
   • Filters: type + decade
   • Life-span counter per person
   • Add-event form
   ═══════════════════════════════════════════════ */

(function () {
  const wrap = document.getElementById('timeline');
  if (!wrap) return;

  const photoMap = {};
  let showHistory = true;
  let dbNodes = [];
  let dbCustomEvents = [];
  let dbHistoricalEvents = [];  
  let dbProfiles = [];

  /* ── БЕЛОРУССКИЕ И СОВЕТСКИЕ ИСТОРИЧЕСКИЕ СОБЫТИЯ ── */
  const HISTORY = [
    { year: 1905, title: 'Первая русская революция',    desc: 'Волнения по всей стране',                                 icon: '🏛' },
    { year: 1914, title: 'Первая мировая война',         desc: 'Начало боевых действий в Европе, затронувших белорусские земли', icon: '⚔' },
    { year: 1917, title: 'Революция 1917 года',          desc: 'Смена власти, падение империи, рождение новой эпохи',     icon: '🔴' },
    { year: 1919, title: 'Образование БССР',             desc: 'Провозглашение Белорусской Советской Социалистической Республики', icon: '⭐' },
    { year: 1921, title: 'Основание БГУ',                desc: 'Открытие Белорусского государственного университета в Минске',   icon: '📚' },
    { year: 1922, title: 'Образование СССР',             desc: 'Создание Союза Советских Социалистических Республик',      icon: '🚩' },
    { year: 1941, title: 'Начало Великой Отечественной войны', desc: 'Вторжение врага, оборона Брестской крепости',         icon: '🛡' },
    { year: 1944, title: 'Освобождение Минска',          desc: 'Победоносная операция «Багратион», изгнание оккупационных войск', icon: '🎖' },
    { year: 1945, title: 'Победа в Великой Отечественной войне', desc: '9 мая — окончание войны, БССР входит в число основателей ООН', icon: '🕊' },
    { year: 1946, title: 'Строительство МТЗ',            desc: 'Начало возведения Минского тракторного завода',             icon: '🚜' },
    { year: 1947, title: 'Первые грузовики МАЗ',         desc: 'Выпуск первых белорусских тяжелых автомобилей МАЗ-205',      icon: '🚚' },
    { year: 1957, title: 'Запуск Спутника',              desc: 'СССР выводит на орбиту первый искусственный спутник Земли', icon: '🛰' },
    { year: 1958, title: 'Первый БелАЗ',                 desc: 'Выпуск первого карьерного самосвала на заводе в Жодино',     icon: '🚛' },
    { year: 1961, title: 'Полёт Юрия Гагарина',          desc: 'Первый полет человека в космос',                           icon: '🚀' },
    { year: 1971, title: 'Мемориал «Брестская крепость»', desc: 'Торжественное открытие мемориального комплекса',            icon: '🕯' },
    { year: 1984, title: 'Открытие Минского метро',       desc: 'Запуск первой линии метрополитена от станции «Институт культуры» до «Московской»', icon: '🚇' },
    { year: 1986, title: 'Катастрофа на ЧАЭС',           desc: 'Авария на Чернобыльской АЭС, затронувшая значительную часть территории Беларуси', icon: '☢' },
    { year: 1990, title: 'Суверенитет БССР',             desc: 'Принятие Декларации о государственном суверенитете',       icon: '📄' },
    { year: 1991, title: 'Создание Республики Беларусь',  desc: 'Распад СССР, обретение независимости Республикой Беларусь', icon: '📌' },
    { year: 1994, title: 'Конституция Беларуси',         desc: 'Принятие Основного Закона и выборы первого Президента страны', icon: '📜' },
    { year: 2005, title: 'Основание ПВТ',                desc: 'Создание Парка высоких технологий для ИТ-сектора в Беларуси', icon: '💻' },
    { year: 2006, title: 'Новое здание Нацбиблиотеки',    desc: 'Открытие уникального здания Национальной библиотеки («алмаза знаний»)', icon: '💎' },
  ];

  /* ── PARSE YEAR ── */
  function parseYear(s) {
    const m = (s || '').match(/(\d{4})/);
    return m ? parseInt(m[1], 10) : null;
  }

  /* ── CALC AGE ── */
  function lifeYears(born, died) {
    const b = parseYear(born), d = parseYear(died) || new Date().getFullYear();
    return (b && d) ? d - b : null;
  }

  /* ── LOAD CUSTOM EVENTS ── */
  const STORAGE_KEY = 'memory_custom_events';
  const ACTIVE_TREE_KEY = 'active_tree_id';   /* ← key used by tree-edit.js */
  const ALL_TREES_KEY   = 'all_trees';

  function loadCustom() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }
  function saveCustom(arr) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch {}
  }

  /* ── GET ACTIVE TREE ── */
  function getActiveTreeId() {
    /* tree-edit.js uses URL param ?tree=xxx as current tree id */
    const urlTree = new URLSearchParams(window.location.search).get('tree');
    if (urlTree && urlTree !== 'default') return urlTree;
    /* fallback: localStorage active_tree_id */
    return localStorage.getItem(ACTIVE_TREE_KEY) || null;
  }

  function getActivTreeMeta() {
    try {
      const id = getActiveTreeId();
      if (!id) return null;
      const trees = JSON.parse(localStorage.getItem(ALL_TREES_KEY) || '[]');
      /* all_trees may be array of strings (old format) or array of objects */
      if (trees.length && typeof trees[0] === 'object') {
        return trees.find(t => t.id === id) || null;
      }
      return { id, name: id, color: '#c8a84b' };
    } catch { return null; }
  }

  /* ── LOAD TREE NODES FROM ACTIVE TREE ONLY ── */
  function loadActiveTreeNodes() {
    const treeId = getActiveTreeId();
    if (!treeId) return [];
    try {
      return JSON.parse(localStorage.getItem(`tree_nodes_${treeId}`) || '[]');
    } catch { return []; }
  }

  /* Convert tree nodes → timeline events */
  function treeNodesToEvents(nodes, treeMeta) {
    const events = [];
    const treeName  = treeMeta ? (treeMeta.name || treeMeta.id) : '';
    const treeColor = treeMeta ? (treeMeta.color || '#c8a84b') : '#c8a84b';
    const treeId    = treeMeta ? treeMeta.id : null;

    nodes.forEach(node => {
      const name  = node.full_name || node.fullName || node.name || '';
      const years = node.years || '';
      if (!years) return;
      const mBoth = years.match(/(\d{4})[^\d]+(\d{4})/);
      const mBorn = years.match(/^(\d{4})/);
      const mDied = years.match(/(\d{4})\s*$/);

      const born = mBoth ? parseInt(mBoth[1]) : (mBorn ? parseInt(mBorn[1]) : null);
      const died = mBoth ? parseInt(mBoth[2]) : (born && mDied && parseInt(mDied[1]) !== born ? parseInt(mDied[1]) : null);

      const pId = node.id || node.personId || node.person_id || node.page_id;

      if (born) events.push({
        year: born, type: 'birth',
        title: 'Родился / Родилась', subtitle: name,
        city: node.city || '', age: null,
        _fromTree: true, treeId, treeName, treeColor,
        photo: node.photo_url || node.photo || '',
        personId: pId,
      });
      if (died) events.push({
        year: died, type: 'death',
        title: 'Ушёл из жизни / Ушла из жизни', subtitle: name,
        city: node.city || '', age: died - born,
        _fromTree: true, treeId, treeName, treeColor,
        photo: node.photo_url || node.photo || '',
        personId: pId,
      });
    });
    return events;
  }

  /* ── BUILD EVENT LIST ── */
  
  function normalizeEvents(events) {
    // keep only events with valid numeric year
    const out = [];
    for (const e of (events || [])) {
      const y = (typeof e.year === 'number') ? e.year : parseInt(e.year, 10);
      if (!Number.isFinite(y)) continue;
      const age = (typeof e.age === 'number') ? e.age : (e.age ? parseInt(e.age, 10) : null);
      out.push({ ...e, year: y, age: Number.isFinite(age) ? age : null });
    }
    // ensure stable sort
    out.sort((a,b) => a.year - b.year);
    return out;
  }

  function buildEvents() {
    const events = [];

    /* From DB Profiles or fallback static data */
    const sourcePeople = dbProfiles.length ? dbProfiles : (typeof PEOPLE !== 'undefined' ? PEOPLE : []);
    sourcePeople.forEach(p => {
      const by = parseYear(p.born), dy = parseYear(p.died);
      const age = lifeYears(p.born, p.died);
      if (by) events.push({
        year: by, type: 'birth', person: p,
        title: 'Родился / Родилась',
        subtitle: p.name,
        city: p.city,
        age: null,
        photo: photoMap[p.id] || '',
        personId: p.id,
      });
      if (dy) events.push({
        year: dy, type: 'death', person: p,
        title: 'Ушёл из жизни / Ушла из жизни',
        subtitle: p.name,
        city: p.city,
        age: age,
        photo: photoMap[p.id] || '',
        personId: p.id,
      });
    });

    /* From ACTIVE tree only (not all trees) */
    const treeMeta  = getActivTreeMeta();
    const treeNodes = dbNodes.length ? dbNodes : loadActiveTreeNodes();
    treeNodesToEvents(treeNodes, treeMeta).forEach(e => events.push(e));

/* Historical — из API если есть, иначе локальный fallback */
if (dbHistoricalEvents.length > 0) {
  dbHistoricalEvents.forEach(h => {
    const year = parseYear(h.date);
    if (!year) return;
    events.push({
      id: h.id,
      year,
      type: 'history',
      title: h.title,
      subtitle: h.description || '',
      city: h.place || '',
      icon: iconForHistorical(h),
      iconKey: h.iconKey || null,
      witnesses: h.witnesses || null,  // ← список свидетелей от бэка
    });
  });
} else {
  // Fallback: статичный список (если бэк недоступен)
  HISTORY.forEach(h => events.push({
    year: h.year, type: 'history',
    title: h.title,
    subtitle: h.desc,
    city: '',
    icon: h.icon,
  }));
}
    /* Custom (non-tree) */
    const customEvents = dbCustomEvents.length ? dbCustomEvents : loadCustom();
    customEvents.filter(c => !c._fromTree).forEach(c => events.push({ ...c, type: c.type || 'custom' }));

    events.sort((a, b) => a.year - b.year);
    return events;
  }

  /* ── ICONS ── */
  const ICON = {
    birth:   '✿',
    death:   '✦',
    history: '❧',
    custom:  '★',
    era:     '❧',
  };

  /* iconKey (бэк) → emoji (фронт) */
const ICON_KEY_TO_EMOJI = {
  war:   '⚔',
  flag:  '🚩',
  star:  '★',
  book:  '📚',
  cross: '✝',
  heart: '♥',
};
function iconForHistorical(ev) {
  if (ev.icon) return ev.icon;
  if (ev.iconKey && ICON_KEY_TO_EMOJI[ev.iconKey]) return ICON_KEY_TO_EMOJI[ev.iconKey];
  return '❧';
}

  /* ── GET PEOPLE ALIVE IN YEAR ── */
  function getPeopleAliveInYear(year) {
    const list = [];
    const seenIds = new Set();

    // 1. From DB Profiles or fallback static data
    const staticPeople = dbProfiles.length ? dbProfiles : (typeof PEOPLE !== 'undefined' ? PEOPLE : []);
    staticPeople.forEach(p => {
      const by = parseYear(p.born);
      const dy = parseYear(p.died) || new Date().getFullYear();
      if (by && by <= year && dy >= year) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          const yearsStr = p.years || `${p.born}–${p.died || '...'}`;
          list.push({ id: p.id, name: p.name, years: yearsStr });
        }
      }
    });

    // 2. From active tree nodes
    const treeNodes = dbNodes.length ? dbNodes : loadActiveTreeNodes();
    treeNodes.forEach(node => {
      const name = node.full_name || node.fullName || node.name || '';
      const years = node.years || '';
      if (!years) return;
      
      const mBoth = years.match(/(\d{4})[^\d]+(\d{4})/);
      const mBorn = years.match(/^(\d{4})/);
      const mDied = years.match(/(\d{4})\s*$/);

      const born = mBoth ? parseInt(mBoth[1]) : (mBorn ? parseInt(mBorn[1]) : null);
      const died = mBoth ? parseInt(mBoth[2]) : (born && mDied && parseInt(mDied[1]) !== born ? parseInt(mDied[1]) : new Date().getFullYear());
      
      const pId = node.linked_profile_id || node.id || node.personId;
      if (born && born <= year && died >= year) {
        if (pId && !seenIds.has(pId)) {
          seenIds.add(pId);
          list.push({ id: pId, name: name, years: years });
        }
      }
    });

    return list;
  }

  /* ── RENDER ONE EVENT ── */
  function buildEventHTML(e, i) {
    const side       = i % 2 === 0 ? 'left' : 'right';
    const icon       = e.icon || ICON[e.type] || '◆';
    const ageTag = e.age
      ? `<span class="timeline__age">${e.age} лет прожито</span>`
      : '';
    const cityHtml = e.city
      ? `<span class="timeline__city">${e.city}</span>`
      : '';
    const customDel = e.type === 'custom'
      ? `<button class="timeline__del" data-id="${e.id}" title="Удалить">×</button>`
      : '';
    const histClass = e.type === 'history' ? ' timeline__card--history' : '';

    /* Tree tag for events from active tree */
    const treeTag = e._fromTree && e.treeName
      ? `<span style="font-family:var(--font-ui);font-size:10px;letter-spacing:0.1em;color:${e.treeColor || '#c8a84b'};opacity:0.85;">${e.treeName}</span>`
      : '';

    const personId = e.personId || e.person?.id;
    
    // Avatar
    const photo = e.photo || (personId ? photoMap[personId] : '');
    let headerHtml = '';
    if (e.type === 'birth' || e.type === 'death') {
      const avatar = photo
        ? `<img class="timeline__avatar" src="${API.resolveUrl(photo)}" alt="${e.subtitle || ''}" data-tl-avatar="1"/>`
        : `<div class="timeline__avatar--empty"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:24px;height:24px;fill:currentColor;"><circle cx="12" cy="7" r="4"/><path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8"/></svg></div>`;
      
      headerHtml = `
        <div class="timeline__card-header-row">
          ${avatar}
          <div class="timeline__card-header-info">
            <div class="timeline__year">${e.year}</div>
            <h3 class="timeline__title">${e.title}</h3>
          </div>
        </div>`;
    } else {
      headerHtml = `
        <div class="timeline__year">${e.year}</div>
        <h3 class="timeline__title">${e.title}</h3>`;
    }

    // Actions Row
    let actionsHtml = '';
    if (personId) {
      const treeLink = `family-tree.html?highlight=${encodeURIComponent(personId)}`;
      const pageLink = e.person || e._fromTree
        ? `<a class="timeline__link" href="/p/${encodeURIComponent(personId)}" style="margin-top:0;">страница памяти →</a>`
        : '';
      actionsHtml = `
        <div class="timeline__actions-row">
          <a class="timeline__tree-link" href="${treeLink}">🌳 Показать на дереве</a>
          ${pageLink}
        </div>`;
    }

    let relativesHtml = '';
if (e.type === 'history') {
  // 1. Приоритет — witnesses от бэка (по реальным PUBLIC профилям)
  // 2. Fallback — локальный getPeopleAliveInYear (localStorage + статичный PEOPLE)
  let witnessesList = [];
  if (e.witnesses && Array.isArray(e.witnesses) && e.witnesses.length > 0) {
    witnessesList = e.witnesses.map(w => ({
      id: w.slug || w.id,          // на странице памяти id = slug
      name: w.fullName,
      years: '',
    }));
  } else {
    witnessesList = getPeopleAliveInYear(e.year);
  }
  if (witnessesList.length > 0) {
    relativesHtml = `
      <div class="timeline__relatives" style="margin-top:12px;border-top:1px dashed rgba(200,168,75,0.15);padding-top:8px;">
        <div style="font-family:var(--font-ui);font-size:10px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;text-align:left;">Свидетели эпохи из семьи:</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-start;">
          ${witnessesList.map(p => `
            <a href="/p/${encodeURIComponent(p.id)}" class="timeline__relative-link" style="font-family:var(--font-body);font-size:12px;color:var(--cream-dim);text-decoration:none;background:rgba(200,168,75,0.06);padding:3px 8px;border-radius:12px;border:1px solid rgba(200,168,75,0.15);transition:all 0.3s;display:inline-block;">
              ${p.name}${p.years ? ` <span style="font-size:10px;opacity:0.6;">(${p.years})</span>` : ''}
            </a>`).join('')}
        </div>
      </div>`;
  }
}

    return `
      <article class="timeline__item timeline__item--${side} timeline__item--${e.type}"
               data-type="${e.type}" data-year="${e.year}">
        <div class="timeline__marker">
          <span class="timeline__marker-icon">${icon}</span>
        </div>
        <div class="timeline__card${histClass}">
          ${customDel}
          ${headerHtml}
          <p class="timeline__subtitle">${e.subtitle}</p>
          ${relativesHtml}
          <div class="timeline__meta">
            ${cityHtml}
            ${ageTag}
            ${treeTag}
          </div>
          ${actionsHtml}
        </div>
      </article>`;
  }

  /* ── STAT FACTS ── */
  function getStatFact(key, value) {
    if (value === '—' || value === 0) return null;
    const n = parseInt(value, 10);

    const facts = {
      births: [
        `${value} ${declension(n, ['рождение', 'рождения', 'рождений'])} в этой летописи — каждое из них начало целой судьбы, полной надежд и открытий.`,
        `Число ${value} — столько раз жизнь побеждала в этом роду. Демографы отмечают: средняя семья XIX века насчитывала 5–7 детей.`,
        `${value} ${declension(n, ['новая жизнь', 'новые жизни', 'новых жизней'])} зафиксировано в летописи. Каждое рождение — это новая ветвь на древе рода.`,
      ],
      deaths: [
        `${value} ${declension(n, ['уход', 'ухода', 'уходов'])} отмечено в летописи. Память о каждом — это нить, которая связывает поколения.`,
        `Число ${value} напоминает нам: смерть — не конец истории, а её переход. Именно ради сохранения этих ${value} историй и создан сайт.`,
        `${value} ${declension(n, ['человек ушёл', 'человека ушли', 'человек ушли'])} из жизни, но остались в памяти тех, кто помнит.`,
      ],
      avgAge: (() => {
        if (isNaN(n)) return [];
        const era = n < 50 ? 'В XIX — начале XX века средняя продолжительность жизни в России составляла около 35–40 лет.' :
                    n < 65 ? 'Средняя продолжительность жизни в СССР к 1960-м годам достигла 70 лет — рекорд для страны.' :
                    'По данным ВОЗ, средняя продолжительность жизни в мире сегодня составляет около 73 лет.';
        return [
          `Средний возраст ${value} ${declension(n, ['год', 'года', 'лет'])} в этой летописи. ${era}`,
          `${value} лет — средний возраст людей в этой летописи. Учёные считают, что каждое последующее поколение живёт в среднем на 2–3 года дольше предыдущего.`,
          `Средний возраст ${value} лет говорит о том, что поколения этого рода жили ${n >= 65 ? 'долго и достойно' : 'в непростое историческое время'}.`,
        ];
      })(),
      maxAge: (() => {
        if (isNaN(n)) return [];
        const who = n >= 90 ? 'долгожителей — людей старше 90 лет — в мире насчитывается около 450 тысяч' :
                    n >= 80 ? 'люди старше 80 лет составляют около 5% населения развитых стран' :
                    n >= 74 ? 'ВОЗ относит людей от 60 до 74 лет к пожилому возрасту, а с 74 лет начинается период настоящей старости' :
                    'этот возраст соответствует периоду зрелости по классификации ВОЗ';
        return [
          `${value} ${declension(n, ['год', 'года', 'лет'])} — максимальный возраст в летописи. По данным ВОЗ, ${who}.`,
          `${value} лет прожил самый долгий из людей в этой летописи. Наука геронтология изучает, почему некоторые люди живут значительно дольше среднего — роль играют гены, образ жизни и эпоха.`,
          `Максимальный возраст ${value} ${declension(n, ['год', 'года', 'лет'])} в роду. Долголетие часто передаётся по наследству: если прародители дожили до ${n} лет, их потомки имеют повышенные шансы на долгую жизнь.`,
        ];
      })(),
      span: (() => {
        if (isNaN(n) || n === 0) return [];
        const eras = n > 150 ? 'охватывает несколько исторических эпох — от царской России до наших дней' :
                     n > 100 ? 'перекрывает весь XX век с его революциями, войнами и переменами' :
                     n > 50  ? 'включает несколько десятилетий истории страны' :
                     'фиксирует события одного-двух поколений';
        return [
          `${value} ${declension(n, ['год', 'года', 'лет'])} охвата летописи — она ${eras}. За каждым годом — живые судьбы.`,
          `Летопись охватывает ${value} лет. Историки говорят: чтобы понять человека, нужно знать три поколения его предков. Эта летопись хранит куда больше.`,
          `${value} лет истории рода — это примерно ${Math.round(n / 25)} ${declension(Math.round(n / 25), ['поколение', 'поколения', 'поколений'])}. Каждое поколение живёт около 25 лет.`,
        ];
      })(),
      histEv: [
        `${value} ${declension(n, ['событие истории', 'события истории', 'событий истории'])} России вплетено в летопись рода. История страны и история семьи — всегда неразрывны.`,
        `${value} исторических событий страны отражены рядом с семейными датами. Войны, революции, полёты в космос — всё это было фоном чьей-то жизни.`,
        `Число ${value} — столько исторических вех России соседствует в летописи с личными датами. Большая история всегда складывается из маленьких.`,
      ],
      custom: [
        `${value} ${declension(n, ['личное событие добавлено', 'личных события добавлено', 'личных событий добавлено'])} в летопись. Именно такие детали делают историю семьи живой и неповторимой.`,
        `${value} ${declension(n, ['запись', 'записи', 'записей'])} оставили хранители этой памяти. Каждая — маленький фрагмент большой мозаики.`,
        `${value} собственных события в летописи. Антропологи считают: семейные истории, записанные очевидцами, ценнее любых архивных документов.`,
      ],
    };

    const list = facts[key];
    if (!list || !list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function declension(n, forms) {
    const abs = Math.abs(n) % 100;
    const rem = abs % 10;
    if (abs > 10 && abs < 20) return forms[2];
    if (rem > 1 && rem < 5)   return forms[1];
    if (rem === 1)             return forms[0];
    return forms[2];
  }

  /* ── FACT POPUP ── */
  let factPopupTimer = null;

  function showFactPopup(key, value, anchorEl) {
    const fact = getStatFact(key, value);
    if (!fact) return;

    // Remove existing
    const old = document.getElementById('tl-fact-popup');
    if (old) old.remove();
    clearTimeout(factPopupTimer);

    const popup = document.createElement('div');
    popup.id = 'tl-fact-popup';

    const icons = { births:'✿', deaths:'✦', avgAge:'⏳', maxAge:'🕰', span:'📜', histEv:'❧', custom:'★' };
    const labels = { births:'Рождений', deaths:'Уходов', avgAge:'Средний возраст', maxAge:'Макс. возраст', span:'Лет охвата', histEv:'Событий истории', custom:'Своих событий' };

    popup.innerHTML = `
      <div class="tl-fact-popup__inner">
        <button class="tl-fact-popup__close" title="Закрыть">✕</button>
        <div class="tl-fact-popup__header">
          <span class="tl-fact-popup__icon">${icons[key] || '◆'}</span>
          <div>
            <div class="tl-fact-popup__num">${value}</div>
            <div class="tl-fact-popup__label">${labels[key] || ''}</div>
          </div>
        </div>
        <p class="tl-fact-popup__text">${fact}</p>
        <div class="tl-fact-popup__footer">Факт из летописи</div>
      </div>`;

    document.body.appendChild(popup);

    // Position near the clicked stat
    const rect = anchorEl.getBoundingClientRect();
    const popupEl = popup.querySelector('.tl-fact-popup__inner');

    // Horizontal: center over the stat, but keep in viewport
    let left = rect.left + rect.width / 2 - 160;
    left = Math.max(12, Math.min(left, window.innerWidth - 332));
    let top = rect.bottom + 12;
    if (top + 200 > window.innerHeight) top = rect.top - 220;

    popup.style.cssText = `
      position:fixed;z-index:9000;
      left:${left}px;top:${top}px;
      pointer-events:auto;`;

    // Animate in
    requestAnimationFrame(() => popup.classList.add('tl-fact-popup--visible'));

    // Close handlers
    popup.querySelector('.tl-fact-popup__close').addEventListener('click', () => closeFactPopup(popup));

    factPopupTimer = setTimeout(() => closeFactPopup(popup), 8000);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function outsideClose(e) {
        if (!popup.contains(e.target) && e.target !== anchorEl) {
          closeFactPopup(popup);
          document.removeEventListener('click', outsideClose);
        }
      });
    }, 100);
  }

  function closeFactPopup(popup) {
    if (!popup || !popup.parentNode) return;
    popup.classList.remove('tl-fact-popup--visible');
    setTimeout(() => popup.remove(), 350);
    clearTimeout(factPopupTimer);
  }

  /* ── STATS BAR ── */
  function buildStats(events) {
    const births   = events.filter(e => e.type === 'birth').length;
    const deaths   = events.filter(e => e.type === 'death').length;
    const custom   = events.filter(e => e.type === 'custom').length;
    const histEv   = events.filter(e => e.type === 'history').length;
    const allAges  = events.filter(e => Number.isFinite(e.age)).map(e => e.age);
    const avgAge   = allAges.length
      ? Math.round(allAges.reduce((s,a) => s+a, 0) / allAges.length)
      : '—';
    const maxAge   = allAges.length ? Math.max(...allAges) : '—';
    const span     = (events.length >= 2)
      ? (events[events.length-1].year - events[0].year)
      : 0;

    /* Active tree label */
    const treeMeta  = getActivTreeMeta();
    let treeName = treeMeta ? (treeMeta.name || treeMeta.id) : '';
    if (treeName && (treeName.includes('uuid') || treeName.length > 25)) {
      treeName = ''; // Hide raw UUIDs
    }
    const treeLabel = treeName
      ? `<div style="text-align:center;margin-bottom:8px;font-family:var(--font-ui);font-size:11px;letter-spacing:0.1em;opacity:0.5;">
           <span style="color:${treeMeta.color || '#c8a84b'};">▪ ${treeName}</span>
         </div>`
      : '';

    const stats = [
      { key: 'births',  val: births,  label: 'рождений' },
      { key: 'deaths',  val: deaths,  label: 'уходов' },
      { key: 'avgAge',  val: avgAge,  label: 'средний возраст' },
      { key: 'maxAge',  val: maxAge,  label: 'макс. возраст' },
      { key: 'span',    val: span,    label: 'лет охвата' },
      { key: 'histEv',  val: histEv,  label: 'событий истории' },
      { key: 'custom',  val: custom,  label: 'свои события' },
    ];

    const hasFact = key => getStatFact(key, stats.find(s => s.key === key)?.val) !== null;

    return `
      <div class="tl-stats">
        ${treeLabel}
        ${stats.map(s => `
          <div class="tl-stat ${hasFact(s.key) ? 'tl-stat--clickable' : ''}" data-stat-key="${s.key}" data-stat-val="${s.val}" title="${hasFact(s.key) ? 'Нажмите — интересный факт' : ''}">
            <span>${s.val}</span>
            <small>${s.label}</small>
            ${hasFact(s.key) ? '<i class="tl-stat__hint">?</i>' : ''}
          </div>`).join('')}
      </div>`;
  }

  /* ── MAIN RENDER ── */
  let activeType   = 'all';
  let yearFrom = '';
  let yearTo = '';

  function render() {
    const allEvents = normalizeEvents(buildEvents());

    /* Insert stats */
    let statsEl = document.getElementById('tl-stats-bar');
    if (!statsEl) {
      statsEl = document.createElement('div');
      statsEl.id = 'tl-stats-bar';
      wrap.parentElement.insertBefore(statsEl, wrap);
    }
    statsEl.innerHTML = buildStats(allEvents);

    /* Attach fact popup clicks */
    statsEl.querySelectorAll('.tl-stat--clickable').forEach(el => {
      el.addEventListener('click', () => {
        showFactPopup(el.dataset.statKey, el.dataset.statVal, el);
      });
    });

    /* Build / update filters */
    let filtersEl = document.getElementById('tl-filters');
    if (!filtersEl) {
      filtersEl = document.createElement('div');
      filtersEl.id = 'tl-filters';
      statsEl.after(filtersEl);
    }

    filtersEl.innerHTML = `
      <div class="tl-filters">
        <div class="tl-filters__group">
          <span class="tl-filters__label">Тип</span>
          ${['all','birth','death','history','custom'].map(t => `
            <button class="tl-filter-btn ${activeType===t?'tl-filter-btn--active':''}" data-ftype="${t}">
              ${t==='all'?'Все':t==='birth'?'Рождения':t==='death'?'Уходы':t==='history'?'История страны':'Мои события'}
            </button>`).join('')}
        </div>
        <div class="tl-filters__group">
          <span class="tl-filters__label">Эпоха</span>
          <button class="tl-filter-btn" data-epoch="all">Все</button>
          <button class="tl-filter-btn" data-epoch="pre1914">До 1914</button>
          <button class="tl-filter-btn" data-epoch="ww1-ww2">1914–1945</button>
          <button class="tl-filter-btn" data-epoch="ussr">1946–1991</button>
          <button class="tl-filter-btn" data-epoch="post1991">1992–н.в.</button>
          <div class="tl-range" style="margin-top:8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <span class="tl-filters__label" style="margin:0;">Годы</span>
            <div class="tl-number-wrapper" id="tl-year-from-wrap">
              <input class="tl-input tl-input--number" id="tl-year-from" type="number" placeholder="от" min="1600" max="2100" value="${yearFrom}"/>
              <div class="tl-number-arrows">
                <button type="button" class="tl-arrow-up" tabindex="-1">▲</button>
                <button type="button" class="tl-arrow-down" tabindex="-1">▼</button>
              </div>
            </div>
            <div class="tl-number-wrapper" id="tl-year-to-wrap">
              <input class="tl-input tl-input--number" id="tl-year-to" type="number" placeholder="до" min="1600" max="2100" value="${yearTo}"/>
              <div class="tl-number-arrows">
                <button type="button" class="tl-arrow-up" tabindex="-1">▲</button>
                <button type="button" class="tl-arrow-down" tabindex="-1">▼</button>
              </div>
            </div>
            <button class="tl-filter-btn" id="tl-year-clear" type="button">Сброс</button>
          </div>
        </div>
      </div>
      <div class="tl-controls-group">
        <label class="tl-toggle">
          <input type="checkbox" id="tl-toggle-history" ${showHistory ? 'checked' : ''} />
          <span class="tl-toggle__slider"></span>
          <span class="tl-toggle__label">Показывать историю страны</span>
        </label>
      </div>`;

    filtersEl.querySelectorAll('[data-ftype]').forEach(btn => {
      btn.addEventListener('click', () => { activeType = btn.dataset.ftype; render(); });
    });
    filtersEl.querySelectorAll('[data-epoch]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ep = btn.dataset.epoch;
        if (ep === 'all') { yearFrom=''; yearTo=''; }
        if (ep === 'pre1914') { yearFrom=''; yearTo='1913'; }
        if (ep === 'ww1-ww2') { yearFrom='1914'; yearTo='1945'; }
        if (ep === 'ussr') { yearFrom='1946'; yearTo='1991'; }
        if (ep === 'post1991') { yearFrom='1992'; yearTo=''; }
        render();
      });
    });

    const yf = filtersEl.querySelector('#tl-year-from');
    const yt = filtersEl.querySelector('#tl-year-to');
    const yc = filtersEl.querySelector('#tl-year-clear');
    const onRange = () => {
      yearFrom = (yf && yf.value) ? String(yf.value).trim() : '';
      yearTo   = (yt && yt.value) ? String(yt.value).trim() : '';
      render();
    };
    if (yf) yf.addEventListener('input', onRange);
    if (yt) yt.addEventListener('input', onRange);
    if (yc) yc.addEventListener('click', () => { yearFrom=''; yearTo=''; render(); });

    const setupCustomArrows = (inputEl, wrapperEl) => {
      if (!inputEl || !wrapperEl) return;
      const up = wrapperEl.querySelector('.tl-arrow-up');
      const down = wrapperEl.querySelector('.tl-arrow-down');
      if (up) {
        up.addEventListener('click', () => {
          if (!inputEl.value) {
            inputEl.value = inputEl.min || '1600';
          } else {
            inputEl.stepUp();
          }
          onRange();
        });
      }
      if (down) {
        down.addEventListener('click', () => {
          if (!inputEl.value) {
            inputEl.value = inputEl.max || '2100';
          } else {
            inputEl.stepDown();
          }
          onRange();
        });
      }
    };
    setupCustomArrows(yf, filtersEl.querySelector('#tl-year-from-wrap'));
    setupCustomArrows(yt, filtersEl.querySelector('#tl-year-to-wrap'));



    const historyToggle = filtersEl.querySelector('#tl-toggle-history');
    if (historyToggle) {
      historyToggle.addEventListener('change', e => {
        showHistory = e.target.checked;
        render();
      });
    }

    /* Filter events */
    const filtered = allEvents.filter(e => {
      const yf = yearFrom ? parseInt(yearFrom, 10) : null;
      const yt = yearTo   ? parseInt(yearTo, 10)   : null;
      const yearOk = (!yf || e.year >= yf) && (!yt || e.year <= yt);

      const typeOk   = activeType === 'all' || e.type === activeType;
      const historyOk = showHistory || e.type !== 'history';
      return yearOk && typeOk && historyOk;
    });

    /* Clear and rebuild timeline items */
    wrap.querySelectorAll('.timeline__item').forEach(el => el.remove());

    if (!filtered.length) {
      wrap.insertAdjacentHTML('beforeend',
        `<p style="text-align:center;color:var(--cream-dim);font-style:italic;padding:60px 0;">
           Нет событий для выбранных фильтров</p>`);
    } else {
      wrap.insertAdjacentHTML('beforeend', filtered.map(buildEventHTML).join(''));
    }

    /* Delete custom events */
    wrap.querySelectorAll('.timeline__del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.id;

        if (dbCustomEvents.some(ev => ev.id === id) && typeof API !== 'undefined') {
          API.del(`/api/timeline-events/${encodeURIComponent(id)}`)
            .then(res => {
              if (res && res.ok) {
                loadDbData();
              }
            })
            .catch(err => {
              console.error('Failed to delete timeline event from DB:', err);
            });
        }

        const arr = loadCustom().filter(ev => ev.id !== id);
        saveCustom(arr);
        render();
      });
    });

    /* Scroll reveal */
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add('is-visible');
          io.unobserve(en.target);
          setTimeout(updateTimelineParallax, 50);
        }
      });
    }, { threshold: 0.12 });
    wrap.querySelectorAll('.timeline__item').forEach(el => io.observe(el));

    // Parallax effect on scroll
    function updateTimelineParallax() {
      const items = wrap.querySelectorAll('.timeline__item.is-visible');
      const viewportHeight = window.innerHeight;
      
      items.forEach(item => {
        const rect = item.getBoundingClientRect();
        const itemCenter = rect.top + rect.height / 2;
        const relativeCenter = (itemCenter - viewportHeight / 2) / (viewportHeight / 2); // range -1.5 to 1.5
        
        const isLeft = item.classList.contains('timeline__item--left');
        const direction = isLeft ? -1 : 1;
        
        const translateY = relativeCenter * 15; // moves slightly up/down
        const rotateY = relativeCenter * direction * 4; // tilts slightly
        const scale = 1 - Math.min(0.04, Math.abs(relativeCenter) * 0.04);
        
        const card = item.querySelector('.timeline__card');
        if (card) {
          card.style.transform = `translateY(${translateY}px) rotateY(${rotateY}deg) scale(${scale})`;
        }
      });
    }

    if (window._tlParallaxHandler) {
      window.removeEventListener('scroll', window._tlParallaxHandler);
    }
    window._tlParallaxHandler = updateTimelineParallax;
    window.addEventListener('scroll', updateTimelineParallax, { passive: true });
    setTimeout(updateTimelineParallax, 150);
  }

  /* ── ADD EVENT FORM ── */
  function buildForm() {
    const formSection = document.getElementById('tl-add-form');
    if (!formSection) return;

    formSection.innerHTML = `
      <div class="tl-add-form__inner">
        <h2 class="tl-add-form__title">Добавить событие</h2>
        <p class="tl-add-form__sub">Свадьба, переезд, важная дата — то, чего нет в общих данных</p>
        <form id="tl-form">
          <div class="tl-form-row">
            <div class="tl-form-field">
              <label>Год *</label>
              <input type="number" name="year" min="1800" max="2100" placeholder="1978" required class="tl-input"/>
            </div>
            <div class="tl-form-field">
              <label>Тип</label>
              <select name="type" class="tl-input">
                <option value="custom">Событие семьи</option>
                <option value="birth">Рождение</option>
                <option value="death">Уход</option>
              </select>
            </div>
          </div>
          <div class="tl-form-field">
            <label>Заголовок *</label>
            <input type="text" name="title" placeholder="Переезд в Москву" required class="tl-input" maxlength="80"/>
          </div>
          <div class="tl-form-field">
            <label>Описание</label>
            <input type="text" name="subtitle" placeholder="Короткое описание события" class="tl-input" maxlength="160"/>
          </div>
          <div class="tl-form-row">
            <div class="tl-form-field">
              <label>Город</label>
              <input type="text" name="city" placeholder="Санкт-Петербург" class="tl-input" maxlength="60"/>
            </div>
            <div class="tl-form-field">
              <label>Иконка</label>
              <input type="text" name="icon" placeholder="🏠" class="tl-input tl-input--icon" maxlength="4"/>
            </div>
          </div>
          <button type="submit" class="tl-submit">Добавить в летопись</button>
          <p class="tl-form__status" id="tl-status" style="display:none"></p>
        </form>
      </div>`;

    document.getElementById('tl-form').addEventListener('submit', e => {
      e.preventDefault();
      const fd  = new FormData(e.target);
      const ev  = {
        id:       Date.now().toString(36),
        year:     parseInt(fd.get('year'), 10),
        type:     fd.get('type') || 'custom',
        title:    (fd.get('title') || '').trim(),
        subtitle: (fd.get('subtitle') || '').trim(),
        city:     (fd.get('city')    || '').trim(),
        icon:     (fd.get('icon')    || '').trim() || '★',
      };
      if (!ev.year || !ev.title) return;

      const arr = loadCustom();
      arr.push(ev);
      saveCustom(arr);

      if (typeof API !== 'undefined') {
        const treeId = getActiveTreeId() || 'default';
        API.post('/api/timeline-events', {
          treeId,
          year: ev.year,
          type: ev.type,
          title: ev.title,
          subtitle: ev.subtitle,
          city: ev.city,
          icon: ev.icon,
        }).then(res => {
          if (res && res.ok) {
            loadDbData();
          }
        }).catch(err => {
          console.error('Failed to save timeline event to DB:', err);
        });
      }

      e.target.reset();
      const status = document.getElementById('tl-status');
      status.style.display = 'block';
      status.textContent   = `✦ "${ev.title}" добавлено в ${ev.year} году`;
      setTimeout(() => { status.style.display = 'none'; }, 3000);

      activeType   = 'all';
      render();
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* INIT */
  async function loadPhotos() {
    try {
      if (typeof API !== 'undefined') {
        const [profilesRes, peopleRes] = await Promise.all([
          API.get('/api/profiles').catch(() => null),
          API.get('/api/people?page=1&limit=100').catch(() => null)
        ]);
        
        const list = [];
        if (profilesRes?.data) list.push(...profilesRes.data);
        if (peopleRes?.data) list.push(...peopleRes.data);
        
        const seen = new Set();
        dbProfiles = [];
        list.forEach(p => {
          if (p.id && !seen.has(p.id)) {
            seen.add(p.id);
            dbProfiles.push(p);
            photoMap[p.id] = p.photo || p.photo_url || '';
          }
        });
        render();
      }
    } catch (e) {
      console.error(e);
    }
  }

 async function loadDbData() {
  const treeId = getActiveTreeId();
  try {
    if (typeof API !== 'undefined') {
      // 1. Узлы текущего дерева (если выбрано)
      // 2. Историчесие + кастомные — общим запросом без treeId
      const requests = [
        API.get('/api/timeline-events').catch(() => null),  // общая летопись
      ];
      if (treeId) {
        requests.push(API.get(`/api/family-nodes?treeId=${encodeURIComponent(treeId)}`).catch(() => null));
      }
      const [allEventsRes, nodesRes] = await Promise.all(requests);

      if (nodesRes && nodesRes.ok && Array.isArray(nodesRes.data)) {
        dbNodes = nodesRes.data;
      }
      if (allEventsRes && allEventsRes.ok && Array.isArray(allEventsRes.data)) {
        const all = allEventsRes.data;
        dbHistoricalEvents = all.filter(e => e.category === 'historical');
        dbCustomEvents     = all.filter(e =>
          e.category !== 'historical' &&
          e.category !== 'birth' &&
          e.category !== 'death'
        );
      }
      render();
    }
  } catch (e) {
    console.warn('Failed to load database events for timeline:', e);
  }
}

  loadPhotos();
  loadDbData();
  render();
  buildForm();
})();

/* ═══════════════════════════════════════════════
   Fallback для img.timeline__avatar — SVG placeholder при error
   ═══════════════════════════════════════════════ */
document.addEventListener('error', function (ev) {
  const t = ev.target;
  if (!t || !t.matches) return;
  if (!t.matches('img.timeline__avatar[data-tl-avatar]')) return;
  t.outerHTML = '<div class="timeline__avatar--empty"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:24px;height:24px;fill:currentColor;"><circle cx="12" cy="7" r="4"/><path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8"/></svg></div>';
}, true);
