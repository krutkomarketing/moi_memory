/* ═══════════════════════════════════════════════
   TREE-EDIT.JS v3
   ✓ Кнопка «Создать дерево» — новое пустое дерево
   ✓ Анимация перехода между деревьями
   ✓ Соединение карточек (и default и dynamic)
   ✓ Добавить ветвь (работает)
   ✓ Синхронизация с летописью
   ═══════════════════════════════════════════════ */

(function () {
  const urlParams   = new URLSearchParams(window.location.search);
  let currentTreeId = urlParams.get('tree') || 'default';

  const isLocalDev  = window.location.port && window.location.port !== '80' && window.location.port !== '443' && window.location.port !== '5500';
  const BASE        = isLocalDev ? 'http://localhost:3000' : '';

  // Transparent Tree Selection: if logged in and no tree param is specified, redirect to their first tree
  if (typeof API !== 'undefined' && API.isLoggedIn && API.isLoggedIn() && !urlParams.has('tree')) {
    fetch(`${BASE}/api/family-trees`)
      .then(r => r.json())
      .then(j => {
        const trees = (j && (j.data || j.trees)) || [];
        if (trees.length > 0) {
          const target = trees[0].id || trees[0].treeId;
          if (typeof API.updateRootTreeId === 'function') {
            API.updateRootTreeId(target);
          }
          window.location.replace("family-tree.html?tree=" + encodeURIComponent(target));
        } else {
          if (typeof API.updateRootTreeId === 'function') {
            API.updateRootTreeId(null);
          }
          window.location.replace("family-tree.html?tree=default");
        }
      })
      .catch(() => {
        window.location.replace("family-tree.html?tree=default");
      });
    return;
  }

  const editBtn = document.getElementById('tree-edit-btn');
  if (!editBtn) return;

  const printBtn = document.getElementById('tree-print-btn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }
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
  let isEditMode = false;
  let allNodes   = [];
  let clansCache = {};
  let activeDynamicClan = null;

  const isDeceased = (yearsStr) => {
    if (!yearsStr) return false;
    const str = String(yearsStr).trim();
    if (/[-–—]\s*$/.test(str)) return false;
    const yearsMatched = str.match(/\d{4}/g);
    if (yearsMatched && yearsMatched.length >= 2) return true;
    if ((str.includes('-') || str.includes('–') || str.includes('—')) && !/[-–—]\s*$/.test(str)) return true;
    return false;
  };

  /* ── HISTORY IS HANDLED EXCLUSIVELY VIA PERSONAL EVENTS ── */

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

  /* ── PREMIUM GLASSMORPHIC CUSTOM PROMPT ── */
  function showCustomPrompt(title, placeholder, onConfirm) {
    const old = document.getElementById('custom-prompt-modal');
    if (old) old.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'custom-prompt-modal';
    backdrop.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      z-index: 15000;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(18, 18, 18, 0.85);
      border: 1px solid rgba(200, 168, 75, 0.3);
      border-radius: 16px;
      padding: 30px;
      width: 90%;
      max-width: 400px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.6);
      transform: scale(0.9);
      transition: transform 0.3s ease;
      font-family: var(--font-body);
      color: var(--cream);
    `;

    panel.innerHTML = `
      <h3 style="margin-top:0;font-family:var(--font-display);font-size:20px;color:var(--gold-light);margin-bottom:12px;">${title}</h3>
      <input type="text" id="custom-prompt-input" placeholder="${placeholder}" style="
        width: 100%;
        padding: 12px 16px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        color: #fff;
        font-size: 15px;
        margin-bottom: 20px;
        box-sizing: border-box;
        outline: none;
        transition: border-color 0.3s;
      " />
      <div style="display:flex;justify-content:flex-end;gap:12px;">
        <button id="custom-prompt-cancel" style="
          padding: 8px 16px;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.15);
          color: var(--cream-dim);
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.3s;
        ">Отмена</button>
        <button id="custom-prompt-ok" style="
          padding: 8px 20px;
          background: var(--gold);
          border: none;
          color: #121212;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.3s;
        ">OK</button>
      </div>
    `;

    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    const input = panel.querySelector('#custom-prompt-input');
    input.focus();

    requestAnimationFrame(() => {
      backdrop.style.opacity = '1';
      panel.style.transform = 'scale(1)';
    });

    const close = () => {
      backdrop.style.opacity = '0';
      panel.style.transform = 'scale(0.9)';
      setTimeout(() => backdrop.remove(), 300);
    };

    const handleConfirm = () => {
      const val = input.value.trim();
      if (val) {
        onConfirm(val);
      }
      close();
    };

    panel.querySelector('#custom-prompt-cancel').addEventListener('click', close);
    panel.querySelector('#custom-prompt-ok').addEventListener('click', handleConfirm);
    
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleConfirm();
      if (e.key === 'Escape') close();
    });

    input.addEventListener('focus', () => {
      input.style.borderColor = 'var(--gold)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = 'rgba(255,255,255,0.1)';
    });
  }

  /* ── CUSTOM CONNECTION MODAL ── */
  /* ── CUSTOM CONNECTION MODAL ── */
  function showConnectionTypeModal(idA, idB, clickX, clickY, onConfirm, onCancel) {
    const old = document.getElementById('connection-type-modal');
    if (old) old.remove();
    const oldBackdrop = document.getElementById('connection-modal-backdrop');
    if (oldBackdrop) oldBackdrop.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'connection-modal-backdrop';
    backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;background:none;pointer-events:auto;';

    const modal = document.createElement('div');
    modal.id = 'connection-type-modal';
    modal.className = 'connection-modal';
    modal.style.cssText = `
      position: absolute;
      left: ${clickX}px;
      top: ${clickY}px;
      transform: translate(-50%, -50%);
      z-index: 10000;
      pointer-events: auto;
    `;
    modal.innerHTML = `
      <div class="connection-modal__content connection-modal__content--popup">
        <h3 class="connection-modal__title">Тип соединения</h3>
        <div class="connection-modal__options">
          <button class="connection-modal__btn" data-type="spouse">💍 Брак</button>
          <button class="connection-modal__btn" data-type="parent">🧬 Родство</button>
          <button class="connection-modal__btn" data-type="kin">🌿 Ветвь</button>
        </div>
        <div class="connection-modal__colors-label">Цвет нити:</div>
        <div class="connection-modal__colors">
          <span class="connection-color-dot connection-color-dot--selected" style="background:#c8a84b;" data-color="#c8a84b"></span>
          <span class="connection-color-dot" style="background:#7ec8b4;" data-color="#7ec8b4"></span>
          <span class="connection-color-dot" style="background:#c87e7e;" data-color="#c87e7e"></span>
          <span class="connection-color-dot" style="background:#4b8cc8;" data-color="#4b8cc8"></span>
          <input type="color" id="connection-custom-color" value="#c8a84b" style="width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;padding:0;background:none;" />
        </div>
        <button class="connection-modal__btn connection-modal__btn--cancel" id="connection-cancel-btn">Отмена</button>
      </div>`;

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    const rect = modal.getBoundingClientRect();
    let left = clickX;
    let top = clickY;
    if (left - rect.width / 2 < 10) left = rect.width / 2 + 10;
    if (left + rect.width / 2 > window.innerWidth - 10) left = window.innerWidth - rect.width / 2 - 10;
    if (top - rect.height / 2 < 10) top = rect.height / 2 + 10;
    if (top + rect.height / 2 > window.innerHeight - 10) top = window.innerHeight - rect.height / 2 - 10;

    modal.style.left = `${left + window.scrollX}px`;
    modal.style.top = `${top + window.scrollY}px`;

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
    modal.querySelectorAll('.connection-modal__options button').forEach(btn => {
      btn.addEventListener('click', () => {
        onConfirm(btn.dataset.type, selectedColor);
        modal.remove();
        backdrop.remove();
      });
    });
    const handleCancel = () => {
      onCancel();
      modal.remove();
      backdrop.remove();
    };
    modal.querySelector('#connection-cancel-btn').addEventListener('click', handleCancel);
    backdrop.addEventListener('click', handleCancel);
    const handleEsc = (e) => {
      if (e.key === 'Escape') { handleCancel(); document.removeEventListener('keydown', handleEsc); }
    };
    document.addEventListener('keydown', handleEsc);
  }

  /* ── BARYCENTRIC LAYOUT SORTING ── */
  function sortDynamicGenerations(gens, manualGens) {
    const sortedGenIndices = Object.keys(gens).map(Number).sort((a,b) => a-b);
    if (sortedGenIndices.length === 0) return;

    // Build parent/child maps dynamically
    const parentsOf = {};
    const childrenOf = {};
    sortedGenIndices.forEach(g => {
      const people = gens[g] || [];
      people.forEach(p => {
        let pids = [];
        try {
          if (p.parent_ids) {
            pids = typeof p.parent_ids === 'string' ? JSON.parse(p.parent_ids) : p.parent_ids;
          } else if (p.parentIds) {
            pids = typeof p.parentIds === 'string' ? JSON.parse(p.parentIds) : p.parentIds;
          }
        } catch(e) {
          pids = [];
        }
        if (!Array.isArray(pids)) pids = [];

        parentsOf[p.id] = pids;
        pids.forEach(parentId => {
          if (!childrenOf[parentId]) childrenOf[parentId] = [];
          if (!childrenOf[parentId].includes(p.id)) {
            childrenOf[parentId].push(p.id);
          }
        });
      });
    });

    const getClanName = (p) => {
      const clanId = p.clan_id || p.clanId;
      if (!clanId) return '';
      if (typeof CLANS !== 'undefined' && CLANS[clanId]) return CLANS[clanId].name || '';
      if (clansCache && clansCache[clanId]) return clansCache[clanId].name || '';
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

    function getGenerationUnitsLocal(people) {
      const units = [];
      const visited = new Set();
      people.forEach(p => {
        if (visited.has(p.id)) return;
        visited.add(p.id);
        const spouseId = p.spouse_id || p.spouseId;
        if (spouseId) {
          const spouse = people.find(sp => sp.id === spouseId);
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
      // Bottom-up pass
      for (let i = 1; i < sortedGenIndices.length; i++) {
        const g = sortedGenIndices[i];
        if (manualGens && manualGens.has(g)) continue;

        const prevG = sortedGenIndices[i - 1];
        const prevPeople = gens[prevG] || [];
        const prevPeopleIndices = {};
        prevPeople.forEach((p, idx) => { prevPeopleIndices[p.id] = idx; });

        const units = getGenerationUnitsLocal(gens[g] || []);
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
        gens[g] = flat;
      }

      // Top-down pass
      for (let i = sortedGenIndices.length - 2; i >= 0; i--) {
        const g = sortedGenIndices[i];
        if (manualGens && manualGens.has(g)) continue;

        const nextG = sortedGenIndices[i + 1];
        const nextPeople = gens[nextG] || [];
        const nextPeopleIndices = {};
        nextPeople.forEach((p, idx) => { nextPeopleIndices[p.id] = idx; });

        const units = getGenerationUnitsLocal(gens[g] || []);
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
        gens[g] = flat;
      }
    }

    const oldestGen = sortedGenIndices[0];
    if (oldestGen !== undefined && !(manualGens && manualGens.has(oldestGen))) {
      const gen0Units = getGenerationUnitsLocal(gens[oldestGen] || []);
      gen0Units.sort((a, b) => getUnitClanWeight(a) - getUnitClanWeight(b));
      const flat0 = [];
      gen0Units.forEach(u => flat0.push(...u));
      gens[oldestGen] = flat0;
    }
  }

  function groupSpousesDynamic(people) {
    const result = [];
    const visited = new Set();
    people.forEach(p => {
      if (visited.has(p.id)) return;
      result.push(p);
      visited.add(p.id);
      const spouseId = p.spouse_id || p.spouseId;
      if (spouseId) {
        const spouse = people.find(sp => sp.id === spouseId);
        if (spouse && !visited.has(spouse.id)) {
          result.push(spouse);
          visited.add(spouse.id);
        }
      }
    });
    return result;
  }

  /* ── TOOLTIP DOM ELEMENT ── */
  let tooltip = document.querySelector('.tree-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'tree-tooltip';
    tooltip.style.cssText = 'position:fixed;pointer-events:none;opacity:0;transition:opacity 0.2s;z-index:200';
    document.body.appendChild(tooltip);
  }

  /* ── LINEAGE HIGHLIGHT DYNAMIC ── */
  let highlightedDynamicId = null;
  function highlightDynamicNode(id) {
    const container = document.getElementById('tree-dynamic');
    if (!container) return;
    
    highlightedDynamicId = id;
    container.classList.add('has-highlight');
    
    const parentsOf = {};
    const childrenOf = {};
    const spouseOf = {};
    
    allNodes.forEach(n => {
      const spouseId = n.spouse_id || n.spouseId;
      if (spouseId) spouseOf[n.id] = spouseId;
      
      let pids = [];
      try {
        if (n.parent_ids) pids = typeof n.parent_ids === 'string' ? JSON.parse(n.parent_ids) : n.parent_ids;
        else if (n.parentIds) pids = typeof n.parentIds === 'string' ? JSON.parse(n.parentIds) : n.parentIds;
      } catch(e) {}
      if (Array.isArray(pids)) {
        pids.forEach(pid => {
          parentsOf[n.id] = parentsOf[n.id] || [];
          if (!parentsOf[n.id].includes(pid)) parentsOf[n.id].push(pid);
          
          childrenOf[pid] = childrenOf[pid] || [];
          if (!childrenOf[pid].includes(n.id)) childrenOf[pid].push(n.id);
        });
      }
    });
    
    function getAncestors(nid, acc = new Set()) {
      (parentsOf[nid] || []).forEach(p => { if (!acc.has(p)) { acc.add(p); getAncestors(p, acc); } });
      return acc;
    }
    function getDescendants(nid, acc = new Set()) {
      (childrenOf[nid] || []).forEach(c => { if (!acc.has(c)) { acc.add(c); getDescendants(c, acc); } });
      return acc;
    }
    
    const ancestors = getAncestors(id);
    const descendants = getDescendants(id);
    const spouse = spouseOf[id];
    const lineageSet = new Set([id, ...ancestors, ...descendants]);
    if (spouse) lineageSet.add(spouse);
    
    container.querySelectorAll('.tree-node').forEach(el => {
      const nid = el.dataset.id;
      el.classList.remove('tree-node--active', 'tree-node--ancestor', 'tree-node--descendant', 'tree-node--dim');
      if (nid === id || nid === spouse) el.classList.add('tree-node--active');
      else if (ancestors.has(nid)) el.classList.add('tree-node--ancestor');
      else if (descendants.has(nid)) el.classList.add('tree-node--descendant');
      else el.classList.add('tree-node--dim');
    });
    
    const svg = container.querySelector('.tree-dynamic-svg');
    if (svg) {
      svg.querySelectorAll('path').forEach(p => {
        const a = p.dataset.a || p.getAttribute('data-a');
        const b = p.dataset.b || p.getAttribute('data-b');
        if (a && b) {
          const isActive = lineageSet.has(a) && lineageSet.has(b);
          p.classList.add(isActive ? 'thread-path--active' : 'thread-path--dim');
        } else {
          p.classList.add('thread-path--dim');
        }
      });
    }
  }
  
  function clearHighlightDynamic() {
    highlightedDynamicId = null;
    const container = document.getElementById('tree-dynamic');
    if (!container) return;
    container.classList.remove('has-highlight');
    container.querySelectorAll('.tree-node').forEach(el => {
      el.classList.remove('tree-node--active', 'tree-node--ancestor', 'tree-node--descendant', 'tree-node--dim');
    });
    const svg = container.querySelector('.tree-dynamic-svg');
    if (svg) {
      svg.querySelectorAll('path').forEach(p => {
        p.classList.remove('thread-path--active', 'thread-path--dim');
      });
    }
    if (activeDynamicClan) {
      filterDynamicByClan(activeDynamicClan);
    }
  }

  function filterDynamicByClan(clanId) {
    activeDynamicClan = clanId;
    
    highlightedDynamicId = null;
    const container = document.getElementById('tree-dynamic');
    if (container) {
      container.classList.remove('has-highlight');
      container.querySelectorAll('.tree-node').forEach(el => {
        el.classList.remove('tree-node--active', 'tree-node--ancestor', 'tree-node--descendant', 'tree-node--dim');
      });
      const svg = container.querySelector('.tree-dynamic-svg');
      if (svg) {
        svg.querySelectorAll('path').forEach(p => {
          p.classList.remove('thread-path--active', 'thread-path--dim');
        });
      }
    }
    
    document.querySelectorAll('#tree-clan-legend .clan-legend__item').forEach(el => {
      el.classList.toggle('clan-legend__item--active', el.dataset.clan === clanId && clanId !== null);
    });

    if (!container) return;

    container.querySelectorAll('.tree-node').forEach(el => {
      const nid = el.dataset.id;
      const node = allNodes.find(n => n.id === nid);
      const nodeClanId = node ? (node.clan_id || node.clanId) : null;
      if (!clanId || nodeClanId === clanId) {
        el.classList.remove('tree-node--clan-dim');
      } else {
        el.classList.add('tree-node--clan-dim');
      }
    });

    const svg = container.querySelector('.tree-dynamic-svg');
    if (svg) {
      svg.querySelectorAll('path').forEach(p => {
        const clanA = p.dataset.clan || p.getAttribute('data-clan');
        if (!clanId || clanA === clanId) {
          p.classList.remove('thread-path--clan-dim');
        } else {
          p.classList.add('thread-path--clan-dim');
        }
      });
    }
  }

  document.addEventListener('click', e => {
    if (currentTreeId === 'default') return;
    if (!e.target.closest('#tree-dynamic .tree-node') && !e.target.closest('.clan-legend__item') && !e.target.closest('.tree-modal') && !e.target.closest('.tree-toolbar')) {
      filterDynamicByClan(null);
      clearHighlightDynamic();
    }
  });

  /* ── localStorage helpers ── */
  const NODES_KEY = () => `tree_nodes_${currentTreeId}`;
  const CONN_KEY  = () => `tree_connections_${currentTreeId}`;
  const getLocalNodes       = () => { try { return JSON.parse(localStorage.getItem(NODES_KEY()) || '[]'); } catch { return []; } };
  const saveLocalNodes      = a  => { try { localStorage.setItem(NODES_KEY(), JSON.stringify(a)); } catch {} };
  const getLocalConnections = () => { try { return JSON.parse(localStorage.getItem(CONN_KEY())  || '[]'); } catch { return []; } };
  const saveLocalConnections= a  => { try { localStorage.setItem(CONN_KEY(),  JSON.stringify(a)); } catch {} };

  /* ── Список всех деревьев (localStorage) ── */
  const getAllTrees = () => { try { return JSON.parse(localStorage.getItem('all_trees') || '["default"]'); } catch { return ['default']; } };
  const saveAllTrees = arr => { try { localStorage.setItem('all_trees', JSON.stringify(arr)); } catch {} };

  /* ════════════════════════════════════════════
     КНОПКА РЕДАКТИРОВАТЬ
     ════════════════════════════════════════════ */
  editBtn.addEventListener('click', () => {
    if (!isEditMode) enterEditMode();
  });

  // Кнопка выхода из edit mode
  document.getElementById('tree-edit-exit')?.addEventListener('click', () => {
    exitEditMode();
  });

  /* ════════════════════════════════════════════
     КНОПКИ «ДОБАВИТЬ ВЕТВЬ» и «СОЗДАТЬ ДЕРЕВО»
     ════════════════════════════════════════════ */
  const newBranchBtn = document.getElementById('tree-new-btn');
  if (newBranchBtn) {
    newBranchBtn.textContent = '🌿 Добавить ветвь';
    newBranchBtn.addEventListener('click', () => openAddBranchModal());
  }

  /* Кнопку «Создать дерево» — listener вешаем всегда */
  (function addCreateTreeBtn() {
    let btn = document.getElementById('tree-create-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id        = 'tree-create-btn';
      btn.className = 'tree-edit-btn tree-edit-btn--create';
      btn.textContent = '🌳 Создать дерево';
      newBranchBtn?.parentElement?.appendChild(btn);
    }
    btn.replaceWith(btn.cloneNode(true));
    document.getElementById('tree-create-btn').addEventListener('click', () => openCreateTreeModal());
  })();

  /* ── КНОПКА «СОЕДИНИТЬ КАРТОЧКИ» — скролл к легенде + подсветка ── */
  (function initConnectBtn() {
    const btn = document.getElementById('tree-connect-btn');
    if (!btn) return;
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);

    fresh.addEventListener('click', () => {
      const legend = document.getElementById('tree-legend');
      if (!legend) return;

      /* Плавный скролл к легенде */
      legend.scrollIntoView({ behavior: 'smooth', block: 'center' });

      /* Подсветка легенды */
      legend.classList.add('tree-legend--active');
      setTimeout(() => legend.classList.remove('tree-legend--active'), 3000);

      /* Показать подсказку-инструкцию над легендой */
      let tip = document.getElementById('connect-tip');
      if (tip) { tip.remove(); }
      tip = document.createElement('div');
      tip.id = 'connect-tip';
      tip.innerHTML = `
        <div class="connect-tip__inner">
          <span class="connect-tip__icon">🔗</span>
          <div>
            <strong>Как соединить карточки</strong>
            <ol>
              <li>Нажмите на тип линии в легенде ниже</li>
              <li>Кликните на первую карточку</li>
              <li>Кликните на вторую карточку</li>
              <li>Линия появится автоматически ✦</li>
            </ol>
          </div>
          <button class="connect-tip__close" onclick="this.closest('#connect-tip').remove()">✕</button>
        </div>`;
      legend.parentElement.insertBefore(tip, legend);
      requestAnimationFrame(() => requestAnimationFrame(() => tip.classList.add('connect-tip--visible')));
      setTimeout(() => { if (tip.parentNode) { tip.classList.remove('connect-tip--visible'); setTimeout(() => tip.remove(), 400); } }, 6000);
    });
  })();

  /* ── КНОПКА «УБРАТЬ СВЯЗЬ» ── */
  (function initDisconnectBtn() {
    const btn = document.getElementById('tree-disconnect-btn');
    if (!btn) return;
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);

    fresh.addEventListener('click', () => {
      if (connectionMode === 'disconnect') {
        cancelConnectionMode();
        return;
      }
      cancelConnectionMode();
      connectionMode  = 'disconnect';
      connectionStep  = 0;
      connectionNodeA = null;
      fresh.style.background = 'rgba(239,68,68,0.18)';
      fresh.style.boxShadow  = '0 0 0 2px rgba(239,68,68,0.6)';
      showConnectionToast('disconnect');
    });
  })();

  /* ════════════════════════════════════════════
     МОДАЛКА «СОЗДАТЬ ДЕРЕВО»
     ════════════════════════════════════════════ */
  function openCreateTreeModal() {
    document.getElementById('create-tree-modal')?.remove();

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
            <div class="ctm-photo-placeholder-icon" style="transition: opacity 0.4s ease-out; display: flex; align-items: center; justify-content: center;">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="40" height="40">
                <circle cx="12" cy="7" r="4" fill="currentColor"/>
                <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8" fill="currentColor"/>
              </svg>
            </div>
            <img class="ctm-photo-img" src="" style="display:none;opacity:0;width:100%;height:100%;object-fit:cover;border-radius:50%;transition:opacity 0.4s ease-out;position:absolute;top:0;left:0;">
          </div>
          <label class="ctm-photo-label" for="ctm-photo-input">
            <span class="ctm-photo-text">📷 Прикрепить фото</span>
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
              <input type="number" name="deathYear" placeholder="1985" min="1800" max="2025" class="ctm-input"/>
            </div>
            <div class="ctm-field">
              <label>Город</label>
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
            <label>Краткое описание</label>
            <textarea name="bio" placeholder="Немного о человеке…" class="ctm-input ctm-textarea" rows="3"></textarea>
          </div>
          <button type="submit" class="ctm-submit">🌳 Создать древо и перейти</button>
        </form>
      </div>`;

    document.body.appendChild(modal);

    /* Фото превью и фоновая загрузка */
    const photoInput   = modal.querySelector('#ctm-photo-input');
    const photoPreview = modal.querySelector('#ctm-photo-preview');
    const photoText    = modal.querySelector('.ctm-photo-text');
    let uploadedPhotoUrl = '';

    photoInput.addEventListener('change', async () => {
      const file = photoInput.files[0];
      if (!file) return;

      // 1. Показываем локальное превью для быстрого отклика
      const reader = new FileReader();
      reader.onload = ev => {
        const img = photoPreview.querySelector('.ctm-photo-img');
        const placeholder = photoPreview.querySelector('.ctm-photo-placeholder-icon');
        if (img && placeholder) {
          img.src = ev.target.result;
          img.style.display = 'block';
          img.offsetHeight;
          img.style.opacity = '0.5'; // полупрозрачный во время загрузки
          placeholder.style.opacity = '0';
          setTimeout(() => {
            placeholder.style.display = 'none';
          }, 400);
        }
      };
      reader.readAsDataURL(file);

      // 2. Фоновая отправка на сервер
      if (photoText) photoText.textContent = '⏳ Загрузка...';
      const fd = new FormData();
      fd.append('photo', file);

      try {
        const r = await fetch(`${BASE}/api/upload-photo`, { method: 'POST', body: fd });
        const j = await r.json();
        if (j.ok) {
          uploadedPhotoUrl = j.url;
          const img = photoPreview.querySelector('.ctm-photo-img');
          if (img) img.style.opacity = '1';
          if (photoText) photoText.textContent = '✅ Фото загружено';
        } else {
          alert('Ошибка при загрузке фото: ' + (j.error || 'неизвестная ошибка'));
          resetPhotoPreview();
        }
      } catch (err) {
        alert('Ошибка соединения при загрузке фото');
        resetPhotoPreview();
      }
    });

    function resetPhotoPreview() {
      uploadedPhotoUrl = '';
      if (photoText) photoText.textContent = '📷 Прикрепить фото';
      const img = photoPreview.querySelector('.ctm-photo-img');
      const placeholder = photoPreview.querySelector('.ctm-photo-placeholder-icon');
      if (img && placeholder) {
        img.src = '';
        img.style.display = 'none';
        img.style.opacity = '0';
        placeholder.style.display = 'flex';
        placeholder.style.opacity = '1';
      }
      photoInput.value = '';
    }

    const close = () => {
      modal.classList.remove('ctm-visible');
      setTimeout(() => {
        modal.remove();
      }, 450);
    };
    modal.querySelector('.ctm-close').addEventListener('click', close);
    modal.querySelector('.ctm-backdrop').addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('ctm-visible')));

    modal.querySelector('#ctm-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const firstName = fd.get('firstName')?.trim();
      const lastName  = fd.get('lastName')?.trim();
      if (!firstName || !lastName) {
        alert('Пожалуйста, укажите обязательные поля: Имя и Фамилия');
        return;
      }

      const treeName = fd.get('treeName')?.trim() || `Род ${lastName}`;
      
      // Make tree ID unique by appending a random suffix to avoid 409 conflict
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const treeIdBase = treeName.toLowerCase()
        .replace(/[^a-zа-яё0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 25);
      const treeId = (treeIdBase || 'tree') + '-' + randomSuffix;

      const years = fd.get('birthYear')
        ? `${fd.get('birthYear')}–${fd.get('deathYear') || ''}`
        : '';

      const roleLabels = {
        progenitor: 'Прародитель рода', patriarch: 'Патриарх',
        parent: 'Родитель', grandparent: 'Дед / Бабушка', greatgrandparent: 'Прапрадед',
      };

      const fullName = `${lastName} ${firstName}${fd.get('middleName') ? ' ' + fd.get('middleName').trim() : ''}`;

      const nodeData = {
        firstName,
        lastName,
        birth: fd.get('birthYear') || '',
        death: fd.get('deathYear') || '',
        fullName,
        years,
        generation: 0,
        ageClass: 'old',
        treeId,
        description: roleLabels[fd.get('role')] || '',
        photoUrl: uploadedPhotoUrl,
        gender: fd.get('gender') || 'male',
      };

      const submitBtn = modal.querySelector('.ctm-submit');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Создание...';
      }

      let serverSuccess = false;

      /* 1. Создаём дерево на сервере */
      try {
        const treeRes = await fetch(`${BASE}/api/family-trees`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: treeId, name: treeName })
        });
        const treeJson = await treeRes.json();
        if (!treeJson.ok) {
          throw new Error(treeJson.error || 'Ошибка при создании дерева');
        }

        /* 2. Создаём первый узел на сервере */
        const nodeRes = await fetch(`${BASE}/api/family-nodes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nodeData)
        });
        const nodeJson = await nodeRes.json();
        if (!nodeJson.ok) {
          throw new Error(nodeJson.error || 'Ошибка при создании первого узла');
        }

        /* Сервер вернул узел — сохраняем в localStorage для немедленного отображения */
        localStorage.setItem(`tree_nodes_${treeId}`, JSON.stringify([nodeJson.data]));
        serverSuccess = true;
      } catch (err) {
        console.error('Failed to create tree/node on server:', err);
        alert('Не удалось создать дерево на сервере: ' + err.message);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '🌳 Создать древо и перейти';
        }
        return; // Stop execution, don't redirect to empty page
      }

      if (serverSuccess) {
        const trees = getAllTrees();
        if (!trees.includes(treeId)) { trees.push(treeId); saveAllTrees(trees); }

        /* Обновляем легенду линий с новым названием рода */
        updateLegendWithNewTree(treeName, fd.get('gender') === 'female' ? '#c87e7e' : '#c8a84b');

        close();
        transitionToNewTree(treeId);
      }
    });
  }

  /* ════════════════════════════════════════════
     ОБНОВЛЕНИЕ ЛЕГЕНДЫ ЛИНИЙ ПРИ НОВОМ ДЕРЕВЕ
     ════════════════════════════════════════════ */
  function updateLegendWithNewTree(treeName, color) {
    const legend = document.getElementById('tree-legend');
    if (!legend) return;

    /* Убираем старую запись этого рода если есть */
    legend.querySelectorAll('[data-new-tree]').forEach(el => el.remove());

    /* Создаём новый элемент легенды с названием РОД сверху */
    const item = document.createElement('div');
    item.className = 'tree-legend__item tree-legend__item--new';
    item.dataset.newTree = treeName;
    item.innerHTML = `
      <span class="tree-legend__clan-label" style="color:${color};">${treeName}</span>
      <span class="tree-legend__line" style="background:linear-gradient(90deg,${color},${color}88)"></span>`;
    item.style.opacity = '0';
    item.style.transform = 'translateY(8px)';
    item.style.transition = 'opacity 0.5s, transform 0.5s';
    legend.appendChild(item);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      item.style.opacity = '1';
      item.style.transform = 'translateY(0)';
    }));
  }

  /* ════════════════════════════════════════════
     АНИМАЦИЯ ПЕРЕХОДА К НОВОМУ ДЕРЕВУ
     ════════════════════════════════════════════ */
  function transitionToNewTree(treeId) {
    /* Запоминаем активное дерево для летописи */
    if (treeId && treeId !== 'default') {
      localStorage.setItem('active_tree_id', treeId);
      if (typeof API !== 'undefined' && typeof API.updateRootTreeId === 'function') {
        API.updateRootTreeId(treeId);
      }
    } else {
      localStorage.removeItem('active_tree_id');
      if (typeof API !== 'undefined' && typeof API.updateRootTreeId === 'function') {
        API.updateRootTreeId(null);
      }
    }

    /* Старое дерево отдаляется и пропадает */
    const treeSection = document.querySelector('.tree-section');
    const clanWrap    = document.querySelector('.clan-legend-wrap');
    const legend      = document.querySelector('.tree-legend');
    const hero        = document.querySelector('.tree-hero');

    const els = [hero, clanWrap, treeSection, legend].filter(Boolean);
    els.forEach(el => {
      el.style.transition = 'transform 0.7s cubic-bezier(0.4,0,0.2,1), opacity 0.7s ease';
      el.style.transform  = 'scale(0.6) translateY(-40px)';
      el.style.opacity    = '0';
      el.style.pointerEvents = 'none';
    });

    /* Затем переходим */
    setTimeout(() => {
      window.location.href = `family-tree.html?tree=${encodeURIComponent(treeId)}`;
    }, 680);
  }



  /* ════════════════════════════════════════════
     МОДАЛКА «ДОБАВИТЬ ВЕТВЬ»
     ════════════════════════════════════════════ */
  function openAddBranchModal() {
    document.getElementById('tree-branch-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'tree-modal-overlay';
    overlay.id        = 'tree-branch-modal';
    overlay.innerHTML = `
      <div class="tree-modal">
        <button class="tree-modal__close" id="tbr-close">×</button>
        <h2 class="tree-modal__title">Добавить ветвь</h2>
        <p style="font-family:var(--font-body);font-size:14px;color:var(--cream-dim);margin-bottom:20px;">
          Ветвь — боковая линия внутри текущего дерева (семья дяди, другая фамилия).
        </p>
        <form id="tbr-form">
          <div class="tree-modal__field">
            <label>Название ветви</label>
            <input type="text" id="tbr-name" placeholder="Ветвь Смирновых" maxlength="60" autofocus required/>
          </div>
          <div class="tree-modal__field">
            <label>Первый человек (ФИО)</label>
            <input type="text" id="tbr-person" placeholder="Смирнов Иван Петрович" maxlength="120"/>
          </div>
          <div class="tree-modal__field">
            <label>Годы жизни</label>
            <input type="text" id="tbr-years" placeholder="1920–1985" maxlength="30"/>
          </div>
          <div class="tree-modal__field">
            <label>Поколение</label>
            <select id="tbr-gen">
              <option value="0">Прапрародители</option>
              <option value="1">Прародители</option>
              <option value="2" selected>Родители</option>
              <option value="3">Наше поколение</option>
            </select>
          </div>
          <div class="tree-modal__actions">
            <button type="button" class="tree-modal__btn tree-modal__btn--cancel" id="tbr-cancel">Отмена</button>
            <button type="submit" class="tree-modal__btn tree-modal__btn--save">Добавить</button>
          </div>
          <p class="tree-modal__error" id="tbr-error" style="display:none"></p>
        </form>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('tbr-close').addEventListener('click', close);
    document.getElementById('tbr-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    document.getElementById('tbr-form').addEventListener('submit', async e => {
      e.preventDefault();
      const branchName = document.getElementById('tbr-name').value.trim();
      const personName = document.getElementById('tbr-person').value.trim();
      const years      = document.getElementById('tbr-years').value.trim();
      const gen        = parseInt(document.getElementById('tbr-gen').value, 10);
      const errEl      = document.getElementById('tbr-error');
      if (!branchName) return;

      const parts = (personName || branchName).split(/\s+/).filter(Boolean);
      const firstName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
      const lastName = parts.length > 1 ? parts[0] : '';

      let birth = '';
      let death = '';
      if (years) {
        const yParts = years.split(/[\-\–\—\s]+/).map(x => x.trim()).filter(Boolean);
        if (yParts.length === 1) {
          if (years.includes('-') || years.includes('–') || years.includes('—')) {
            if (years.trim().startsWith('-') || years.trim().startsWith('–') || years.trim().startsWith('—')) {
              death = yParts[0];
            } else {
              birth = yParts[0];
            }
          } else {
            birth = yParts[0];
          }
        } else if (yParts.length >= 2) {
          birth = yParts[0];
          death = yParts[1];
        }
      }

      const nodeData = {
        treeId: currentTreeId,
        firstName,
        lastName,
        birth,
        death,
        fullName: personName || branchName,
        years,
        description: `Ветвь: ${branchName}`, generation: gen, genOrder: 99,
        ageClass: gen <= 1 ? 'old' : 'young', isBranchRoot: true, branchName,
      };

      let saved = false;
      try {
        const r = await fetch(`${BASE}/api/family-nodes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nodeData) });
        const j = await r.json();
        if (j.ok) { saved = true; close(); syncTimelineAndStats(); reloadTreeInPlace(); }
        else { errEl.textContent = j.error || 'Ошибка'; errEl.style.display = 'block'; }
      } catch (_) {}

      if (!saved && !errEl.textContent) {
        const arr = getLocalNodes();
        const node = { ...nodeData, id: 'local-' + Date.now() };
        arr.push(node); saveLocalNodes(arr); allNodes = arr;
        syncTimelineAndStats(); close();
        const dc = document.getElementById('tree-dynamic');
        if (dc) { renderDynamicTree(dc); } else { reloadTreeInPlace(); }
      }
    });
  }

  /* ════════════════════════════════════════════
     РЕЖИМ СОЕДИНЕНИЯ — ЛЕГЕНДА ЛИНИЙ
     ════════════════════════════════════════════ */
  let connectionMode = null;
  let connectionStep = 0;
  let connectionNodeA = null;

  function initLegendConnections() {
    document.querySelectorAll('.tree-legend__item').forEach(item => {
      item.style.cursor     = 'pointer';
      item.style.transition = 'all 0.25s';
      item.style.borderRadius = '6px';
      item.style.padding    = '4px 10px';
      item.style.userSelect = 'none';

      item.addEventListener('click', () => {
        const lineEl = item.querySelector('.tree-legend__line');
        if (!lineEl) return;
        let type = 'line';
        if (lineEl.classList.contains('tree-legend__line--braid') || lineEl.classList.contains('tree-legend__line--marriage')) type = 'marriage';
        else if (lineEl.classList.contains('tree-legend__line--wood') || lineEl.classList.contains('tree-legend__line--kinship')) type = 'parent';

        if (connectionMode === type) { cancelConnectionMode(); return; }
        cancelConnectionMode();
        connectionMode  = type;
        connectionStep  = 0;
        connectionNodeA = null;
        item.style.background = 'rgba(200,168,75,0.18)';
        item.style.boxShadow  = '0 0 0 2px rgba(200,168,75,0.6)';
        item.dataset.activeConn = '1';
        showConnectionToast(type);
      });
    });
  }

  function cancelConnectionMode() {
    connectionMode = null; connectionStep = 0; connectionNodeA = null;
    document.querySelectorAll('.tree-legend__item[data-active-conn]').forEach(el => {
      el.style.background = ''; el.style.boxShadow = ''; delete el.dataset.activeConn;
    });
    document.querySelectorAll('.tree-node--conn-selected').forEach(el => el.classList.remove('tree-node--conn-selected'));
    document.querySelectorAll('.tree-node--disconn-selected').forEach(el => el.classList.remove('tree-node--disconn-selected'));
    document.getElementById('conn-toast')?.remove();
    const disBtn = document.getElementById('tree-disconnect-btn');
    if (disBtn) { disBtn.style.background = ''; disBtn.style.boxShadow = ''; }
  }

  function showConnectionToast(type) {
    document.getElementById('conn-toast')?.remove();
    const labels = { marriage: 'Брачный союз 💍', parent: 'Родство 🧬', line: 'Прямая линия →', disconnect: 'Удаление связи 🔓' };
    const t = document.createElement('div');
    t.id = 'conn-toast';
    t.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:rgba(8,8,8,0.95);border:1px solid rgba(200,168,75,0.5);border-radius:30px;padding:12px 24px;font-family:var(--font-body);font-size:14px;color:var(--gold-light);z-index:9999;display:flex;align-items:center;gap:12px;backdrop-filter:blur(8px);box-shadow:0 8px 32px rgba(0,0,0,0.7);animation:toastIn 0.3s ease;pointer-events:auto;';
    if (type === 'disconnect') {
      t.style.borderColor = 'rgba(239,68,68,0.5)';
      t.style.color = '#ff9e9e';
      t.innerHTML = `<span id="conn-toast-msg">${labels[type]} — кликните на первую карточку</span><button onclick="document.getElementById('conn-toast')?.remove()" style="background:none;border:none;color:#ffcccc;font-size:18px;cursor:pointer;margin-left:8px;line-height:1;">×</button>`;
    } else {
      t.innerHTML = `<span id="conn-toast-msg">${labels[type]} — кликните на первую карточку</span><button onclick="document.getElementById('conn-toast')?.remove()" style="background:none;border:none;color:var(--cream-dim);font-size:18px;cursor:pointer;margin-left:8px;line-height:1;">×</button>`;
    }
    document.body.appendChild(t);
  }

  function showSuccessToast(msg) {
    document.getElementById('conn-toast')?.remove();
    const t = document.createElement('div');
    t.id = 'conn-toast';
    t.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:rgba(8,8,8,0.95);border:1px solid #7ec8b4;border-radius:30px;padding:12px 24px;font-family:var(--font-body);font-size:14px;color:#7ec8b4;z-index:9999;display:flex;align-items:center;gap:12px;backdrop-filter:blur(8px);box-shadow:0 8px 32px rgba(0,0,0,0.7);animation:toastIn 0.3s ease;pointer-events:auto;';
    t.innerHTML = `<span>✓ ${msg}</span><button onclick="document.getElementById('conn-toast')?.remove()" style="background:none;border:none;color:#ccffee;font-size:18px;cursor:pointer;margin-left:8px;line-height:1;">×</button>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  function showErrorToast(msg) {
    document.getElementById('conn-toast')?.remove();
    document.getElementById('err-toast')?.remove();
    const t = document.createElement('div');
    t.id = 'err-toast';
    t.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:rgba(26,12,12,0.92);border:1px solid rgba(239,68,68,0.5);border-radius:30px;padding:12px 24px;font-family:var(--font-body);font-size:14px;color:#ff9e9e;z-index:9999;display:flex;align-items:center;gap:12px;backdrop-filter:blur(8px);box-shadow:0 8px 32px rgba(0,0,0,0.7);animation:toastIn 0.3s ease;pointer-events:auto;';
    t.innerHTML = `<span id="err-toast-msg">⚠️ ${msg}</span><button onclick="document.getElementById('err-toast')?.remove()" style="background:none;border:none;color:#ffcccc;font-size:18px;cursor:pointer;margin-left:8px;line-height:1;">×</button>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  function updateConnectionToast(step) {
    const msg = document.getElementById('conn-toast-msg');
    if (!msg) return;
    if (connectionMode === 'disconnect') {
      msg.textContent = step === 1 ? 'Теперь кликните на вторую карточку для удаления связи' : '✓ Связь удалена!';
    } else {
      msg.textContent = step === 1 ? 'Теперь кликните на вторую карточку' : '✓ Соединение установлено!';
    }
  }

  /* ── Клик по карточке для соединения / разъединения ── */
  function handleNodeConnectionClick(nodeEl, nodeId) {
    if (!connectionMode) return false;
    
    if (connectionMode === 'disconnect') {
      if (connectionStep === 0) {
        connectionNodeA = nodeId; connectionStep = 1;
        nodeEl.classList.add('tree-node--disconn-selected');
        updateConnectionToast(1);
        return true;
      }
      if (connectionStep === 1) {
        if (nodeId === connectionNodeA) {
          nodeEl.classList.remove('tree-node--disconn-selected');
          connectionNodeA = null; connectionStep = 0;
          const msg = document.getElementById('conn-toast-msg');
          if (msg) msg.textContent = 'Удаление связи 🔓 — кликните на первую карточку';
          return true;
        }
        nodeEl.classList.add('tree-node--disconn-selected');
        updateConnectionToast(2);
        disconnectNodes(connectionNodeA, nodeId);
        setTimeout(() => cancelConnectionMode(), 1400);
        return true;
      }
    }

    if (connectionStep === 0) {
      connectionNodeA = nodeId; connectionStep = 1;
      nodeEl.classList.add('tree-node--conn-selected');
      updateConnectionToast(1);
      return true;
    }
    if (connectionStep === 1) {
      if (nodeId === connectionNodeA) {
        nodeEl.classList.remove('tree-node--conn-selected');
        connectionNodeA = null; connectionStep = 0; return true;
      }
      if (connectionMode === 'marriage') {
        const nodeA = allNodes.find(n => n.id === connectionNodeA);
        const nodeB = allNodes.find(n => n.id === nodeId);
        if (nodeA && nodeB) {
          const genA = nodeA.generation || 0;
          const genB = nodeB.generation || 0;
          const clanA = nodeA.clan_id || nodeA.clanId;
          const clanB = nodeB.clan_id || nodeB.clanId;
          if (genA !== genB && clanA && clanB && clanA === clanB) {
            showErrorToast('Брак между членами одного рода из разных поколений запрещен!');
            cancelConnectionMode();
            return true;
          }
        }
      }
      /* __MARRIAGE_YEAR_PROMPT_V1__ */
      const proceedWithConnection = (extras = {}) => {
        connectNodes(connectionNodeA, nodeId, connectionMode, extras);
        nodeEl.classList.add('tree-node--conn-selected');
        updateConnectionToast(2);
        setTimeout(() => cancelConnectionMode(), 1400);
      };

      if (connectionMode === 'marriage') {
        // Open custom premium modal
        document.getElementById('tree-marriage-year-modal')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'tree-marriage-year-modal';
        overlay.style.cssText = `
          position: fixed;
          top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          z-index: 15000;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.3s ease;
        `;
        overlay.innerHTML = `
          <div class="tree-modal" style="
            background: rgba(18, 18, 18, 0.85);
            border: 1px solid rgba(200, 168, 75, 0.3);
            border-radius: 16px;
            padding: 30px;
            width: 90%;
            max-width: 400px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.6);
            transform: scale(0.9);
            transition: transform 0.3s ease;
            font-family: var(--font-body);
            color: var(--cream);
            position: relative;
          ">
            <button class="tree-modal__close" id="tmy-close" style="
              position: absolute;
              top: 15px; right: 15px;
              background: transparent;
              border: none;
              color: var(--cream-dim);
              font-size: 24px;
              cursor: pointer;
              outline: none;
            ">×</button>
            <h3 style="margin-top:0;font-family:var(--font-display);font-size:20px;color:var(--gold-light);margin-bottom:12px;">Год брака</h3>
            <form id="tmy-form">
              <div class="tree-modal__field" style="margin-bottom: 20px;">
                <label style="display:block;margin-bottom:8px;font-size:14px;color:var(--cream-dim);">Укажите год брака (необязательно)</label>
                <input type="number" id="tmy-year" placeholder="Пример: 1980" min="1500" max="${new Date().getFullYear() + 5}" autofocus style="
                  width: 100%;
                  padding: 12px 16px;
                  background: rgba(255,255,255,0.05);
                  border: 1px solid rgba(255,255,255,0.1);
                  border-radius: 8px;
                  color: #fff;
                  font-size: 15px;
                  box-sizing: border-box;
                  outline: none;
                  transition: border-color 0.3s;
                " />
              </div>
              <div style="display:flex;justify-content:flex-end;gap:12px;">
                <button type="button" id="tmy-cancel" style="
                  padding: 8px 16px;
                  background: transparent;
                  border: 1px solid rgba(255,255,255,0.15);
                  color: var(--cream-dim);
                  border-radius: 6px;
                  cursor: pointer;
                  font-size: 14px;
                  transition: background 0.3s;
                ">Пропустить</button>
                <button type="submit" id="tmy-ok" style="
                  padding: 8px 20px;
                  background: var(--gold);
                  border: none;
                  color: #121212;
                  font-weight: 600;
                  border-radius: 6px;
                  cursor: pointer;
                  font-size: 14px;
                  transition: background 0.3s;
                ">Сохранить</button>
              </div>
            </form>
          </div>
        `;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('#tmy-year');
        input.focus();

        requestAnimationFrame(() => {
          overlay.style.opacity = '1';
          overlay.querySelector('.tree-modal').style.transform = 'scale(1)';
        });

        const close = () => {
          overlay.style.opacity = '0';
          overlay.querySelector('.tree-modal').style.transform = 'scale(0.9)';
          setTimeout(() => overlay.remove(), 300);
        };

        overlay.querySelector('#tmy-close').addEventListener('click', close);
        overlay.querySelector('#tmy-cancel').addEventListener('click', () => {
          proceedWithConnection({});
          close();
        });

        overlay.querySelector('#tmy-form').addEventListener('submit', (e) => {
          e.preventDefault();
          const val = input.value.trim();
          let extras = {};
          if (val) {
            const y = parseInt(val, 10);
            const yearMax = new Date().getFullYear() + 5;
            if (Number.isInteger(y) && y >= 1500 && y <= yearMax) {
              extras.startDate = y + '-01-01';
            } else {
              showErrorToast('Введите год от 1500 до ' + yearMax);
              return;
            }
          }
          proceedWithConnection(extras);
          close();
        });

        input.addEventListener('keydown', e => {
          if (e.key === 'Escape') close();
        });
        input.addEventListener('focus', () => {
          input.style.borderColor = 'var(--gold)';
        });
        input.addEventListener('blur', () => {
          input.style.borderColor = 'rgba(255,255,255,0.1)';
        });
      } else {
        proceedWithConnection({});
      }
      return true;
    }
    return false;
  }

  /* ── Сохранить и нарисовать соединение ── */
  function connectNodes(idA, idB, type, extras = {}) {
    const conns = getLocalConnections();
    const ex = conns.find(c => (c.a === idA && c.b === idB) || (c.a === idB && c.b === idA));

    /* Определяем цвет из активного элемента легенды */
    const activeItem = document.querySelector('.tree-legend__item[data-active-conn]');
    const activeLine = activeItem ? activeItem.querySelector('.tree-legend__line') : null;
    let lineColor = null;
    if (activeLine) {
      const bg = activeLine.style.background || activeLine.style.backgroundColor;
      /* Извлекаем hex/rgb из inline style */
      const hexMatch = bg.match(/#[0-9a-fA-F]{6}/);
      if (hexMatch) lineColor = hexMatch[0];
    }

    const connData = { id: Date.now().toString(36), a: idA, b: idB, type };
    if (extras && extras.startDate) connData.startDate = extras.startDate;
    if (lineColor) connData.color = lineColor;

    if (ex) { Object.assign(ex, { type, color: lineColor || ex.color }); }
    else { conns.push(connData); }
    saveLocalConnections(conns);

    fetch(`${BASE}/api/family-connections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      /* __CONN_FIELD_NAMES_V1__ */ body: JSON.stringify(Object.assign({ treeId: currentTreeId, fromNodeId: idA, toNodeId: idB, nodeA: idA, nodeB: idB, type: type, color: lineColor }, (extras && extras.startDate ? { startDate: extras.startDate } : {}))),
    }).then(r => { if (!r.ok) r.text().then(t => console.error('POST /family-connections failed:', r.status, t)); }).catch(e => console.error('POST /family-connections network error:', e));

    /* Нарисовать нити — и в dynamic и в static контейнере */
    const dc = document.getElementById('tree-dynamic');
    if (dc) {
      drawCustomConnections(dc, conns);
    } else {
      /* static default дерево — рисуем поверх tree-wrapper */
      const tw = document.getElementById('tree-wrapper');
      if (tw) drawCustomConnections(tw, conns);
    }
    syncTimelineAndStats();
  }

  /* ── Helpers для чтения/записи родственных отношений узлов ── */
  function getParentIds(node) {
    let pids = [];
    try {
      if (node.parent_ids) pids = typeof node.parent_ids === 'string' ? JSON.parse(node.parent_ids) : node.parent_ids;
      else if (node.parentIds) pids = typeof node.parentIds === 'string' ? JSON.parse(node.parentIds) : node.parentIds;
    } catch (_) {}
    return Array.isArray(pids) ? pids : [];
  }

  function setParentIds(node, array) {
    if (node.hasOwnProperty('parent_ids') || node.parent_ids === undefined) {
      node.parent_ids = array;
    }
    if (node.hasOwnProperty('parentIds') || node.parentIds === undefined) {
      node.parentIds = array;
    }
  }

  async function saveNodeUpdates(node) {
    const isLocal = node.id && node.id.toString().startsWith('local-');
    const name = node.full_name || node.fullName || '';
    const parts = name.split(/\s+/).filter(Boolean);
    const firstName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
    const lastName = parts.length > 1 ? parts[0] : '';

    const yearsInput = node.years || '';
    let birth = '';
    let death = '';
    if (yearsInput) {
      const yParts = yearsInput.split(/[\-\–\—\s]+/).map(x => x.trim()).filter(Boolean);
      if (yParts.length === 1) {
        if (yearsInput.includes('-') || yearsInput.includes('–') || yearsInput.includes('—')) {
          if (yearsInput.trim().startsWith('-') || yearsInput.trim().startsWith('–') || yearsInput.trim().startsWith('—')) {
            death = yParts[0];
          } else {
            birth = yParts[0];
          }
        } else {
          birth = yParts[0];
        }
      } else if (yParts.length >= 2) {
        birth = yParts[0];
        death = yParts[1];
      }
    }

    const data = {
      firstName,
      lastName,
      birth,
      death,
      fullName: name,
      years: yearsInput,
      clanId: node.clan_id || node.clanId || '',
      ageClass: node.age_class || node.ageClass || 'young',
      generation: node.generation ?? 3,
      spouseId: node.spouse_id || node.spouseId || null,
      parentIds: node.parent_ids || node.parentIds || [],
      linkedProfileId: node.linked_profile_id || node.linkedProfileId || null,
      photoUrl: node.photo_url || node.photoUrl || '',
      description: node.description || '',
      posX: typeof node.posX === 'number' ? node.posX : (node.posX ?? node.pos_x ?? null),
      posY: typeof node.posY === 'number' ? node.posY : (node.posY ?? node.pos_y ?? null)
    };

    const arr = getLocalNodes();
    const idx = arr.findIndex(n => n.id === node.id);
    if (idx !== -1) {
      arr[idx] = { ...arr[idx], ...data };
      saveLocalNodes(arr);
    }
    const ai = allNodes.findIndex(n => n.id === node.id);
    if (ai !== -1) {
      allNodes[ai] = { ...allNodes[ai], ...data };
    }

    if (!isLocal) {
      try {
        await fetch(`${BASE}/api/family-nodes/${node.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } catch (_) {}
    }
  }

  /* ── Разорвать и удалить соединение ── */
  async function disconnectNodes(idA, idB) {
    let disconnected = false;

    // 1. Сначала ищем и удаляем кастомное соединение в базе/localStorage
    const conns = getLocalConnections();
    const foundConnIndex = conns.findIndex(c => (c.a === idA && c.b === idB) || (c.a === idB && c.b === idA));
    if (foundConnIndex !== -1) {
      const conn = conns[foundConnIndex];
      conns.splice(foundConnIndex, 1);
      saveLocalConnections(conns);
      
      // Удаление на сервере
      fetch(`${BASE}/api/family-connections/${conn.id}`, {
        method: 'DELETE'
      }).catch(() => {});
      
      disconnected = true;
    }

    // 2. Ищем и сбрасываем супружескую связь (spouse_id)
    const nodeA = allNodes.find(n => n.id === idA);
    const nodeB = allNodes.find(n => n.id === idB);
    
    if (nodeA && nodeB) {
      const spouseIdA = nodeA.spouse_id || nodeA.spouseId;
      const spouseIdB = nodeB.spouse_id || nodeB.spouseId;
      if (spouseIdA === idB || spouseIdB === idA) {
        nodeA.spouse_id = null;
        nodeA.spouseId = null;
        nodeB.spouse_id = null;
        nodeB.spouseId = null;
        
        await saveNodeUpdates(nodeA);
        await saveNodeUpdates(nodeB);
        disconnected = true;
      }

      // Ищем и сбрасываем детско-родительскую связь (parent_ids)
      const pidsA = getParentIds(nodeA);
      const pidsB = getParentIds(nodeB);

      if (pidsA.includes(idB)) {
        setParentIds(nodeA, pidsA.filter(pid => pid !== idB));
        await saveNodeUpdates(nodeA);
        disconnected = true;
      }
      if (pidsB.includes(idA)) {
        setParentIds(nodeB, pidsB.filter(pid => pid !== idA));
        await saveNodeUpdates(nodeB);
        disconnected = true;
      }
    }

    if (disconnected) {
      // Полный перерендер дерева для очистки связей
      reloadTreeInPlace();
      showSuccessToast('Связь успешно удалена');
    } else {
      showErrorToast('Связь между выбранными карточками не найдена');
    }
  }

  /* ════════════════════════════════════════════
     ПЕРЕКЛЮЧАТЕЛЬ ДЕРЕВЬЕВ (dropdown)
     ════════════════════════════════════════════ */
  (async function initTreeSwitcher() {
    /* Сначала пробуем API */
    let trees = [];
    try {
      const r = await fetch(`${BASE}/api/family-trees`);
      const j = await r.json();
      if (j.ok && Array.isArray(j.data)) {
        trees = j.data.map(item => {
          if (typeof item === 'string') {
            return { id: item, name: item === 'default' ? 'Основное' : item };
          }
          return item;
        });
      }
    } catch (_) {}
    /* Дополняем из localStorage */
    const localTrees = getAllTrees();
    localTrees.forEach(t => {
      const tid = typeof t === 'string' ? t : t.id;
      if (!trees.some(x => x.id === tid)) {
        trees.push({ id: tid, name: tid === 'default' ? 'Основное' : tid });
      }
    });

    if (trees.length <= 1) return;

    // Filter out redundant default tree if user is logged in
    const isLoggedIn = typeof API !== 'undefined' && API.isLoggedIn && API.isLoggedIn();
    if (isLoggedIn) {
      trees = trees.filter(t => t.id !== 'default');
    }

    const sw = document.createElement('div');
    sw.className = 'tree-switcher';
    
    const optionsHtml = trees.map(t => {
      let displayName = t.name || t.id;
      if (t.id === 'default' || t.id.endsWith('-default')) {
        displayName = 'Основное древо';
      }
      return `<option value="${t.id}" ${t.id === currentTreeId ? 'selected' : ''}>${displayName}</option>`;
    }).join('');

    sw.innerHTML = `<label class="tree-switcher__label">Дерево:</label>
      <select class="tree-switcher__select" id="tree-switcher-select">
        ${optionsHtml}
      </select>`;
    document.querySelector('.clan-legend-wrap')?.insertBefore(sw, document.querySelector('.clan-legend-wrap').firstChild);

    document.getElementById('tree-switcher-select')?.addEventListener('change', e => {
      const val = e.target.value;
      transitionToNewTree(val === 'default' ? null : val);
      setTimeout(() => {
        window.location.href = val === 'default' ? 'family-tree.html?tree=default' : `family-tree.html?tree=${encodeURIComponent(val)}`;
      }, 10);
    });
  })();



  async function syncConnectionsFromDb() {
    try {
      const r = await fetch(`${BASE}/api/family-connections?treeId=${currentTreeId}`);
      const j = await r.json();
      if (j.ok && Array.isArray(j.data)) {
        const conns = j.data.map(c => {
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
        saveLocalConnections(conns);
      }
    } catch (_) {}
  }

  /* ════════════════════════════════════════════
     ИНИЦИАЛИЗАЦИЯ — СТАТИЧЕСКОЕ ИЛИ ДИНАМИЧЕСКОЕ
     ════════════════════════════════════════════ */
  if (currentTreeId !== 'default') {
    /* Новое / кастомное дерево — скрываем статику, рендерим динамику */
    const sw = document.getElementById('tree-wrapper');
    if (sw) sw.style.display = 'none';
    const sl = document.getElementById('tree-clan-legend');
    if (sl) sl.innerHTML = '';
    const dc = document.createElement('div');
    dc.className = 'tree-dynamic'; dc.id = 'tree-dynamic';
    document.querySelector('.tree-section')?.appendChild(dc);

    Promise.all([
      loadAndRenderClans(),
      syncConnectionsFromDb(),
      loadNodes()
    ]).then(() => {
      renderDynamicTree(dc);
      initLegendConnections();
    });
  } else {
    /* Default дерево — статическое, но если юзер логинен — проверяем его деревья */
    const isLoggedIn = typeof API !== 'undefined' && API.isLoggedIn && API.isLoggedIn();
    if (isLoggedIn) {
      // Скрываем статику превентивно, чтобы не мерцал mock
      const sw = document.getElementById('tree-wrapper');
      if (sw) sw.style.display = 'none';

      fetch(`${BASE}/api/family-trees`, {
        headers: API.getToken ? (API.getToken() ? { 'Authorization': 'Bearer ' + API.getToken() } : {}) : {}
      }).then(r => r.json()).then(j => {
        const trees = (j && (j.data || j.trees)) || [];
        if (trees.length > 0) {
          const target = trees[0].id || trees[0].treeId;
          if (typeof API.updateRootTreeId === 'function') {
            API.updateRootTreeId(target);
          }
          // Если параметр tree явно равен 'default', не редирекмим, а показываем статику
          if (urlParams.get('tree') === 'default') {
            if (sw) sw.style.display = 'block';
          } else {
            // Перенаправляем на первое дерево
            window.location.replace("family-tree.html?tree=" + encodeURIComponent(target));
          }
        } else {
          // Деревьев нет — показываем схематику
          const sl = document.getElementById('tree-clan-legend');
          if (sl) sl.innerHTML = '';
          
          let dc = document.getElementById('tree-dynamic');
          if (!dc) {
            dc = document.createElement('div');
            dc.className = 'tree-dynamic'; dc.id = 'tree-dynamic';
            document.querySelector('.tree-section')?.appendChild(dc);
          }
          dc.style.display = 'block';
          renderEmptySchematic(dc);
        }
      }).catch(() => {
        // В случае ошибки показываем схематику
        let dc = document.getElementById('tree-dynamic');
        if (!dc) {
          dc = document.createElement('div');
          dc.className = 'tree-dynamic'; dc.id = 'tree-dynamic';
          document.querySelector('.tree-section')?.appendChild(dc);
        }
        dc.style.display = 'block';
        renderEmptySchematic(dc);
      });
    } else {
      /* Default дерево — статическое, но соединения тоже работают */
      syncConnectionsFromDb().then(() => {
        // Done syncing default connections
      });

      /* Вешаем соединение на статические карточки */
      function attachStaticNodeClicks() {
        document.querySelectorAll('#tree-wrapper .tree-node, #tree-generations .tree-node').forEach(nodeEl => {
          if (nodeEl.dataset.connBound) return;
          nodeEl.dataset.connBound = '1';
          nodeEl.addEventListener('click', e => {
            if (e.target.closest('.tree-node-ctrl')) return;
            const nid = nodeEl.dataset.id;
            if (nid && handleNodeConnectionClick(nodeEl, nid)) {
              e.preventDefault();
            }
          });
        });
      }
      /* tree.js строит карточки — ждём */
      setTimeout(() => { attachStaticNodeClicks(); initLegendConnections(); }, 600);

      /* Рисуем сохранённые соединения поверх статического дерева */
      setTimeout(() => {
        const tw = document.getElementById('tree-wrapper');
        if (tw) {
          const conns = getLocalConnections();
          if (conns.length) drawCustomConnections(tw, conns);
        }
      }, 800);
    }
  }

  function addClanButton() {
    const legend = document.getElementById('tree-clan-legend');
    if (!legend || legend.querySelector('.clan-legend__item--add')) return;
    if (!isEditMode) return; // только в edit mode
    const btn = document.createElement('div');
    btn.className = 'clan-legend__item clan-legend__item--add';
    btn.innerHTML = `<span class="clan-legend__add-icon">+</span><div class="clan-legend__text"><strong>Добавить род</strong><span>Новая линия</span></div>`;
    btn.addEventListener('click', openAddClanModal);
    legend.appendChild(btn);
  }

  function removeClanButton() {
    document.querySelector('.clan-legend__item--add')?.remove();
  }

  async function loadAndRenderClans() {
    const legend = document.getElementById('tree-clan-legend');
    if (!legend) return;
    try {
      const r = await fetch(`${BASE}/api/family-clans?treeId=${encodeURIComponent(currentTreeId)}`);
      if (r.status === 403 || r.status === 404) {
        if (currentTreeId !== 'default') {
          const user = typeof API !== 'undefined' ? API.getUser() : null;
          if (user && user.rootTreeId === currentTreeId) {
            if (typeof API.updateRootTreeId === 'function') {
              API.updateRootTreeId(null);
            }
          }
          const freshUser = typeof API !== 'undefined' ? API.getUser() : null;
          if (freshUser && freshUser.rootTreeId && freshUser.rootTreeId !== currentTreeId) {
            window.location.replace("family-tree.html?tree=" + encodeURIComponent(freshUser.rootTreeId));
          } else {
            window.location.replace("family-tree.html?tree=default");
          }
          return;
        }
      }
      const j = await r.json();
      if (!j.ok) return;
      clansCache = {};
      j.data.forEach(c => { clansCache[c.id] = c; });
      legend.innerHTML = j.data.map(c => `
        <div class="clan-legend__item${activeDynamicClan === c.id ? ' clan-legend__item--active' : ''}" data-clan="${c.id}" style="--clan-color:${c.color}">
          <span class="clan-legend__badge" style="background:${c.color};box-shadow:0 0 10px ${c.color}44;">${c.icon}</span>
          <div class="clan-legend__text"><strong>${c.name}</strong><span>${c.description || ''}</span></div>
        </div>`).join('');

      legend.querySelectorAll('.clan-legend__item').forEach(item => {
        item.addEventListener('click', () => {
          const cid = item.dataset.clan;
          if (cid) {
            filterDynamicByClan(cid === activeDynamicClan ? null : cid);
          }
        });
      });
    } catch (_) {}
    addClanButton();
  }

  function openAddClanModal() {
    document.getElementById('tree-clan-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'tree-modal-overlay'; overlay.id = 'tree-clan-modal';
    overlay.innerHTML = `
      <div class="tree-modal">
        <button class="tree-modal__close" id="tcm-close">×</button>
        <h2 class="tree-modal__title">Добавить род</h2>
        <form id="tcm-form">
          <div class="tree-modal__field"><label>Название</label><input type="text" id="tcm-name" placeholder="Петровы" maxlength="100" required/></div>
          <div class="tree-modal__field"><label>Описание</label><input type="text" id="tcm-desc" placeholder="Врачи, военные…" maxlength="200"/></div>
          <div class="tree-modal__row">
            <div class="tree-modal__field tree-modal__field--half"><label>Цвет</label><input type="color" id="tcm-color" value="#c8a84b" style="width:100%;height:40px;border:none;border-radius:6px;cursor:pointer;"/></div>
            <div class="tree-modal__field tree-modal__field--half"><label>Иконка</label>
              <div id="tcm-icon-picker"><input type="hidden" id="tcm-icon" value="✦"/>
                <div class="tcm-icon-grid">${['✦','⚔︎','⚕︎','⚒︎','⚓︎','✿','♕','⚖︎','✎','♫','⛭','☸','✈︎','⚡︎','☘︎','⛪︎','★','⚙︎','♥','☀︎'].map((ic,i)=>`<button type="button" class="tcm-icon-opt${i===0?' tcm-icon-opt--active':''}" data-icon="${ic}">${ic}</button>`).join('')}</div>
              </div>
            </div>
          </div>
          <div class="tree-modal__actions">
            <button type="button" class="tree-modal__btn tree-modal__btn--cancel" id="tcm-cancel">Отмена</button>
            <button type="submit" class="tree-modal__btn tree-modal__btn--save">Создать</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    document.getElementById('tcm-close').addEventListener('click', close);
    document.getElementById('tcm-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.getElementById('tcm-form').addEventListener('submit', async e => {
      e.preventDefault();
      const name = document.getElementById('tcm-name').value.trim();
      if (!name) return;
      try {
        const r = await fetch(`${BASE}/api/family-clans`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color: document.getElementById('tcm-color').value, icon: document.getElementById('tcm-icon').value || '✦', description: document.getElementById('tcm-desc').value.trim(), treeId: currentTreeId }) });
        const j = await r.json();
        if (j.ok) { close(); syncTimelineAndStats(); reloadTreeInPlace(); } else alert(j.error || 'Ошибка');
      } catch (_) { alert('Сервер недоступен'); }
    });
    document.getElementById('tcm-icon-picker')?.addEventListener('click', e => {
      const b = e.target.closest('.tcm-icon-opt');
      if (!b) return;
      document.querySelectorAll('.tcm-icon-opt').forEach(x => x.classList.remove('tcm-icon-opt--active'));
      b.classList.add('tcm-icon-opt--active');
      document.getElementById('tcm-icon').value = b.dataset.icon;
    });
  }



  /* ════════════════════════════════════════════
     РЕНДЕР ПУСТОЙ СХЕМАТИКИ (EMPTY STATE PLACEHOLDER)
     ════════════════════════════════════════════ */
  function renderEmptySchematic(container) {
    const sw = document.getElementById('tree-wrapper');
    if (sw) sw.style.display = 'none';

    // Скрываем поиск, легенду и кнопки
    const searchWrap = document.querySelector('.tree-search-wrap');
    if (searchWrap) searchWrap.style.display = 'none';
    const printBtn = document.getElementById('tree-print-btn');
    if (printBtn) printBtn.style.display = 'none';
    const editBtn = document.getElementById('tree-edit-btn');
    if (editBtn) editBtn.style.display = 'none';

    // Clear any thread elements
    const svg = document.getElementById('tree-threads') || container.querySelector('.tree-dynamic-svg');
    if (svg) svg.innerHTML = '';

    const isCustomTree = currentTreeId && currentTreeId !== 'default';
    const btnText = isCustomTree ? '➕ Добавить первую карточку' : '🌳 Создать семейное древо';
    const subtitleText = isCustomTree
      ? 'Древо пока пустое. Добавьте первую карточку (прародителя рода), чтобы начать родословную.'
      : 'Оживите историю вашей семьи: добавляйте поколения, указывайте годы жизни и плетите цветные нити родов.';

    container.innerHTML = `
      <div class="tree-empty-schematic">
        <div class="schematic-header">
          <h2 class="schematic-title">Создайте своё семейное древо</h2>
          <p class="schematic-subtitle">${subtitleText}</p>
        </div>

        <div class="schematic-grid">
          <!-- SVG lines linking dummy cards -->
          <svg class="schematic-svg" viewBox="0 0 800 340">
            <path d="M 180 80 L 290 190" stroke="rgba(255,255,255,0.06)" stroke-width="2" stroke-dasharray="4,4" fill="none" />
            <path d="M 400 80 L 290 190" stroke="rgba(255,255,255,0.06)" stroke-width="2" stroke-dasharray="4,4" fill="none" />
            <path d="M 620 80 L 510 190" stroke="rgba(255,255,255,0.06)" stroke-width="2" stroke-dasharray="4,4" fill="none" />
            <path d="M 510 190 L 400 290" stroke="rgba(255,255,255,0.06)" stroke-width="2" stroke-dasharray="4,4" fill="none" />
            <path d="M 290 190 L 400 290" stroke="rgba(255,255,255,0.06)" stroke-width="2" stroke-dasharray="4,4" fill="none" />
            <path d="M 290 190 L 510 190" stroke="rgba(255,255,255,0.04)" stroke-width="2" stroke-dasharray="4,4" fill="none" />
          </svg>

          <!-- Generation rows -->
          <div class="schematic-row schematic-row--top">
            <div class="schematic-card schematic-card--stub">
              <span class="schematic-card__label">Дедушка</span>
            </div>
            <div class="schematic-card schematic-card--stub">
              <span class="schematic-card__label">Бабушка</span>
            </div>
            <div class="schematic-card schematic-card--stub">
              <span class="schematic-card__label">Дедушка</span>
            </div>
            <div class="schematic-card schematic-card--stub">
              <span class="schematic-card__label">Бабушка</span>
            </div>
          </div>

          <div class="schematic-row schematic-row--mid">
            <div class="schematic-card schematic-card--stub">
              <span class="schematic-card__label">Отец</span>
            </div>
            <div class="schematic-card schematic-card--stub">
              <span class="schematic-card__label">Мать</span>
            </div>
          </div>

          <div class="schematic-row schematic-row--bot">
            <div class="schematic-card schematic-card--active">
              <span class="schematic-card__label">Вы</span>
            </div>
          </div>
        </div>

        <!-- Glassmorphic action panel -->
        <div class="schematic-panel">
          <p class="schematic-panel__text">
            Постройте интерактивную летопись вашего рода. Первая карточка станет началом семейного древа.
          </p>
          <button class="schematic-cta-btn" id="schematic-create-btn">
            ${btnText}
          </button>
        </div>
      </div>
    `;

    const ctaBtn = container.querySelector('#schematic-create-btn');
    if (ctaBtn) {
      ctaBtn.addEventListener('click', () => {
        if (isCustomTree) {
          openNodeModal(null, 'stub', 3);
        } else {
          if (typeof openCreateTreeModal === 'function') {
            openCreateTreeModal();
          } else {
            enterEditMode();
          }
        }
      });
    }
  }

  /* ════════════════════════════════════════════
     РЕНДЕР ДИНАМИЧЕСКОГО ДЕРЕВА
     ════════════════════════════════════════════ */
  function renderDynamicTree(container) {
    const localConns = getLocalConnections();

    // Pre-populate parents and spouse fields from connections for tree rendering to sort correctly
    const parentMap = {};
    const spouseMap = {};

    localConns.forEach(c => {
      const typeLower = String(c.type).toLowerCase();
      if (typeLower === 'parent' || typeLower === 'kinship') {
        if (!parentMap[c.b]) parentMap[c.b] = [];
        parentMap[c.b].push(c.a);
      } else if (typeLower === 'spouse' || typeLower === 'marriage') {
        spouseMap[c.a] = c.b;
        spouseMap[c.b] = c.a;
      }
    });

    allNodes.forEach(n => {
      n.parentIds = parentMap[n.id] || [];
      n.parent_ids = n.parentIds;
      n.spouseId = spouseMap[n.id] || null;
      n.spouse_id = n.spouseId;
      n.spouseOf = n.spouseId;
    });

    if (!allNodes.length && !isEditMode) {
      renderEmptySchematic(container);
      return;
    }

    // Восстанавливаем видимость поиска и кнопок
    const searchWrap = document.querySelector('.tree-search-wrap');
    if (searchWrap) searchWrap.style.display = '';
    const printBtn = document.getElementById('tree-print-btn');
    if (printBtn) printBtn.style.display = '';
    const editBtn = document.getElementById('tree-edit-btn');
    if (editBtn) editBtn.style.display = '';
    const gens = {};
    allNodes.forEach(n => { const g = n.generation || 0; if (!gens[g]) gens[g] = []; gens[g].push(n); });

    const manualGens = new Set();
    Object.keys(gens).forEach(g => {
      const list = gens[g];
      if (list.some(n => typeof n.posX === 'number' && n.posX !== null)) {
        manualGens.add(Number(g));
      }
    });

    // Pre-sort manual generations by posX so they stay in order before any algorithm steps
    manualGens.forEach(g => {
      gens[g].sort((a, b) => {
        const ax = typeof a.posX === 'number' ? a.posX : 999999;
        const bx = typeof b.posX === 'number' ? b.posX : 999999;
        return ax - bx;
      });
    });

    sortDynamicGenerations(gens, manualGens);

    // Save fallback positions for auto-sorted generations so they persist on next load or drag
    Object.keys(gens).forEach(g => {
      const genNum = Number(g);
      if (!manualGens.has(genNum)) {
        gens[g].forEach((n, idx) => {
          n.posX = idx * 100;
          saveNodeUpdates(n).catch(() => {});
        });
      }
    });
    const GEN_LABELS = ['Прапрародители','Прародители','Родители','Наше поколение','Дети','Внуки'];
    let sorted = Object.keys(gens).map(Number).sort((a,b) => a-b);

    // В edit mode: если дерево пустое — показываем 3 пустых поколения
    if (isEditMode && !sorted.length) sorted = [0, 1, 2, 3];
    // В edit mode: добавляем пустые поколения между существующими если их нет
    if (isEditMode && sorted.length) {
      const min = sorted[0], max = sorted[sorted.length - 1];
      for (let i = min; i <= max; i++) { if (!sorted.includes(i)) sorted.push(i); }
      sorted.sort((a, b) => a - b);
    }

    let html = '';
    if (isEditMode) {
      const topGen = sorted.length ? sorted[sorted.length-1]+1 : 4;
      html += `<button class="tree-gen-add-btn" data-gen="${topGen}">+ Младшее поколение</button>`;
    }

    [...sorted].reverse().forEach(g => {
      const label = GEN_LABELS[g] || 'Поколение '+g;
      const people = gens[g] || [];

      // В обычном режиме пропускаем пустые поколения
      if (!isEditMode && !people.length) return;

      html += `<div class="tree-generation-wrap" data-gen="${g}">`;

      if (isEditMode) {
        html += `<div class="gen-label gen-label--editable" data-gen="${g}"><span class="gen-label__text">${label}</span><button class="gen-label__edit" data-gen="${g}" title="Переименовать">✏️</button></div>`;
      } else {
        html += `<div class="gen-label">${label}</div>`;
      }
      html += `<div class="gen-row" data-gen="${g}">`;
      people.forEach(node => {
        const name   = (node.full_name || node.fullName || '').replace(/\n/g,'<br/>');
        const photo  = node.photo_url || node.photoUrl || '';
        const linked = node.linked_profile_id || node.linkedProfileId || '';
        const branch = node.isBranchRoot ? ' tree-node--branch-root' : '';

        const clanId = node.clan_id || node.clanId;
        let clan = null;
        if (clanId) {
          if (typeof CLANS !== 'undefined' && CLANS[clanId]) {
            clan = CLANS[clanId];
          } else if (clansCache[clanId]) {
            clan = clansCache[clanId];
          }
        }
        const color = clan ? clan.color : '#c8a84b';
        const colorDim = clan ? (clan.colorDim || clan.color + '33') : '#6b5a22';

        const deceased = isDeceased(node.years);
        const hasPage = !isEditMode && deceased && linked;
        const tagName = hasPage ? 'a' : 'div';
        const hrefAttr = hasPage ? `href="person.html?id=${encodeURIComponent(linked)}"` : '';

        html += `
          <${tagName} ${hrefAttr} class="tree-node tree-node--young${branch}${activeDynamicClan && activeDynamicClan !== clanId ? ' tree-node--clan-dim' : ''}" data-id="${node.id}" data-clan="${clanId || ''}">
            ${isEditMode ? `<div class="tree-node-controls">
              <button class="tree-node-ctrl" data-action="edit" data-id="${node.id}" title="Редактировать"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button>
              <button class="tree-node-ctrl tree-node-ctrl--events" data-action="events" data-id="${node.id}" title="События жизни"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></button>
              <button class="tree-node-ctrl tree-node-ctrl--del" data-action="delete" data-id="${node.id}" title="Удалить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
            </div>` : ''}
            <div class="tree-node__frame" style="--clan-color:${color}; --clan-dim:${colorDim}">
              ${clan ? `<span class="tree-node__clan-badge" title="${clan.name}">${clan.icon}</span>` : ''}
              <div class="tree-node__photo">
                ${photo ? `<img src="${resolveUrl(photo)}" style="width:100%;height:100%;object-fit:cover;" data-te-fb="tree-node"/>` : `<div class="tree-node__avatar"><svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8"/></svg></div>`}
              </div>
            </div>
            <div class="tree-node__info">
              <div class="tree-node__name">${name || 'Без имени'}</div>
              <div class="tree-node__years">${node.years || ''}</div>
              ${clan ? `<div class="tree-node__clan-name" style="color:${color}">${clan.name}</div>` : ''}
              ${node.description ? `<div class="tree-node__desc">${node.description}</div>` : ''}
              ${linked ? (hasPage ? `<span class="tree-node__link">Страница памяти →</span>` : `<a href="person.html?id=${encodeURIComponent(linked)}" class="tree-node__link">Страница памяти →</a>`) : ''}
            </div>
          </${tagName}>`;
      });
      if (isEditMode) {
        html += `
          <div class="tree-node tree-node--placeholder" data-gen="${g}" title="Добавить человека в это поколение">
            <div class="tree-node__frame">
              <div class="tree-node__avatar">
                <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </div>
            </div>
            <div class="tree-node__info">
              <div class="tree-node__name">Добавить</div>
            </div>
          </div>`;
      }
      html += `</div>`;
      html += `</div>`;
    });

    if (isEditMode) {
      const bot = sorted.length ? sorted[0]-1 : 0;
      html += `<button class="tree-gen-add-btn" data-gen="${bot}">+ Старшее поколение</button>`;
    }
    container.innerHTML = html;

    /* Нити */
    drawCustomConnections(container, localConns);

    /* Обработчики edit-кнопок */
    if (isEditMode) {
      container.querySelectorAll('.tree-gen-add-btn').forEach(b =>
        b.addEventListener('click', () => openCardTypeChooser(parseInt(b.dataset.gen, 10)))
      );
      container.querySelectorAll('.tree-node--placeholder').forEach(b =>
        b.addEventListener('click', () => openNodeModal(null, 'stub', parseInt(b.dataset.gen, 10)))
      );
      container.querySelectorAll('.tree-node-ctrl').forEach(b =>
        b.addEventListener('click', e => {
          e.stopPropagation();
          const action = b.dataset.action;
          const id = b.dataset.id;
          if (action === 'edit') {
            openNodeModal(id, 'edit');
          } else if (action === 'events') {
            window.openRelativePopup(id);
          } else if (action === 'delete') {
            deleteNode(id);
          }
        })
      );
    }

    /* Клик по карточке — соединение / подсветка / страница памяти */
    const dynamicClickTimers = {};
    container.querySelectorAll('.tree-node').forEach(nodeEl =>
      nodeEl.addEventListener('click', e => {
        if (e.target.closest('.tree-node-ctrl')) return;
        if (e.target.closest('.tree-node__link') && nodeEl.tagName !== 'A') return; // let inner <a> links work
        if (nodeEl.tagName === 'A') e.preventDefault();
        if (_nodeDragJustHappened) {
          e.preventDefault();
          return; // не реагируем на клик сразу после перетаскивания
        }
        const nid = nodeEl.dataset.id;
        if (handleNodeConnectionClick(nodeEl, nid)) {
          e.preventDefault();
          return;
        }

        if (dynamicClickTimers[nid]) {
          clearTimeout(dynamicClickTimers[nid]);
          delete dynamicClickTimers[nid];
          
          const node = allNodes.find(n => n.id === nid);
          const linked = node ? (node.linked_profile_id || node.linkedProfileId) : null;
          if (linked) {
            window.location.href = `person.html?id=${encodeURIComponent(linked)}`;
          } else if (window.openRelativePopup) {
            window.openRelativePopup(nid);
          }
        } else {
          dynamicClickTimers[nid] = setTimeout(() => {
            delete dynamicClickTimers[nid];
            if (highlightedDynamicId === nid) {
              clearHighlightDynamic();
            } else {
              highlightDynamicNode(nid);
            }
          }, 260);
        }
      })
    );

    /* Hover Tooltip для динамических карточек */
    container.querySelectorAll('.tree-node').forEach(nodeEl => {
      const nid = nodeEl.dataset.id;
      const node = allNodes.find(n => n.id === nid);
      if (!node) return;

      nodeEl.addEventListener('mouseenter', ev => {
        const timelineHtml = getPersonTimelineHtml(node);
        const name = (node.full_name || node.fullName || 'Без имени').replace(/\n/g, ' ');
        
        let clan = null;
        if (typeof CLANS !== 'undefined' && CLANS[node.clan_id || node.clanId]) {
          clan = CLANS[node.clan_id || node.clanId];
        } else if (clansCache[node.clan_id || node.clanId]) {
          clan = clansCache[node.clan_id || node.clanId];
        } else {
          clan = { name: 'Род семьи', icon: '🌳', color: '#c8a84b' };
        }

        tooltip.innerHTML = `
          <div class="tree-tooltip__inner">
            <span class="tree-tooltip__icon">${clan.icon}</span>
            <strong>${clan.name}</strong>
            <span>${name}</span>
            ${timelineHtml}
            ${node.linked_profile_id || node.linkedProfileId ? `<span class="tree-tooltip__hint">Двойной клик → страница памяти</span>` : `<span class="tree-tooltip__hint">Двойной клик → события родственника</span>`}
          </div>`;
        tooltip.style.opacity = '1';
        tooltip.style.left    = ev.clientX + 14 + 'px';
        tooltip.style.top     = ev.clientY - 10 + 'px';
      });

      nodeEl.addEventListener('mousemove', ev => {
        tooltip.style.left = ev.clientX + 14 + 'px';
        tooltip.style.top  = ev.clientY - 10 + 'px';
      });

      nodeEl.addEventListener('mouseleave', () => {
        tooltip.style.opacity = '0';
      });
    });

    // Dynamic Search Input Setup
    const searchInput = document.getElementById('tree-search-input');
    if (searchInput) {
      const freshInput = searchInput.cloneNode(true);
      searchInput.replaceWith(freshInput);
      freshInput.addEventListener('input', e => {
        const q = e.target.value.toLowerCase().trim();
        if (!q) {
          if (highlightedDynamicId) {
            highlightDynamicNode(highlightedDynamicId);
          } else {
            clearHighlightDynamic();
          }
          return;
        }

        container.classList.add('has-highlight');
        container.querySelectorAll('.tree-node').forEach(el => {
          const nid = el.dataset.id;
          const node = allNodes.find(n => n.id === nid);
          const name = node ? (node.full_name || node.fullName || '').toLowerCase() : '';
          const years = node ? (node.years || '').toLowerCase() : '';
          const matches = name.includes(q) || years.includes(q);

          el.classList.remove('tree-node--dim', 'tree-node--active');
          if (matches) {
            el.classList.add('tree-node--active');
          } else {
            el.classList.add('tree-node--dim');
          }
        });

        const svg = container.querySelector('.tree-dynamic-svg');
        if (svg) {
          svg.querySelectorAll('path').forEach(p => {
            p.classList.remove('thread-path--active');
            p.classList.add('thread-path--dim');
          });
        }
      });
    }

    /* Перетаскивание карточек (edit mode) — связи рвутся при перетаскивании */
    attachNodeDragging(container);
  }

  /* ── SVG нити — линии идут ОТ НИЗА карточек ── */
  function drawCustomConnections(container, connections) {
    const list = Array.isArray(connections) ? [...connections] : [];

    // Auto-generate lines for custom trees to connect cards based on nodes' DB relations
    const autoConns = [];
    if (currentTreeId !== 'default' && Array.isArray(allNodes)) {
      allNodes.forEach(node => {
        // 1. Marriage (spouse_id)
        const spouseId = node.spouse_id || node.spouseId;
        if (spouseId) {
          if (node.id < spouseId) { // process each pair only once
            const exists = list.some(c =>
              c.type === 'marriage' &&
              ((c.a === node.id && c.b === spouseId) || (c.a === spouseId && c.b === node.id))
            );
            if (!exists) {
              autoConns.push({
                id: `auto-m-${node.id}-${spouseId}`,
                a: node.id,
                b: spouseId,
                type: 'marriage'
              });
            }
          }
        }

        // 2. Kinship (parent_ids)
        let pids = [];
        try {
          if (node.parent_ids) pids = typeof node.parent_ids === 'string' ? JSON.parse(node.parent_ids) : node.parent_ids;
          else if (node.parentIds) pids = typeof node.parentIds === 'string' ? JSON.parse(node.parentIds) : node.parentIds;
        } catch (e) {}
        if (Array.isArray(pids)) {
          pids.forEach(pid => {
            if (!pid) return;
            const exists = list.some(c =>
              c.type === 'kinship' &&
              ((c.a === pid && c.b === node.id) || (c.a === node.id && c.b === pid))
            );
            if (!exists) {
              autoConns.push({
                id: `auto-k-${pid}-${node.id}`,
                a: pid,
                b: node.id,
                type: 'kinship'
              });
            }
          });
        }
      });
    }

    const combined = [...list, ...autoConns];

    // Дедупликация: одна линия на пару узлов в каждой категории (брак / родство).
    // Иначе сохранённая связь ('spouse') и авто-связь ('marriage') одной пары
    // рисуются дважды → визуальное «задвоение» линий (заметно при зуме).
    const _seenPairs = new Set();
    const deduped = combined.filter(conn => {
      if (!conn || conn.a == null || conn.b == null) return false;
      const cat = /spouse|marriage|брак/i.test(String(conn.type)) ? 'm' : 'k';
      const key = [String(conn.a), String(conn.b)].sort().join('|') + ':' + cat;
      if (_seenPairs.has(key)) return false;
      _seenPairs.add(key);
      return true;
    });

    // Гарантируем единственный svg-слой (на случай дублей от прошлых перерисовок).
    const _existingSvgs = container.querySelectorAll(':scope > .tree-dynamic-svg');
    for (let i = 1; i < _existingSvgs.length; i++) _existingSvgs[i].remove();

    let svg = container.querySelector('.tree-dynamic-svg');
    if (!deduped.length) {
      if (svg) svg.innerHTML = '';
      return;
    }

    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'tree-dynamic-svg'); // ВАЖНО: у SVG .className не задаёт атрибут class → querySelector('.tree-dynamic-svg') не находил svg и каждый перерисов создавал НОВЫЙ слой (задвоение линий)
      svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;overflow:visible;';
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
      container.insertBefore(svg, container.firstChild);
    }
    svg.innerHTML = '';
    const cr = container.getBoundingClientRect();
    const scaleX = cr.width / container.offsetWidth || 1;
    const scaleY = cr.height / container.offsetHeight || 1;

    const getClanColorOfNode = (node) => {
      if (!node) return '#c8a84b';
      const clanId = node.clan_id || node.clanId;
      let clan = null;
      if (clanId) {
        if (typeof CLANS !== 'undefined' && CLANS[clanId]) clan = CLANS[clanId];
        else if (clansCache[clanId]) clan = clansCache[clanId];
      }
      return clan ? clan.color : '#c8a84b';
    };

    deduped.forEach(conn => {
      const elA = container.querySelector(`[data-id="${conn.a}"]`);
      const elB = container.querySelector(`[data-id="${conn.b}"]`);
      if (!elA || !elB) return;
      const frameA = elA.querySelector('.tree-node__frame') || elA;
      const frameB = elB.querySelector('.tree-node__frame') || elB;
      const rA = frameA.getBoundingClientRect();
      const rB = frameB.getBoundingClientRect();

      /* Точки соединения и контрольные точки Безье */
      const x1 = (rA.left - cr.left) / scaleX + (rA.width / scaleX) / 2;
      const x2 = (rB.left - cr.left) / scaleX + (rB.width / scaleX) / 2;
      let y1, y2, cy1, cy2, drop = 0;

      const nodeA = allNodes.find(n => n.id === conn.a);
      const nodeB = allNodes.find(n => n.id === conn.b);
      const genA = nodeA ? (nodeA.generation ?? 0) : 0;
      const genB = nodeB ? (nodeB.generation ?? 0) : 0;
      const clanIdA = nodeA ? (nodeA.clan_id || nodeA.clanId) : '';
      const clanIdB = nodeB ? (nodeB.clan_id || nodeB.clanId) : '';

      if (conn.type === 'marriage') {
        y1 = (rA.bottom - cr.top) / scaleY;
        y2 = (rB.bottom - cr.top) / scaleY;
        drop = Math.min(Math.abs(y2 - y1) * 0.5 + 40, 120);
        cy1 = y1 + drop;
        cy2 = y2 + drop;
      } else {
        if (genA < genB) {
          // A is parent (lower gen, larger Y), B is child (higher gen, smaller Y)
          y1 = (rA.top - cr.top) / scaleY;
          y2 = (rB.bottom - cr.top) / scaleY;
          const dist = y1 - y2;
          cy1 = y1 - dist * 0.4;
          cy2 = y2 + dist * 0.4;
        } else if (genA > genB) {
          // B is parent (larger Y), A is child (smaller Y)
          y1 = (rA.bottom - cr.top) / scaleY;
          y2 = (rB.top - cr.top) / scaleY;
          const dist = y2 - y1;
          cy1 = y1 + dist * 0.4;
          cy2 = y2 - dist * 0.4;
        } else {
          // same generation fallback
          y1 = (rA.bottom - cr.top) / scaleY;
          y2 = (rB.bottom - cr.top) / scaleY;
          drop = Math.min(Math.abs(y2 - y1) * 0.5 + 40, 120);
          cy1 = y1 + drop;
          cy2 = y2 + drop;
        }
      }

      if (conn.type === 'marriage') {
        /* Плетёная нить из 3 полос */
        const mainColor = getClanColorOfNode(nodeA);
        let colors = [mainColor + 'dd', mainColor + '66', mainColor];
        if (mainColor === '#c8a84b') {
          colors = ['#e2c97e', '#8a7035', '#c8a84b'];
        }
        const len    = Math.hypot(x2 - x1, y2 - y1 + drop * 2) || 1;
        const steps  = Math.max(24, Math.floor(len / 5));
        for (let s = 0; s < 3; s++) {
          const phase = (s / 3) * Math.PI * 2;
          let d = `M ${x1} ${y1}`;
          for (let i = 1; i <= steps; i++) {
            const t  = i / steps;
            /* Точка вдоль кубической кривой */
            const bx = cubicBezier(x1, x1, x2, x2, t);
            const by = cubicBezier(y1, cy1, cy2, y2, t);
            /* Нормаль к касательной */
            const tx = cubicBezierDeriv(x1, x1, x2, x2, t);
            const ty = cubicBezierDeriv(y1, cy1, cy2, y2, t);
            const tl = Math.hypot(tx, ty) || 1;
            const nx = -ty / tl, ny = tx / tl;
            const wave = Math.sin(t * Math.PI * 4 + phase) * 4;
            d += ` L ${(bx + nx * wave).toFixed(1)} ${(by + ny * wave).toFixed(1)}`;
          }
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', d);
          path.setAttribute('stroke', colors[s]);
          path.setAttribute('stroke-width', '1.8');
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('opacity', '0.9');
          path.style.filter = 'drop-shadow(0 0 3px ' + colors[s] + '55)';
          path.setAttribute('data-clan', clanIdA || clanIdB || '');
          path.setAttribute('data-a', conn.a);
          path.setAttribute('data-b', conn.b);
          animateDraw(path);
          svg.appendChild(path);
        }
        /* Бриллиант по середине */
        const mx = (x1 + x2) / 2, my = Math.max(y1, y2) + drop * 0.8;
        const ds = 6;
        const diamond = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        diamond.setAttribute('d', `M ${mx} ${my-ds} L ${mx+ds} ${my} L ${mx} ${my+ds} L ${mx-ds} ${my} Z`);
        diamond.setAttribute('fill', mainColor);
        diamond.setAttribute('stroke', 'rgba(8,8,8,0.5)');
        diamond.setAttribute('stroke-width', '1');
        diamond.style.opacity = '0';
        diamond.style.transition = 'opacity 0.5s 1.2s';
        diamond.setAttribute('data-a', conn.a);
        diamond.setAttribute('data-b', conn.b);
        svg.appendChild(diamond);
        requestAnimationFrame(() => requestAnimationFrame(() => { diamond.style.opacity = '1'; }));
      } else {
        /* Родство / прямая — плавная кривая с цветом родительского рода */
        const genA = nodeA ? (nodeA.generation || 0) : 0;
        const genB = nodeB ? (nodeB.generation || 0) : 0;
        const parentNode = genA <= genB ? nodeA : nodeB;
        const childNode = genA <= genB ? nodeB : nodeA;

        let parentClanColor = getClanColorOfNode(parentNode);
        let parentClanId = parentNode ? (parentNode.clan_id || parentNode.clanId) : '';

        // Fallback to child's clan if parent has no clan assigned
        if (!parentClanId && childNode) {
          const childClanId = childNode.clan_id || childNode.clanId;
          if (childClanId) {
            const childClanColor = getClanColorOfNode(childNode);
            parentClanColor = childClanColor;
            parentClanId = childClanId;
          }
        }

        const color = parentClanColor;
        const path  = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`);
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('opacity', '0.85');
        path.setAttribute('data-clan', parentClanId);
        path.setAttribute('data-a', conn.a);
        path.setAttribute('data-b', conn.b);
        animateDraw(path);
        svg.appendChild(path);
      }
    });
    window._treeDrawThreadsCustom = c => drawCustomConnections(container, c);
  }

  /* Вспомогательные функции для кривых Безье */
  function cubicBezier(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return mt*mt*mt*p0 + 3*mt*mt*t*p1 + 3*mt*t*t*p2 + t*t*t*p3;
  }
  function cubicBezierDeriv(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return 3*(mt*mt*(p1-p0) + 2*mt*t*(p2-p1) + t*t*(p3-p2));
  }

  /* Анимация рисования линии */
  function animateDraw(path) {
    if (_skipThreadAnim) return; // мгновенно: линия уже видна, без эффекта прорисовки (для перетаскивания)
    requestAnimationFrame(() => {
      const len = path.getTotalLength ? path.getTotalLength() : 500;
      path.style.strokeDasharray  = len;
      path.style.strokeDashoffset = len;
      path.style.transition = `stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)`;
      requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
    });
  }

  /* ════════════════════════════════════════════
     ПЕРЕТАСКИВАНИЕ КАРТОЧЕК — связи рвутся (Draggable)
     ════════════════════════════════════════════ */
  let _nodeDragJustHappened = false;
  let _skipThreadAnim = false; // при перетаскивании рисуем линии мгновенно (без долгого draw-in)
  let _redrawRAF = 0;

  function _treePrefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* Разорвать ВСЕ связи узла: убрать линии (с анимацией) + почистить
     данные у самого узла и у партнёров, чтобы авто-линии не вернулись. */
  async function detachNodeAllConnections(nodeId) {
    const container = document.getElementById('tree-dynamic') || document.getElementById('tree-wrapper');
    const node = allNodes.find(n => n.id === nodeId);

    // 1. Анимация разрыва: гасим и убираем линии/ромб этого узла
    if (container) {
      const svg = container.querySelector('.tree-dynamic-svg');
      if (svg) {
        const parts = svg.querySelectorAll(`[data-a="${nodeId}"], [data-b="${nodeId}"]`);
        if (parts.length) {
          if (typeof gsap !== 'undefined' && !_treePrefersReducedMotion()) {
            gsap.to(parts, { opacity: 0, duration: 0.28, ease: 'power2.in', stagger: 0.02,
              onComplete: () => parts.forEach(p => p.remove()) });
          } else {
            parts.forEach(p => p.remove());
          }
        }
      }
    }

    // 2. Собираем партнёров (по соединениям и по полям узлов)
    const partners = new Set();
    const conns = getLocalConnections();
    conns.forEach(c => { if (c.a === nodeId) partners.add(c.b); else if (c.b === nodeId) partners.add(c.a); });
    if (node) {
      const sp = node.spouse_id || node.spouseId; if (sp) partners.add(sp);
      getParentIds(node).forEach(pid => partners.add(pid));
    }
    allNodes.forEach(n => {
      if (getParentIds(n).includes(nodeId)) partners.add(n.id);
      if ((n.spouse_id || n.spouseId) === nodeId) partners.add(n.id);
    });

    // 3. Удаляем локальные соединения этого узла (+ сервер)
    const remaining = [];
    conns.forEach(c => {
      if (c.a === nodeId || c.b === nodeId) {
        if (c.id) fetch(`${BASE}/api/family-connections/${c.id}`, { method: 'DELETE' }).catch(() => {});
      } else {
        remaining.push(c);
      }
    });
    saveLocalConnections(remaining);

    // 4. Чистим родственные поля у самого узла
    if (node) {
      node.spouse_id = null; node.spouseId = null; node.spouseOf = null;
      setParentIds(node, []);
      try { await saveNodeUpdates(node); } catch (_) {}
    }
    // 5. Чистим ссылки на узел у партнёров
    for (const pid of partners) {
      const p = allNodes.find(n => n.id === pid);
      if (!p) continue;
      let changed = false;
      if ((p.spouse_id || p.spouseId) === nodeId) { p.spouse_id = null; p.spouseId = null; p.spouseOf = null; changed = true; }
      const pids = getParentIds(p);
      if (pids.includes(nodeId)) { setParentIds(p, pids.filter(x => x !== nodeId)); changed = true; }
      if (changed) { try { await saveNodeUpdates(p); } catch (_) {} }
    }

    if (typeof syncTimelineAndStats === 'function') { try { syncTimelineAndStats(); } catch (_) {} }
  }

  /* Перерисовать связи в динамическом дереве (после обмена/разрыва) */
  function _treeRedrawConnections() {
    const dc = document.getElementById('tree-dynamic') || document.getElementById('tree-wrapper');
    if (dc) { try { drawCustomConnections(dc, getLocalConnections()); } catch (_) {} }
  }
  /* Перерисовка с тротлингом по кадрам (чтобы линии плавно следовали без перегруза) */
  function _treeRedrawThrottled() {
    if (_redrawRAF) return;
    _redrawRAF = requestAnimationFrame(() => { _redrawRAF = 0; _treeRedrawConnections(); });
  }

  /* Поменять местами два DOM-узла в одном родителе */
  function _domSwap(a, b) {
    const aParent = a.parentNode, bParent = b.parentNode;
    if (!aParent || !bParent) return;
    const aSibling = a.nextSibling === b ? a : a.nextSibling;
    bParent.insertBefore(a, b);
    aParent.insertBefore(b, aSibling);
  }

  /* Обмен карточек местами с FLIP-анимацией; линии следуют мгновенно (без мерцания) */
  function _swapWithFlip(a, b) {
    const cont = document.getElementById('tree-dynamic') || document.getElementById('tree-wrapper');
    // масштаб контейнера (pan/zoom) — чтобы FLIP-смещения были корректны при любом зуме
    const sc = cont ? ((cont.getBoundingClientRect().width / (cont.offsetWidth || 1)) || 1) : 1;
    const aFirst = a.getBoundingClientRect();
    const bFirst = b.getBoundingClientRect();
    _domSwap(a, b);
    gsap.set(a, { x: 0, y: 0, scale: 1 });
    gsap.set(b, { x: 0, y: 0 });
    const aLast = a.getBoundingClientRect();
    const bLast = b.getBoundingClientRect();
    _skipThreadAnim = true; // линии перерисовываем мгновенно во время переноса
    const done = () => { _treeRedrawConnections(); _skipThreadAnim = false; };
    if (_treePrefersReducedMotion()) { done(); return; }
    gsap.fromTo(a, { x: (aFirst.left - aLast.left) / sc, y: (aFirst.top - aLast.top) / sc, scale: 1.05 },
                   { x: 0, y: 0, scale: 1, duration: 0.42, ease: 'power3.out', onUpdate: _treeRedrawThrottled, onComplete: done });
    gsap.fromTo(b, { x: (bFirst.left - bLast.left) / sc, y: (bFirst.top - bLast.top) / sc },
                   { x: 0, y: 0, duration: 0.42, ease: 'power3.out' });
  }

  /* Завершение перетаскивания: обмен / разрыв при выносе / возврат на место */
  /* Завершение перетаскивания: горизонтальная перестановка и перемещение по поколениям с сохранением в БД */
  async function finishNodeDrag(card, rowEl, px, py) {
    const cardId = card.dataset.id;
    if (!cardId) {
      gsap.to(card, { x: 0, y: 0, scale: 1, duration: 0.34, ease: 'power3.out', onUpdate: _treeRedrawThrottled });
      return;
    }

    const rows = Array.from(document.querySelectorAll('.gen-row'));
    let closestRow = null;
    let minDistanceY = Infinity;
    
    rows.forEach(r => {
      const rect = r.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const distY = Math.abs(py - centerY);
      if (distY < minDistanceY) {
        minDistanceY = distY;
        closestRow = r;
      }
    });

    if (closestRow && minDistanceY <= 200) {
      const targetGen = parseInt(closestRow.dataset.gen, 10);
      const nodeObj = allNodes.find(n => n.id == cardId);
      
      if (!nodeObj) {
        gsap.to(card, { x: 0, y: 0, scale: 1, duration: 0.34, ease: 'power3.out', onUpdate: _treeRedrawThrottled });
        return;
      }

      // Находим индекс вставки по горизонтали
      const otherCards = Array.from(closestRow.querySelectorAll(`.tree-node:not(.tree-node--dragging):not(.tree-node--placeholder)[data-id]`))
        .filter(c => c.dataset.id != cardId);

      let insertIndex = 0;
      for (let i = 0; i < otherCards.length; i++) {
        const rRect = otherCards[i].getBoundingClientRect();
        const cardCenterX = rRect.left + rRect.width / 2;
        if (px > cardCenterX) {
          insertIndex = i + 1;
        } else {
          break;
        }
      }

      // Получаем список узлов целевого поколения
      const targetGenNodes = allNodes.filter(n => n.generation == targetGen && n.id != cardId);
      targetGenNodes.sort((a, b) => {
        const ax = typeof a.posX === 'number' ? a.posX : 999999;
        const bx = typeof b.posX === 'number' ? b.posX : 999999;
        return ax - bx;
      });

      // Переставляем
      nodeObj.generation = targetGen;
      targetGenNodes.splice(insertIndex, 0, nodeObj);

      const updatePromises = [];
      targetGenNodes.forEach((n, idx) => {
        n.posX = idx * 100;
        updatePromises.push(saveNodeUpdates(n));
      });

      const originalGen = nodeObj._originalGen !== undefined ? nodeObj._originalGen : nodeObj.generation;
      if (originalGen !== targetGen) {
        const sourceGenNodes = allNodes.filter(n => n.generation == originalGen && n.id != cardId);
        sourceGenNodes.sort((a, b) => {
          const ax = typeof a.posX === 'number' ? a.posX : 999999;
          const bx = typeof b.posX === 'number' ? b.posX : 999999;
          return ax - bx;
        });
        sourceGenNodes.forEach((n, idx) => {
          n.posX = idx * 100;
          updatePromises.push(saveNodeUpdates(n));
        });
      }

      try {
        await Promise.all(updatePromises);
      } catch (err) {
        console.error("Error saving positions:", err);
      }

      reloadTreeInPlace();
    } else {
      gsap.to(card, { x: 0, y: 0, scale: 1, duration: 0.34, ease: 'power3.out', onUpdate: _treeRedrawThrottled });
    }
  }

  /* Делаем карточки перетаскиваемыми (только в режиме редактирования) */
  function attachNodeDragging(container) {
    if (!container || !isEditMode) return;
    if (typeof gsap === 'undefined' || typeof Draggable === 'undefined') return;

    container.querySelectorAll('.tree-node:not(.tree-node--placeholder)').forEach(nodeEl => {
      if (nodeEl._dragBound) return;
      nodeEl._dragBound = true;
      nodeEl.classList.add('tree-node--draggable');
      let rowEl = null;

      Draggable.create(nodeEl, {
        type: 'x,y',
        dragClickables: false,      // не таскать при нажатии на кнопки-контролы
        minimumMovement: 6,
        zIndexBoost: false,
        onPress: function () {
          rowEl = nodeEl.closest('.gen-row');
          const nodeObj = allNodes.find(n => n.id == nodeEl.dataset.id);
          if (nodeObj) {
            nodeObj._originalGen = nodeObj.generation || 0;
          }
        },
        onDragStart: function () {
          _nodeDragJustHappened = true;
          nodeEl.classList.add('tree-node--dragging');
          if (!_treePrefersReducedMotion()) gsap.to(nodeEl, { scale: 1.05, duration: 0.16, ease: 'power2.out' });
        },
        onDrag: _treeRedrawThrottled,
        onDragEnd: function () {
          nodeEl.classList.remove('tree-node--dragging');
          finishNodeDrag(nodeEl, rowEl, this.pointerX, this.pointerY);
          setTimeout(() => { _nodeDragJustHappened = false; }, 80);
        }
      });
    });
  }

  /* ════════════════════════════════════════════
     EDIT MODE — вход / выход
     ════════════════════════════════════════════ */
  function enterEditMode() {
    isEditMode = true;
    editBtn.style.display = 'none';
    const toolbar = document.getElementById('tree-toolbar');
    if (toolbar) toolbar.style.display = 'flex';

    // Показываем кнопку "Добавить род" в легенде
    addClanButton();

    if (currentTreeId !== 'default') {
      const dc = document.getElementById('tree-dynamic');
      if (dc) renderDynamicTree(dc);

      const ts = document.querySelector('.tree-section');
      if (ts && !document.getElementById('tree-add-panel')) {
        const ap = document.createElement('div'); ap.className = 'tree-add-panel'; ap.id = 'tree-add-panel';
        ap.innerHTML = `<button class="tree-add-btn tree-add-btn--linked" id="tree-add-linked">+ Привязать страницу памяти</button><button class="tree-add-btn" id="tree-add-stub">+ Карточка родственника</button>`;
        ts.appendChild(ap);
        document.getElementById('tree-add-stub')?.addEventListener('click', () => openNodeModal(null,'stub'));
        document.getElementById('tree-add-linked')?.addEventListener('click', () => openNodeModal(null,'linked'));
      }

      document.addEventListener('click', handleEditClick);
      return;
    }

    /* Добавляем кнопки управления на статические карточки */
    function addControlsToStaticNodes() {
      let added = 0;
      document.querySelectorAll('#tree-wrapper .tree-node, #tree-generations .tree-node').forEach(node => {
        if (node.querySelector('.tree-node-controls')) return;
        /* Для статических карточек берём id из dataset или генерируем */
        const nid = node.dataset.id || node.dataset.personId || '';
        if (!nid) return;
        const c = document.createElement('div'); c.className = 'tree-node-controls';
        c.innerHTML = `<button class="tree-node-ctrl" data-action="edit" data-id="${nid}" title="Редактировать"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button><button class="tree-node-ctrl tree-node-ctrl--events" data-action="events" data-id="${nid}" title="События жизни"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></button><button class="tree-node-ctrl tree-node-ctrl--del" data-action="delete" data-id="${nid}" title="Удалить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>`;
        node.appendChild(c);
        added++;
      });
      return added;
    }

    /* Пробуем сразу, если tree.js ещё строит — пробуем ещё раз */
    if (addControlsToStaticNodes() === 0) {
      setTimeout(() => addControlsToStaticNodes(), 700);
    }

    const ts = document.querySelector('.tree-section');
    if (ts && !document.getElementById('tree-gen-top')) {
      const tb = document.createElement('button'); tb.className = 'tree-gen-add-btn'; tb.textContent = '+ Добавить младшее поколение'; tb.id = 'tree-gen-top'; tb.addEventListener('click', () => openNodeModal(null,'stub',4)); ts.insertBefore(tb, ts.firstChild);
      const bb = document.createElement('button'); bb.className = 'tree-gen-add-btn'; bb.textContent = '+ Добавить старшее поколение'; bb.id = 'tree-gen-bottom'; bb.addEventListener('click', () => openNodeModal(null,'stub',0)); ts.appendChild(bb);
    }
    if (!document.getElementById('tree-add-panel')) {
      const ap = document.createElement('div'); ap.className = 'tree-add-panel'; ap.id = 'tree-add-panel';
      ap.innerHTML = `<button class="tree-add-btn tree-add-btn--linked" id="tree-add-linked">+ Привязать страницу памяти</button><button class="tree-add-btn" id="tree-add-stub">+ Карточка родственника</button>`;
      ts?.appendChild(ap);
      document.getElementById('tree-add-stub')?.addEventListener('click', () => openNodeModal(null,'stub'));
      document.getElementById('tree-add-linked')?.addEventListener('click', () => openNodeModal(null,'linked'));
    }
    document.addEventListener('click', handleEditClick);
  }

  function exitEditMode() {
    isEditMode = false;
    editBtn.style.display = '';
    const toolbar = document.getElementById('tree-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    // Убираем кнопку "Добавить род"
    document.querySelector('.clan-legend__item--add')?.remove();
    cancelConnectionMode();
    document.querySelectorAll('.tree-node-controls').forEach(el => el.remove());
    document.getElementById('tree-add-panel')?.remove();
    document.getElementById('tree-gen-top')?.remove();
    document.getElementById('tree-gen-bottom')?.remove();
    document.removeEventListener('click', handleEditClick);
    if (currentTreeId !== 'default') {
      const dc = document.getElementById('tree-dynamic');
      if (dc) renderDynamicTree(dc);
    }
  }

  function handleEditClick(e) {
    const btn = e.target.closest('.tree-node-ctrl');
    if (!btn) return;
    e.stopPropagation(); e.preventDefault();
    if (btn.dataset.action === 'edit')   openNodeModal(btn.dataset.id, 'edit');
    if (btn.dataset.action === 'events') window.openRelativePopup(btn.dataset.id);
    if (btn.dataset.action === 'delete') deleteNode(btn.dataset.id);
  }

  /* ════════════════════════════════════════════
     УДАЛЕНИЕ КАРТОЧКИ
     ════════════════════════════════════════════ */
  async function deleteNode(id) {
    if (!confirm('Удалить человека из дерева?')) return;

    /* Анимируем удаление */
    const el = document.querySelector(`.tree-node[data-id="${id}"]`);
    if (el) {
      el.style.transition = 'opacity 0.3s,transform 0.3s';
      el.style.opacity = '0';
      el.style.transform = 'scale(0.7)';
      setTimeout(() => el.remove(), 320);
    }

    /* Удаляем из localStorage и памяти */
    saveLocalNodes(getLocalNodes().filter(n => n.id !== id));
    allNodes = allNodes.filter(n => n.id !== id);
    saveLocalConnections(getLocalConnections().filter(c => c.a !== id && c.b !== id));

    /* Пробуем удалить через API */
    try { await fetch(`${BASE}/api/family-nodes/${id}`, { method: 'DELETE' }); } catch (_) {}

    syncTimelineAndStats();

    /* Перерисовываем нити и дерево */
    const dc = document.getElementById('tree-dynamic');
    if (dc) {
      /* Динамическое дерево — полный перерендер */
      setTimeout(() => renderDynamicTree(dc), 350);
    } else {
      /* Статическое дерево — перерисовываем только нити */
      const tw = document.getElementById('tree-wrapper');
      if (tw) {
        const conns = getLocalConnections();
        /* Удаляем старый SVG и рисуем заново */
        const oldSvg = tw.querySelector('.tree-dynamic-svg');
        if (oldSvg) oldSvg.remove();
        if (conns.length) setTimeout(() => drawCustomConnections(tw, conns), 350);
      }
    }
  }

  /* ════════════════════════════════════════════
     ЗАГРУЗКА УЗЛОВ
     ════════════════════════════════════════════ */
  async function loadNodes() {
    try {
      const r = await fetch(`${BASE}/api/family-nodes?treeId=${encodeURIComponent(currentTreeId)}`);
      if (r.status === 403 || r.status === 404) {
        if (currentTreeId !== 'default') {
          const user = typeof API !== 'undefined' ? API.getUser() : null;
          if (user && user.rootTreeId === currentTreeId) {
            if (typeof API.updateRootTreeId === 'function') {
              API.updateRootTreeId(null);
            }
          }
          const freshUser = typeof API !== 'undefined' ? API.getUser() : null;
          if (freshUser && freshUser.rootTreeId && freshUser.rootTreeId !== currentTreeId) {
            window.location.replace("family-tree.html?tree=" + encodeURIComponent(freshUser.rootTreeId));
          } else {
            window.location.replace("family-tree.html?tree=default");
          }
          return [];
        }
      }
      const j = await r.json();
      if (j.ok) {
        const localOnly = getLocalNodes().filter(n => String(n.id).startsWith('local-'));
        allNodes = [...j.data, ...localOnly];
        saveLocalNodes(allNodes);
        return allNodes;
      }
    } catch (_) {}
    allNodes = getLocalNodes();
    return allNodes;
  }

  /* Перезагрузка дерева без выхода из edit mode */
  async function reloadTreeInPlace() {
    await loadAndRenderClans();
    await loadNodes();
    const dc = document.getElementById('tree-dynamic');
    if (dc) {
      renderDynamicTree(dc);
    }
    // Для default дерева — просто обновляем (статика не перерисовывается без reload)
  }


  /* ════════════════════════════════════════════
     МОДАЛКА ДОБАВИТЬ / РЕДАКТИРОВАТЬ КАРТОЧКУ
     ════════════════════════════════════════════ */
  async function openNodeModal(nodeId, mode, presetGen) {
    await loadNodes();
    document.getElementById('tree-node-modal')?.remove();
    if (mode === 'linked') { openLinkedProfilePicker(presetGen); return; }

    const isNew = !nodeId || mode === 'stub';
    const title = isNew ? 'Добавить человека' : 'Редактировать';
    const others = allNodes.filter(n => n.id !== nodeId);
    const opts   = others.map(n => `<option value="${n.id}">${n.full_name || n.fullName || 'Без имени'}</option>`).join('');

    const overlay = document.createElement('div');
    overlay.className = 'tree-modal-overlay'; overlay.id = 'tree-node-modal';
    overlay.innerHTML = `
      <div class="tree-modal">
        <button class="tree-modal__close" id="tm-close">×</button>
        <h2 class="tree-modal__title">${title}</h2>
        <form class="tree-modal__form" id="tm-form">
          <div class="tree-modal__field"><label>ФИО</label><input type="text" id="tm-name" placeholder="Фамилия Имя Отчество" maxlength="200" autofocus/></div>
          <div class="tree-modal__field"><label>Годы жизни</label><input type="text" id="tm-years" placeholder="1930–2000" maxlength="50"/></div>
          <div class="tree-modal__field"><label>Кем приходится</label><input type="text" id="tm-desc" placeholder="Дедушка, тётя…" maxlength="300"/></div>
          <div class="tree-modal__row">
            <div class="tree-modal__field tree-modal__field--half">
              <label>Род <button type="button" class="tree-modal__inline-btn" id="tm-add-clan">+ новый</button></label>
              <select id="tm-clan"><option value="">— без рода —</option></select>
            </div>
            <div class="tree-modal__field tree-modal__field--half">
              <label>Поколение</label>
              <select id="tm-gen">
                <option value="0">Прапрародители</option><option value="1">Прародители</option>
                <option value="2">Родители</option><option value="3" selected>Наше поколение</option>
              </select>
            </div>
          </div>
          <div class="tree-modal__section-title">Связи</div>
          <div class="tree-modal__field"><label>Супруг/а</label><select id="tm-spouse"><option value="">— нет —</option>${opts}</select></div>
          <div class="tree-modal__field">
            <label>Родители (до 2)</label>
            <select id="tm-parents" multiple size="3"><option value="">— нет —</option>${opts}</select>
            <small style="color:var(--cream-dim);font-size:11px;">Ctrl+клик для нескольких</small>
          </div>
          <div class="tree-modal__field">
            <label>Фото</label>
            <div class="tree-modal__photo-row">
              <label class="tree-modal__photo-btn"><input type="file" id="tm-photo-file" accept="image/*" hidden/><span>📷 Загрузить</span></label>
              <span id="tm-photo-status"></span>
            </div>
            <input type="hidden" id="tm-photo-url" value=""/>
          </div>
          <div class="tree-modal__actions">
            <button type="button" class="tree-modal__btn tree-modal__btn--cancel" id="tm-cancel">Отмена</button>
            <button type="submit" class="tree-modal__btn tree-modal__btn--save">${isNew ? 'Добавить' : 'Сохранить'}</button>
          </div>
          <p class="tree-modal__error" id="tm-error" style="display:none"></p>
        </form>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('tm-close').addEventListener('click', close);
    document.getElementById('tm-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    loadClansIntoSelect();
    document.getElementById('tm-add-clan')?.addEventListener('click', () => {
      showCustomPrompt('Название рода', 'Например: Род Ивановых', (name) => {
        const color = '#' + Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6,'0');
        fetch(`${BASE}/api/family-clans`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name, color, treeId: currentTreeId}) })
          .then(r => r.json()).then(async j => {
            if (j.ok) {
              await loadAndRenderClans();
              loadClansIntoSelect(j.data.id);
            } else {
              alert(j.error || 'Ошибка при добавлении рода');
            }
          }).catch(() => {
            alert('Сервер недоступен');
          });
      });
    });

    const photoInput = document.getElementById('tm-photo-file');
    const photoStatus = document.getElementById('tm-photo-status');
    const photoUrl   = document.getElementById('tm-photo-url');
    photoInput?.addEventListener('change', async () => {
      const file = photoInput.files[0]; if (!file) return;
      photoStatus.textContent = '⏳';
      const fd = new FormData(); fd.append('photo', file);
      try {
        const r = await fetch(`${BASE}/api/upload-photo`, { method:'POST', body: fd });
        const j = await r.json();
        if (j.ok) { photoUrl.value = j.url; photoStatus.textContent = '✅'; } else photoStatus.textContent = '❌';
      } catch (_) { photoStatus.textContent = '❌'; }
    });

    if (!isNew && nodeId) {
      const node = allNodes.find(n => n.id === nodeId);
      if (node) {
        document.getElementById('tm-name').value  = node.full_name || node.fullName || '';
        document.getElementById('tm-years').value = node.years || '';
        document.getElementById('tm-desc').value  = node.description || '';
        document.getElementById('tm-clan').value  = node.clan_id || node.clanId || '';
        document.getElementById('tm-gen').value   = String(node.generation || 0);
        document.getElementById('tm-photo-url').value = node.photo_url || node.photoUrl || '';
        const sp = document.getElementById('tm-spouse'); if (sp) sp.value = node.spouse_id || node.spouseId || '';
        const pids = (() => { try { return JSON.parse(node.parent_ids || '[]'); } catch { return node.parentIds || []; } })();
        if (pids.length) Array.from(document.getElementById('tm-parents').options).forEach(o => { o.selected = pids.includes(o.value); });
      }
    }

    if (presetGen !== undefined && presetGen !== null) {
      const gs = document.getElementById('tm-gen');
      if (gs) {
        if (!Array.from(gs.options).some(o => o.value === String(presetGen))) {
          const opt = document.createElement('option'); opt.value = presetGen; opt.textContent = `Поколение ${presetGen}`; gs.appendChild(opt);
        }
        gs.value = String(presetGen);
      }
    }

    document.getElementById('tm-form').addEventListener('submit', async e => {
      e.preventDefault();
      const err = document.getElementById('tm-error'); err.style.display = 'none';
      const name = document.getElementById('tm-name').value.trim();
      if (!name) { err.textContent = 'Укажите ФИО'; err.style.display = 'block'; return; }
      const parts = name.split(/\s+/).filter(Boolean);
      const firstName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
      const lastName = parts.length > 1 ? parts[0] : '';

      const yearsInput = document.getElementById('tm-years').value.trim();
      let birth = '';
      let death = '';
      if (yearsInput) {
        const yParts = yearsInput.split(/[\-\–\—\s]+/).map(x => x.trim()).filter(Boolean);
        if (yParts.length === 1) {
          if (yearsInput.includes('-') || yearsInput.includes('–') || yearsInput.includes('—')) {
            if (yearsInput.trim().startsWith('-') || yearsInput.trim().startsWith('–') || yearsInput.trim().startsWith('—')) {
              death = yParts[0];
            } else {
              birth = yParts[0];
            }
          } else {
            birth = yParts[0];
          }
        } else if (yParts.length >= 2) {
          birth = yParts[0];
          death = yParts[1];
        }
      }

      const data = {
        treeId: currentTreeId,
        firstName,
        lastName,
        birth,
        death,
        fullName: name,
        years:       yearsInput,
        description: document.getElementById('tm-desc').value.trim(),
        clanId:      document.getElementById('tm-clan').value,
        generation:  parseInt(document.getElementById('tm-gen').value, 10),
        genOrder: 0,
        ageClass: parseInt(document.getElementById('tm-gen').value, 10) <= 1 ? 'old' : 'young',
        spouseId:  document.getElementById('tm-spouse').value || null,
        parentIds: Array.from(document.getElementById('tm-parents').selectedOptions).map(o => o.value).filter(Boolean).slice(0,2),
        photoUrl:  document.getElementById('tm-photo-url').value,
      };

      // Validation for spouse generation and clan
      if (data.spouseId) {
        const spouseNode = allNodes.find(n => n.id === data.spouseId);
        if (spouseNode) {
          const spouseGen = spouseNode.generation || 0;
          const spouseClan = spouseNode.clan_id || spouseNode.clanId;
          if (spouseGen !== data.generation && spouseClan && data.clanId && spouseClan === data.clanId) {
            err.textContent = 'Брак между членами одного рода из разных поколений запрещен!';
            err.style.display = 'block';
            return;
          }
        }
      }

      let saved = false;
      try {
        const url = isNew ? `${BASE}/api/family-nodes` : `${BASE}/api/family-nodes/${nodeId}`;
        const r = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
        const j = await r.json();
        if (j.ok) { saved = true; close(); syncTimelineAndStats(); reloadTreeInPlace(); }
        else { err.textContent = j.error || 'Ошибка'; err.style.display = 'block'; }
      } catch (_) {}

      if (!saved && !err.textContent) {
        const arr = getLocalNodes();
        if (isNew) { const n = {...data, id:'local-'+Date.now()}; arr.push(n); allNodes.push(n); }
        else {
          const i = arr.findIndex(n => n.id === nodeId); if (i !== -1) arr[i] = {...arr[i],...data};
          const ai = allNodes.findIndex(n => n.id === nodeId); if (ai !== -1) allNodes[ai] = {...allNodes[ai],...data};
        }
        saveLocalNodes(arr); syncTimelineAndStats(); close();
        const dc = document.getElementById('tree-dynamic');
        if (dc) renderDynamicTree(dc);
      }
    });
  }

  async function openLinkedProfilePicker(presetGen) {
    let profiles = [];
    try {
      const [resProfiles, resPeople] = await Promise.all([
        fetch(`${BASE}/api/profiles`).then(r => r.json()).catch(() => ({ ok: false })),
        fetch(`${BASE}/api/people?limit=1000`).then(r => r.json()).catch(() => ({ ok: false }))
      ]);

      const list1 = (resProfiles && resProfiles.ok && resProfiles.data) ? resProfiles.data : [];
      const list2 = (resPeople && resPeople.ok && resPeople.data) ? resPeople.data : [];

      const merged = [...list1, ...list2];
      const seen = new Set();
      for (const p of merged) {
        if (!p.id || seen.has(p.id)) continue;
        seen.add(p.id);
        const pName = p.name || p.fullName || '';
        if (pName && pName !== 'Новая страница') {
          profiles.push({
            id: p.id,
            name: pName,
            born: p.born || '',
            died: p.died || '',
            photo: p.photo || p.photoUrl || ''
          });
        }
      }
    } catch (_) {}

    const overlay = document.createElement('div');
    overlay.className = 'tree-modal-overlay'; overlay.id = 'tree-node-modal';
    const list = profiles.length
      ? profiles.map(p => `<button type="button" class="tree-profile-item" data-id="${p.id}"><div class="tree-profile-item__photo">${p.photo ? `<img src="${resolveUrl(p.photo)}" data-te-fb="hide-show-next"/><span style="display:none;">👤</span>` : '<span>👤</span>'}</div><div class="tree-profile-item__info"><div class="tree-profile-item__name">${p.name}</div><div class="tree-profile-item__dates">${p.born||''} ${p.died?'— '+p.died:''}</div></div></button>`).join('')
      : '<p style="color:var(--cream-dim);text-align:center;padding:20px;">Нет страниц памяти</p>';

    overlay.innerHTML = `<div class="tree-modal"><button class="tree-modal__close" id="tpl-close">×</button><h2 class="tree-modal__title">Выбрать страницу памяти</h2><div class="tree-profile-list">${list}</div><button type="button" class="tree-add-btn tree-add-btn--linked" id="tpl-create" style="width:100%;margin-top:16px;">+ Создать новую страницу</button></div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('tpl-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelectorAll('.tree-profile-item').forEach(item => {
      item.addEventListener('click', async () => {
        const p = profiles.find(x => x.id === item.dataset.id);
        if (!p) return;
        const parts = (p.name || '').split(/\s+/).filter(Boolean);
        const firstName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
        const lastName = parts.length > 1 ? parts[0] : '';
        const data = {
          treeId: currentTreeId,
          firstName,
          lastName,
          birth: p.born || '',
          death: p.died || '',
          fullName: p.name||'',
          years:(p.born||'')+(p.died?' — '+p.died:''),
          linkedProfileId: p.id,
          generation: presetGen??3,
          ageClass:(presetGen??3)<=1?'old':'young',
          photoUrl: p.photo||''
        };
        try {
          const r = await fetch(`${BASE}/api/family-nodes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
          const j = await r.json();
          if (j.ok) { syncTimelineAndStats(); reloadTreeInPlace(); } else alert(j.error||'Ошибка');
        } catch (_) {
          const n = {...data, id:'local-'+Date.now()}; const arr = getLocalNodes(); arr.push(n); saveLocalNodes(arr); allNodes.push(n);
          syncTimelineAndStats(); close(); const dc=document.getElementById('tree-dynamic'); if (dc) renderDynamicTree(dc);
        }
      });
    });
    document.getElementById('tpl-create').addEventListener('click', async () => {
      try {
        const r = await fetch(`${BASE}/api/profiles`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({full_name:'',dates:'',main_text:''})});
        const j = await r.json();
        if (j.ok && j.data?.id) window.location.href = `person.html?id=${j.data.id}&edit=1`;
      } catch (_) { alert('Сервер недоступен'); }
    });
  }

  async function loadClansIntoSelect(val) {
    const sel = document.getElementById('tm-clan'); if (!sel) return;
    try {
      const r = await fetch(`${BASE}/api/family-clans?treeId=${encodeURIComponent(currentTreeId)}`);
      const j = await r.json();
      if (!j.ok) return;
      sel.innerHTML = '<option value="">— без рода —</option>' + j.data.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      if (val) sel.value = val;
    } catch (_) {}
  }

  /* ════════════════════════════════════════════
     СИНХРОНИЗАЦИЯ С ЛЕТОПИСЬЮ И СЧЁТЧИКАМИ
     ════════════════════════════════════════════ */
  function syncTimelineAndStats() {
    updateTreeCounters();
    syncNodesToTimeline();
  }

  function updateTreeCounters() {
    const total = allNodes.length;
    document.querySelectorAll('[data-tree-count]').forEach(el => { el.textContent = total; });
    const gens = new Set(allNodes.map(n => n.generation || 0)).size;
    document.querySelectorAll('[data-tree-gens]').forEach(el => { el.textContent = gens; });
  }

  function syncNodesToTimeline() {
    const SK = 'memory_custom_events';
    let evs = [];
    try { evs = JSON.parse(localStorage.getItem(SK) || '[]'); } catch {}
    evs = evs.filter(e => !e._fromTree);

    /* Собираем узлы ТОЛЬКО из активного дерева */
    const activeNodes = [];
    try {
      /* Текущее дерево из URL — это активное */
      allNodes.forEach(n => activeNodes.push(n));
    } catch {}

    /* Сохраняем active_tree_id в localStorage чтобы timeline мог читать */
    if (currentTreeId && currentTreeId !== 'default') {
      localStorage.setItem('active_tree_id', currentTreeId);
    }

    activeNodes.forEach(node => {
      const name  = node.full_name || node.fullName || 'Без имени';
      const years = node.years || '';
      const bm = years.match(/(\d{4})/);
      if (bm) {
        const born = parseInt(bm[1], 10);
        if (born >= 1800 && born <= 2100 && !evs.find(e => e._fromTree && e._nodeId === node.id && e.type === 'birth')) {
          evs.push({ id:'tree_birth_'+node.id, _fromTree:true, _nodeId:node.id, _treeId:currentTreeId, year:born, type:'birth', title:'Родился / Родилась', subtitle:name, city: node.city || '', icon:'✿' });
        }
      }
      const dm = years.match(/\d{4}[—–-](\d{4})/);
      if (dm) {
        const died = parseInt(dm[1], 10);
        if (died >= 1800 && died <= 2100 && !evs.find(e => e._fromTree && e._nodeId === node.id && e.type === 'death')) {
          const age = bm ? died - parseInt(bm[1],10) : null;
          evs.push({ id:'tree_death_'+node.id, _fromTree:true, _nodeId:node.id, _treeId:currentTreeId, year:died, type:'death', title:'Ушёл из жизни', subtitle:name, city: node.city || '', icon:'✦', age });
        }
      }
    });
    try { localStorage.setItem(SK, JSON.stringify(evs)); } catch {}
    if (document.getElementById('timeline') && window._timelineRender) window._timelineRender();
  }

  /* ── Inject CSS для новых элементов ── */
  if (!document.getElementById('tree-edit-extra-css')) {
    const s = document.createElement('style');
    s.id = 'tree-edit-extra-css';
    s.textContent = `
      @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(16px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
      .tree-edit-btn--create { margin-left:10px; background:rgba(200,168,75,0.12); border-color:rgba(200,168,75,0.45); color:var(--gold-light); }
      .tree-edit-btn--create:hover { background:rgba(200,168,75,0.22); border-color:var(--gold); }
      .tree-node--conn-selected .tree-node__frame { box-shadow:0 0 0 3px rgba(200,168,75,0.95),0 0 24px rgba(200,168,75,0.55)!important; transform:translateY(-4px) scale(1.07)!important; }
      .tree-node--conn-selected .tree-node__name { color:var(--gold-light)!important; }
      .tree-node--disconn-selected .tree-node__frame { box-shadow:0 0 0 3px rgba(239,68,68,0.95),0 0 24px rgba(239,68,68,0.55)!important; transform:translateY(-4px) scale(1.07)!important; }
      .tree-node--disconn-selected .tree-node__name { color:#ff9e9e!important; }
      .tree-node--branch-root .tree-node__frame::after { content:'🌿'; position:absolute; bottom:4px; right:4px; font-size:14px; z-index:5; }

      /* ── Легенда — активная подсветка при клике «Соединить» ── */
      .tree-legend--active {
        box-shadow: 0 0 0 2px rgba(200,168,75,0.6), 0 0 32px rgba(200,168,75,0.25) !important;
        background: rgba(200,168,75,0.07) !important;
        border-radius: 12px;
        transition: box-shadow 0.4s, background 0.4s;
      }
      .tree-legend { transition: box-shadow 0.4s, background 0.4s; border-radius: 12px; }

      /* ── Новый элемент легенды ── */
      .tree-legend__item--new { border: 1px solid rgba(200,168,75,0.35); border-radius: 8px; padding: 4px 12px; }
      .tree-legend__new-badge {
        font-size: 9px; font-family: var(--font-ui); letter-spacing: 0.1em; text-transform: uppercase;
        background: rgba(200,168,75,0.2); border: 1px solid rgba(200,168,75,0.35);
        color: var(--gold-light); border-radius: 20px; padding: 1px 7px; margin-left: 6px;
      }

      /* ── Подсказка «как соединить» ── */
      #connect-tip { padding: 0 32px; margin-bottom: 12px; }
      .connect-tip__inner {
        display: flex; align-items: flex-start; gap: 14px;
        background: linear-gradient(135deg, rgba(12,12,12,0.96), rgba(20,18,10,0.96));
        border: 1px solid rgba(200,168,75,0.35); border-radius: 12px;
        padding: 18px 22px; max-width: 700px; margin: 0 auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(200,168,75,0.08);
        opacity: 0; transform: translateY(-8px);
        transition: opacity 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.4s cubic-bezier(0.34,1.3,0.64,1);
      }
      #connect-tip.connect-tip--visible .connect-tip__inner { opacity: 1; transform: translateY(0); }
      .connect-tip__icon { font-size: 28px; line-height: 1; flex-shrink: 0; filter: drop-shadow(0 0 8px rgba(200,168,75,0.5)); }
      .connect-tip__inner strong {
        display: block; font-family: var(--font-display); font-size: 16px; font-weight: 400;
        color: var(--gold-light); margin-bottom: 10px;
      }
      .connect-tip__inner ol {
        margin: 0; padding-left: 18px;
        font-family: var(--font-body); font-size: 14px; font-weight: 300;
        color: var(--cream); line-height: 2; list-style: none; counter-reset: steps;
      }
      .connect-tip__inner ol li { counter-increment: steps; position: relative; padding-left: 4px; }
      .connect-tip__inner ol li::before {
        content: counter(steps);
        position: absolute; left: -18px;
        width: 16px; height: 16px; border-radius: 50%;
        background: rgba(200,168,75,0.2); border: 1px solid rgba(200,168,75,0.4);
        color: var(--gold-light); font-family: var(--font-ui); font-size: 10px;
        display: flex; align-items: center; justify-content: center; top: 4px;
      }
      .connect-tip__close {
        margin-left: auto; align-self: flex-start; flex-shrink: 0;
        background: none; border: 1px solid rgba(200,168,75,0.2); border-radius: 50%;
        width: 26px; height: 26px; color: var(--cream-dim); cursor: pointer;
        font-size: 12px; display: flex; align-items: center; justify-content: center;
        transition: all 0.2s;
      }
      .connect-tip__close:hover { background: rgba(200,80,80,0.15); border-color: rgba(200,80,80,0.4); color: #e08080; }
    `;
    document.head.appendChild(s);
  }

  setTimeout(syncTimelineAndStats, 900);

  /* ══════════════════════════════════════
     ВЫБОР ТИПА КАРТОЧКИ
     ══════════════════════════════════════ */
  function openCardTypeChooser(presetGen) {
    document.getElementById('card-type-chooser')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'tree-modal-overlay';
    overlay.id = 'card-type-chooser';
    overlay.innerHTML = `
      <div class="tree-modal tree-modal--chooser">
        <button class="tree-modal__close" id="ctc-close">×</button>
        <h2 class="tree-modal__title">Какую карточку добавить?</h2>
        <div class="ctc-options">
          <button class="ctc-option" id="ctc-memory">
            <div class="ctc-option__icon-badge">
              <span class="ctc-option__icon">📜</span>
            </div>
            <span class="ctc-option__title">Страница памяти</span>
            <span class="ctc-option__desc">Для ушедших — полная страница с биографией</span>
          </button>
          <button class="ctc-option" id="ctc-relative">
            <div class="ctc-option__icon-badge">
              <span class="ctc-option__icon">👤</span>
            </div>
            <span class="ctc-option__title">Родственник</span>
            <span class="ctc-option__desc">Для живых — карточка с событиями</span>
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('ctc-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    document.getElementById('ctc-memory').addEventListener('click', () => {
      close();
      openNodeModal(null, 'linked', presetGen);
    });
    document.getElementById('ctc-relative').addEventListener('click', () => {
      close();
      openNodeModal(null, 'stub', presetGen);
    });
  }

  /* ══════════════════════════════════════
     ПОПАП КАРТОЧКИ РОДСТВЕННИКА (с событиями)
     ══════════════════════════════════════ */
  window.openRelativePopup = async function(nodeId) {
    if (!nodeId) return;
    await loadNodes();
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) return;

    document.getElementById('relative-popup')?.remove();

    const name = node.full_name || node.fullName || 'Без имени';
    const years = node.years || '';
    const desc = node.description || '';
    const photo = node.photo_url || node.photoUrl || '';

    // Загружаем события этого узла
    let events = [];
    try {
      const r = await fetch(`${BASE}/api/timeline-events?treeId=${encodeURIComponent(currentTreeId)}&nodeId=${nodeId}`);
      const j = await r.json();
      if (j.ok) events = (j.data || []).filter(e => {
        if (e.type === 'birth' || e.type === 'death') return false;
        // Год обязателен и валиден — отсекаем «undefined»/битые записи
        const y = parseInt(e.year, 10);
        if (!Number.isFinite(y) || y < 1000 || y > 3000) return false;
        const title = (e.title || '').trim();
        if (!title) return false;
        // Чужие события родственников: «Смерть: Ольга», «Рождение: Егор» и т.п.
        if (/^(рожден|смерт|похорон|уход|брак|свадьб)[^:：—–]*[:：—–]\s*\S/iu.test(title)) return false;
        // Авто-дубликаты собственных вех (рождение/смерть) — для них есть отдельные поля
        if (/^(рождение|уход из жизни|смерть|наши дни)\.?$/iu.test(title)) return false;
        return true;
      });
    } catch (_) {}

    const overlay = document.createElement('div');
    overlay.className = 'tree-modal-overlay';
    overlay.id = 'relative-popup';

    const eventsHTML = events.length
      ? events.map(e => `<div class="rp-event" data-id="${e.id}"><span class="rp-event__year">${Number.isFinite(parseInt(e.year, 10)) ? e.year : ''}</span><span class="rp-event__title">${e.title}</span>${e.city ? `<span class="rp-event__city">${e.city}</span>` : ''}<button class="rp-event__del" data-eid="${e.id}" title="Удалить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div>`).join('')
      : `<div class="rp-no-events"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg><span>Нет записанных событий</span></div>`;

    overlay.innerHTML = `
      <div class="tree-modal" style="max-width:520px;">
        <button class="tree-modal__close" id="rp-close">×</button>
        <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:20px;">
          <div style="width:80px;height:80px;border-radius:8px;overflow:hidden;background:rgba(200,168,75,0.1);flex-shrink:0;display:flex;align-items:center;justify-content:center;">
            ${photo ? `<img src="${resolveUrl(photo)}" style="width:100%;height:100%;object-fit:cover;" data-te-fb="emoji-32"/>` : '<span style="font-size:32px;">👤</span>'}
          </div>
          <div>
            <h2 class="tree-modal__title" style="margin-bottom:4px;">${name}</h2>
            <p style="font-family:var(--font-ui);font-size:12px;color:var(--gold);letter-spacing:0.1em;">${years}</p>
            ${desc ? `<p style="font-family:var(--font-body);font-size:13px;color:var(--cream-dim);margin-top:6px;">${desc}</p>` : ''}
          </div>
        </div>

        <div class="rp-section-title">События жизни</div>
        <div class="rp-events" id="rp-events">${eventsHTML}</div>

        <div class="rp-add-event" id="rp-add-event" style="display:none; flex-direction:column; gap:12px;">
          <div class="rp-templates" style="display:flex; flex-wrap:wrap; gap:6px; width:100%;">
            <button type="button" class="rp-tpl-btn" data-val="Свадьба">💍 Свадьба</button>
            <button type="button" class="rp-tpl-btn" data-val="Рождение ребёнка">👶 Рождение</button>
            <button type="button" class="rp-tpl-btn" data-val="Окончание учёбы">🎓 Выпускной</button>
            <button type="button" class="rp-tpl-btn" data-val="Начало работы">🛠 Работа</button>
            <button type="button" class="rp-tpl-btn" data-val="Военная служба">⚔ Служба</button>
            <button type="button" class="rp-tpl-btn" data-val="Переезд">✈️ Переезд</button>
          </div>
          <div style="display:flex; gap:8px; width:100%; align-items:center;">
            <input type="number" id="rp-ev-year" placeholder="Год" min="1800" max="2030" style="width:70px;"/>
            <input type="text" id="rp-ev-title" placeholder="Событие (свадьба, переезд...)" style="flex:1;"/>
            <input type="text" id="rp-ev-city" placeholder="Город" style="width:100px;"/>
            <button class="rp-ev-save" id="rp-ev-save" title="Сохранить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
          </div>
        </div>
        <button class="rp-add-btn" id="rp-add-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>Добавить событие</button>

        <div style="display:flex;gap:10px;margin-top:20px;">
          ${isEditMode ? `<button class="rp-edit-btn" id="rp-edit-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;stroke:currentColor;fill:none;"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>Редактировать</button>` : ''}
          <button class="tree-modal__btn tree-modal__btn--cancel" id="rp-close2" style="flex:1;">Закрыть</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Template buttons listeners
    overlay.querySelectorAll('.rp-tpl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        const titleInput = document.getElementById('rp-ev-title');
        if (titleInput) {
          titleInput.value = val;
          titleInput.focus();
        }
      });
    });

    // Закрытие
    const close = () => overlay.remove();
    document.getElementById('rp-close').addEventListener('click', close);
    document.getElementById('rp-close2').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Кнопка редактирования → открывает полную модалку
    document.getElementById('rp-edit-btn')?.addEventListener('click', () => { close(); openNodeModal(nodeId, 'edit'); });

    // Добавление события
    const addBtn = document.getElementById('rp-add-btn');
    const addForm = document.getElementById('rp-add-event');
    addBtn.addEventListener('click', () => { addForm.style.display = 'flex'; addBtn.style.display = 'none'; document.getElementById('rp-ev-year')?.focus(); });

    document.getElementById('rp-ev-save')?.addEventListener('click', async () => {
      const year = parseInt(document.getElementById('rp-ev-year').value, 10);
      const title = document.getElementById('rp-ev-title').value.trim();
      const city = document.getElementById('rp-ev-city').value.trim();
      if (!year || !title) return;

      try {
        const r = await fetch(`${BASE}/api/timeline-events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ treeId: currentTreeId, year, type: 'custom', title, city, nodeId }),
        });
        const j = await r.json();
        if (j.ok) { close(); window.openRelativePopup(nodeId); }
      } catch (_) {}
    });

    // Удаление событий
    overlay.querySelectorAll('.rp-event__del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const eid = btn.dataset.eid;
        try {
          await fetch(`${BASE}/api/timeline-events/${eid}`, { method: 'DELETE' });
          close(); window.openRelativePopup(nodeId);
        } catch (_) {}
      });
    });
  };

  window.addEventListener('resize', () => {
    if (currentTreeId !== 'default') {
      const dc = document.getElementById('tree-dynamic');
      if (dc) {
        const conns = getLocalConnections();
        drawCustomConnections(dc, conns);
      }
    } else {
      const tw = document.getElementById('tree-wrapper');
      if (tw && isEditMode) {
        const conns = getLocalConnections();
        drawCustomConnections(tw, conns);
      }
    }
  });

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
    if (!t.matches('img[data-te-fb]')) return;
    const kind = t.getAttribute('data-te-fb');
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
