/* ═══════════════════════════════════════════════
   TREE-EDIT.JS v3
   ✓ Кнопка «Создать дерево» — новое пустое дерево
   ✓ Анимация перехода между деревьями
   ✓ Соединение карточек (и default и dynamic)
   ✓ Добавить ветвь (работает)
   ✓ Синхронизация с летописью
   ═══════════════════════════════════════════════ */

(function () {
  const editBtn = document.getElementById('tree-edit-btn');
  if (!editBtn) return;

  const BASE = window.location.port === '3000' ? '' : 'http://localhost:3000';
  let isEditMode = false;
  let allNodes   = [];

  const urlParams   = new URLSearchParams(window.location.search);
  let currentTreeId = urlParams.get('tree') || 'default';

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
    else exitEditMode();
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

    /* Фото превью */
    const photoInput   = modal.querySelector('#ctm-photo-input');
    const photoPreview = modal.querySelector('#ctm-photo-preview');
    photoInput.addEventListener('change', () => {
      const file = photoInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        photoPreview.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      };
      reader.readAsDataURL(file);
    });

    const close = () => modal.remove();
    modal.querySelector('.ctm-close').addEventListener('click', close);
    modal.querySelector('.ctm-backdrop').addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('ctm-visible')));

    modal.querySelector('#ctm-form').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const firstName = fd.get('firstName')?.trim();
      const lastName  = fd.get('lastName')?.trim();
      if (!firstName || !lastName) return;

      const treeName = fd.get('treeName')?.trim() || `Род ${lastName}`;
      const treeId   = treeName.toLowerCase()
        .replace(/[^a-zа-яё0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
        || 'tree-' + Date.now();

      const years = fd.get('birthYear')
        ? `${fd.get('birthYear')}–${fd.get('deathYear') || ''}`
        : '';

      const roleLabels = {
        progenitor: 'Прародитель рода', patriarch: 'Патриарх',
        parent: 'Родитель', grandparent: 'Дед / Бабушка', greatgrandparent: 'Прапрадед',
      };

      const node = {
        id: 'local-' + Date.now(),
        fullName: `${lastName} ${firstName}${fd.get('middleName') ? ' ' + fd.get('middleName').trim() : ''}`,
        years, generation: 0, ageClass: 'old', treeId,
        description: roleLabels[fd.get('role')] || '',
        city: fd.get('city')?.trim(),
        bio:  fd.get('bio')?.trim(),
        photo_url: photoPreview.querySelector('img')?.src || '',
      };

      localStorage.setItem(`tree_nodes_${treeId}`, JSON.stringify([node]));
      const trees = getAllTrees();
      if (!trees.includes(treeId)) { trees.push(treeId); saveAllTrees(trees); }

      /* Обновляем легенду линий с новым названием рода */
      updateLegendWithNewTree(treeName, fd.get('gender') === 'female' ? '#c87e7e' : '#c8a84b');

      close();
      transitionToNewTree(treeId);
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
    } else {
      localStorage.removeItem('active_tree_id');
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

      const nodeData = {
        treeId: currentTreeId, fullName: personName || branchName, years,
        description: `Ветвь: ${branchName}`, generation: gen, genOrder: 99,
        ageClass: gen <= 1 ? 'old' : 'young', isBranchRoot: true, branchName,
      };

      let saved = false;
      try {
        const r = await fetch(`${BASE}/api/family-nodes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nodeData) });
        const j = await r.json();
        if (j.ok) { saved = true; close(); syncTimelineAndStats(); window.location.reload(); }
        else { errEl.textContent = j.error || 'Ошибка'; errEl.style.display = 'block'; }
      } catch (_) {}

      if (!saved) {
        const arr = getLocalNodes();
        const node = { ...nodeData, id: 'local-' + Date.now() };
        arr.push(node); saveLocalNodes(arr); allNodes = arr;
        syncTimelineAndStats(); close();
        const dc = document.getElementById('tree-dynamic');
        if (dc) { renderDynamicTree(dc); } else { window.location.reload(); }
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
        if (lineEl.classList.contains('tree-legend__line--braid')) type = 'marriage';
        else if (lineEl.classList.contains('tree-legend__line--wood')) type = 'parent';

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
    document.getElementById('conn-toast')?.remove();
  }

  function showConnectionToast(type) {
    document.getElementById('conn-toast')?.remove();
    const labels = { marriage: 'Брачный союз 💍', parent: 'Родство 🧬', line: 'Прямая линия →' };
    const t = document.createElement('div');
    t.id = 'conn-toast';
    t.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:rgba(8,8,8,0.95);border:1px solid rgba(200,168,75,0.5);border-radius:30px;padding:12px 24px;font-family:var(--font-body);font-size:14px;color:var(--gold-light);z-index:9999;display:flex;align-items:center;gap:12px;backdrop-filter:blur(8px);box-shadow:0 8px 32px rgba(0,0,0,0.7);animation:toastIn 0.3s ease;pointer-events:auto;';
    t.innerHTML = `<span id="conn-toast-msg">${labels[type]} — кликните на первую карточку</span><button onclick="document.getElementById('conn-toast')?.remove()" style="background:none;border:none;color:var(--cream-dim);font-size:18px;cursor:pointer;margin-left:8px;line-height:1;">×</button>`;
    document.body.appendChild(t);
  }

  function updateConnectionToast(step) {
    const msg = document.getElementById('conn-toast-msg');
    if (!msg) return;
    msg.textContent = step === 1 ? 'Теперь кликните на вторую карточку' : '✓ Соединение установлено!';
  }

  /* ── Клик по карточке для соединения ── */
  function handleNodeConnectionClick(nodeEl, nodeId) {
    if (!connectionMode) return false;
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
      connectNodes(connectionNodeA, nodeId, connectionMode);
      nodeEl.classList.add('tree-node--conn-selected');
      updateConnectionToast(2);
      setTimeout(() => cancelConnectionMode(), 1400);
      return true;
    }
    return false;
  }

  /* ── Сохранить и нарисовать соединение ── */
  function connectNodes(idA, idB, type) {
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
    if (lineColor) connData.color = lineColor;

    if (ex) { Object.assign(ex, { type, color: lineColor || ex.color }); }
    else { conns.push(connData); }
    saveLocalConnections(conns);

    fetch(`${BASE}/api/family-connections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ treeId: currentTreeId, nodeA: idA, nodeB: idB, connectionType: type }),
    }).catch(() => {});

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

  /* ════════════════════════════════════════════
     ПЕРЕКЛЮЧАТЕЛЬ ДЕРЕВЬЕВ (dropdown)
     ════════════════════════════════════════════ */
  (async function initTreeSwitcher() {
    /* Сначала пробуем API */
    let trees = [];
    try {
      const r = await fetch(`${BASE}/api/family-trees`);
      const j = await r.json();
      if (j.ok && Array.isArray(j.data)) trees = j.data;
    } catch (_) {}
    /* Дополняем из localStorage */
    const localTrees = getAllTrees();
    localTrees.forEach(t => { if (!trees.includes(t)) trees.push(t); });
    if (trees.length <= 1) return;

    const sw = document.createElement('div');
    sw.className = 'tree-switcher';
    sw.innerHTML = `<label class="tree-switcher__label">Дерево:</label>
      <select class="tree-switcher__select" id="tree-switcher-select">
        ${trees.map(t => `<option value="${t}" ${t === currentTreeId ? 'selected' : ''}>${t === 'default' ? 'Основное' : t}</option>`).join('')}
      </select>`;
    document.querySelector('.clan-legend-wrap')?.insertBefore(sw, document.querySelector('.clan-legend-wrap').firstChild);

    document.getElementById('tree-switcher-select')?.addEventListener('change', e => {
      const val = e.target.value;
      transitionToNewTree(val === 'default' ? null : val);
      setTimeout(() => {
        window.location.href = val === 'default' ? 'family-tree.html' : `family-tree.html?tree=${encodeURIComponent(val)}`;
      }, 10);
    });
  })();



  /* ════════════════════════════════════════════
     ИНИЦИАЛИЗАЦИЯ — СТАТИЧЕСКОЕ ИЛИ ДИНАМИЧЕСКОЕ
     ════════════════════════════════════════════ */
  if (currentTreeId !== 'default') {
    /* Новое / кастомное дерево — скрываем статику, рендерим динамику */
    const sw = document.getElementById('tree-wrapper');
    if (sw) sw.style.display = 'none';
    const sl = document.getElementById('tree-clan-legend');
    if (sl) sl.innerHTML = '';
    loadAndRenderClans();

    const dc = document.createElement('div');
    dc.className = 'tree-dynamic'; dc.id = 'tree-dynamic';
    document.querySelector('.tree-section')?.appendChild(dc);

    loadNodes().then(() => { renderDynamicTree(dc); initLegendConnections(); });
  } else {
    /* Default дерево — статическое, но соединения тоже работают */
    addClanButton();

    /* Вешаем соединение на статические карточки */
    function attachStaticNodeClicks() {
      document.querySelectorAll('#tree-wrapper .tree-node, #tree-generations .tree-node').forEach(nodeEl => {
        if (nodeEl.dataset.connBound) return;
        nodeEl.dataset.connBound = '1';
        nodeEl.addEventListener('click', e => {
          if (e.target.closest('.tree-node-ctrl')) return;
          const nid = nodeEl.dataset.id;
          if (nid) handleNodeConnectionClick(nodeEl, nid);
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

  function addClanButton() {
    const legend = document.getElementById('tree-clan-legend');
    if (!legend || legend.querySelector('.clan-legend__item--add')) return;
    const btn = document.createElement('div');
    btn.className = 'clan-legend__item clan-legend__item--add';
    btn.innerHTML = `<span class="clan-legend__add-icon">+</span><div class="clan-legend__text"><strong>Добавить род</strong><span>Новая линия</span></div>`;
    btn.addEventListener('click', openAddClanModal);
    legend.appendChild(btn);
  }

  async function loadAndRenderClans() {
    const legend = document.getElementById('tree-clan-legend');
    if (!legend) return;
    try {
      const r = await fetch(`${BASE}/api/family-clans?treeId=${encodeURIComponent(currentTreeId)}`);
      const j = await r.json();
      if (!j.ok) return;
      legend.innerHTML = j.data.map(c => `
        <div class="clan-legend__item" data-clan="${c.id}" style="--clan-color:${c.color}">
          <span class="clan-legend__badge" style="background:${c.color};box-shadow:0 0 10px ${c.color}44;">${c.icon}</span>
          <div class="clan-legend__text"><strong>${c.name}</strong><span>${c.description || ''}</span></div>
        </div>`).join('');
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
        if (j.ok) { syncTimelineAndStats(); window.location.reload(); } else alert(j.error || 'Ошибка');
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
     РЕНДЕР ДИНАМИЧЕСКОГО ДЕРЕВА
     ════════════════════════════════════════════ */
  function renderDynamicTree(container) {
    const localConns = getLocalConnections();
    if (!allNodes.length && !isEditMode) {
      container.innerHTML = `<div class="tree-empty"><p class="tree-empty__icon">🌳</p><p class="tree-empty__text">Дерево пустое</p><p class="tree-empty__hint">Нажмите «Редактировать дерево» и добавьте первого человека</p></div>`;
      return;
    }
    const gens = {};
    allNodes.forEach(n => { const g = n.generation || 0; if (!gens[g]) gens[g] = []; gens[g].push(n); });
    const GEN_LABELS = ['Прапрародители','Прародители','Родители','Наше поколение','Дети','Внуки'];
    let sorted = Object.keys(gens).map(Number).sort((a,b) => a-b);
    if (!sorted.length && isEditMode) sorted.push(0);

    let html = '';
    if (isEditMode) {
      const topGen = sorted.length ? sorted[sorted.length-1]+1 : 4;
      html += `<button class="tree-gen-add-btn" data-gen="${topGen}">+ Младшее поколение</button>`;
    }

    [...sorted].reverse().forEach(g => {
      html += `<div class="gen-label">${GEN_LABELS[g] || 'Поколение '+g}</div>`;
      html += `<div class="gen-row" data-gen="${g}">`;
      (gens[g] || []).forEach(node => {
        const name   = (node.full_name || node.fullName || '').replace(/\n/g,'<br/>');
        const photo  = node.photo_url || node.photoUrl || '';
        const linked = node.linked_profile_id || node.linkedProfileId || '';
        const branch = node.isBranchRoot ? ' tree-node--branch-root' : '';
        html += `
          <div class="tree-node tree-node--young${branch}" data-id="${node.id}">
            ${isEditMode ? `<div class="tree-node-controls">
              <button class="tree-node-ctrl" data-action="edit" data-id="${node.id}" title="Редактировать">✏️</button>
              <button class="tree-node-ctrl tree-node-ctrl--del" data-action="delete" data-id="${node.id}" title="Удалить">🗑</button>
            </div>` : ''}
            <div class="tree-node__frame" style="--clan-color:#c8a84b">
              <div class="tree-node__photo">
                ${photo ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;"/>` : `<div class="tree-node__avatar"><svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8"/></svg></div>`}
              </div>
            </div>
            <div class="tree-node__info">
              <div class="tree-node__name">${name || 'Без имени'}</div>
              <div class="tree-node__years">${node.years || ''}</div>
              ${node.description ? `<div class="tree-node__desc">${node.description}</div>` : ''}
              ${linked ? `<a href="person.html?id=${linked}" class="tree-node__link">Страница памяти →</a>` : ''}
            </div>
          </div>`;
      });
      if (isEditMode) html += `<button class="tree-gen-card-add" data-gen="${g}">+ Карточка</button>`;
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
      container.querySelectorAll('.tree-gen-add-btn, .tree-gen-card-add').forEach(b =>
        b.addEventListener('click', () => openNodeModal(null, 'stub', parseInt(b.dataset.gen, 10)))
      );
      container.querySelectorAll('.tree-node-ctrl').forEach(b =>
        b.addEventListener('click', e => {
          e.stopPropagation();
          b.dataset.action === 'edit' ? openNodeModal(b.dataset.id, 'edit') : deleteNode(b.dataset.id);
        })
      );
    }

    /* Клик по карточке — соединение */
    container.querySelectorAll('.tree-node').forEach(nodeEl =>
      nodeEl.addEventListener('click', e => {
        if (e.target.closest('.tree-node-ctrl')) return;
        const nid = nodeEl.dataset.id;
        if (!handleNodeConnectionClick(nodeEl, nid)) {
          const lnk = nodeEl.querySelector('.tree-node__link');
          if (lnk) { e.preventDefault(); window.location.href = lnk.href; }
        }
      })
    );
  }

  /* ── SVG нити — линии идут ОТ НИЗА карточек ── */
  function drawCustomConnections(container, connections) {
    if (!connections || !connections.length) return;
    let svg = container.querySelector('.tree-dynamic-svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.className = 'tree-dynamic-svg';
      svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;overflow:visible;';
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
      container.insertBefore(svg, container.firstChild);
    }
    svg.innerHTML = '';
    const cr = container.getBoundingClientRect();

    connections.forEach(conn => {
      const elA = container.querySelector(`[data-id="${conn.a}"]`);
      const elB = container.querySelector(`[data-id="${conn.b}"]`);
      if (!elA || !elB) return;
      const frameA = elA.querySelector('.tree-node__frame') || elA;
      const frameB = elB.querySelector('.tree-node__frame') || elB;
      const rA = frameA.getBoundingClientRect();
      const rB = frameB.getBoundingClientRect();

      /* Точки соединения — низ центра каждой карточки */
      const x1 = rA.left + rA.width / 2 - cr.left;
      const y1 = rA.bottom - cr.top;
      const x2 = rB.left + rB.width / 2 - cr.left;
      const y2 = rB.bottom - cr.top;

      /* Контрольные точки кривой Безье — "U-образный" спуск под карточки */
      const drop = Math.min(Math.abs(y2 - y1) * 0.5 + 40, 120);
      const cy1  = y1 + drop;
      const cy2  = y2 + drop;

      if (conn.type === 'marriage') {
        /* Плетёная нить из 3 полос */
        const colors = ['#e2c97e', '#8a7035', '#c8a84b'];
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
          path.style.filter = 'drop-shadow(0 0 3px rgba(226,201,126,0.35))';
          animateDraw(path);
          svg.appendChild(path);
        }
        /* Бриллиант по середине */
        const mx = (x1 + x2) / 2, my = Math.max(y1, y2) + drop * 0.8;
        const ds = 6;
        const diamond = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        diamond.setAttribute('d', `M ${mx} ${my-ds} L ${mx+ds} ${my} L ${mx} ${my+ds} L ${mx-ds} ${my} Z`);
        diamond.setAttribute('fill', '#e2c97e');
        diamond.setAttribute('stroke', 'rgba(8,8,8,0.5)');
        diamond.setAttribute('stroke-width', '1');
        diamond.style.opacity = '0';
        diamond.style.transition = 'opacity 0.5s 1.2s';
        svg.appendChild(diamond);
        requestAnimationFrame(() => requestAnimationFrame(() => { diamond.style.opacity = '1'; }));
      } else {
        /* Родство / прямая — плавная кривая с цветом из легенды */
        const color = conn.color || (conn.type === 'parent' ? '#c8a84b' : '#7ec8b4');
        const path  = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`);
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('opacity', '0.85');
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
    requestAnimationFrame(() => {
      const len = path.getTotalLength ? path.getTotalLength() : 500;
      path.style.strokeDasharray  = len;
      path.style.strokeDashoffset = len;
      path.style.transition = `stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)`;
      requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
    });
  }

  /* ════════════════════════════════════════════
     EDIT MODE — вход / выход
     ════════════════════════════════════════════ */
  function enterEditMode() {
    isEditMode = true;
    editBtn.textContent = '✕ Выйти из редактирования';
    editBtn.classList.add('tree-edit-btn--active');

    if (currentTreeId !== 'default') {
      const dc = document.getElementById('tree-dynamic');
      if (dc) renderDynamicTree(dc);
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
        c.innerHTML = `<button class="tree-node-ctrl" data-action="edit" data-id="${nid}" title="Редактировать">✏️</button><button class="tree-node-ctrl tree-node-ctrl--del" data-action="delete" data-id="${nid}" title="Удалить">🗑</button>`;
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
    editBtn.textContent = '✏️ Редактировать дерево';
    editBtn.classList.remove('tree-edit-btn--active');
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
      const j = await r.json();
      if (j.ok) {
        allNodes = j.data;
        const local = getLocalNodes().filter(ln => !allNodes.find(n => n.id === ln.id));
        allNodes = [...allNodes, ...local];
        return allNodes;
      }
    } catch (_) {}
    allNodes = getLocalNodes();
    return allNodes;
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
      const name = prompt('Название рода:');
      if (!name) return;
      const color = '#' + Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6,'0');
      fetch(`${BASE}/api/family-clans`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name, color, treeId: currentTreeId}) })
        .then(r => r.json()).then(j => { if (j.ok) loadClansIntoSelect(j.data.id); });
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
      const data = {
        treeId: currentTreeId,
        fullName: name,
        years:       document.getElementById('tm-years').value.trim(),
        description: document.getElementById('tm-desc').value.trim(),
        clanId:      document.getElementById('tm-clan').value,
        generation:  parseInt(document.getElementById('tm-gen').value, 10),
        genOrder: 0,
        ageClass: parseInt(document.getElementById('tm-gen').value, 10) <= 1 ? 'old' : 'young',
        spouseId:  document.getElementById('tm-spouse').value || null,
        parentIds: Array.from(document.getElementById('tm-parents').selectedOptions).map(o => o.value).filter(Boolean).slice(0,2),
        photoUrl:  document.getElementById('tm-photo-url').value,
      };

      let saved = false;
      try {
        const url = isNew ? `${BASE}/api/family-nodes` : `${BASE}/api/family-nodes/${nodeId}`;
        const r = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
        const j = await r.json();
        if (j.ok) { saved = true; syncTimelineAndStats(); window.location.reload(); }
        else { err.textContent = j.error || 'Ошибка'; err.style.display = 'block'; }
      } catch (_) {}

      if (!saved) {
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
      const r = await fetch(`${BASE}/api/profiles`); const j = await r.json();
      if (j.ok && j.data) profiles = j.data.filter(p => p.name && p.name !== 'Новая страница');
    } catch (_) {}

    const overlay = document.createElement('div');
    overlay.className = 'tree-modal-overlay'; overlay.id = 'tree-node-modal';
    const list = profiles.length
      ? profiles.map(p => `<button type="button" class="tree-profile-item" data-id="${p.id}"><div class="tree-profile-item__photo">${p.photo ? `<img src="${p.photo}"/>` : '<span>👤</span>'}</div><div class="tree-profile-item__info"><div class="tree-profile-item__name">${p.name}</div><div class="tree-profile-item__dates">${p.born||''} ${p.died?'— '+p.died:''}</div></div></button>`).join('')
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
        const data = { treeId: currentTreeId, fullName: p.name||'', years:(p.born||'')+(p.died?' — '+p.died:''), linkedProfileId: p.id, generation: presetGen??3, ageClass:(presetGen??3)<=1?'old':'young', photoUrl: p.photo||'' };
        try {
          const r = await fetch(`${BASE}/api/family-nodes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
          const j = await r.json();
          if (j.ok) { syncTimelineAndStats(); window.location.reload(); } else alert(j.error||'Ошибка');
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

})();
