/* ═══════════════════════════════════════════════
   AUTH UI — Login / Register modal
   Injects "Войти" button into nav on all pages
   ═══════════════════════════════════════════════ */

(function () {
  // Inject style block for Page Guard and Modal Styling
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .page-guard-blur-wrapper {
      filter: blur(15px);
      pointer-events: none;
      user-select: none;
      transition: filter 0.5s ease;
    }
    .page-guard-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 99998;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(10, 10, 12, 0.6);
      backdrop-filter: blur(10px);
    }
    .page-guard-box {
      background: rgba(255, 255, 255, 0.03);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 3rem 2rem;
      border-radius: 24px;
      max-width: 450px;
      width: 90%;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
      animation: guardFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes guardFadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .page-guard-box__logo {
      font-size: 3rem;
      color: #c8a84b;
      margin-bottom: 1.5rem;
      text-shadow: 0 0 15px rgba(200, 168, 75, 0.4);
    }
    .page-guard-box__title {
      font-family: 'Outfit', 'Inter', sans-serif;
      font-size: 1.75rem;
      font-weight: 600;
      margin-bottom: 1rem;
      background: linear-gradient(135deg, #fff 0%, #a5a5a6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .page-guard-box__text {
      font-size: 0.95rem;
      color: rgba(255, 255, 255, 0.7);
      line-height: 1.6;
      margin-bottom: 2rem;
    }
    .page-guard-box__btn {
      background: linear-gradient(135deg, #c8a84b 0%, #a6842c 100%);
      color: #0d0d0f;
      border: none;
      font-weight: 600;
      padding: 1rem 2.5rem;
      border-radius: 12px;
      cursor: pointer;
      font-size: 1rem;
      transition: all 0.3s ease;
      box-shadow: 0 10px 20px rgba(200, 168, 75, 0.2);
    }
    .page-guard-box__btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 15px 30px rgba(200, 168, 75, 0.35);
    }
    .auth-modal__forgot {
      text-align: right;
      margin: -0.4rem 0 0.6rem;
    }
    .auth-modal__forgot a {
      color: #c8a84b;
      font-size: 0.85rem;
      text-decoration: none;
      cursor: pointer;
      opacity: 0.85;
      transition: opacity 0.2s ease;
    }
    .auth-modal__forgot a:hover {
      opacity: 1;
      text-decoration: underline;
    }
    .auth-modal__consent {
      margin: 1rem 0 1.2rem;
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.65);
      line-height: 1.48;
      text-align: left;
    }
    .auth-modal__consent label {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      cursor: pointer;
      user-select: none;
    }
    .auth-modal__consent input[type="checkbox"] {
      appearance: none;
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
      position: relative;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      margin-top: 0.15rem;
      flex-shrink: 0;
      outline: none;
    }
    .auth-modal__consent input[type="checkbox"]:checked {
      background: #c8a84b;
      border-color: #c8a84b;
      box-shadow: 0 0 8px rgba(200, 168, 75, 0.4);
    }
    .auth-modal__consent input[type="checkbox"]:checked::after {
      content: '';
      position: absolute;
      left: 5px;
      top: 2px;
      width: 4px;
      height: 8px;
      border: solid #000;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }
    .auth-modal__consent input[type="checkbox"]:hover {
      border-color: #c8a84b;
      background: rgba(200, 168, 75, 0.08);
    }
    .auth-modal__consent input[type="checkbox"]:focus-visible {
      border-color: #c8a84b;
      box-shadow: 0 0 0 2px rgba(200, 168, 75, 0.2);
    }
    .auth-modal__consent a {
      color: #c8a84b;
      text-decoration: none;
      border-bottom: 1px dashed rgba(200, 168, 75, 0.4);
      transition: all 0.2s ease;
    }
    .auth-modal__consent a:hover {
      color: #e5c060;
      border-bottom-color: #e5c060;
    }
  `;
  document.head.appendChild(styleEl);

  const nav = document.querySelector('.nav__inner');
  if (!nav) return;

  /* ── Inject auth button into nav ── */
  const authBtn = document.createElement('button');
  authBtn.className = 'nav__auth';

  // Injected mobile auth element inside the dropdown menu
  const navLinks = document.querySelector('.nav__links');
  let mobileAuthLi = null;
  let mobileAuthBtn = null;
  if (navLinks) {
    mobileAuthLi = document.createElement('li');
    mobileAuthLi.className = 'nav__auth-li';
    mobileAuthBtn = document.createElement('a');
    mobileAuthBtn.className = 'nav__link nav__link--auth';
    mobileAuthBtn.style.cursor = 'pointer';
    mobileAuthLi.appendChild(mobileAuthBtn);
    navLinks.appendChild(mobileAuthLi);
  }

  updateAuthBtn();
  nav.appendChild(authBtn);

  function updateAuthBtn() {
    if (API.isLoggedIn()) {
      authBtn.textContent = 'Выйти';
      authBtn.onclick = async () => { await API.logout(); location.reload(); };
      if (mobileAuthBtn) {
        mobileAuthBtn.textContent = 'Выйти';
        mobileAuthBtn.onclick = async () => { await API.logout(); location.reload(); };
      }
    } else {
      authBtn.textContent = 'Войти';
      authBtn.onclick = () => openModal('login');
      if (mobileAuthBtn) {
        mobileAuthBtn.textContent = 'Войти';
        mobileAuthBtn.onclick = () => openModal('login');
      }
    }
  }

  /* ── Modal ── */
  let mode = 'login'; // or 'register'

  function openModal(m) {
    mode = m || 'login';
    closeModal();

    const overlay = document.createElement('div');
    overlay.className = 'auth-modal-overlay';
    overlay.id = 'auth-overlay';

    overlay.innerHTML = `
      <div class="auth-modal" role="dialog" aria-modal="true">
        <button class="auth-modal__close" id="auth-close" aria-label="Закрыть">×</button>
        <h2 class="auth-modal__title" id="auth-title">${mode === 'login' ? 'Войти' : 'Регистрация'}</h2>
        <form id="auth-form">
          ${mode === 'register' ? `
          <div class="auth-modal__field">
            <input class="auth-modal__input" type="text" name="name" placeholder="Имя" required autocomplete="name"/>
          </div>` : ''}
          <div class="auth-modal__field">
            <input class="auth-modal__input" type="email" name="email" placeholder="Email" required autocomplete="email"/>
          </div>
          <div class="auth-modal__field">
            <input class="auth-modal__input" type="password" name="password" placeholder="Пароль" required minlength="6" autocomplete="current-password"/>
          </div>
          ${mode === 'login' ? '<div class="auth-modal__forgot"><a href="/forgot-password.html">Забыли пароль?</a></div>' : ''}
          ${mode === 'register' ? `<div class="auth-modal__consent"><label><input type="checkbox" name="accept" id="auth-accept" required/><span>Я согласен с <a href="/privacy.html" target="_blank">Политикой обработки персональных данных</a> и <a href="/terms.html" target="_blank">Пользовательским соглашением</a></span></label></div>` : ''}
          <button type="submit" class="auth-modal__submit">
            ${mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
          <p class="auth-modal__error" id="auth-error"></p>
        </form>
        <p class="auth-modal__switch">
          ${mode === 'login'
            ? 'Нет аккаунта? <a id="auth-switch">Зарегистрироваться</a>'
            : 'Уже есть аккаунт? <a id="auth-switch">Войти</a>'}
          ${mode === 'login' ? `
            <div class="auth-modal__divider"><span>или</span></div>
            <button type="button" id="tg-login-btn" class="auth-modal__tg-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:8px"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              Войти через Telegram
            </button>
          ` : ''}
        </p>
      </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector('input')?.focus();

    document.getElementById('auth-close').onclick  = () => {
      closeModal();
      if (!API.isLoggedIn() && isPrivate) {
        window.location.href = 'index.html';
      }
    };
    document.getElementById('auth-switch').onclick = () => openModal(mode === 'login' ? 'register' : 'login');
    overlay.addEventListener('click', e => { 
      if (e.target === overlay) {
        closeModal(); 
        if (!API.isLoggedIn() && isPrivate) {
          window.location.href = 'index.html';
        }
      }
    });
    document.addEventListener('keydown', onEsc);

    // ── Telegram deep-link login ──
    if (mode === 'login') {
      const tgBtn = document.getElementById('tg-login-btn');
      if (tgBtn) {
        tgBtn.onclick = async () => {
          const errEl = document.getElementById('auth-error');
          errEl.textContent = '';
          tgBtn.disabled = true;
          try {
            const init = await API.telegramLoginInit();
            if (!init || !init.token || !init.botUrl) throw new Error('init failed');
            window.open(init.botUrl, '_blank', 'noopener,noreferrer');
            tgBtn.textContent = '⏳ Ожидаю подтверждения в Telegram…';
            const deadline = Date.now() + (init.ttlSec || 300) * 1000;
            const poll = async () => {
              if (Date.now() > deadline) {
                errEl.textContent = 'Время ожидания истекло. Попробуйте снова.';
                tgBtn.disabled = false;
                tgBtn.textContent = 'Войти через Telegram';
                return;
              }
              try {
                const r = await API.telegramLoginPoll(init.token);
                if (r && r.status === 'READY' && r.token) {
                  localStorage.setItem('memory_jwt', r.token);
                  if (r.user) localStorage.setItem('memory_user', JSON.stringify(r.user));
                  closeModal();
                  location.reload();
                  return;
                }
                if (r && (r.status === 'EXPIRED' || r.status === 'NOT_FOUND' || r.status === 'CONSUMED')) {
                  errEl.textContent = 'Сессия истекла. Попробуйте снова.';
                  tgBtn.disabled = false;
                  tgBtn.textContent = 'Войти через Telegram';
                  return;
                }
                setTimeout(poll, 1500);
              } catch (e) {
                errEl.textContent = e.message;
                tgBtn.disabled = false;
                tgBtn.textContent = 'Войти через Telegram';
              }
            };
            setTimeout(poll, 1500);
          } catch (e) {
            errEl.textContent = e.message || 'Telegram login error';
            tgBtn.disabled = false;
            tgBtn.textContent = 'Войти через Telegram';
          }
        };
      }
    }

    document.getElementById('auth-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd   = new FormData(e.target);
      const errEl = document.getElementById('auth-error');
      const btn   = e.target.querySelector('.auth-modal__submit');
      btn.disabled = true;
      errEl.textContent = '';

      try {
        if (mode === 'login') {
          await API.login(fd.get('email'), fd.get('password'));
        } else {
          if (!fd.get('accept')) {
            throw new Error('Необходимо согласиться с политикой обработки персональных данных');
          }
          await API.register(fd.get('name'), fd.get('email'), fd.get('password'), true);
        }
        closeModal();
        updateAuthBtn();
        location.reload();
      } catch (err) {
        errEl.textContent = err.message;
        btn.disabled = false;
      }
    });
  }

  function closeModal() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
      if (window.closeModalWithGSAP) {
        window.closeModalWithGSAP(overlay, '.auth-modal');
      } else {
        overlay.remove();
      }
    }
    document.removeEventListener('keydown', onEsc);
  }

  function onEsc(e) { 
    if (e.key === 'Escape') {
      closeModal(); 
      if (!API.isLoggedIn() && isPrivate) {
        window.location.href = 'index.html';
      }
    }
  }

  // Expose function globally
  window.openAuthModal = openModal;

  // Page Guard Logic
  const privatePages = ['/memory.html', '/family-tree.html', '/timeline.html', '/person.html'];
  const currentPath = window.location.pathname.toLowerCase();
  const isPrivate = privatePages.some(page => currentPath.endsWith(page));

  if (isPrivate && !API.isLoggedIn()) {
    document.addEventListener('DOMContentLoaded', () => {
      const bodyChildren = Array.from(document.body.children);
      const blurWrapper = document.createElement('div');
      blurWrapper.className = 'page-guard-blur-wrapper';

      bodyChildren.forEach(child => {
        if (child.tagName !== 'SCRIPT' && child.tagName !== 'STYLE') {
          blurWrapper.appendChild(child);
        }
      });
      document.body.appendChild(blurWrapper);

      const guardOverlay = document.createElement('div');
      guardOverlay.className = 'page-guard-overlay';
      guardOverlay.innerHTML = `
        <div class="page-guard-box">
          <div class="page-guard-box__logo">✦</div>
          <h2 class="page-guard-box__title">Личная Книга Памяти</h2>
          <p class="page-guard-box__text">Доступ к семейному древу и страницам памяти ограничен. Войдите в свой личный кабинет или зарегистрируйтесь для продолжения.</p>
          <button class="page-guard-box__btn" id="page-guard-login-btn">Войти в систему</button>
        </div>
      `;
      document.body.appendChild(guardOverlay);

      document.getElementById('page-guard-login-btn').onclick = () => {
        openModal('login');
      };

      // Automatically open modal immediately
      openModal('login');
    });
  }
})();
