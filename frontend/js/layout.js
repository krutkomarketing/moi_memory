/*
 * layout.js — единый источник общей шапки и подвала сайта QR-Память.
 *
 * Как подключать на странице:
 *   1) В начале <body> поставить плейсхолдер:  <div id="site-header"></div>
 *      и сразу после него:  <script src="js/layout.js?v=1"></script>
 *   2) Перед </body> (где нужен футер):  <div id="site-footer"></div>
 *
 * Меняешь меню/футер/логотип только здесь — на всех страницах обновится автоматически.
 * Скрипты auth-ui.js / nav.js работают: шапка содержит .nav__inner и .nav__links.
 */
(function () {
  'use strict';

  var HEADER =
    '<nav class="nav"><div class="nav__inner">' +
      '<a href="index.html" class="nav__logo" aria-label="QR-Память — на главную">' +
        '<img src="assets-v2/logo-tree-cut.webp" alt="" width="360" height="369" />' +
        '<span class="nav__logo-script">QR-Память</span>' +
      '</a>' +
      '<ul class="nav__links">' +
        '<li><a href="index.html" class="nav__link" data-path="index.html">Главная</a></li>' +
        '<li><a href="memory.html" class="nav__link" data-path="memory.html">Страницы памяти</a></li>' +
        '<li><a href="family-tree.html?tree=default" class="nav__link" data-path="family-tree.html">Древо семьи</a></li>' +
        '<li><a href="timeline.html" class="nav__link" data-path="timeline.html">Летопись</a></li>' +
        '<li><a href="blog.html" class="nav__link" data-path="blog.html">Блог</a></li>' +
        '<li><a href="faq.html" class="nav__link" data-path="faq.html">Вопросы</a></li>' +
      '</ul>' +
    '</div></nav>';

  var FOOTER =
    '<footer class="footer"><div class="footer__top">' +
      '<div class="footer__logo-wrap">' +
        '<span class="footer__logo">QR-Память</span>' +
        '<span class="footer__tagline">Пронесём историю вашей семьи сквозь века</span>' +
      '</div>' +
      '<nav class="footer__nav" aria-label="Навигация сайта">' +
        '<a href="index.html" class="footer__nav-link">Главная</a>' +
        '<a href="memory.html" class="footer__nav-link">Страницы памяти</a>' +
        '<a href="family-tree.html?tree=default" class="footer__nav-link">Древо семьи</a>' +
        '<a href="timeline.html" class="footer__nav-link">Летопись</a>' +
        '<a href="blog.html" class="footer__nav-link">Блог</a>' +
        '<a href="faq.html" class="footer__nav-link">Вопросы и ответы</a>' +
        '<a href="about.html" class="footer__nav-link">О сервисе</a>' +
      '</nav>' +
    '</div><div class="footer__bottom"><div class="footer__inner">' +
      '<p class="footer__copy">© 2024–2026 QR-Память · Беларусь</p>' +
      '<p class="footer__copy">' +
        '<a href="privacy.html" class="footer__copy-link">Политика конфиденциальности</a> · ' +
        '<a href="terms.html" class="footer__copy-link">Условия</a>' +
      '</p>' +
    '</div></div></footer>';

  function fill(id, html) {
    var el = document.getElementById(id);
    if (el && el.getAttribute('data-filled') !== '1') {
      el.innerHTML = html;
      el.setAttribute('data-filled', '1');
      return true;
    }
    return false;
  }

  function markActive() {
    var p = location.pathname.split('/').pop();
    if (!p) p = 'index.html';
    var links = document.querySelectorAll('#site-header [data-path]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('data-path') === p) {
        links[i].classList.add('nav__link--active');
      }
    }
  }

  function mountHeader() { if (fill('site-header', HEADER)) markActive(); }
  function mountFooter() { fill('site-footer', FOOTER); }

  mountHeader();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      mountHeader();
      mountFooter();
    });
  } else {
    mountFooter();
  }
})();
