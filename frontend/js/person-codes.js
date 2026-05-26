'use strict';
/* ═══════════════════════════════════════════════
   PERSON-CODES.JS — UI одноразовых кодов доступа (Frontend H)
   Кнопка «🔑 Коды» появляется только если data.canManageAccess === true
   ═══════════════════════════════════════════════ */
(function () {
    const params = new URLSearchParams(window.location.search);
    const idOrSlug = params.get('id');
    if (!idOrSlug) return;
    if (typeof API === 'undefined' || !API.isLoggedIn || !API.isLoggedIn()) return;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, m =>
            ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m])
        );
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
        } catch { return iso; }
    }

    async function init() {
        try {
            const r = await API.get('/api/profiles/' + encodeURIComponent(idOrSlug));
            const data = r && r.data ? r.data : null;
            if (!data || !data.canManageAccess) return;
            injectButton();
        } catch (e) { /* доступ закрыт — молча выходим */ }
    }

    function injectButton() {
        function attach() {
            let host = document.getElementById('edit-panel') || document.getElementById('access-panel');
            if (!host) {
                host = document.createElement('div');
                host.id = 'access-panel';
                host.className = 'edit-panel access-panel';
                document.body.appendChild(host);
            }
            if (document.getElementById('codes-toggle-btn')) return;
            const btn = document.createElement('button');
            btn.id = 'codes-toggle-btn';
            btn.className = 'edit-panel__btn codes-toggle-btn';
            btn.type = 'button';
            btn.innerHTML = '🔑 Коды';
            btn.addEventListener('click', openModal);
            host.appendChild(btn);
        }
        if (document.readyState === 'complete') setTimeout(attach, 700);
        else window.addEventListener('load', () => setTimeout(attach, 700));
    }

    function openModal() {
        if (document.getElementById('codes-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'codes-modal';
        modal.className = 'access-modal codes-modal';
        modal.innerHTML =
            '<div class="access-modal__backdrop" data-close="1"></div>' +
            '<div class="access-modal__panel" role="dialog" aria-modal="true">' +
              '<div class="access-modal__header">' +
                '<h2 class="access-modal__title">Коды доступа</h2>' +
                '<button class="access-modal__close" data-close="1" aria-label="Закрыть">×</button>' +
              '</div>' +
              '<div class="access-modal__body">' +
                '<form class="access-form codes-form" id="codes-add-form">' +
                  '<input type="text" id="codes-label" placeholder="Метка (напр. «Для семьи»)" maxlength="100" class="access-form__input"/>' +
                  '<input type="datetime-local" id="codes-expires" class="access-form__input codes-form__date" title="Действителен до"/>' +
                  '<button type="submit" class="access-form__submit">+ Создать код</button>' +
                '</form>' +
                '<div class="access-form__error" id="codes-form-error" style="display:none"></div>' +
                '<div class="codes-just-created" id="codes-just-created" style="display:none"></div>' +
                '<div class="access-list" id="codes-list"><div class="access-list__loading">Загрузка…</div></div>' +
              '</div>' +
            '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target.dataset && e.target.dataset.close) closeModal();
        });
        document.addEventListener('keydown', escHandler);
        document.getElementById('codes-add-form').addEventListener('submit', onCreate);
        loadCodes();
    }
    function escHandler(e) { if (e.key === 'Escape') closeModal(); }
    function closeModal() {
        const m = document.getElementById('codes-modal');
        if (m) m.remove();
        document.removeEventListener('keydown', escHandler);
    }

    async function loadCodes() {
        const list = document.getElementById('codes-list');
        if (!list) return;
        list.innerHTML = '<div class="access-list__loading">Загрузка…</div>';
        try {
            const r = await API.get('/api/profiles/' + encodeURIComponent(idOrSlug) + '/access-codes');
            const codes = (r && r.data) || [];
            renderCodes(codes);
        } catch (e) {
            list.innerHTML = '<div class="access-list__empty">Ошибка: ' + esc(e.message || 'не удалось загрузить') + '</div>';
        }
    }

    function statusBadge(c) {
        if (c.isRevoked) return '<span class="codes-badge codes-badge--revoked">Отозван</span>';
        if (c.isExpired) return '<span class="codes-badge codes-badge--expired">Истёк</span>';
        return '<span class="codes-badge codes-badge--active">Активен</span>';
    }

    function renderCodes(codes) {
        const list = document.getElementById('codes-list');
        if (!list) return;
        if (!codes.length) {
            list.innerHTML = '<div class="access-list__empty">Пока нет кодов доступа.</div>';
            return;
        }
        list.innerHTML = codes.map(c => {
            const canRevoke = c.isActive;
            return '' +
                '<div class="codes-row" data-id="' + esc(c.id) + '">' +
                  '<div class="codes-row__info">' +
                    '<div class="codes-row__label">' + (c.label ? esc(c.label) : '<em style="color:#666">без метки</em>') + ' ' + statusBadge(c) + '</div>' +
                    '<div class="codes-row__meta">' +
                      'создан: ' + esc(fmtDate(c.createdAt)) +
                      (c.expiresAt ? ' · до: ' + esc(fmtDate(c.expiresAt)) : '') +
                      (c.revokedAt ? ' · отозван: ' + esc(fmtDate(c.revokedAt)) : '') +
                    '</div>' +
                  '</div>' +
                  '<div class="codes-row__actions">' +
                    (canRevoke ? '<button class="codes-row__btn codes-row__btn--revoke" data-action="revoke" type="button">Отозвать</button>' : '') +
                    '<button class="codes-row__btn codes-row__btn--delete" data-action="delete" type="button" title="Удалить">×</button>' +
                  '</div>' +
                '</div>';
        }).join('');

        list.querySelectorAll('.codes-row').forEach(row => {
            const codeId = row.dataset.id;
            const revokeBtn = row.querySelector('[data-action="revoke"]');
            if (revokeBtn) {
                revokeBtn.addEventListener('click', async () => {
                    if (!confirm('Отозвать код? После отзыва ввод этого кода перестанет открывать доступ.')) return;
                    revokeBtn.disabled = true;
                    try {
                        await API.post('/api/profiles/' + encodeURIComponent(idOrSlug) + '/access-codes/' + encodeURIComponent(codeId) + '/revoke', {});
                        await loadCodes();
                    } catch (err) {
                        alert('Не удалось отозвать: ' + (err.message || ''));
                        revokeBtn.disabled = false;
                    }
                });
            }
            row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
                if (!confirm('Удалить запись о коде полностью? Это действие необратимо.')) return;
                try {
                    await API.del('/api/profiles/' + encodeURIComponent(idOrSlug) + '/access-codes/' + encodeURIComponent(codeId));
                    row.remove();
                    if (!document.querySelectorAll('.codes-row').length) renderCodes([]);
                } catch (err) {
                    alert('Не удалось удалить: ' + (err.message || ''));
                }
            });
        });
    }

    async function onCreate(e) {
        e.preventDefault();
        const label = document.getElementById('codes-label').value.trim();
        const expRaw = document.getElementById('codes-expires').value;
        const errEl = document.getElementById('codes-form-error');
        errEl.style.display = 'none';

        const body = {};
        if (label) body.label = label;
        if (expRaw) {
            // datetime-local даёт "YYYY-MM-DDTHH:mm" в локальном времени → конвертируем в ISO
            const d = new Date(expRaw);
            if (isNaN(d.getTime())) {
                errEl.textContent = 'Неверная дата'; errEl.style.display = 'block'; return;
            }
            body.expiresAt = d.toISOString();
        }

        const submit = e.target.querySelector('.access-form__submit');
        submit.disabled = true;
        const oldText = submit.textContent;
        submit.textContent = '⏳ Создаю...';
        try {
            const r = await API.post('/api/profiles/' + encodeURIComponent(idOrSlug) + '/access-codes', body);
            const created = (r && r.data) || r;
            showJustCreated(created);
            document.getElementById('codes-label').value = '';
            document.getElementById('codes-expires').value = '';
            await loadCodes();
        } catch (err) {
            errEl.textContent = err.message || 'Не удалось создать код';
            errEl.style.display = 'block';
        } finally {
            submit.disabled = false;
            submit.textContent = oldText;
        }
    }

    function showJustCreated(c) {
        const box = document.getElementById('codes-just-created');
        if (!box || !c || !c.plaintextCode) return;
        box.style.display = 'block';
        box.innerHTML =
            '<div class="codes-created__warn">⚠️ Код показывается ОДИН раз. Скопируйте сейчас — восстановить нельзя.</div>' +
            '<div class="codes-created__row">' +
              '<code class="codes-created__code">' + esc(c.plaintextCode) + '</code>' +
              '<button type="button" class="codes-created__copy">Скопировать</button>' +
              '<button type="button" class="codes-created__close" aria-label="Скрыть">×</button>' +
            '</div>' +
            (c.label ? '<div class="codes-created__meta">Метка: ' + esc(c.label) + '</div>' : '') +
            (c.expiresAt ? '<div class="codes-created__meta">Действителен до: ' + esc(fmtDate(c.expiresAt)) + '</div>' : '');
        box.querySelector('.codes-created__copy').addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(c.plaintextCode);
                const btn = box.querySelector('.codes-created__copy');
                const orig = btn.textContent;
                btn.textContent = '✓ Скопировано';
                setTimeout(() => { btn.textContent = orig; }, 1500);
            } catch {
                alert('Не удалось скопировать. Выделите вручную: ' + c.plaintextCode);
            }
        });
        box.querySelector('.codes-created__close').addEventListener('click', () => {
            box.style.display = 'none'; box.innerHTML = '';
        });
    }

    init();
})();
