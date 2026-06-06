/* ═══════════════════════════════════════════════
   API CLIENT — same-origin via Caddy, JWT auto,
   AbortController timeouts (15s default, 60s upload)
   ═══════════════════════════════════════════════ */
const API = (() => {
  // В Docker/Caddy фронт работает на стандартном порту 80/443 (same-origin).
  // Если мы запущены на нестандартном локальном порту (например, 5500), перенаправляем API-запросы на backend (порт 3000).
  const isLocalDev = window.location.port && window.location.port !== '80' && window.location.port !== '443';
  const BASE = isLocalDev ? 'http://localhost:3000' : '';
  const TOKEN_KEY = 'memory_jwt';
  const TIMEOUT_DEFAULT = 15000;
  const TIMEOUT_UPLOAD = 60000;

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }

  function compressImage(file, maxW = 1200, maxH = 1200, quality = 0.82) {
    return new Promise((resolve) => {
      if (!window.FileReader || !window.HTMLCanvasElement) return resolve(file);
      if (!file.type || !file.type.startsWith('image/') || file.type === 'image/gif') return resolve(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxW || height > maxH) {
            if (width > height) {
              height = Math.round((height * maxW) / width);
              width = maxW;
            } else {
              width = Math.round((width * maxH) / height);
              height = maxH;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (!blob) return resolve(file);
            const originalName = file.name || 'image.png';
            const cleanName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
            const newName = cleanName + '.webp';
            const compressedFile = new File([blob], newName, {
              type: 'image/webp',
              lastModified: Date.now()
            });
            resolve(compressedFile.size < file.size ? compressedFile : file);
          }, 'image/webp', quality);
        };
        img.onerror = () => resolve(file);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }

  // Global fetch interceptor: JWT injection + image compression
  const originalFetch = window.fetch;
  window.fetch = async function (resource, options = {}) {
    const url = typeof resource === 'string' ? resource : (resource instanceof URL ? resource.href : resource?.url || '');
    if (url && (url.startsWith('/api/') || url.includes('/api/'))) {
      // 1. JWT
      const token = getToken();
      if (token) {
        options.headers = options.headers || {};
        if (options.headers instanceof Headers) {
          if (!options.headers.has('Authorization')) {
            options.headers.set('Authorization', 'Bearer ' + token);
          }
        } else if (Array.isArray(options.headers)) {
          if (!options.headers.some(([key]) => key.toLowerCase() === 'authorization')) {
            options.headers.push(['Authorization', 'Bearer ' + token]);
          }
        } else {
          if (!options.headers['Authorization'] && !options.headers['authorization']) {
            options.headers['Authorization'] = 'Bearer ' + token;
          }
        }
      }
      // 2. Image compression
      if (options.body instanceof FormData && options.body.has('photo')) {
        const file = options.body.get('photo');
        if (file instanceof File && file.type.startsWith('image/') && file.type !== 'image/gif') {
          try {
            const compressed = await compressImage(file);
            options.body.set('photo', compressed);
          } catch (e) {
            console.error('Image compression failed, uploading original:', e);
          }
        }
      }
    }
    return originalFetch.call(this, resource, options);
  };

  async function req(method, path, body, isForm, opts) {
    const controller = new AbortController();
    const timeoutMs = isForm ? TIMEOUT_UPLOAD : TIMEOUT_DEFAULT;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers = {};
    // extra headers (e.g. X-Profile-Access)
    if (opts && opts.headers) {
      for (const k of Object.keys(opts.headers)) {
        headers[k] = opts.headers[k];
      }
    }
    const tok = getToken();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    if (body && !isForm) headers['Content-Type'] = 'application/json';

    try {
      const res = await fetch(BASE + path, {
        method,
        headers,
        body: isForm ? body : (body ? JSON.stringify(body) : undefined),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const json = await res.json().catch(() => ({}));
      if (!res.ok && !json.ok) {
        if (res.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem('memory_user');
        }
        const error = new Error(json.error || `HTTP ${res.status}`);
        error.status = res.status;
        throw error;
      }
      return json;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('Сервер недоступен (таймаут)');
      throw err;
    }
  }

  return {
    BASE,
    resolveUrl(path) {
      if (!path) return '';
      if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
        return path;
      }
      const isLocalDev = window.location.port && window.location.port !== '80' && window.location.port !== '443';
      const devPrefix = isLocalDev ? 'http://localhost:3000' : '';
      // Same-origin: /uploads/, /bot-data/, /images/ отдаются тем же хостом через Caddy. В dev-режиме берем с порта 3000.
      if (path.startsWith('/uploads/') || path.startsWith('/bot-data/') || path.startsWith('/images/')) {
        const fullUrl = devPrefix + path;
        return fullUrl.includes('/uploads/') ? fullUrl + '?v=5' : fullUrl;
      }
      if (path.startsWith('uploads/') || path.startsWith('bot-data/') || path.startsWith('images/')) {
        const fullUrl = devPrefix + '/' + path;
        return fullUrl.includes('/uploads/') ? fullUrl + '?v=5' : fullUrl;
      }
      return path;
    },
    get:    (path, opts)       => req('GET',    path, undefined, false, opts),
    post:   (path, body, opts) => req('POST',   path, body, false, opts),
    put:    (path, body, opts) => req('PUT',    path, body, false, opts),
    patch:  (path, body, opts) => req('PATCH',  path, body, false, opts),
    del:    (path, opts)       => req('DELETE', path, undefined, false, opts),
    upload: (path, form, opts) => req('POST',   path, form, true, opts),
    compressImage,
    getToken, setToken,
    isLoggedIn: () => !!getToken(),
    getUser() {
      try {
        const u = localStorage.getItem('memory_user');
        return u ? JSON.parse(u) : null;
      } catch {
        return null;
      }
    },
    async login(email, password) {
      const r = await req('POST', '/api/auth/login', { email, password });
      setToken(r.token);
      if (r.user) localStorage.setItem('memory_user', JSON.stringify(r.user));
      return r;
    },
    async register(name, email, password, accept) {
      const r = await req('POST', '/api/auth/register', { name, email, password, accept });
      setToken(r.token);
      if (r.user) localStorage.setItem('memory_user', JSON.stringify(r.user));
      return r;
    },
    async logout() {
      // Best-effort: записать LOGOUT в AuditLog. Не блокируем выход при ошибке.
      try {
        if (getToken()) {
          await this.post('/api/auth/logout', {});
        }
      } catch (e) {
        console.warn('[logout] backend call failed:', e.message);
      }
      setToken(null);
      localStorage.removeItem('memory_user');
    },
  };
})();

// ─── Telegram deep-link login (Phase 3) ───
API.telegramLoginInit = async function () {
    const r = await this.post('/api/auth/telegram/init', {});
    return r.data || r;
};
API.telegramLoginPoll = async function (token) {
    return await this.get('/api/auth/telegram/poll?token=' + encodeURIComponent(token));
};

