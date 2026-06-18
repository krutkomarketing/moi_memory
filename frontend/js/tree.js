/* ═══════════════════════════════════════════════
   FAMILY TREE — Braided SVG threads + clan colours
   Bottom = oldest, Top = youngest
   Click node → highlight lineage OR open person page
   Click 2 nodes → draw animated connection between them
   ═══════════════════════════════════════════════ */

(function () {

const urlParams = new URLSearchParams(window.location.search);
const currentTreeId = urlParams.get('tree') || 'default';


  const isLocalDev = window.location.port && window.location.port !== '80' && window.location.port !== '443' && window.location.port !== '5500';
  const BASE = isLocalDev ? 'http://localhost:3000' : '';
  
  // Pan and Zoom State Variables
  let zoom = 1.0;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let isPanning = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let draggableInstance;

  const isDeceased = (yearsStr) => {
    if (!yearsStr) return false;
    const str = String(yearsStr).trim();
    if (/[-–—]\s*$/.test(str)) return false;
    const yearsMatched = str.match(/\d{4}/g);
    if (yearsMatched && yearsMatched.length >= 2) return true;
    if ((str.includes('-') || str.includes('–') || str.includes('—')) && !/[-–—]\s*$/.test(str)) return true;
    return false;
  };

  const resolveUrl = path => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
    if (path.startsWith('/uploads/') || path.startsWith('/bot-data/') || path.startsWith('/images/')) {
      const fullUrl = BASE + path;
      return fullUrl.includes('/uploads/') ? fullUrl + '?v=5' : fullUrl;
    }
    if (path.startsWith('uploads/') || path.startsWith('bot-data/') || path.startsWith('images/')) {
      const fullUrl = BASE + '/' + path;
      return fullUrl.includes('/uploads/') ? fullUrl + '?v=5' : fullUrl;
    }
    return path;
  };

  let CLANS = {
    ivanov:   { name: 'Род Ивановых',   color: '#c8a84b', colorDim: '#6b5a22', icon: '⚔', desc: 'Потомственные инженеры и военные' },
    smirnov:  { name: 'Род Смирновых',  color: '#7ec8b4', colorDim: '#2e6b5e', icon: '⚕', desc: 'Врачи и учёные' },
    kozlov:   { name: 'Род Козловых',   color: '#c87e7e', colorDim: '#6b2e2e', icon: '✦', desc: 'Архитекторы и строители' },
  };

  let GENERATIONS = [
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

  /* ── HISTORY IS HANDLED EXCLUSIVELY VIA PERSONAL EVENTS ── */

  /* ── BARYCENTRIC LAYOUT SORTING ── */
  function sortGenerationPeople(generations) {
    const numGens = generations.length;
    if (numGens <= 1) return;

    const getClanName = (p) => {
      const clanId = p.clan_id || p.clanId;
      if (!clanId) return '';
      if (typeof CLANS !== 'undefined' && CLANS[clanId]) return CLANS[clanId].name || '';
      return '';
    };

    function getClanWeight(p) {
      const name = getClanName(p).toLowerCase();
      if (name.includes('волков')) return 0;
      if (name.includes('морозов')) return 1;
      if (name.includes('соколов')) return 2;
      if (name.includes('петров')) return 3;
      return 4;
    }

    function getUnitClanWeight(unit) {
      let sum = 0;
      unit.forEach(p => { sum += getClanWeight(p); });
      return sum / unit.length;
    }

    // Helper to get unit weights in bottom-to-top pass
    function getBottomUpUnitWeight(unit, prevPeopleIndices) {
      let sum = 0;
      let count = 0;
      unit.forEach(p => {
        const parents = parentsOf[p.id] || [];
        parents.forEach(pid => {
          const idx = prevPeopleIndices[pid];
          if (idx !== undefined) {
            sum += idx;
            count++;
          }
        });
      });
      return count > 0 ? sum / count : null;
    }

    // Helper to get unit weights in top-to-bottom pass
    function getTopDownUnitWeight(unit, nextPeopleIndices) {
      let sum = 0;
      let count = 0;
      unit.forEach(p => {
        const children = childrenOf[p.id] || [];
        children.forEach(cid => {
          const idx = nextPeopleIndices[cid];
          if (idx !== undefined) {
            sum += idx;
            count++;
          }
        });
      });
      return count > 0 ? sum / count : null;
    }

    function arrangeSinglesToEdges(sortedUnits, childrenOf) {
      const mainUnits = [];
      const leftSingles = [];
      const rightSingles = [];

      const midIdx = sortedUnits.length / 2;
      sortedUnits.forEach((unit, idx) => {
        const p = unit[0];
        const isSingle = unit.length === 1 && 
                         !p.spouseId && 
                         !p.spouseOf && 
                         !p.spouse_id &&
                         (!childrenOf[p.id] || childrenOf[p.id].length === 0);
        if (isSingle) {
          if (idx < midIdx) {
            leftSingles.push(unit);
          } else {
            rightSingles.push(unit);
          }
        } else {
          mainUnits.push(unit);
        }
      });

      return [...leftSingles, ...mainUnits, ...rightSingles];
    }

    // Run 15 iterations of Sugiyama-style barycentric layout adjustment
    const iterations = 15;
    for (let iter = 0; iter < iterations; iter++) {
      // 1. Bottom-up pass: sort g = 1 to max based on g - 1
      for (let g = 1; g < numGens; g++) {
        const prevPeople = generations[g - 1].people;
        const prevPeopleIndices = {};
        prevPeople.forEach((p, idx) => { prevPeopleIndices[p.id] = idx; });

        const units = getGenerationUnits(generations[g].people);
        units.forEach((unit, uIdx) => {
          const w = getBottomUpUnitWeight(unit, prevPeopleIndices);
          unit._weight = w !== null ? w : (getUnitClanWeight(unit) * 1000 + uIdx);
        });

        units.sort((a, b) => {
          const clanDiff = getUnitClanWeight(a) - getUnitClanWeight(b);
          if (Math.abs(clanDiff) < 0.001) {
            return a._weight - b._weight;
          }
          return clanDiff;
        });
        const partitioned = arrangeSinglesToEdges(units, childrenOf);

        const flat = [];
        partitioned.forEach(unit => flat.push(...unit));
        generations[g].people = flat;
      }

      // 2. Top-down pass: sort g = max - 2 down to 0 based on g + 1
      for (let g = numGens - 2; g >= 0; g--) {
        const nextPeople = generations[g + 1].people;
        const nextPeopleIndices = {};
        nextPeople.forEach((p, idx) => { nextPeopleIndices[p.id] = idx; });

        const units = getGenerationUnits(generations[g].people);
        units.forEach((unit, uIdx) => {
          const w = getTopDownUnitWeight(unit, nextPeopleIndices);
          unit._weight = w !== null ? w : (getUnitClanWeight(unit) * 1000 + uIdx);
        });

        units.sort((a, b) => {
          const clanDiff = getUnitClanWeight(a) - getUnitClanWeight(b);
          if (Math.abs(clanDiff) < 0.001) {
            return a._weight - b._weight;
          }
          return clanDiff;
        });
        const partitioned = arrangeSinglesToEdges(units, childrenOf);

        const flat = [];
        partitioned.forEach(unit => flat.push(...unit));
        generations[g].people = flat;
      }
    }

    const gen0Units = getGenerationUnits(generations[0].people);
    gen0Units.sort((a, b) => getUnitClanWeight(a) - getUnitClanWeight(b));
    const flat0 = [];
    gen0Units.forEach(u => flat0.push(...u));
    generations[0].people = flat0;
  }

  function getGenerationUnits(people) {
    const units = [];
    const visited = new Set();
    people.forEach(p => {
      if (visited.has(p.id)) return;
      visited.add(p.id);
      if (p.spouseOf) {
        const spouse = people.find(sp => sp.id === p.spouseOf);
        if (spouse) {
          visited.add(spouse.id);
          const pIdx = people.indexOf(p);
          const sIdx = people.indexOf(spouse);
          if (pIdx < sIdx) {
            units.push([p, spouse]);
          } else {
            units.push([spouse, p]);
          }
        } else {
          units.push([p]);
        }
      } else {
        units.push([p]);
      }
    });
    return units;
  }

  function groupSpouses(people) {
    const result = [];
    const visited = new Set();
    people.forEach(p => {
      if (visited.has(p.id)) return;
      result.push(p);
      visited.add(p.id);
      if (p.spouseOf) {
        const spouse = people.find(sp => sp.id === p.spouseOf);
        if (spouse && !visited.has(spouse.id)) {
          result.push(spouse);
          visited.add(spouse.id);
        }
      }
    });
    return result;
  }

  /* ── CUSTOM CONNECTION MODAL ── */
  function showConnectionTypeModal(idA, idB, onConfirm, onCancel) {
    const old = document.getElementById('connection-type-modal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'connection-type-modal';
    modal.className = 'connection-modal';
    modal.innerHTML = `
      <div class="connection-modal__content">
        <h3 class="connection-modal__title">Тип соединения</h3>
        <p class="connection-modal__desc">Выберите тип связи и цвет нити</p>
        <div class="connection-modal__options">
          <button class="connection-modal__btn" data-type="spouse">💍 Брачный союз</button>
          <button class="connection-modal__btn" data-type="parent">🧬 Родство (Родитель → Ребёнок)</button>
          <button class="connection-modal__btn" data-type="kin">🌿 Ветвь (Связь родов)</button>
        </div>
        <div style="font-family:var(--font-body);font-size:12px;color:var(--gold);margin-bottom:8px;">Цвет нити:</div>
        <div class="connection-modal__colors">
          <span class="connection-color-dot connection-color-dot--selected" style="background:#c8a84b;" data-color="#c8a84b"></span>
          <span class="connection-color-dot" style="background:#7ec8b4;" data-color="#7ec8b4"></span>
          <span class="connection-color-dot" style="background:#c87e7e;" data-color="#c87e7e"></span>
          <span class="connection-color-dot" style="background:#4b8cc8;" data-color="#4b8cc8"></span>
          <input type="color" id="connection-custom-color" value="#c8a84b" style="width:28px;height:28px;border:none;border-radius:50%;cursor:pointer;padding:0;background:none;" />
        </div>
        <button class="connection-modal__btn connection-modal__btn--cancel" id="connection-cancel-btn">Отмена</button>
      </div>`;
    document.body.appendChild(modal);
    let selectedColor = '#c8a84b';
    const dots = modal.querySelectorAll('.connection-color-dot');
    const customPicker = modal.querySelector('#connection-custom-color');
    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        dots.forEach(d => d.classList.remove('connection-color-dot--selected'));
        dot.classList.add('connection-color-dot--selected');
        selectedColor = dot.dataset.color;
        customPicker.value = selectedColor;
      });
    });
    customPicker.addEventListener('input', (e) => {
      dots.forEach(d => d.classList.remove('connection-color-dot--selected'));
      selectedColor = e.target.value;
    });
    const close = () => {
      if (window.closeModalWithGSAP) {
        window.closeModalWithGSAP(modal, '.connection-modal__content');
      } else {
        modal.remove();
      }
      document.removeEventListener('keydown', handleEsc);
    };
    modal.querySelectorAll('.connection-modal__options button').forEach(btn => {
      btn.addEventListener('click', () => {
        onConfirm(btn.dataset.type, selectedColor);
        close();
      });
    });
    modal.querySelector('#connection-cancel-btn').addEventListener('click', () => {
      onCancel();
      close();
    });
    const handleEsc = (e) => {
      if (e.key === 'Escape') { 
        onCancel(); 
        close();
      }
    };
    document.addEventListener('keydown', handleEsc);
  }

  /* ── INTERACTIVE TIMELINE TOOLTIP BUILDER ── */
  function getPersonTimelineHtml(person) {
    if (!person || !person.years) return '';
    const match = person.years.match(/(\d{4})[^\d]*(\d{4})?/);
    if (!match) return '';
    const birth = parseInt(match[1]);
    const isOngoing = (person.years.endsWith('–') || person.years.endsWith('-') || person.years.endsWith('—'));
    const death = match[2] ? parseInt(match[2]) : null;
    const deathYear = death || new Date().getFullYear();
    
    // 1. Birth
    const events = [{ year: birth, text: 'Рождение', type: 'life' }];
    
    // 2. Spouse & Marriage
    let spouseId = person.spouseOf || person.spouse_id || person.spouseId || null;
    if (!spouseId && typeof getLocalConnections === 'function') {
      try {
        const localConns = getLocalConnections();
        const conn = localConns.find(c => c.type === 'marriage' && (c.a === person.id || c.b === person.id));
        if (conn) {
          spouseId = conn.a === person.id ? conn.b : conn.a;
        }
      } catch(e) {}
    }
    
    const cleanName = (nameStr) => (nameStr || '').replace(/\n/g, ' ').trim();
    
    let spouseName = '';
    if (spouseId) {
      let spouseNode = null;
      if (typeof personById !== 'undefined' && personById[spouseId]) {
        spouseNode = personById[spouseId];
      } else if (typeof allNodes !== 'undefined') {
        spouseNode = allNodes.find(n => n.id === spouseId);
      }
      if (spouseNode) {
        spouseName = cleanName(spouseNode.name || spouseNode.full_name || spouseNode.fullName);
      }
    }
    
    // Collect children to estimate marriage and add child birth events
    const childBirthYears = [];
    const childrenEvents = [];
    
    if (typeof GENERATIONS !== 'undefined') {
      GENERATIONS.forEach(gen => {
        if (gen.childrenMap) {
          const list = gen.childrenMap[person.id] || (spouseId && gen.childrenMap[spouseId]) || [];
          list.forEach(cid => {
            const childNode = personById[cid];
            if (childNode) {
              const cName = cleanName(childNode.name);
              const cMatch = childNode.years ? childNode.years.match(/(\d{4})/) : null;
              if (cMatch) {
                const cBorn = parseInt(cMatch[1]);
                childBirthYears.push(cBorn);
                childrenEvents.push({ year: cBorn, text: `Рождение ребенка (${cName})`, type: 'life' });
              }
            }
          });
        }
      });
    }
    
    if (typeof allNodes !== 'undefined') {
      allNodes.forEach(n => {
        let pids = [];
        try {
          if (n.parent_ids) pids = typeof n.parent_ids === 'string' ? JSON.parse(n.parent_ids) : n.parent_ids;
          else if (n.parentIds) pids = typeof n.parentIds === 'string' ? JSON.parse(n.parentIds) : n.parentIds;
        } catch(e) {}
        if (Array.isArray(pids) && (pids.includes(person.id) || (spouseId && pids.includes(spouseId)))) {
          const cName = cleanName(n.name || n.full_name || n.fullName);
          const cMatch = n.years ? n.years.match(/(\d{4})/) : null;
          if (cMatch) {
            const cBorn = parseInt(cMatch[1]);
            childBirthYears.push(cBorn);
            childrenEvents.push({ year: cBorn, text: `Рождение ребенка (${cName})`, type: 'life' });
          }
        }
      });
    }
    
    events.push(...childrenEvents);
    
    // Determine Marriage Year
    if (spouseId) {
      let marriageYear = null;
      try {
        const custom = JSON.parse(localStorage.getItem('memory_custom_events') || '[]');
        const mEvent = custom.find(e => 
          (e._nodeId === person.id || e.nodeId === person.id) && 
          (e.type === 'marriage' || /брак|свадьба|женитьб|венчан/i.test(e.title || '') || /брак|свадьба|женитьб|венчан/i.test(e.description || ''))
        );
        if (mEvent) {
          marriageYear = parseInt(mEvent.year);
        }
      } catch(e) {}
      
      if (!marriageYear) {
        childBirthYears.sort((a, b) => a - b);
        if (childBirthYears.length > 0) {
          marriageYear = Math.max(birth + 18, childBirthYears[0] - 1);
        } else {
          marriageYear = birth + 25;
        }
      }
      
      marriageYear = Math.min(marriageYear, deathYear);
      marriageYear = Math.max(marriageYear, birth + 18);
      
      events.push({ year: marriageYear, text: `Брак с ${spouseName || 'супругом(ой)'}`, type: 'marriage' });
    }
    
    // 3. Custom events
    try {
      const custom = JSON.parse(localStorage.getItem('memory_custom_events') || '[]');
      custom.forEach(e => {
        if ((e._nodeId === person.id || e.nodeId === person.id) && e.type !== 'birth' && e.type !== 'death') {
          const cy = parseInt(e.year);
          if (cy >= birth && cy <= deathYear) {
            events.push({ year: cy, text: e.title, type: 'custom' });
          }
        }
      });
    } catch(e) {}
    
    // 4. Death or Present day
    if (death) {
      events.push({ year: death, text: 'Уход из жизни', type: 'life' });
    } else if (isOngoing) {
      events.push({ year: new Date().getFullYear(), text: 'Наши дни', type: 'life' });
    }
    
    events.sort((a, b) => a.year - b.year);
    
    // De-duplicate events by year + text
    const uniqueEvents = [];
    const seen = new Set();
    events.forEach(ev => {
      const key = `${ev.year}_${ev.text}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueEvents.push(ev);
      }
    });
    
    return `
      <div class="tree-tooltip__mini-timeline">
        ${uniqueEvents.map(ev => `
          <div class="tree-tooltip__event ${ev.type === 'custom' ? 'tree-tooltip__event--custom' : ev.type === 'marriage' ? 'tree-tooltip__event--marriage' : ''}">
            <span class="tree-tooltip__event-year ${ev.type === 'custom' ? 'tree-tooltip__event-year--custom' : ev.type === 'marriage' ? 'tree-tooltip__event-year--marriage' : ''}">${ev.year}</span>
            <span class="tree-tooltip__event-text">${ev.text}</span>
          </div>`).join('')}
      </div>`;
  }

  /* ── Если кастомное дерево — tree.js не рисует статику ── */
  const _urlTree = new URLSearchParams(window.location.search).get('tree') || 'default';
  if (_urlTree && _urlTree !== 'default') return;

  /* ── DOM SETUP ── */

  async function ensureTreeSelector() {
    try {
      if (typeof API === 'undefined' || !API.isLoggedIn || !API.isLoggedIn()) return;

      const treesRes = await fetch(`${BASE}/api/family-trees`, {
        headers: API.getToken ? (API.getToken() ? { 'Authorization': 'Bearer ' + API.getToken() } : {}) : {}
      }).catch(() => null);

      const treesJson = treesRes ? await treesRes.json().catch(() => null) : null;
      const trees = (treesJson && (treesJson.data || treesJson.trees)) || [];
      if (!Array.isArray(trees) || trees.length === 0) return;

      // auto redirect if no tree param
      const urlParams = new URLSearchParams(window.location.search);
      const t = urlParams.get('tree');
      const user = (typeof API !== 'undefined' && API.getUser) ? API.getUser() : null;

      const target = trees[0].id || trees[0].treeId;
      if (target && typeof API.updateRootTreeId === 'function') {
        API.updateRootTreeId(target);
      }

      if (!t) {
        const redirectTarget = (user && user.rootTreeId) ? user.rootTreeId : target;
        if (redirectTarget) {
          window.location.replace('family-tree.html?tree=' + encodeURIComponent(redirectTarget));
          return;
        }
      }

      // inject select near buttons
      if (document.getElementById('tree-select')) return;
      const legend = document.querySelector('.clan-legend-wrap');
      if (!legend) return;

      const wrap = document.createElement('div');
      wrap.className = 'tree-select-wrap';
      wrap.style.cssText = 'display:flex;justify-content:center;gap:10px;align-items:center;margin-top:10px;';

      const label = document.createElement('span');
      label.textContent = 'Дерево:';
      label.style.cssText = 'opacity:0.8;font-size:14px;';

      const sel = document.createElement('select');
      sel.id = 'tree-select';
      sel.className = 'tree-select';
      sel.style.cssText = 'min-width:220px;padding:8px 10px;border-radius:10px;';

      const current = urlParams.get('tree') || 'default';
      sel.innerHTML = trees.map(tr => {
        const id = tr.id || tr.treeId || '';
        const name = tr.name || 'Без названия';
        const selected = (id === current) ? 'selected' : '';
        return `<option value="${String(id).replace(/"/g,'&quot;')}" ${selected}>${String(name).replace(/</g,'&lt;')}</option>`;
      }).join('');

      sel.addEventListener('change', () => {
        const id = sel.value;
        if (!id) return;
        window.location.href = 'family-tree.html?tree=' + encodeURIComponent(id);
      });

      wrap.appendChild(label);
      wrap.appendChild(sel);
      legend.appendChild(wrap);
    } catch (e) {
      console.warn('[tree] selector init failed:', e.message);
    }
  }

  const wrapper = document.getElementById('tree-wrapper');
  const svgEl   = document.getElementById('tree-threads');
  const gensEl  = document.getElementById('tree-generations');
  if (!wrapper || !svgEl || !gensEl) return;

    // Open linked profile on double click
    wrapper.addEventListener('dblclick', (e) => {
      const card = e.target && e.target.closest ? e.target.closest('.tree-node') : null;
      if (!card) return;
      const pid = card.dataset && (card.dataset.personPageId || card.dataset.profileSlug || card.dataset.profileId);
      if (pid) window.location.href = 'person.html?id=' + encodeURIComponent(pid);
    });

  const nodeEls   = {};
  const threadEls = {};

  const personSVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="7" r="4"/>
    <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8"/>
  </svg>`;

  /* ── RELATIONSHIP GRAPH ── */
  const parentsOf  = {};
  const childrenOf = {};
  const spouseOf   = {};

  function getAncestors(id, acc = new Set()) {
    (parentsOf[id] || []).forEach(p => { if (!acc.has(p)) { acc.add(p); getAncestors(p, acc); } });
    return acc;
  }
  function getDescendants(id, acc = new Set()) {
    (childrenOf[id] || []).forEach(c => { if (!acc.has(c)) { acc.add(c); getDescendants(c, acc); } });
    return acc;
  }

  // color dimming utility
  function dimColor(hex, percent = 0.55) {
    hex = hex.replace(/^\s*#|\s*$/g, '');
    if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
    let r = parseInt(hex.substr(0, 2), 16) || 0;
    let g = parseInt(hex.substr(2, 2), 16) || 0;
    let b = parseInt(hex.substr(4, 2), 16) || 0;
    r = Math.floor(r * percent);
    g = Math.floor(g * percent);
    b = Math.floor(b * percent);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // Asynchronous Loader from database
  // ensureTreeSelector(); // Obsolete, tree-edit.js provides the styled tree-switcher-select instead

    async function loadDataFromDb() {
    try {
      const clansRes = await fetch(`${BASE}/api/family-clans?treeId=${encodeURIComponent(currentTreeId)}`);
      const nodesRes = await fetch(`${BASE}/api/family-nodes?treeId=${encodeURIComponent(currentTreeId)}`);
      const connsRes = await fetch(`${BASE}/api/family-connections?treeId=${encodeURIComponent(currentTreeId)}`);
      const clansJson = await clansRes.json();
      const nodesJson = await nodesRes.json();
      const connsJson = await connsRes.json().catch(() => ({ ok: false }));

      if (connsJson.ok && Array.isArray(connsJson.data)) {
        const conns = connsJson.data.map(c => {
          const typeLower = String(c.type || '').toLowerCase();
          let type = typeLower;
          if (typeLower === 'spouse') type = 'marriage';
          if (typeLower === 'parent') type = 'kinship';
          return {
            id: c.id,
            a: c.nodeA,
            b: c.nodeB,
            type: type,
            color: c.color,
          };
        });
        localStorage.setItem('tree_connections_default', JSON.stringify(conns));
      }

      if (clansJson.ok && nodesJson.ok && Array.isArray(clansJson.data) && Array.isArray(nodesJson.data)) {
        if (nodesJson.data.length === 0) {
          GENERATIONS = [];
          CLANS = {};
          console.log('Loaded empty tree from DB.');
        } else if (clansJson.data.length > 0 && nodesJson.data.length > 0) {
        if (connsJson.ok && Array.isArray(connsJson.data)) {
          // Pre-populate parents and spouse fields from connections for tree rendering to sort correctly
          const parentMap = {};
          const spouseMap = {};

          connsJson.data.forEach(c => {
            const typeLower = String(c.type).toLowerCase();
            const fromId = c.fromNodeId || c.nodeA;
            const toId = c.toNodeId || c.nodeB;
            if (fromId && toId) {
              if (typeLower === 'parent' || typeLower === 'kinship') {
                if (!parentMap[toId]) parentMap[toId] = [];
                parentMap[toId].push(fromId);
              } else if (typeLower === 'spouse' || typeLower === 'marriage') {
                spouseMap[fromId] = toId;
                spouseMap[toId] = fromId;
              }
            }
          });

          nodesJson.data.forEach(n => {
            n.parentIds = parentMap[n.id] || [];
            n.parent_ids = n.parentIds;
            n.spouseId = spouseMap[n.id] || null;
            n.spouse_id = n.spouseId;
            n.spouseOf = n.spouseId;
          });
        }

        // Rebuild CLANS
        const newClans = {};
        clansJson.data.forEach(c => {
          newClans[c.id] = {
            name: c.name,
            color: c.color,
            colorDim: dimColor(c.color, 0.55),
            icon: c.icon,
            desc: c.description || ''
          };
        });
        CLANS = newClans;

        // Group nodes by generation
        const gensMap = {};
        nodesJson.data.forEach(n => {
          const g = n.generation !== undefined ? n.generation : 0;
          if (!gensMap[g]) gensMap[g] = [];
          gensMap[g].push(n);
        });

        const GEN_LABELS = ['Прапрародители', 'Прародители', 'Родители', 'Наше поколение', 'Дети', 'Внуки', 'Правнуки'];
        const maxGen = Math.max(...Object.keys(gensMap).map(Number), 3);
        
        const newGenerations = [];
        for (let g = 0; g <= maxGen; g++) {
          const peopleInGen = gensMap[g] || [];
          
          // Reconstruct childrenMap for generation g based on parentIds of generation g + 1
          const childrenMap = {};
          const nextGenPeople = gensMap[g + 1] || [];
          nextGenPeople.forEach(child => {
            let pids = [];
            if (Array.isArray(child.parentIds)) {
              pids = child.parentIds;
            } else {
              try { pids = JSON.parse(child.parentIds || '[]'); } catch (_) { pids = []; }
            }
            if (Array.isArray(pids)) {
              pids.forEach(parentId => {
                if (!childrenMap[parentId]) childrenMap[parentId] = [];
                if (!childrenMap[parentId].includes(child.id)) {
                  childrenMap[parentId].push(child.id);
                }
              });
            }
          });

          newGenerations.push({
            label: GEN_LABELS[g] || `Поколение ${g + 1}`,
            ageClass: g < 2 ? 'old' : 'young',
            people: peopleInGen.map(n => ({
              id: n.id,
              name: n.fullName.includes('\n') ? n.fullName : n.fullName.replace(' ', '\n'),
              years: n.years || '',
              spouseOf: n.spouseId || null,
              clanId: n.clanId || 'ivanov',
              personPageId: n.profileSlug || n.profileId || null,
              photoUrl: n.photoUrl || ''
            })),
            childrenMap
          });
        }
        GENERATIONS = newGenerations;
        console.log('Successfully loaded default tree clans and nodes from DB:', CLANS, GENERATIONS);
      }
    } else {
        console.log('No DB records or invalid formats. Falling back to hardcoded default data.');
      }
    } catch (err) {
      console.warn('Failed to load default tree from DB, falling back to static data:', err);
    }
  }

  function computeGraphMaps() {
    for (const key in personById) delete personById[key];
    for (const key in parentsOf) delete parentsOf[key];
    for (const key in childrenOf) delete childrenOf[key];
    for (const key in spouseOf) delete spouseOf[key];

    GENERATIONS.forEach(g => g.people.forEach(p => { personById[p.id] = p; }));

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
  }

  function buildTreeDOM() {
    // 1. Build Clan Legend
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

    // 2. Build Generation Rows
    gensEl.innerHTML = '';
    for (const key in nodeEls) delete nodeEls[key];

    sortGenerationPeople(GENERATIONS);
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
        const deceased = isDeceased(person.years);
        const hasPage = deceased && person.personPageId;
        const node = document.createElement(hasPage ? 'a' : 'div');
        if (hasPage) {
          node.href = `person.html?id=${person.personPageId}`;
        }
        node.className = `tree-node tree-node--${gen.ageClass} tree-node--clan-${person.clanId}`;
        node.dataset.id     = person.id;
        node.dataset.clan   = person.clanId;
        node.tabIndex       = 0;

        const nameParts = person.name.split('\n');
        const clanIcon  = clan.icon;
        const photoHtml = person.photoUrl
          ? `<img src="${resolveUrl(person.photoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;" data-tr-fb="tree-node">`
          : `<div class="tree-node__avatar">${personSVG}</div>`;

        node.innerHTML = `
          <div class="tree-node__frame" title="${nameParts.join(' ')}"
               style="--clan-color:${clan.color};--clan-dim:${clan.colorDim}">
            <span class="tree-node__clan-badge" title="${clan.name}">${clanIcon}</span>
            <div class="tree-node__photo">
              ${photoHtml}
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

    // 3. Attach click and keydown handlers
    attachCardListeners();

    // 4. Attach tooltips
    attachTooltipListeners();

    // 5. Connect button
    attachConnectButtonListener();

    // 6. Search input setup
    attachSearchListener();
  }

  // Promise that resolves when data is loaded and DOM is built
  const dataLoadPromise = loadDataFromDb().then(() => {
    computeGraphMaps();
    buildTreeDOM();
  });

  /* ── THREAD DRAWING ── */
  function getFrameCenter(el) {
    const frame = el.querySelector('.tree-node__frame');
    const wRect = wrapper.getBoundingClientRect();
    const fRect = frame.getBoundingClientRect();
    const scaleX = wRect.width / wrapper.offsetWidth || 1;
    const scaleY = wRect.height / wrapper.offsetHeight || 1;
    return {
      x: (fRect.left - wRect.left) / scaleX + (fRect.width / scaleX) / 2,
      y: (fRect.top  - wRect.top) / scaleY + (fRect.height / scaleY) / 2,
      top:    (fRect.top  - wRect.top) / scaleY,
      bottom: (fRect.bottom - wRect.top) / scaleY,
      left:   (fRect.left - wRect.left) / scaleX,
      right:  (fRect.right - wRect.left) / scaleX,
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
      /* Spouse connections — одна горизонтальная линия между центрами + маленький кружок */
      gen.people.forEach(person => {
        if (person.spouseOf && person.id < person.spouseOf) {
          const a = nodeEls[person.id], b = nodeEls[person.spouseOf];
          if (!a || !b) return;

          const ca = getFrameCenter(a), cb = getFrameCenter(b);
          const colors = clanColors(person.clanId);
          const key = `spouse:${person.id}::${person.spouseOf}`;
          threadEls[key] = [];

          // Determine left and right cards to connect inner edges
          const leftCard = ca.x < cb.x ? ca : cb;
          const rightCard = ca.x < cb.x ? cb : ca;
          const startX = leftCard.right;
          const endX = rightCard.left;

          // Горизонтальная брачная линия — двойная (тонкая + толстая полупрозрачная)
          const y = (ca.y + cb.y) / 2;
          // Фоновая толстая полупрозрачная
          const bgPath = createThread(`M ${startX} ${y} L ${endX} ${y}`, colors[0] + '33', 6, delay);
          bgPath.dataset.kind = 'spouse'; bgPath.dataset.a = person.id; bgPath.dataset.b = person.spouseOf; bgPath.dataset.clan = person.clanId;
          svgEl.appendChild(bgPath);
          // Основная тонкая
          const path = createThread(`M ${startX} ${y} L ${endX} ${y}`, colors[0], 1.5, delay);
          path.dataset.kind = 'spouse'; path.dataset.a = person.id; path.dataset.b = person.spouseOf; path.dataset.clan = person.clanId;
          svgEl.appendChild(path);
          threadEls[key].push(bgPath, path);

          // Маленький кружок посередине
          const mx = (ca.x + cb.x) / 2;
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', mx);
          circle.setAttribute('cy', y);
          circle.setAttribute('r', '5');
          circle.setAttribute('fill', '#f3e9c8');
          circle.setAttribute('stroke', colors[0]);
          circle.setAttribute('stroke-width', '1.5');
          circle.classList.add('marriage-circle');
          circle.dataset.a = person.id;
          circle.dataset.b = person.spouseOf;
          svgEl.appendChild(circle);

          delay += 0.06;
        }
      });

      if (gi + 1 >= GENERATIONS.length) return;

      /* Parent → child — от кружка брачного союза (или центра одинокого родителя) к детям */
      const processedPairs = new Set();
      Object.entries(gen.childrenMap || {}).forEach(([parentId, childIds]) => {
        const parentEl = nodeEls[parentId];
        if (!parentEl) return;
        const parentClanId = personById[parentId]?.clanId || '';
        const spouse = personById[parentId]?.spouseOf;

        // Избегаем дублирования — обрабатываем пару один раз
        const pairKey = spouse ? [parentId, spouse].sort().join(':') : parentId;
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);

        // Собираем всех детей пары
        let allChildIds = [...childIds];
        if (spouse && gen.childrenMap[spouse]) {
          gen.childrenMap[spouse].forEach(cid => { if (!allChildIds.includes(cid)) allChildIds.push(cid); });
        }

        // Якорь — кружок брачного союза (середина между супругами) или центр одинокого родителя
        const cp = getFrameCenter(parentEl);
        let anchorX, anchorY;
        if (spouse && nodeEls[spouse]) {
          const sp = getFrameCenter(nodeEls[spouse]);
          anchorX = (cp.x + sp.x) / 2;
          anchorY = (cp.y + sp.y) / 2;
        } else {
          anchorX = cp.x;
          anchorY = cp.top;
        }

        // Рисуем линии от якоря к каждому ребёнку
        allChildIds.forEach(childId => {
          const childEl = nodeEls[childId];
          if (!childEl) return;
          const cc = getFrameCenter(childEl);

          // Fallback logic for parent-to-child connection line colors
          let finalClanId = parentClanId;
          if (!finalClanId && spouse) {
            finalClanId = personById[spouse]?.clanId || '';
          }
          if (!finalClanId) {
            finalClanId = personById[childId]?.clanId || '';
          }
          if (!finalClanId) {
            finalClanId = 'ivanov';
          }

          const colors = clanColors(finalClanId);

          // Плавная кривая Безье от якоря вверх к ребёнку (дети сверху, родители снизу)
          const midY = anchorY + (cc.bottom - anchorY) * 0.5;
          const r = 12;
          const d = `M ${anchorX} ${anchorY} C ${anchorX} ${midY}, ${cc.x} ${midY}, ${cc.x} ${cc.bottom}`;

          const key = `parent:${parentId}->${childId}`;
          threadEls[key] = [];
          const path = createThread(d, colors[0], 1.4, delay);
          path.dataset.kind = 'parent';
          path.dataset.a = parentId;
          path.dataset.b = childId;
          path.dataset.clan = finalClanId;
          svgEl.appendChild(path);
          threadEls[key].push(path);
          delay += 0.08;
        });
      });
    });

    /* Animate draw using DrawSVGPlugin */
    if (typeof gsap !== 'undefined' && typeof DrawSVGPlugin !== 'undefined') {
      svgEl.querySelectorAll('.thread-path').forEach(p => {
        const del = parseFloat(p.dataset.delay || 0);
        gsap.fromTo(p, 
          { drawSVG: "0%" },
          { drawSVG: "100%", duration: 1.5, delay: del, ease: "power2.out" }
        );
      });
    } else {
      /* Fallback if plugin is not loaded */
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
    }

    if (activeClan) applyFilter(activeClan);

    // Draw user-created custom connections
    try {
      const conns = JSON.parse(localStorage.getItem('tree_connections_default') || '[]');
      if (conns.length) {
        conns.forEach(c => {
          const typeLower = String(c.type || '').toLowerCase();
          if (typeLower !== 'parent' && typeLower !== 'child' && typeLower !== 'spouse' && typeLower !== 'marriage' && typeLower !== 'kinship') {
            drawAnimatedConnection(c.a, c.b, c.type, c.color);
          }
        });
      }
    } catch (e) {}
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
  function drawAnimatedConnection(idA, idB, connType, customColor) {
    const elA = nodeEls[idA], elB = nodeEls[idB];
    if (!elA || !elB) return;

    const cA = getFrameCenter(elA), cB = getFrameCenter(elB);

    let x1 = cA.x, y1;
    let x2 = cB.x, y2;
    let cy1, cy2, drop = 0;

    const personA    = personById[idA];
    const isMarriage = connType === 'spouse';

    const genA = GENERATIONS.findIndex(g => g.people.some(p => p.id === idA));
    const genB = GENERATIONS.findIndex(g => g.people.some(p => p.id === idB));

    if (isMarriage) {
      y1 = cA.bottom;
      y2 = cB.bottom;
      drop = Math.min(Math.abs(y2 - y1) * 0.4 + 50, 130);
      cy1 = y1 + drop;
      cy2 = y2 + drop;
    } else {
      if (genA !== -1 && genB !== -1 && genA < genB) {
        // A is parent (older generation, larger Y), B is child (younger generation, smaller Y)
        y1 = cA.top;
        y2 = cB.bottom;
        const dist = y1 - y2;
        cy1 = y1 - dist * 0.4;
        cy2 = y2 + dist * 0.4;
      } else if (genA !== -1 && genB !== -1 && genA > genB) {
        // B is parent (larger Y), A is child (smaller Y)
        y1 = cA.bottom;
        y2 = cB.top;
        const dist = y2 - y1;
        cy1 = y1 + dist * 0.4;
        cy2 = y2 - dist * 0.4;
      } else {
        // same generation fallback
        y1 = cA.bottom;
        y2 = cB.bottom;
        drop = Math.min(Math.abs(y2 - y1) * 0.4 + 50, 130);
        cy1 = y1 + drop;
        cy2 = y2 + drop;
      }
    }

    const colors = customColor
      ? [customColor, customColor, customColor + 'bb']
      : (isMarriage
        ? ['#e2c97e', '#c8a84b', '#e2c97ebb']
        : clanColors(personA?.clanId || 'ivanov'));

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
    if (typeof gsap !== 'undefined' && typeof DrawSVGPlugin !== 'undefined') {
      const paths = group.querySelectorAll('.thread-path');
      paths.forEach((p, i) => {
        gsap.fromTo(p, 
          { drawSVG: "0%" },
          { drawSVG: "100%", duration: 1.3, delay: i * 0.08, ease: "power2.out" }
        );
      });
      gsap.to(diamond, {
        opacity: 1,
        scale: 1,
        transformOrigin: `${mx}px ${my}px`,
        duration: 0.5,
        delay: 1.1,
        ease: "back.out(1.7)",
        onComplete: () => {
          gsap.to(diamond, {
            scale: 1.3,
            duration: 0.8,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
            transformOrigin: `${mx}px ${my}px`
          });
        }
      });
    } else {
      /* Fallback if no gsap */
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
  }

  /* Кубический Безье */
  function cubicB(p0,p1,p2,p3,t) { const m=1-t; return m*m*m*p0+3*m*m*t*p1+3*m*t*t*p2+t*t*t*p3; }
  function cubicBd(p0,p1,p2,p3,t){ const m=1-t; return 3*(m*m*(p1-p0)+2*m*t*(p2-p1)+t*t*(p3-p2)); }

  /* ── CLICK: single tap = highlight or connect, double tap = open page ── */
  const clickTimers = {};
  Object.entries(nodeEls).forEach(([id, el]) => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (el.tagName === 'A') e.preventDefault();

      // CONNECT MODE
      if (connectMode) {
        if (!connectFirst) {
          connectFirst = id;
          el.classList.add('connect-selected');
          showConnectHint('Теперь кликните на вторую карточку…');
        } else if (connectFirst !== id) {
          // Draw connection
          const nodeFirstId = connectFirst;
          const nodeSecondId = id;
          nodeEls[nodeFirstId].classList.remove('connect-selected');
          showConnectionTypeModal(nodeFirstId, nodeSecondId, (type, color) => {
            if (type === 'spouse') {
              const personA = personById[nodeFirstId];
              const personB = personById[nodeSecondId];
              if (personA && personB) {
                const genA = GENERATIONS.findIndex(g => g.people.some(p => p.id === nodeFirstId));
                const genB = GENERATIONS.findIndex(g => g.people.some(p => p.id === nodeSecondId));
                const clanA = personA.clanId;
                const clanB = personB.clanId;
                if (genA !== -1 && genB !== -1 && genA !== genB && clanA && clanB && clanA === clanB) {
                  alert('Брак между членами одного рода из разных поколений запрещен!');
                  exitConnectMode();
                  return;
                }
              }
            }
            customConnections.push({ a: nodeFirstId, b: nodeSecondId, type, color });
            // Save to local connections
            const conns = JSON.parse(localStorage.getItem('tree_connections_default') || '[]');
            conns.push({ id: Date.now().toString(36), a: nodeFirstId, b: nodeSecondId, type, color });
            localStorage.setItem('tree_connections_default', JSON.stringify(conns));
            // Draw
            drawAnimatedConnection(nodeFirstId, nodeSecondId, type, color);
            exitConnectMode();
          }, () => {
            exitConnectMode();
          });
        }
        return;
      }

      if (clickTimers[id]) {
        // double click → navigate or open popup
        clearTimeout(clickTimers[id]);
        delete clickTimers[id];
        const person = personById[id];
        if (person?.personPageId) {
          window.location.href = `person.html?id=${person.personPageId}`;
        } else if (window.openRelativePopup) {
          window.openRelativePopup(id);
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
    if (!e.target.closest('.tree-node') && !e.target.closest('.clan-legend__item')) {
      clearHighlight();
      filterByClan(null);
      const legendWrap = document.getElementById('tree-clan-legend');
      if (legendWrap) {
        legendWrap.querySelectorAll('[data-clan]').forEach(el =>
          el.classList.remove('clan-legend__item--active'));
      }
    }
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
    const close = () => {
      if (window.closeModalWithGSAP) {
        window.closeModalWithGSAP(modal, '.ctm-panel');
      } else {
        modal.remove();
      }
      document.removeEventListener('keydown', esc);
    };
    modal.querySelector('.ctm-close').addEventListener('click', close);
    modal.querySelector('.ctm-backdrop').addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); }
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
      close();
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
      ? `<img src="${resolveUrl(data.photo)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
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
    node.addEventListener('click', () => { if (isPanning) return; highlight(newNode.id); });

    setTimeout(() => {
      node.classList.remove('tree-node--new-pulse');
      drawThreads();
    }, 2000);
  }

  /* ── EVENT ATTACHERS FOR DYNAMIC DOM ── */
  function attachCardListeners() {
    const clickTimers = {};
    Object.entries(nodeEls).forEach(([id, el]) => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        if (el.tagName === 'A') e.preventDefault();
        if (isPanning) {
          e.preventDefault();
          return;
        }

        // CONNECT MODE
        if (connectMode) {
          e.preventDefault();
          if (!connectFirst) {
            connectFirst = id;
            el.classList.add('connect-selected');
            showConnectHint('Теперь кликните на вторую карточку…');
          } else if (connectFirst !== id) {
            // Draw connection
            const nodeFirstId = connectFirst;
            const nodeSecondId = id;
            nodeEls[nodeFirstId].classList.remove('connect-selected');
            showConnectionTypeModal(nodeFirstId, nodeSecondId, (type, color) => {
              if (type === 'spouse') {
                const personA = personById[nodeFirstId];
                const personB = personById[nodeSecondId];
                if (personA && personB) {
                  const genA = GENERATIONS.findIndex(g => g.people.some(p => p.id === nodeFirstId));
                  const genB = GENERATIONS.findIndex(g => g.people.some(p => p.id === nodeSecondId));
                  const clanA = personA.clanId;
                  const clanB = personB.clanId;
                  if (genA !== -1 && genB !== -1 && genA !== genB && clanA && clanB && clanA === clanB) {
                    alert('Брак между членами одного рода из разных поколений запрещен!');
                    exitConnectMode();
                    return;
                  }
                }
              }
              customConnections.push({ a: nodeFirstId, b: nodeSecondId, type, color });
              // Save to local connections
              const conns = JSON.parse(localStorage.getItem('tree_connections_default') || '[]');
              conns.push({ id: Date.now().toString(36), a: nodeFirstId, b: nodeSecondId, type, color });
              localStorage.setItem('tree_connections_default', JSON.stringify(conns));
              // Draw
              drawAnimatedConnection(nodeFirstId, nodeSecondId, type, color);
              exitConnectMode();
            }, () => {
              exitConnectMode();
            });
          }
          return;
        }

        if (clickTimers[id]) {
          // double click → navigate or open popup
          clearTimeout(clickTimers[id]);
          delete clickTimers[id];
          const person = personById[id];
          if (person?.personPageId) {
            window.location.href = `person.html?id=${person.personPageId}`;
          } else if (window.openRelativePopup) {
            window.openRelativePopup(id);
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
  }

  function attachTooltipListeners() {
    // Clean up any existing tooltips
    document.querySelectorAll('.tree-tooltip').forEach(t => t.remove());

    const tooltip = document.createElement('div');
    tooltip.className = 'tree-tooltip';
    tooltip.style.cssText = 'position:fixed;pointer-events:none;opacity:0;transition:opacity 0.2s;z-index:200';
    document.body.appendChild(tooltip);

    Object.entries(nodeEls).forEach(([id, el]) => {
      const person = personById[id];
      const clan   = person ? CLANS[person.clanId] : null;
      el.addEventListener('mouseenter', ev => {
        if (!clan) return;
        const timelineHtml = getPersonTimelineHtml(person);
        tooltip.innerHTML = `
          <div class="tree-tooltip__inner">
            <span class="tree-tooltip__icon">${clan.icon}</span>
            <strong>${clan.name}</strong>
            <span>${person.name.replace('\n',' ')}</span>
            ${timelineHtml}
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
  }

  function attachConnectButtonListener() {
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
  }

  function attachSearchListener() {
    const searchInput = document.getElementById('tree-search-input');
    if (searchInput) {
      // Re-bind listener (clone input to drop old listeners if any)
      const freshInput = searchInput.cloneNode(true);
      searchInput.replaceWith(freshInput);
      freshInput.addEventListener('input', e => {
        const q = e.target.value.toLowerCase().trim();
        if (!q) {
          if (highlightedId) {
            highlight(highlightedId);
          } else {
            clearHighlight();
          }
          return;
        }
        wrapper.classList.add('has-highlight');
        Object.entries(nodeEls).forEach(([nid, el]) => {
          const person = personById[nid];
          const nameMatch = person && person.name.toLowerCase().includes(q);
          const yearsMatch = person && person.years && person.years.toLowerCase().includes(q);
          const matches = nameMatch || yearsMatch;
          if (matches) {
            el.classList.remove('tree-node--dim');
            el.classList.add('tree-node--active');
          } else {
            el.classList.add('tree-node--dim');
            el.classList.remove('tree-node--active');
          }
        });
        svgEl.querySelectorAll('.thread-path').forEach(p => {
          p.classList.add('thread-path--dim');
          p.classList.remove('thread-path--active');
        });
      });
    }
  }

  document.addEventListener('click', e => {
    if (connectMode && !e.target.closest('.tree-node')) { exitConnectMode(); return; }
    if (!e.target.closest('.tree-node') && !e.target.closest('.clan-legend__item')) {
      clearHighlight();
      filterByClan(null);
      const legendWrap = document.getElementById('tree-clan-legend');
      if (legendWrap) {
        legendWrap.querySelectorAll('[data-clan]').forEach(el =>
          el.classList.remove('clan-legend__item--active'));
      }
    }
  });

  window.addEventListener('load', () => {
    dataLoadPromise.then(() => {
      setTimeout(() => {
        drawThreads();
      }, 300);
    });
  });

  window.addEventListener('resize', () => {
    dataLoadPromise.then(() => {
      setTimeout(drawThreads, 200);
    });
  });

  // Pan & zoom system removed — tree scrolls naturally with the page.

})();



/* ═══════════════════════════════════════════════
   Image error fallback delegation (заменяет inline onerror)
   ═══════════════════════════════════════════════ */
(function () {
  function getSvg () {
    try { if (typeof PERSON_SVG !== 'undefined') return PERSON_SVG; } catch (e) {}
    return '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:48px;height:48px;fill:currentColor;opacity:0.3"><circle cx="12" cy="7" r="4"/><path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8"/></svg>';
  }
  document.addEventListener('error', function (ev) {
    const t = ev.target;
    if (!t || !t.matches) return;
    if (!t.matches('img[data-tr-fb]')) return;
    const kind = t.getAttribute('data-tr-fb');
    const svg = getSvg();
    if (kind === 'tree-node')            { t.outerHTML = '<div class="tree-node__avatar">' + svg + '</div>'; }
    else if (kind === 'person-card')     { t.outerHTML = '<div class="person-card__photo-inner">' + svg + '</div>'; }
    else if (kind === 'person-header')   { t.outerHTML = '<div class="person-header__photo-inner">' + svg + '</div>'; }
    else if (kind === 'featured-person') { t.outerHTML = '<div class="featured-person__avatar">' + svg + '</div>'; }
    else if (kind === 'emoji-32')        { t.outerHTML = '<span style="font-size:32px;">👤</span>'; }
    else if (kind === 'hide-show-next')  { t.style.display = 'none'; const n = t.nextElementSibling; if (n) n.style.display = 'inline'; }
    else                                 { t.outerHTML = '<div>' + svg + '</div>'; }
  }, true);
})();
