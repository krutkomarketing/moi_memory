'use strict';

/* ═══════════════════════════════════════════════
   TRASH — restore deleted profiles (soft delete)
   Backend: GET /api/profiles/trash, POST /api/profiles/:slug/restore
   ═══════════════════════════════════════════════ */

(function () {
  const STATE = { page: 1, limit: 20, total: 0, loading: false };

  function $ (sel) { return document.querySelector(sel); }

  function escapeHtml (s) {
    return String(s ?? '').replace(/[&<>"']/g, m => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
    ));
  }

  function checkAuth () {
    if (!API.isLoggedIn()) {
      const wrap = $('#trash-content');
      wrap.innerHTML = `
        <div class="trash-empty">
          <div class="trash-empty__icon">🔒</div>
          <h2 class="trash-empty__title">Нужен вход</h2>
          <p class="trash-empty__sub">Чтобы открыть корзину, войдите в свой аккаунт.</p>
          <a href="/" class="btn btn--primary">На главную</a>
        </div>`;
      return false;
    }
    return true;
  }

  async function loadTrash () {
    if (STATE.loading) return;
    STATE.loading = true;
    const container = $('#trash-content');
    container.innerHTML = '<div class="trash-loader">Загрузка…</div>';

    try {
      const r = await API.get(`/api/profiles/trash?page=${STATE.page}&limit=${STATE.limit}`);
      // Backend может вернуть { items, total } или { data: [], total } — поддерживаем оба
      const items = r.items || r.data || [];
      const total = (typeof r.total === 'number') ? r.total : items.length;
      STATE.total = total;

      if (!items.length) {
        container.innerHTML = renderEmpty();
        return;
      }

      const pages = Math.max(1, Math.ceil(total / STATE.limit));
      container.innerHTML = renderHeader(total) + renderGrid(items) + renderPagination(STATE.page, pages);
      bindHandlers();
    } catch (e) {
      console.error('[trash] load error:', e);
      container.innerHTML = `<div class="trash-error">Не удалось загрузить: ${escapeHtml(e.message || 'неизвестная ошибка')}</div>`;
    } finally {
      STATE.loading = false;
    }
  }

  function renderHeader (total) {
    return `<p class="trash-header">В корзине: <strong>${total}</strong> ${plural(total, 'страница', 'страницы', 'страниц')}</p>`;
  }

  function renderGrid (items) {
    return `<div class="trash-grid">${items.map(renderCard).join('')}</div>`;
  }

  function renderCard (p) {
    const photoRaw = (p.coverPhoto && p.coverPhoto.url) || p.photo || p.coverPhotoUrl || p.photoUrl || '';
    const photoUrl = photoRaw ? API.resolveUrl(photoRaw) : '';
    const fullName = escapeHtml(p.fullName || p.name || '—');
    const years = computeYears(p);
    const deletedAt = formatDate(p.deletedAt || p.updatedAt);
    const deletedBy = escapeHtml(
      (p.deletedByUser && (p.deletedByUser.displayName || p.deletedByUser.email)) ||
      (p.updatedByUser && (p.updatedByUser.displayName || p.updatedByUser.email)) || ''
    );
    const slug = p.slug || p.id;

    return `
      <article class="trash-card" data-slug="${escapeHtml(slug)}">
        <div class="trash-card__photo">
          ${photoUrl
            ? `<img src="${escapeHtml(photoUrl)}" alt="" loading="lazy">`
            : '<div class="trash-card__photo-placeholder">—</div>'}
        </div>
        <div class="trash-card__body">
          <h3 class="trash-card__name">${fullName}</h3>
          ${years ? `<p class="trash-card__years">${years}</p>` : ''}
          <p class="trash-card__meta">Удалено: ${escapeHtml(deletedAt)}${deletedBy ? ` · ${deletedBy}` : ''}</p>
          <div class="trash-card__actions">
            <button type="button" class="btn btn--primary trash-restore-btn" data-slug="${escapeHtml(slug)}">
              Восстановить
            </button>
            <button type="button" class="btn btn--ghost trash-hard-delete-btn" data-slug="${escapeHtml(slug)}">
              Удалить навсегда
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function renderPagination (page, pages) {
    if (pages <= 1) return '';
    return `
      <div class="trash-pagination">
        <button type="button" class="btn btn--ghost" data-pg="prev" ${page <= 1 ? 'disabled' : ''}>← Назад</button>
        <span class="trash-pagination__info">Страница ${page} из ${pages}</span>
        <button type="button" class="btn btn--ghost" data-pg="next" ${page >= pages ? 'disabled' : ''}>Вперёд →</button>
      </div>
    `;
  }

  function renderEmpty () {
    return `
      <div class="trash-empty">
        <div class="trash-empty__icon">🕊</div>
        <h2 class="trash-empty__title">Корзина пуста</h2>
        <p class="trash-empty__sub">Здесь появятся удалённые страницы памяти. Восстановить их можно в течение 90 дней.</p>
        <a href="memory.html" class="btn btn--ghost">К страницам памяти</a>
      </div>
    `;
  }

  function bindHandlers () {
    document.querySelectorAll('.trash-restore-btn').forEach(btn => {
      btn.addEventListener('click', onRestore);
    });
    document.querySelectorAll('.trash-hard-delete-btn').forEach(btn => {
      btn.addEventListener('click', onHardDelete);
    });
    document.querySelectorAll('[data-pg]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const dir = e.currentTarget.dataset.pg;
        if (dir === 'prev' && STATE.page > 1) STATE.page--;
        if (dir === 'next') STATE.page++;
        loadTrash();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

    async function onHardDelete (e) {
    const btn = e.currentTarget;
    const slug = btn.dataset.slug;
    if (!slug) return;

    if (!confirm('Удалить страницу навсегда? Это действие нельзя отменить.')) return;

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Удаляем…';

    try {
      await API.del(`/api/profiles/${encodeURIComponent(slug)}?hard=true`);
      const card = btn.closest('.trash-card');
      if (card) {
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95)';
        setTimeout(() => loadTrash(), 320);
      } else {
        loadTrash();
      }
    } catch (err) {
      console.error('[trash] hard delete error:', err);
      alert('Не удалось удалить навсегда: ' + (err.message || 'неизвестная ошибка'));
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

async function onRestore (e) {
    const btn = e.currentTarget;
    const slug = btn.dataset.slug;
    if (!slug) return;
    if (!confirm('Восстановить эту страницу памяти?')) return;

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Восстанавливаем…';

    try {
      await API.post(`/api/profiles/${encodeURIComponent(slug)}/restore`);
      const card = btn.closest('.trash-card');
      if (card) {
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95)';
        setTimeout(() => loadTrash(), 320);
      } else {
        loadTrash();
      }
    } catch (err) {
      console.error('[trash] restore error:', err);
      alert('Не удалось восстановить: ' + (err.message || 'неизвестная ошибка'));
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  function computeYears (p) {
    // 1) Готовая строка years с бэка (приоритет)
    if (p.years && typeof p.years === 'string' && p.years.trim()) return p.years.trim();
    // 2) Числовые поля
    const by = p.bornYear || extractYear(p.bornDate) || extractYear(p.born);
    const dy = p.diedYear || extractYear(p.diedDate) || extractYear(p.died);
    if (by && dy) return `${by}–${dy}`;
    if (by) return `${by} —`;
    if (dy) return `— ${dy}`;
    // 3) Строковые born/died если без чисел не вышло
    const b = (p.born || '').toString().trim();
    const d = (p.died || '').toString().trim();
    if (b && d) return `${b} — ${d}`;
    if (b) return `${b} —`;
    if (d) return `— ${d}`;
    return '';
  }

  function extractYear (val) {
    if (!val) return null;
    const s = String(val);
    const m = s.match(/(\d{4})/);
    return m ? parseInt(m[1], 10) : null;
  }

  function formatDate (iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return '—';
    }
  }

  function plural (n, one, few, many) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    loadTrash();
  });
})();
