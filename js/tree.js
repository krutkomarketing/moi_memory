/* ═══════════════════════════════════════════════
   FAMILY TREE — Braided SVG threads + clan colours
   Bottom = oldest, Top = youngest
   Click node → highlight lineage OR open person page
   Click 2 nodes → draw animated connection between them
   ═══════════════════════════════════════════════ */

(function () {

  /* ═══════════ CLAN DEFINITIONS ═══════════
     Each clan gets a colour, icon and display name.
     Every person carries a clanId.
  */
  const CLANS = {
    ivanov:   { name: 'Род Ивановых',   color: '#c8a84b', colorDim: '#6b5a22', icon: '⚔', desc: 'Потомственные инженеры и военные' },
    smirnov:  { name: 'Род Смирновых',  color: '#7ec8b4', colorDim: '#2e6b5e', icon: '⚕', desc: 'Врачи и учёные' },
    kozlov:   { name: 'Род Козловых',   color: '#c87e7e', colorDim: '#6b2e2e', icon: '✦', desc: 'Архитекторы и строители' },
  };

  /* ═══════════ GENERATIONS ═══════════
     clanId → determines colour of the card border & thread
     personId → links to person page (matches data.js ids)
  */
  const GENERATIONS = [
    {
      label: 'Прапрародители',
      ageClass: 'old',
      people: [
        { id: 'g0p0', name: 'Иванов\nНиколай', years: '1880–1951', spouseOf: 'g0p1', clanId: 'ivanov',  personPageId: 'ivanov-nikolai' },
        { id: 'g0p1', name: 'Иванова\nМария',   years: '1883–1960', spouseOf: 'g0p0', clanId: 'ivanov',  personPageId: 'ivanova-maria' },
        { id: 'g0p2', name: 'Смирнов\nВасилий', years: '1878–1945', spouseOf: 'g0p3', clanId: 'smirnov', personPageId: 'smirnov-petr' },
        { id: 'g0p3', name: 'Смирнова\nАнна',   years: '1882–1950', spouseOf: 'g0p2', clanId: 'smirnov', personPageId: 'smirnova-anna' },
      ],
      childrenMap: { 'g0p0': ['g1p0'], 'g0p2': ['g1p2'] }
    },
    {
      label: 'Прародители',
      ageClass: 'old',
      people: [
        { id: 'g1p0', name: 'Иванов\nПётр',    years: '1910–1978', spouseOf: 'g1p1', clanId: 'ivanov',  personPageId: 'ivanov-nikolai' },
        { id: 'g1p1', name: 'Иванова\nНина',    years: '1914–1983', spouseOf: 'g1p0', clanId: 'ivanov',  personPageId: 'ivanova-maria' },
        { id: 'g1p2', name: 'Смирнов\nАлексей', years: '1908–1970', spouseOf: 'g1p3', clanId: 'smirnov', personPageId: 'smirnov-petr' },
        { id: 'g1p3', name: 'Смирнова\nТатьяна',years: '1912–1980', spouseOf: 'g1p2', clanId: 'smirnov', personPageId: 'smirnova-anna' },
      ],
      childrenMap: { 'g1p0': ['g2p0'], 'g1p2': ['g2p2'] }
    },
    {
      label: 'Родители',
      ageClass: 'young',
      people: [
        { id: 'g2p0', name: 'Иванов\nСергей',   years: '1945–2010', spouseOf: 'g2p1', clanId: 'ivanov',  personPageId: 'ivanov-nikolai' },
        { id: 'g2p1', name: 'Иванова\nОльга',    years: '1948–2015', spouseOf: 'g2p0', clanId: 'ivanov',  personPageId: 'ivanova-maria' },
        { id: 'g2p2', name: 'Смирнов\nДмитрий',  years: '1943–2005', spouseOf: 'g2p3', clanId: 'smirnov', personPageId: 'smirnov-petr' },
        { id: 'g2p3', name: 'Смирнова\nЕлена',   years: '1947–2018', spouseOf: 'g2p2', clanId: 'smirnov', personPageId: 'smirnova-anna' },
      ],
      childrenMap: { 'g2p0': ['g3p0', 'g3p1'], 'g2p2': ['g3p2'] }
    },
    {
      label: 'Наше поколение',
      ageClass: 'young',
      people: [
        { id: 'g3p0', name: 'Иванов\nМихаил',  years: '1972–',  spouseOf: 'g3p3', clanId: 'ivanov',  personPageId: 'ivanov-nikolai' },
        { id: 'g3p1', name: 'Иванова\nЮлия',   years: '1975–',  spouseOf: null,   clanId: 'ivanov',  personPageId: 'ivanova-maria' },
        { id: 'g3p2', name: 'Смирнова\nКсения', years: '1970–', spouseOf: null,   clanId: 'smirnov', personPageId: 'smirnova-anna' },
        { id: 'g3p3', name: 'Козлова\nАлина',   years: '1974–', spouseOf: 'g3p0', clanId: 'kozlov',  personPageId: 'kozlova-lyudmila' },
      ],
      childrenMap: {}
    },
  ];

  /* flat id→person map */
  const personById = {};
  GENERATIONS.forEach(g => g.people.forEach(p => { personById[p.id] = p; }));

  /* ── Если кастомное дерево — tree.js не рисует статику ── */
  const _urlTree = new URLSearchParams(window.location.search).get('tree');
  if (_urlTree && _urlTree !== 'default') return;

  /* ── DOM SETUP ── */
  const wrapper = document.getElementById('tree-wrapper');
  const svgEl   = document.getElementById('tree-threads');
  const gensEl  = document.getElementById('tree-generations');
  if (!wrapper || !svgEl || !gensEl) return;

  const nodeEls   = {};
  const threadEls = {};

  const personSVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="7" r="4"/>
    <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8"/>
  </svg>`;

  /* ── BUILD CLAN LEGEND ── */
  const legendWrap = document.getElementById('tree-clan-legend');
  if (legendWrap) {
    legendWrap.innerHTML = Object.entries(CLANS).map(([id, c]) => `
      <div class="clan-legend__item" data-clan="${id}">
        <span class="clan-legend__badge" style="background:${c.color};box-shadow:0 0 10px ${c.color}44;">${c.icon}</span>
        <div class="clan-legend__text">
          <strong>${c.name}</strong>
          <span>${c.desc}</span>
        </div>
      </div>`).join('');

    legendWrap.querySelectorAll('[data-clan]').forEach(item => {
      item.addEventListener('click', () => {
        const cid = item.dataset.clan;
        filterByClan(cid === activeClan ? null : cid);
        legendWrap.querySelectorAll('[data-clan]').forEach(el =>
          el.classList.toggle('clan-legend__item--active', el.dataset.clan === cid && cid !== activeClan));
      });
    });
  }

  /* ── BUILD GENERATION ROWS ── */
  const reversed = [...GENERATIONS].reverse();

  reversed.forEach((gen, ri) => {
    const genIndex = GENERATIONS.length - 1 - ri;
    const rowWrap  = document.createElement('div');

    const lbl = document.createElement('div');
    lbl.className = 'gen-label';
    lbl.textContent = gen.label;
    rowWrap.appendChild(lbl);

    const row = document.createElement('div');
    row.className = 'gen-row';
    row.dataset.genIndex = genIndex;

    gen.people.forEach(person => {
      const clan = CLANS[person.clanId] || CLANS.ivanov;
      const node = document.createElement('div');
      node.className = `tree-node tree-node--${gen.ageClass} tree-node--clan-${person.clanId}`;
      node.dataset.id     = person.id;
      node.dataset.clan   = person.clanId;
      node.tabIndex       = 0;

      const nameParts = person.name.split('\n');
      const clanIcon  = clan.icon;

      node.innerHTML = `
        <div class="tree-node__frame" title="${nameParts.join(' ')}"
             style="--clan-color:${clan.color};--clan-dim:${clan.colorDim}">
          <span class="tree-node__clan-badge" title="${clan.name}">${clanIcon}</span>
          <div class="tree-node__photo">
            <div class="tree-node__avatar">${personSVG}</div>
          </div>
        </div>
        <div class="tree-node__info">
          <div class="tree-node__name">${nameParts[0]}<br/>${nameParts[1] || ''}</div>
          <div class="tree-node__years">${person.years}</div>
          <div class="tree-node__clan-name" style="color:${clan.color}">${clan.name}</div>
        </div>`;

      row.appendChild(node);
      nodeEls[person.id] = node;
    });

    rowWrap.appendChild(row);
    gensEl.appendChild(rowWrap);
  });

  /* ── RELATIONSHIP GRAPH ── */
  const parentsOf  = {};
  const childrenOf = {};
  const spouseOf   = {};

  GENERATIONS.forEach(gen => {
    gen.people.forEach(p => { if (p.spouseOf) spouseOf[p.id] = p.spouseOf; });
    Object.entries(gen.childrenMap || {}).forEach(([parentId, kids]) => {
      childrenOf[parentId] = (childrenOf[parentId] || []).concat(kids);
      const sp = spouseOf[parentId];
      if (sp) childrenOf[sp] = (childrenOf[sp] || []).concat(kids);
      kids.forEach(k => {
        parentsOf[k] = parentsOf[k] || [];
        if (!parentsOf[k].includes(parentId)) parentsOf[k].push(parentId);
        if (sp && !parentsOf[k].includes(sp)) parentsOf[k].push(sp);
      });
    });
  });

  function getAncestors(id, acc = new Set()) {
    (parentsOf[id] || []).forEach(p => { if (!acc.has(p)) { acc.add(p); getAncestors(p, acc); } });
    return acc;
  }
  function getDescendants(id, acc = new Set()) {
    (childrenOf[id] || []).forEach(c => { if (!acc.has(c)) { acc.add(c); getDescendants(c, acc); } });
    return acc;
  }

  /* ── THREAD DRAWING ── */
  function getFrameCenter(el) {
    const frame = el.querySelector('.tree-node__frame');
    const wRect = wrapper.getBoundingClientRect();
    const fRect = frame.getBoundingClientRect();
    return {
      x: fRect.left - wRect.left + fRect.width  / 2,
      y: fRect.top  - wRect.top  + fRect.height / 2,
      top:    fRect.top  - wRect.top,
      bottom: fRect.bottom - wRect.top,
      left:   fRect.left - wRect.left,
      right:  fRect.right - wRect.left,
    };
  }

  function braidedPath(x1, y1, x2, y2, strands = 3, amplitude = 6) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(16, Math.floor(len / 8));
    const paths = [];
    for (let s = 0; s < strands; s++) {
      const phase = (s / strands) * Math.PI * 2;
      let d = `M ${x1} ${y1}`;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const px = x1 + dx * t, py = y1 + dy * t;
        const nx = -dy / len, ny = dx / len;
        const wave = Math.sin(t * Math.PI * 3 + phase) * amplitude;
        d += ` L ${(px + nx * wave).toFixed(2)} ${(py + ny * wave).toFixed(2)}`;
      }
      paths.push(d);
    }
    return paths;
  }

  /* Кубический Безье — утилиты для плавных кривых снизу карточек */
  function cubicB(p0,p1,p2,p3,t){const m=1-t;return m*m*m*p0+3*m*m*t*p1+3*m*t*t*p2+t*t*t*p3;}
  function cubicBd(p0,p1,p2,p3,t){const m=1-t;return 3*(m*m*(p1-p0)+2*m*t*(p2-p1)+t*t*(p3-p2));}

  function createThread(d, color, width, delay) {    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', width);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.classList.add('thread-path');
    path.dataset.delay = delay;
    return path;
  }

  /* derive clan thread colours */
  function clanColors(clanId) {
    const c = CLANS[clanId] || CLANS.ivanov;
    return [c.color, c.colorDim, c.color + 'bb'];
  }

  function drawThreads() {
    svgEl.innerHTML = '';
    for (const k in threadEls) delete threadEls[k];

    const wh = wrapper.offsetHeight, ww = wrapper.offsetWidth;
    svgEl.setAttribute('viewBox', `0 0 ${ww} ${wh}`);
    svgEl.setAttribute('width', ww);
    svgEl.setAttribute('height', wh);

    let delay = 0.1;

    GENERATIONS.forEach((gen, gi) => {
      /* Spouse connections — from BOTTOM of frames */
      gen.people.forEach(person => {
        if (person.spouseOf && person.id < person.spouseOf) {
          const a = nodeEls[person.id], b = nodeEls[person.spouseOf];
          if (!a || !b) return;

          const ca = getFrameCenter(a), cb = getFrameCenter(b);
          /* Берём низ карточки, небольшая дуга вниз */
          const x1 = ca.x, y1 = ca.bottom;
          const x2 = cb.x, y2 = cb.bottom;
          const drop = 36;

          const colors = clanColors(person.clanId);
          const steps  = 32;
          for (let s = 0; s < 3; s++) {
            const phase = (s / 3) * Math.PI * 2;
            let d = `M ${x1} ${y1}`;
            for (let i = 1; i <= steps; i++) {
              const t  = i / steps;
              const bx = cubicB(x1, x1, x2, x2, t);
              const by = cubicB(y1, y1 + drop, y2 + drop, y2, t);
              const tx = cubicBd(x1, x1, x2, x2, t);
              const ty = cubicBd(y1, y1 + drop, y2 + drop, y2, t);
              const tl = Math.hypot(tx, ty) || 1;
              const nx = -ty / tl;
              const wave = Math.sin(t * Math.PI * 4 + phase) * 3;
              d += ` L ${(bx + nx * wave).toFixed(1)} ${(by + nx * wave * 0).toFixed(1)}`;
            }
            const path = createThread(d, colors[s % colors.length], 1.2, delay);
            path.dataset.kind = 'spouse';
            path.dataset.a    = person.id;
            path.dataset.b    = person.spouseOf;
            path.dataset.clan = person.clanId;
            svgEl.appendChild(path);
            const key = `spouse:${person.id}::${person.spouseOf}`;
            if (!threadEls[key]) threadEls[key] = [];
            threadEls[key].push(path);
          }
          delay += 0.05;
        }
      });

      if (gi + 1 >= GENERATIONS.length) return;

      /* Parent → child — from BOTTOM of parent, to BOTTOM of child (arc down) */
      Object.entries(gen.childrenMap || {}).forEach(([parentId, childIds]) => {
        const parentEl = nodeEls[parentId];
        if (!parentEl) return;
        const cp = getFrameCenter(parentEl);
        const parentClan = personById[parentId]?.clanId || 'ivanov';

        childIds.forEach(childId => {
          const childEl = nodeEls[childId];
          if (!childEl) return;
          const cc = getFrameCenter(childEl);

          /* От низа родителя к низу ребёнка — дуга через пространство между рядами */
          const x1 = cp.x, y1 = cp.bottom;
          const x2 = cc.x, y2 = cc.bottom;
          const midY = (y1 + y2) / 2 + 20;

          const colors = clanColors(parentClan);
          const strands = braidedPath(x1, y1, x2, y2, 3, 3);
          const key = `parent:${parentId}->${childId}`;
          threadEls[key] = [];
          strands.forEach((d, si) => {
            const path = createThread(d, colors[si % colors.length], 1.4, delay);
            path.dataset.kind = 'parent';
            path.dataset.a    = parentId;
            path.dataset.b    = childId;
            path.dataset.clan = parentClan;
            svgEl.appendChild(path);
            threadEls[key].push(path);
          });
          delay += 0.12;
        });
      });
    });

    /* Animate draw */
    requestAnimationFrame(() => {
      svgEl.querySelectorAll('.thread-path').forEach(p => {
        const len = p.getTotalLength ? p.getTotalLength() : 1000;
        p.setAttribute('stroke-dasharray', len);
        p.setAttribute('stroke-dashoffset', len);
        const del = parseFloat(p.dataset.delay || 0);
        p.style.transition = `stroke-dashoffset 1.8s ease ${del}s, stroke 0.5s, stroke-width 0.5s, opacity 0.4s`;
        requestAnimationFrame(() => { p.style.strokeDashoffset = '0'; });
      });
    });

    if (activeClan) applyFilter(activeClan);
  }

  /* ── CLAN FILTER ── */
  let activeClan = null;

  function filterByClan(clanId) {
    activeClan = clanId;
    clearHighlight();
    applyFilter(clanId);
  }

  function applyFilter(clanId) {
    Object.values(nodeEls).forEach(el => {
      if (!clanId || el.dataset.clan === clanId)
        el.classList.remove('tree-node--clan-dim');
      else
        el.classList.add('tree-node--clan-dim');
    });
    svgEl.querySelectorAll('.thread-path').forEach(p => {
      if (!clanId || p.dataset.clan === clanId)
        p.classList.remove('thread-path--clan-dim');
      else
        p.classList.add('thread-path--clan-dim');
    });
  }

  /* ── LINEAGE HIGHLIGHT ── */
  let highlightedId = null;

  function clearHighlight() {
    highlightedId = null;
    wrapper.classList.remove('has-highlight');
    Object.values(nodeEls).forEach(el =>
      el.classList.remove('tree-node--active','tree-node--ancestor','tree-node--descendant','tree-node--dim'));
    svgEl.querySelectorAll('.thread-path').forEach(p =>
      p.classList.remove('thread-path--active','thread-path--dim'));
    if (activeClan) applyFilter(activeClan);
  }

  function highlight(id) {
    if (highlightedId === id) { clearHighlight(); return; }
    clearHighlight();
    highlightedId = id;
    wrapper.classList.add('has-highlight');

    const ancestors   = getAncestors(id);
    const descendants = getDescendants(id);
    const spouse      = spouseOf[id];
    const lineageSet  = new Set([id, ...ancestors, ...descendants]);
    if (spouse) lineageSet.add(spouse);

    Object.entries(nodeEls).forEach(([nid, el]) => {
      if (nid === id || nid === spouse)  el.classList.add('tree-node--active');
      else if (ancestors.has(nid))       el.classList.add('tree-node--ancestor');
      else if (descendants.has(nid))     el.classList.add('tree-node--descendant');
      else                               el.classList.add('tree-node--dim');
    });

    svgEl.querySelectorAll('.thread-path').forEach(p => {
      const isActive = lineageSet.has(p.dataset.a) && lineageSet.has(p.dataset.b);
      p.classList.add(isActive ? 'thread-path--active' : 'thread-path--dim');
    });
  }

  /* ── CONNECT MODE: click 2 cards → draw animated thread ── */
  let connectMode  = false;
  let connectFirst = null; // id of first selected node
  const customConnections = []; // { a, b, type } — user-drawn connections

  function enterConnectMode() {
    connectMode  = true;
    connectFirst = null;
    wrapper.classList.add('connect-mode');
    clearHighlight();
    showConnectHint('Кликните на первую карточку…');
  }
  function exitConnectMode() {
    connectMode  = false;
    connectFirst = null;
    wrapper.classList.remove('connect-mode');
    Object.values(nodeEls).forEach(el => el.classList.remove('connect-selected'));
    hideConnectHint();
  }

  function showConnectHint(msg) {
    let h = document.getElementById('connect-hint');
    if (!h) {
      h = document.createElement('div');
      h.id = 'connect-hint';
      document.body.appendChild(h);
    }
    h.textContent = msg;
    h.style.cssText = `
      position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
      background:rgba(12,12,12,0.92);border:1px solid rgba(200,168,75,0.4);
      border-radius:30px;padding:10px 28px;
      font-family:var(--font-body);font-size:14px;font-style:italic;
      color:var(--gold-light,#e2c97e);z-index:9999;
      backdrop-filter:blur(10px);box-shadow:0 8px 32px rgba(0,0,0,0.5);
      animation:fadeInUp 0.3s ease;pointer-events:none;`;
  }
  function hideConnectHint() {
    const h = document.getElementById('connect-hint');
    if (h) h.remove();
  }

  /* Draw one animated braided thread between two nodes, snapping to BOTTOM of cards */
  function drawAnimatedConnection(idA, idB, connType) {
    const elA = nodeEls[idA], elB = nodeEls[idB];
    if (!elA || !elB) return;

    const cA = getFrameCenter(elA), cB = getFrameCenter(elB);

    /* Точки — низ центра каждой карточки */
    const x1 = cA.x, y1 = cA.bottom;
    const x2 = cB.x, y2 = cB.bottom;

    const personA    = personById[idA];
    const isMarriage = connType === 'spouse';

    /* U-образный спуск под карточки */
    const drop = Math.min(Math.abs(y2 - y1) * 0.4 + 50, 130);
    const cy1  = y1 + drop;
    const cy2  = y2 + drop;

    const colors = isMarriage
      ? ['#e2c97e', '#c8a84b', '#e2c97ebb']
      : clanColors(personA?.clanId || 'ivanov');

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('custom-connection');
    group.dataset.a = idA;
    group.dataset.b = idB;

    if (isMarriage) {
      /* Три плетёные нити вдоль кривой */
      const steps = 40;
      for (let s = 0; s < 3; s++) {
        const phase = (s / 3) * Math.PI * 2;
        let d = `M ${x1} ${y1}`;
        for (let i = 1; i <= steps; i++) {
          const t  = i / steps;
          const bx = cubicB(x1, x1, x2, x2, t);
          const by = cubicB(y1, cy1, cy2, y2, t);
          const tx = cubicBd(x1, x1, x2, x2, t);
          const ty = cubicBd(y1, cy1, cy2, y2, t);
          const tl = Math.hypot(tx, ty) || 1;
          const nx = -ty / tl, ny = tx / tl;
          const wave = Math.sin(t * Math.PI * 5 + phase) * 5;
          d += ` L ${(bx + nx * wave).toFixed(1)} ${(by + ny * wave).toFixed(1)}`;
        }
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', colors[s % colors.length]);
        path.setAttribute('stroke-width', '1.8');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.classList.add('thread-path', 'thread-path--custom');
        if (s === 0) path.style.filter = 'drop-shadow(0 0 4px rgba(226,201,126,0.5))';
        group.appendChild(path);
      }
    } else {
      /* Одна плавная кривая */
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`);
      path.setAttribute('stroke', colors[0]);
      path.setAttribute('stroke-width', '1.8');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.classList.add('thread-path', 'thread-path--custom');
      group.appendChild(path);
    }

    /* Бриллиант по центру дуги */
    const mx = (x1 + x2) / 2;
    const my = cubicB(y1, cy1, cy2, y2, 0.5);
    const diamond = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const ds = 6;
    diamond.setAttribute('d', `M ${mx} ${my-ds} L ${mx+ds} ${my} L ${mx} ${my+ds} L ${mx-ds} ${my} Z`);
    diamond.setAttribute('fill', isMarriage ? '#e2c97e' : (CLANS[personA?.clanId]?.color || '#c8a84b'));
    diamond.setAttribute('stroke', 'rgba(8,8,8,0.5)');
    diamond.setAttribute('stroke-width', '1');
    diamond.classList.add('thread-diamond');
    diamond.style.opacity = '0';
    group.appendChild(diamond);

    svgEl.appendChild(group);

    /* Анимация рисования */
    requestAnimationFrame(() => {
      group.querySelectorAll('.thread-path').forEach((p, i) => {
        const len = p.getTotalLength ? p.getTotalLength() : 600;
        p.setAttribute('stroke-dasharray', len);
        p.setAttribute('stroke-dashoffset', len);
        p.style.transition = `stroke-dashoffset 1.3s cubic-bezier(0.4,0,0.2,1) ${i * 0.08}s`;
        requestAnimationFrame(() => { p.style.strokeDashoffset = '0'; });
      });
      setTimeout(() => {
        diamond.style.transition = 'opacity 0.5s, transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
        diamond.style.opacity    = '1';
        diamond.style.transformOrigin = `${mx}px ${my}px`;
        let sc = 1;
        setInterval(() => { sc = sc === 1 ? 1.3 : 1; diamond.style.transform = `scale(${sc})`; }, 1600);
      }, 1400);
    });
  }

  /* Кубический Безье */
  function cubicB(p0,p1,p2,p3,t) { const m=1-t; return m*m*m*p0+3*m*m*t*p1+3*m*t*t*p2+t*t*t*p3; }
  function cubicBd(p0,p1,p2,p3,t){ const m=1-t; return 3*(m*m*(p1-p0)+2*m*t*(p2-p1)+t*t*(p3-p2)); }

  /* ── CLICK: single tap = highlight or connect, double tap = open page ── */
  const clickTimers = {};
  Object.entries(nodeEls).forEach(([id, el]) => {
    el.addEventListener('click', e => {
      e.stopPropagation();

      // CONNECT MODE
      if (connectMode) {
        if (!connectFirst) {
          connectFirst = id;
          el.classList.add('connect-selected');
          showConnectHint('Теперь кликните на вторую карточку…');
        } else if (connectFirst !== id) {
          // Draw connection
          const connType = prompt(
            'Тип соединения:\n1 — Брачный союз\n2 — Родство\nВведите 1 или 2:',
            '1'
          );
          const type = connType === '2' ? 'kin' : 'spouse';
          customConnections.push({ a: connectFirst, b: id, type });
          drawAnimatedConnection(connectFirst, id, type);
          nodeEls[connectFirst].classList.remove('connect-selected');
          exitConnectMode();
        }
        return;
      }

      if (clickTimers[id]) {
        // double click → navigate
        clearTimeout(clickTimers[id]);
        delete clickTimers[id];
        const person = personById[id];
        if (person?.personPageId) {
          window.location.href = `person.html?id=${person.personPageId}`;
        }
      } else {
        clickTimers[id] = setTimeout(() => {
          delete clickTimers[id];
          highlight(id);
        }, 260);
      }
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const person = personById[id];
        if (person?.personPageId) window.location.href = `person.html?id=${person.personPageId}`;
      }
      if (e.key === ' ')      { e.preventDefault(); highlight(id); }
      if (e.key === 'Escape') {
        if (connectMode) exitConnectMode();
        else clearHighlight();
      }
    });
  });

  document.addEventListener('click', e => {
    if (connectMode && !e.target.closest('.tree-node')) { exitConnectMode(); return; }
    if (!e.target.closest('.tree-node') && !e.target.closest('.clan-legend__item')) clearHighlight();
  });

  /* ── CONNECT BUTTON ── */
  const connectBtn = document.getElementById('tree-connect-btn');
  if (connectBtn) {
    /* Снять возможный дублирующийся listener */
    const freshBtn = connectBtn.cloneNode(true);
    connectBtn.replaceWith(freshBtn);
    freshBtn.addEventListener('click', () => {
      if (connectMode) exitConnectMode();
      else enterConnectMode();
    });
  }

  /* ── CREATE TREE BUTTON — handled by tree-edit.js ── */
  /* tree-edit.js already handles #tree-create-btn with full modal */

  function openCreateTreeModal() {
    // Remove existing modal if any
    const old = document.getElementById('create-tree-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'create-tree-modal';
    modal.innerHTML = `
      <div class="ctm-backdrop"></div>
      <div class="ctm-panel">
        <button class="ctm-close" title="Закрыть">✕</button>
        <h2 class="ctm-title">Создать <em>новое древо</em></h2>
        <p class="ctm-sub">Заполните данные первого предка — от него начнётся родословная</p>

        <div class="ctm-photo-wrap">
          <div class="ctm-photo-preview" id="ctm-photo-preview">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="40" height="40">
              <circle cx="12" cy="7" r="4" fill="currentColor"/>
              <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8" fill="currentColor"/>
            </svg>
          </div>
          <label class="ctm-photo-label" for="ctm-photo-input">
            📷 Прикрепить фото
            <input type="file" id="ctm-photo-input" accept="image/*" style="display:none">
          </label>
        </div>

        <form id="ctm-form">
          <div class="ctm-grid">
            <div class="ctm-field">
              <label>Имя *</label>
              <input type="text" name="firstName" placeholder="Иван" required class="ctm-input"/>
            </div>
            <div class="ctm-field">
              <label>Отчество</label>
              <input type="text" name="middleName" placeholder="Петрович" class="ctm-input"/>
            </div>
            <div class="ctm-field">
              <label>Фамилия *</label>
              <input type="text" name="lastName" placeholder="Иванов" required class="ctm-input"/>
            </div>
            <div class="ctm-field">
              <label>Статус в роде</label>
              <select name="role" class="ctm-input ctm-select">
                <option value="progenitor">Прародитель рода</option>
                <option value="patriarch">Патриарх / Матриарх</option>
                <option value="parent">Родитель</option>
                <option value="grandparent">Дед / Бабушка</option>
                <option value="greatgrandparent">Прапрадед / Прапрабабушка</option>
              </select>
            </div>
            <div class="ctm-field">
              <label>Год рождения</label>
              <input type="number" name="birthYear" placeholder="1920" min="1800" max="2025" class="ctm-input"/>
            </div>
            <div class="ctm-field">
              <label>Год смерти</label>
              <input type="number" name="deathYear" placeholder="1985 (если ушёл)" min="1800" max="2025" class="ctm-input"/>
            </div>
            <div class="ctm-field">
              <label>Город / Место жизни</label>
              <input type="text" name="city" placeholder="Москва" class="ctm-input"/>
            </div>
            <div class="ctm-field">
              <label>Семейное положение</label>
              <select name="marital" class="ctm-input ctm-select">
                <option value="">Не указано</option>
                <option value="married">В браке</option>
                <option value="single">Не замужем / Не женат</option>
                <option value="widowed">Вдовец / Вдова</option>
                <option value="divorced">Разведён(а)</option>
              </select>
            </div>
            <div class="ctm-field">
              <label>Пол</label>
              <select name="gender" class="ctm-input ctm-select">
                <option value="male">Мужской</option>
                <option value="female">Женский</option>
              </select>
            </div>
            <div class="ctm-field">
              <label>Название древа</label>
              <input type="text" name="treeName" placeholder="Род Ивановых" class="ctm-input"/>
            </div>
          </div>

          <div class="ctm-field ctm-field--full">
            <label>Краткое описание / Биография</label>
            <textarea name="bio" placeholder="Немного о человеке…" class="ctm-input ctm-textarea" rows="3"></textarea>
          </div>

          <button type="submit" class="ctm-submit">
            🌳 Создать древо
          </button>
        </form>
      </div>`;

    document.body.appendChild(modal);

    // Photo preview
    const photoInput   = modal.querySelector('#ctm-photo-input');
    const photoPreview = modal.querySelector('#ctm-photo-preview');
    photoInput.addEventListener('change', () => {
      const file = photoInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        photoPreview.innerHTML = `<img src="${ev.target.result}" alt="Фото" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      };
      reader.readAsDataURL(file);
    });

    // Close
    modal.querySelector('.ctm-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.ctm-backdrop').addEventListener('click', () => modal.remove());
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', esc); }
    });

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => modal.classList.add('ctm-visible'));
    });

    // Submit
    modal.querySelector('#ctm-form').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const photoSrc = photoPreview.querySelector('img')?.src || null;

      const data = {
        firstName:  fd.get('firstName')?.trim(),
        middleName: fd.get('middleName')?.trim(),
        lastName:   fd.get('lastName')?.trim(),
        role:       fd.get('role'),
        birthYear:  fd.get('birthYear'),
        deathYear:  fd.get('deathYear'),
        city:       fd.get('city')?.trim(),
        marital:    fd.get('marital'),
        gender:     fd.get('gender'),
        treeName:   fd.get('treeName')?.trim() || `Род ${fd.get('lastName') || ''}`,
        bio:        fd.get('bio')?.trim(),
        photo:      photoSrc,
      };

      if (!data.firstName || !data.lastName) return;

      createNewTree(data);
      modal.remove();
    });
  }

  /* Build a new tree from the first person's data */
  function createNewTree(data) {
    const years = data.birthYear
      ? `${data.birthYear}–${data.deathYear || ''}`
      : '';

    const roleLabels = {
      progenitor:      'Прародитель рода',
      patriarch:       data.gender === 'female' ? 'Матриарх' : 'Патриарх',
      parent:          data.gender === 'female' ? 'Мать'     : 'Отец',
      grandparent:     data.gender === 'female' ? 'Бабушка'  : 'Дед',
      greatgrandparent:data.gender === 'female' ? 'Прапрабабушка' : 'Прапрадед',
    };

    // Save to localStorage
    const treeId = 'tree_' + Date.now();
    const newNode = {
      id:       'n_' + Date.now(),
      name:     `${data.lastName}\n${data.firstName}${data.middleName ? ' ' + data.middleName : ''}`,
      years,
      city:     data.city,
      marital:  data.marital,
      gender:   data.gender,
      role:     roleLabels[data.role] || data.role,
      bio:      data.bio,
      photo:    data.photo,
      clanId:   'ivanov',
      ageClass: 'old',
    };

    try {
      localStorage.setItem(`tree_nodes_${treeId}`, JSON.stringify([newNode]));
      const allTrees = JSON.parse(localStorage.getItem('all_trees') || '[]');
      allTrees.push({ id: treeId, name: data.treeName });
      localStorage.setItem('all_trees', JSON.stringify(allTrees));
    } catch {}

    // Show success toast
    const toast = document.createElement('div');
    toast.innerHTML = `
      <div style="
        position:fixed;top:40px;left:50%;transform:translateX(-50%);
        background:rgba(12,12,12,0.95);border:1px solid rgba(200,168,75,0.5);
        border-radius:12px;padding:20px 36px;z-index:9999;
        font-family:var(--font-body);font-size:15px;color:var(--gold-light,#e2c97e);
        backdrop-filter:blur(16px);box-shadow:0 12px 40px rgba(0,0,0,0.6);
        text-align:center;min-width:280px;animation:fadeInDown 0.4s ease;">
        <div style="font-size:32px;margin-bottom:8px;">🌳</div>
        <strong style="display:block;font-family:var(--font-display);font-size:18px;margin-bottom:6px;">
          ${data.treeName}
        </strong>
        <span style="font-style:italic;color:rgba(201,191,168,0.7);font-size:13px;">
          Первый предок добавлен — ${data.firstName} ${data.lastName}
        </span>
      </div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);

    // Redraw with new card visible
    const newPerson = { ...newNode, id: newNode.id, personPageId: null, spouseOf: null };
    personById[newNode.id] = newPerson;

    const row = document.createElement('div');
    const clan = CLANS.ivanov;
    const node = document.createElement('div');
    node.className = 'tree-node tree-node--old tree-node--clan-ivanov tree-node--new-pulse';
    node.dataset.id   = newNode.id;
    node.dataset.clan = 'ivanov';
    node.tabIndex     = 0;

    const nameParts = newNode.name.split('\n');
    const photoHtml = data.photo
      ? `<img src="${data.photo}" alt="" style="width:100%;height:100%;object-fit:cover;">`
      : `<div class="tree-node__avatar">${personSVG}</div>`;

    node.innerHTML = `
      <div class="tree-node__frame" title="${nameParts.join(' ')}"
           style="--clan-color:${clan.color};--clan-dim:${clan.colorDim}">
        <span class="tree-node__clan-badge" title="${clan.name}">${clan.icon}</span>
        <div class="tree-node__photo">${photoHtml}</div>
      </div>
      <div class="tree-node__info">
        <div class="tree-node__name">${nameParts[0]}<br/>${nameParts[1] || ''}</div>
        ${years ? `<div class="tree-node__years">${years}</div>` : ''}
        <div class="tree-node__clan-name" style="color:${clan.color}">${newNode.role}</div>
        ${data.city ? `<div class="tree-node__years">${data.city}</div>` : ''}
      </div>`;

    const firstRow = gensEl.querySelector('.gen-row');
    if (firstRow) {
      firstRow.insertBefore(node, firstRow.firstChild);
    } else {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'gen-row';
      rowDiv.appendChild(node);
      gensEl.appendChild(rowDiv);
    }

    nodeEls[newNode.id] = node;
    node.addEventListener('click', () => highlight(newNode.id));

    setTimeout(() => {
      node.classList.remove('tree-node--new-pulse');
      drawThreads();
    }, 2000);
  }

  /* ── TOOLTIP on hover ── */
  const tooltip = document.createElement('div');
  tooltip.className = 'tree-tooltip';
  tooltip.style.cssText = 'position:fixed;pointer-events:none;opacity:0;transition:opacity 0.2s;z-index:200';
  document.body.appendChild(tooltip);

  Object.entries(nodeEls).forEach(([id, el]) => {
    const person = personById[id];
    const clan   = person ? CLANS[person.clanId] : null;
    el.addEventListener('mouseenter', ev => {
      if (!clan) return;
      tooltip.innerHTML = `
        <div class="tree-tooltip__inner">
          <span class="tree-tooltip__icon">${clan.icon}</span>
          <strong>${clan.name}</strong>
          <span>${person.name.replace('\n',' ')}</span>
          <span class="tree-tooltip__hint">Двойной клик → страница памяти</span>
        </div>`;
      tooltip.style.opacity = '1';
      tooltip.style.left    = ev.clientX + 14 + 'px';
      tooltip.style.top     = ev.clientY - 10 + 'px';
    });
    el.addEventListener('mousemove', ev => {
      tooltip.style.left = ev.clientX + 14 + 'px';
      tooltip.style.top  = ev.clientY - 10 + 'px';
    });
    el.addEventListener('mouseleave', () => { tooltip.style.opacity = '0'; });
  });

  window.addEventListener('load',   () => setTimeout(drawThreads, 300));
  window.addEventListener('resize', () => setTimeout(drawThreads, 200));
})();
