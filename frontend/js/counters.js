/* =============================================================================
 *  СЧЁТЧИКИ И АНАЛИТИКА — ЕДИНЫЙ КОНТЕЙНЕР  (counters.js)
 * =============================================================================
 *
 *  ⛔️  НЕ УДАЛЯТЬ И НЕ РЕДАКТИРОВАТЬ ЛОГИКУ ЭТОГО ФАЙЛА АВТОМАТИЧЕСКИ.
 *      Это «контейнер» для систем аналитики и счётчиков.
 *      Менять нужно ТОЛЬКО блок CONFIG ниже (вставлять свои ID).
 *
 *  Зачем файл:
 *    Чтобы коды Яндекс.Метрики / GTM / GA4 лежали в ОДНОМ месте, отдельно от
 *    HTML-страниц. Тогда правки сайта (в т.ч. автоматические) не затрагивают
 *    счётчики. Файл подключён один раз ко всем страницам строкой:
 *        <script src="js/counters.js?v=1" data-counters></script>
 *
 *  Как пользоваться:
 *    1. Открой блок CONFIG ниже.
 *    2. Впиши свой ID в нужную строку (в кавычках). Пустая строка = выключено.
 *    3. Сохрани файл. После заливки на сервер подними версию в подключении
 *       (?v=1 → ?v=2) на страницах, чтобы сбросить кэш. См. инструкцию:
 *       frontend/АНАЛИТИКА-инструкция.md
 *
 *  ВАЖНО про подтверждение прав в вебмастерах (Google / Яндекс):
 *    Поисковые роботы НЕ выполняют JavaScript, поэтому мета-тег верификации,
 *    добавленный этим файлом, они НЕ увидят. Подтверждай права без правки кода:
 *      • Google Search Console — файлом (положить googleXXXX.html в папку
 *        frontend/) или DNS-записью.
 *      • Яндекс.Вебмастер — привязкой счётчика Яндекс.Метрики (если он включён
 *        ниже) или файлом / DNS.
 *    Подробности — в инструкции АНАЛИТИКА-инструкция.md.
 * ========================================================================== */

(function () {
  'use strict';

  /* ===========================================================================
   *  ⬇️  CONFIG — ЕДИНСТВЕННОЕ, ЧТО НУЖНО МЕНЯТЬ. Вставляй ID между кавычек.
   * ======================================================================== */
  var CONFIG = {
    // Яндекс.Метрика — только номер счётчика, например: "98765432"
    yandexMetrikaId: "109694773",

    // Google Tag Manager — ID контейнера, например: "GTM-ABC1234"
    gtmId: "GTM-NK4GMK49",

    // Google Analytics 4 — ID потока, например: "G-XXXXXXXXXX" (необязательно,
    // обычно GA4 подключают внутри GTM, тогда здесь оставь пусто)
    ga4Id: "",

    // Прочие мета-теги <head> (НЕ для подтверждения прав вебмастера — см. шапку).
    // Пример: { name: "facebook-domain-verification", content: "abc123" }
    metaTags: [
      // { name: "", content: "" },
    ],

    // Доп. параметры Яндекс.Метрики
    metrikaOptions: {
      ssr: true,
      webvisor: true,
      clickmap: true,
      ecommerce: "dataLayer",
      accurateTrackBounce: true,
      trackLinks: true
    }
  };

  /* ===========================================================================
   *  ⬇️  Ниже — служебная логика. Менять не нужно.
   * ======================================================================== */

  // Защита от повторного подключения (если файл вставлен на странице дважды)
  if (window.__COUNTERS_LOADED__) { return; }
  window.__COUNTERS_LOADED__ = true;

  function injectMetaTags(list) {
    if (!list || !list.length) { return; }
    var head = document.head || document.getElementsByTagName('head')[0];
    if (!head) { return; }
    list.forEach(function (m) {
      if (!m || !m.name || !m.content) { return; }
      if (document.querySelector('meta[name="' + m.name + '"]')) { return; }
      var el = document.createElement('meta');
      el.setAttribute('name', m.name);
      el.setAttribute('content', m.content);
      head.appendChild(el);
    });
  }

  function initYandexMetrika(id, opts) {
    if (!id) { return; }
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      for (var j = 0; j < e.scripts.length; j++) {
        if (e.scripts[j].src === r) { return; }
      }
      k = e.createElement(t); a = e.getElementsByTagName(t)[0];
      k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + id, 'ym');

    window.ym(id, 'init', opts || {});
  }

  function initGTM(id) {
    if (!id) { return; }
    (function (w, d, s, l, i) {
      w[l] = w[l] || [];
      w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      var f = d.getElementsByTagName(s)[0],
          j = d.createElement(s),
          dl = l !== 'dataLayer' ? '&l=' + l : '';
      j.async = true;
      j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
      f.parentNode.insertBefore(j, f);
    })(window, document, 'script', 'dataLayer', id);
  }

  function initGA4(id) {
    if (!id) { return; }
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = window.gtag || gtag;
    window.gtag('js', new Date());
    window.gtag('config', id);
  }

  // Запуск
  injectMetaTags(CONFIG.metaTags);
  initYandexMetrika(CONFIG.yandexMetrikaId, CONFIG.metrikaOptions);
  initGTM(CONFIG.gtmId);
  initGA4(CONFIG.ga4Id);
})();
