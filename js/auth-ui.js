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
      authBtn.onclick = () => { API.logout(); location.reload(); };
      if (mobileAuthBtn) {
        mobileAuthBtn.textContent = 'Выйти';
        mobileAuthBtn.onclick = () => { API.logout(); location.reload(); };
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
            <input class="auth-modal__input" type="${mode === 'login' ? 'text' : 'email'}" name="email" placeholder="${mode === 'login' ? 'Email или Логин' : 'Email'}" required autocomplete="email"/>
          </div>
          <div class="auth-modal__field">
            <input class="auth-modal__input" type="password" name="password" placeholder="Пароль" required minlength="6" autocomplete="current-password"/>
          </div>
          <button type="submit" class="auth-modal__submit">
            ${mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
          <p class="auth-modal__error" id="auth-error"></p>
        </form>
        <p class="auth-modal__switch">
          ${mode === 'login'
            ? 'Нет аккаунта? <a id="auth-switch">Зарегистрироваться</a>'
            : 'Уже есть аккаунт? <a id="auth-switch">Войти</a>'}
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
          await API.register(fd.get('name'), fd.get('email'), fd.get('password'));
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
    document.getElementById('auth-overlay')?.remove();
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
