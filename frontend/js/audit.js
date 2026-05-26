'use strict';

(function () {
  const ACTIONS = [
    'LOGIN', 'LOGIN_FAILED', 'LOGOUT',
    'PROFILE_CREATE', 'PROFILE_UPDATE',
    'PROFILE_SOFT_DELETE', 'PROFILE_RESTORE', 'PROFILE_HARD_DELETE',
    'TREE_CREATE', 'TREE_DELETE',
    'USER_ROLE_CHANGE',
    'ACCESS_CODE_GENERATE', 'ACCESS_CODE_REDEEM',
  ];

  const ENTITY_TYPES = ['Profile', 'FamilyTree', 'User', 'ProfileAccessCode'];

  const ACTION_LABELS = {
    LOGIN: 'Вход',
    LOGIN_FAILED: 'Ошибка входа',
    LOGOUT: 'Выход',
    PROFILE_CREATE: 'Создание страницы',
    PROFILE_UPDATE: 'Изменение страницы',
    PROFILE_SOFT_DELETE: 'Удаление в корзину',
    PROFILE_RESTORE: 'Восстановление',
    PROFILE_HARD_DELETE: 'Полное удаление',
    TREE_CREATE: 'Создание дерева',
    TREE_DELETE: 'Удаление дерева',
    USER_ROLE_CHANGE: 'Смена роли',
    ACCESS_CODE_GENERATE: 'Генерация кода',
    ACCESS_CODE_REDEEM: 'Активация кода',
  };

  const ACTION_KIND = {
    LOGIN: 'auth',
    LOGIN_FAILED: 'auth-fail',
    LOGOUT: 'auth',
    PROFILE_CREATE: 'create',
    TREE_CREATE: 'create',
    ACCESS_CODE_GENERATE: 'create',
    PROFILE_UPDATE: 'update',
    USER_ROLE_CHANGE: 'update',
    PROFILE_RESTORE: 'update',
    PROFILE_SOFT_DELETE: 'delete-soft',
    PROFILE_HARD_DELETE: 'delete',
    TREE_DELETE: 'delete',
    ACCESS_CODE_REDEEM: 'access',
  };

  const state = {
    action: '',
    userEmail: '',
    entityType: '',
    page: 1,
    limit: 50,
    total: 0,
    rows: [],
    hasMore: false,
    loading: false,
  };

  const root = document.getElementById('audit-content');
  if (!root) return;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function checkAdmin() {
    if (typeof API === 'undefined' || !API.isLoggedIn || !API.isLoggedIn()) {
      window.location.href = 'index.html';
      return false;
    }
    const user = API.getUser ? API.getUser() : null;
    if (!user || user.role !== 'ADMIN') {
      root.innerHTML = '<div class="audit-empty">Доступ только для администраторов.</div>';
      setTimeout(() => { window.location.href = 'index.html'; }, 1500);
      return false;
    }
    return true;
  }

  async function fetchLogs() {
    state.loading = true;
    render();
    const qs = new URLSearchParams();
    if (state.action) qs.set('action', state.action);
    if (state.userEmail) qs.set('userEmail', state.userEmail);
    if (state.entityType) qs.set('entityType', state.entityType);
    qs.set('page', String(state.page));
    qs.set('limit', String(state.limit));
    try {
      const resp = await API.get('/admin/audit-logs?' + qs.toString());
      state.rows = resp.rows || (resp.data && resp.data.rows) || [];
      state.total = resp.total || (resp.data && resp.data.total) || 0;
      state.hasMore = !!(resp.hasMore || (resp.data && resp.data.hasMore));
    } catch (e) {
      state.rows = [];
      state.total = 0;
      state.hasMore = false;
      console.error('audit fetch error:', e);
      alert('Ошибка загрузки: ' + (e && e.message ? e.message : 'неизвестная ошибка'));
    } finally {
      state.loading = false;
      render();
    }
  }

  function renderFilters() {
    const actionOpts = ['<option value="">— все —</option>']
      .concat(ACTIONS.map(function (a) {
        return '<option value="' + a + '"' + (state.action === a ? ' selected' : '') + '>' +
          escapeHtml(ACTION_LABELS[a]) + '</option>';
      }))
      .join('');
    const entityOpts = ['<option value="">— все —</option>']
      .concat(ENTITY_TYPES.map(function (e) {
        return '<option value="' + e + '"' + (state.entityType === e ? ' selected' : '') + '>' + e + '</option>';
      }))
      .join('');
    return '' +
      '<div class="audit-filters">' +
        '<label class="audit-filter">' +
          '<span class="audit-filter__label">Действие</span>' +
          '<select class="audit-filter__input" id="f-action">' + actionOpts + '</select>' +
        '</label>' +
        '<label class="audit-filter">' +
          '<span class="audit-filter__label">Email пользователя</span>' +
          '<input type="text" class="audit-filter__input" id="f-user" placeholder="часть@email" value="' + escapeHtml(state.userEmail) + '" />' +
        '</label>' +
        '<label class="audit-filter">' +
          '<span class="audit-filter__label">Сущность</span>' +
          '<select class="audit-filter__input" id="f-entity">' + entityOpts + '</select>' +
        '</label>' +
        '<div class="audit-filter audit-filter--actions">' +
          '<button class="audit-btn audit-btn--primary" id="f-apply">Применить</button>' +
          '<button class="audit-btn" id="f-reset">Сбросить</button>' +
        '</div>' +
      '</div>';
  }

  function renderRow(r) {
    const kind = ACTION_KIND[r.action] || 'neutral';
    const userCell = r.user
      ? '<div class="audit-user">' +
          '<span class="audit-user__name">' + escapeHtml(r.user.displayName || '—') + '</span>' +
          '<span class="audit-user__email">' + escapeHtml(r.user.email || '') + '</span>' +
        '</div>'
      : '<span class="audit-muted">—</span>';

    const eid = r.entityId || '';
    const entityCell = r.entityType
      ? '<div class="audit-entity">' +
          '<span class="audit-entity__type">' + escapeHtml(r.entityType) + '</span>' +
          (eid ? '<span class="audit-entity__id" title="' + escapeHtml(eid) + '">' + escapeHtml(eid.slice(0, 14)) + (eid.length > 14 ? '…' : '') + '</span>' : '') +
        '</div>'
      : '<span class="audit-muted">—</span>';

    const ipCell = r.ipAddress
      ? '<span class="audit-mono">' + escapeHtml(r.ipAddress) + '</span>'
      : '<span class="audit-muted">—</span>';

    return '<tr>' +
      '<td><span class="audit-badge audit-badge--' + kind + '">' + escapeHtml(ACTION_LABELS[r.action] || r.action) + '</span></td>' +
      '<td>' + userCell + '</td>' +
      '<td>' + entityCell + '</td>' +
      '<td>' + ipCell + '</td>' +
      '<td><span class="audit-mono">' + escapeHtml(fmtTime(r.createdAt)) + '</span></td>' +
    '</tr>';
  }

  function renderTable() {
    if (state.loading) return '<div class="audit-loader">Загрузка…</div>';
    if (!state.rows.length) return '<div class="audit-empty">Записей не найдено.</div>';
    return '' +
      '<div class="audit-table-wrap">' +
        '<table class="audit-table">' +
          '<thead><tr>' +
            '<th>Действие</th>' +
            '<th>Пользователь</th>' +
            '<th>Сущность</th>' +
            '<th>IP</th>' +
            '<th>Время</th>' +
          '</tr></thead>' +
          '<tbody>' + state.rows.map(renderRow).join('') + '</tbody>' +
        '</table>' +
      '</div>';
  }

  function renderPagination() {
    if (state.total === 0) return '';
    const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
    const from = (state.page - 1) * state.limit + 1;
    const to = Math.min(state.page * state.limit, state.total);
    return '' +
      '<div class="audit-pagination">' +
        '<div class="audit-pagination__info">' + from + '–' + to + ' из ' + state.total + '</div>' +
        '<div class="audit-pagination__buttons">' +
          '<button class="audit-btn" id="p-prev"' + (state.page <= 1 ? ' disabled' : '') + '>← Назад</button>' +
          '<span class="audit-pagination__page">Стр. ' + state.page + ' / ' + totalPages + '</span>' +
          '<button class="audit-btn" id="p-next"' + (!state.hasMore ? ' disabled' : '') + '>Вперёд →</button>' +
        '</div>' +
      '</div>';
  }

  function render() {
    root.innerHTML = renderFilters() + renderTable() + renderPagination();
    bindEvents();
  }

  function bindEvents() {
    const fAction = document.getElementById('f-action');
    const fUser = document.getElementById('f-user');
    const fEntity = document.getElementById('f-entity');
    const fApply = document.getElementById('f-apply');
    const fReset = document.getElementById('f-reset');
    const pPrev = document.getElementById('p-prev');
    const pNext = document.getElementById('p-next');

    if (fApply) {
      fApply.addEventListener('click', async () => {
        state.action = fAction.value;
        state.entityType = fEntity.value;
        state.userEmail = fUser.value.trim();
        state.page = 1;
        await fetchLogs();
      });
    }
    if (fUser) {
      fUser.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); fApply && fApply.click(); }
      });
    }
    if (fReset) {
      fReset.addEventListener('click', async () => {
        state.action = '';
        state.entityType = '';
        state.userEmail = '';
        state.page = 1;
        await fetchLogs();
      });
    }
    if (pPrev) {
      pPrev.addEventListener('click', async () => {
        if (state.page > 1) { state.page -= 1; await fetchLogs(); }
      });
    }
    if (pNext) {
      pNext.addEventListener('click', async () => {
        if (state.hasMore) { state.page += 1; await fetchLogs(); }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAdmin()) return;
    await fetchLogs();
  });
})();
