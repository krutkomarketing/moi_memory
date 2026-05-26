/* ═══════════════════════════════════════════════
   FAVICON — inline SVG candle flame favicon
   Injected once on each page
   ═══════════════════════════════════════════════ */
(function () {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect width="32" height="32" fill="#080808"/>
    <!-- candle body -->
    <rect x="12" y="14" width="8" height="13" rx="1" fill="#d4b483"/>
    <!-- flame outer -->
    <ellipse cx="16" cy="11" rx="4" ry="6" fill="#ff8a3d"/>
    <!-- flame inner -->
    <ellipse cx="16" cy="12" rx="2.5" ry="4" fill="#ffd06c"/>
    <!-- flame core -->
    <ellipse cx="16" cy="13" rx="1" ry="2" fill="#fff5c2"/>
    <!-- wick -->
    <rect x="15.5" y="13" width="1" height="2" rx="0.5" fill="#2a1a08"/>
  </svg>`;

  const link = document.createElement('link');
  link.rel  = 'icon';
  link.type = 'image/svg+xml';
  link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
  document.head.appendChild(link);
})();
