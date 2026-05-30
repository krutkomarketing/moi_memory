/* ═══════════════════════════════════════════════════════════
 *  LEGACY CONTACT page
 *  Sections:
 *    1) Owner: form to set/view/revoke trusted heir
 *    2) Heir auto-accept (?invite=TOKEN)
 *    3) Heir: list of saved contact ids + create claim
 *    4) Me: list of submitted claims
 * ═══════════════════════════════════════════════════════════ */
'use strict';
(function () {



  const root = document.getElementById('legacy-content');
  if (!root) return;

  // Local cache of contact ids where current user is heir
  const HEIR_KEY = 'legacy_heir_contact_ids';
  function getHeirIds() {
    try { return JSON.parse(localStorage.getItem(HEIR_KEY) || '[]'); } catch (_) { return []; }
  }
  function addHeirId(id) {
    if (!id) return;
    const list = getHeirIds();
    if (!list.includes(id)) { list.push(id); localStorage.setItem(HEIR_KEY, JSON.stringify(list)); }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('ru-RU', { dateStyle:'medium', timeStyle:'short' }); }
    catch (_) { return '—'; }
  }
  function statusBadge(st) { return `<span class="lg-badge lg-badge--${escapeHtml(st)}">${escapeHtml(st)}</span>`; }

  /* ───── Owner section ───── */
  function renderOwnerSection(contact) {
    if (!contact) {
      // Empty state — form to create
      return `
        <section class="lg-card">
          <h2 class="lg-card__title">Назначить доверенный контакт</h2>
          <p class="lg-card__sub">Этому человеку придёт приглашение по e-mail. После его подтверждения он сможет подать заявку на наследование ваших страниц памяти, если вы не будете заходить в систему более N дней.</p>
          <form id="lg-set-form">
            <div class="lg-field">
              <label class="lg-field__label">E-mail доверенного лица</label>
              <input class="lg-input" name="heirEmail" type="email" required placeholder="heir@example.com"/>
            </div>
            <div class="lg-field">
              <label class="lg-field__label">Имя (необязательно)</label>
              <input class="lg-input" name="heirName" placeholder="Иван Петров"/>
            </div>
            <div class="lg-field">
              <label class="lg-field__label">Период неактивности (дней, 7–365)</label>
              <input class="lg-input" name="inactivityDays" type="number" min="7" max="365" value="90"/>
            </div>
            <div class="lg-field">
              <label class="lg-field__label">Сообщение наследнику (необязательно)</label>
              <textarea class="lg-textarea" name="message" maxlength="2000" placeholder="Дорогой друг, прошу позаботиться о наших страницах памяти..."></textarea>
            </div>
            <div class="lg-actions">
              <button class="lg-btn lg-btn--primary" type="submit">Отправить приглашение</button>
            </div>
            <p class="lg-error" id="lg-set-err"></p>
          </form>
        </section>`;
    }
    const isFinal = contact.status === 'TRANSFERRED' || contact.status === 'REVOKED';
    return `
      <section class="lg-card">
        <h2 class="lg-card__title">Мой доверенный контакт</h2>
        <p class="lg-card__sub">Статус: ${statusBadge(contact.status)}</p>
        <div class="lg-row"><span class="lg-row__key">E-mail</span><span class="lg-row__val">${escapeHtml(contact.heirEmail || '—')}</span></div>
        <div class="lg-row"><span class="lg-row__key">Имя</span><span class="lg-row__val">${escapeHtml(contact.heirName || '—')}</span></div>
        <div class="lg-row"><span class="lg-row__key">Зарегистрирован в системе</span><span class="lg-row__val">${contact.heirUserId ? 'да' : 'нет'}</span></div>
        <div class="lg-row"><span class="lg-row__key">Период неактивности</span><span class="lg-row__val">${escapeHtml(contact.inactivityDays || 90)} дн.</span></div>
        <div class="lg-row"><span class="lg-row__key">Создан</span><span class="lg-row__val">${fmtDate(contact.createdAt)}</span></div>
        ${contact.verifiedAt ? `<div class="lg-row"><span class="lg-row__key">Принято</span><span class="lg-row__val">${fmtDate(contact.verifiedAt)}</span></div>` : ''}
        ${contact.triggeredAt ? `<div class="lg-row"><span class="lg-row__key">Сработал триггер</span><span class="lg-row__val">${fmtDate(contact.triggeredAt)}</span></div>` : ''}
        ${contact.inviteExpiresAt ? `<div class="lg-row"><span class="lg-row__key">Приглашение действует до</span><span class="lg-row__val">${fmtDate(contact.inviteExpiresAt)}</span></div>` : ''}
        ${contact.message ? `<div class="lg-row"><span class="lg-row__key">Сообщение</span><span class="lg-row__val">${escapeHtml(contact.message)}</span></div>` : ''}
        ${!isFinal ? `
          <div class="lg-actions">
            ${contact.status === 'PENDING' ? `<button class="lg-btn lg-btn--ghost" id="lg-resend">Отправить ссылку повторно</button>` : ''}
            <button class="lg-btn lg-btn--danger" id="lg-revoke">Отозвать назначение</button>
          </div>
          <p class="lg-error" id="lg-owner-err"></p>
          <p class="lg-success" id="lg-owner-ok"></p>
        ` : ''}
      </section>`;
  }

  /* ───── Heir section: claims + create claim ───── */
  function renderHeirSection(myClaims) {
    const ids = getHeirIds();
    return `
      <section class="lg-card">
        <h2 class="lg-card__title">Я — доверенный контакт</h2>
        <p class="lg-card__sub">Если владельцы профилей назначили вас доверенным контактом и долго не заходили на сайт, вы можете подать заявку на передачу их страниц памяти под ваш аккаунт. Заявку рассматривает администратор.</p>

        <div class="lg-field">
          <label class="lg-field__label">ID контактного запроса (получили в письме или сохранили после принятия приглашения)</label>
          <input class="lg-input" id="lg-claim-id" placeholder="cm..."/>
        </div>
        <div class="lg-field">
          <label class="lg-field__label">Доказательства (свидетельство, скан завещания, и т.д.)</label>
          <textarea class="lg-textarea" id="lg-claim-ev" maxlength="4000" placeholder="Свидетельство о смерти №..., завещание заверено..."></textarea>
        </div>
        <div class="lg-actions">
          <button class="lg-btn lg-btn--primary" id="lg-claim-submit">Подать заявку</button>
        </div>
        <p class="lg-error" id="lg-claim-err"></p>
        <p class="lg-success" id="lg-claim-ok"></p>

        ${ids.length ? `<p class="lg-card__sub" style="margin-top:18px;">Сохранённые контактные ID (на этом устройстве): ${ids.map(i => `<code style="color:#d8b96b;">${escapeHtml(i)}</code>`).join(', ')}</p>` : ''}
      </section>

      <section class="lg-card">
        <h2 class="lg-card__title">Мои заявки</h2>
        ${(!myClaims || !myClaims.length) ? '<p class="lg-empty">Заявок пока нет.</p>' : myClaims.map(c => `
          <div class="lg-row" style="flex-direction:column;align-items:flex-start;">
            <div style="display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;">
              ${statusBadge(c.status)}
              <span class="lg-row__key">${fmtDate(c.createdAt)}</span>
              <code style="color:rgba(255,255,255,0.5);font-size:0.8rem;">${escapeHtml(c.id)}</code>
            </div>
            ${c.legacyContact && c.legacyContact.owner ? `<div class="lg-row__val">Владелец: ${escapeHtml(c.legacyContact.owner.displayName || c.legacyContact.owner.email || '—')}</div>` : ''}
            ${c.evidence ? `<div class="lg-row__val" style="opacity:0.7;font-size:0.85rem;">«${escapeHtml(c.evidence.slice(0, 200))}${c.evidence.length > 200 ? '…' : ''}»</div>` : ''}
            ${c.reviewNotes ? `<div class="lg-row__val" style="font-size:0.85rem;">Решение администратора: ${escapeHtml(c.reviewNotes)}</div>` : ''}
          </div>`).join('')}
      </section>`;
  }

  /* ───── API wrappers ───── */
  async function fetchContact() {
    const r = await API.get('/api/legacy-contact');
    return (r && r.data) || null;
  }
  async function fetchMyClaims() {
    const r = await API.get('/api/legacy-claims/me');
    return (r && r.rows) || [];
  }

  /* ───── Event handlers ───── */
  function bindOwnerEvents(contact) {
    if (!contact) {
      const form = document.getElementById('lg-set-form');
      if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const errEl = document.getElementById('lg-set-err');
        errEl.textContent = '';
        try {
          const body = {
            heirEmail:      fd.get('heirEmail'),
            heirName:       fd.get('heirName') || undefined,
            inactivityDays: parseInt(fd.get('inactivityDays'), 10) || undefined,
            message:        fd.get('message') || undefined,
          };
          await API.put('/api/legacy-contact', body);
          await reload();
        } catch (err) { errEl.textContent = err.message || 'Ошибка'; }
      });
      return;
    }
    const resendBtn = document.getElementById('lg-resend');
    const revokeBtn = document.getElementById('lg-revoke');
    const errEl = document.getElementById('lg-owner-err');
    const okEl  = document.getElementById('lg-owner-ok');
    if (resendBtn) resendBtn.addEventListener('click', async () => {
      errEl.textContent = ''; okEl.textContent = '';
      try {
        await API.post('/api/legacy-contact/resend', {});
        okEl.textContent = 'Приглашение отправлено повторно';
        setTimeout(reload, 1200);
      } catch (err) { errEl.textContent = err.message || 'Ошибка'; }
    });
    if (revokeBtn) revokeBtn.addEventListener('click', async () => {
      if (!confirm('Отозвать назначение доверенного контакта? Это действие необратимо для текущей записи.')) return;
      errEl.textContent = ''; okEl.textContent = '';
      try { await API.del('/api/legacy-contact'); await reload(); }
      catch (err) { errEl.textContent = err.message || 'Ошибка'; }
    });
  }
  function bindHeirEvents() {
    const btn = document.getElementById('lg-claim-submit');
    const errEl = document.getElementById('lg-claim-err');
    const okEl  = document.getElementById('lg-claim-ok');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      errEl.textContent = ''; okEl.textContent = '';
      const id = (document.getElementById('lg-claim-id').value || '').trim();
      const ev = (document.getElementById('lg-claim-ev').value || '').trim();
      if (!id) { errEl.textContent = 'Укажите ID контактного запроса'; return; }
      if (!ev || ev.length < 10) { errEl.textContent = 'Доказательства обязательны (минимум 10 символов)'; return; }
      btn.disabled = true;
      try {
        await API.post(`/api/legacy-contacts/${encodeURIComponent(id)}/claims`, { evidence: ev });
        okEl.textContent = 'Заявка отправлена. Ожидайте решения администратора.';
        document.getElementById('lg-claim-id').value = '';
        document.getElementById('lg-claim-ev').value = '';
        setTimeout(reload, 1200);
      } catch (err) { errEl.textContent = err.message || 'Ошибка'; }
      finally { btn.disabled = false; }
    });
  }

  /* ───── Auto-accept invite ───── */
  async function maybeAcceptInvite() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite');
    if (!token) return null;
    try {
      const r = await API.post('/api/legacy-invites/accept', { inviteToken: token });
      const data = (r && r.data) || null;
      if (data && data.id) addHeirId(data.id);
      // Remove ?invite= from URL
      const u = new URL(window.location.href);
      u.searchParams.delete('invite');
      history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
      return { ok: true, contactId: data?.id };
    } catch (err) {
      return { ok: false, error: err.message || 'Не удалось принять приглашение' };
    }
  }

  /* ───── Main render ───── */
  async function reload() {
    root.innerHTML = '<div class="audit-loader">Загрузка…</div>';
    let contact = null;
    let claims  = [];
    let acceptMsg = '';
    try {
      contact = await fetchContact();
    } catch (e) {
      root.innerHTML = `<section class="lg-card"><p class="lg-error">${escapeHtml(e.message || 'Ошибка загрузки')}</p></section>`;
      return;
    }
    try { claims = await fetchMyClaims(); } catch (e) { /* non-fatal */ }

    const acceptResult = await maybeAcceptInvite();
    if (acceptResult) {
      acceptMsg = acceptResult.ok
        ? `<section class="lg-card"><p class="lg-success">✓ Приглашение принято. ID контакта сохранён локально: <code style="color:#d8b96b;">${escapeHtml(acceptResult.contactId || '')}</code></p></section>`
        : `<section class="lg-card"><p class="lg-error">${escapeHtml(acceptResult.error)}</p></section>`;
      // refetch in case state changed
      try { contact = await fetchContact(); } catch (_) {}
      try { claims  = await fetchMyClaims(); } catch (_) {}
    }

    root.innerHTML = acceptMsg + renderOwnerSection(contact) + renderHeirSection(claims);
    bindOwnerEvents(contact);
    bindHeirEvents();
  }

  /* ───── Init: require login ───── */
  if (typeof API === 'undefined' || !API.isLoggedIn || !API.isLoggedIn()) {
    root.innerHTML = `<section class="lg-card"><p class="lg-empty">Войдите в систему, чтобы управлять доверенным контактом.</p></section>`;
    // Try to open login modal if available
    setTimeout(() => { try { window.openAuthModal && window.openAuthModal('login'); } catch (_) {} }, 200);
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reload);
  } else { reload(); }
})();
