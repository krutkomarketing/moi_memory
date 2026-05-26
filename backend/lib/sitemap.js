
'use strict';

/**
 * Генератор XML-карты сайта (Sitemap protocol v0.9).
 *
 * https://www.sitemaps.org/protocol.html
 * Лимиты: 50 000 URL и 50 MB на один файл. У нас сейчас десятки → ок.
 *
 * Если фронт использует другой паттерн URL (например /?profile=slug),
 * поменяй PROFILE_URL_TEMPLATE ниже.
 */

const PROFILE_URL_TEMPLATE = (baseUrl, slug) => `${baseUrl}/profile/${encodeURIComponent(slug)}`;

/**
 * XML-эскейп для значений внутри <loc>, <lastmod> и т.д.
 */
function xmlEscape(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Нормализует base URL: убирает trailing slash, проверяет схему.
 */
function normalizeBaseUrl(raw) {
    if (!raw || typeof raw !== 'string') return 'http://localhost:3000';
    const trimmed = raw.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(trimmed)) return 'http://localhost:3000';
    return trimmed;
}

/**
 * Превращает Date в ISO 8601 (YYYY-MM-DD) для <lastmod>.
 */
function toLastmod(d) {
    if (!d) return null;
    const date = (d instanceof Date) ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

/**
 * Собирает XML карту сайта из массива профилей.
 *
 * @param {object} args
 * @param {string} args.baseUrl   — корневой URL сайта без trailing slash
 * @param {Array<{ slug: string, updatedAt?: Date|string, createdAt?: Date|string }>} args.profiles
 * @returns {string} XML
 */
function buildSitemap({ baseUrl, profiles }) {
    const base = normalizeBaseUrl(baseUrl);
    const rootLastmod = toLastmod(new Date());

    const urls = [];

    // Корень
    urls.push(
        '  <url>\n' +
        `    <loc>${xmlEscape(base + '/')}</loc>\n` +
        `    <lastmod>${rootLastmod}</lastmod>\n` +
        `    <changefreq>daily</changefreq>\n` +
        `    <priority>1.0</priority>\n` +
        '  </url>'
    );

    // Профили
    for (const p of profiles || []) {
        if (!p || !p.slug) continue;
        const lastmod = toLastmod(p.updatedAt || p.createdAt);
        const loc = PROFILE_URL_TEMPLATE(base, p.slug);
        const lines = [
            '  <url>',
            `    <loc>${xmlEscape(loc)}</loc>`,
        ];
        if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
        lines.push('    <changefreq>monthly</changefreq>');
        lines.push('    <priority>0.8</priority>');
        lines.push('  </url>');
        urls.push(lines.join('\n'));
    }

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.join('\n') + '\n' +
        '</urlset>\n'
    );
}

/**
 * robots.txt c указанием Sitemap.
 */
function buildRobotsTxt(baseUrl) {
    const base = normalizeBaseUrl(baseUrl);
    return (
        'User-agent: *\n' +
        'Allow: /\n' +
        'Disallow: /api/\n' +
        'Disallow: /uploads/\n' +
        `Sitemap: ${base}/sitemap.xml\n`
    );
}

module.exports = { buildSitemap, buildRobotsTxt, normalizeBaseUrl };
