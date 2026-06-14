
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

// ВАЖНО: публичная каноническая страница памяти — это /p/<slug> (SSR Open Graph via backend /p/ handler
// which injects metas into the person.html shell + client loader supports the path directly).
// This enables clean QR codes on physical plaques, good share previews, and sitemap entries.
// (Previously /profile/<slug> caused 404s in search results.)
const PROFILE_URL_TEMPLATE = (baseUrl, slug) => `${baseUrl}/p/${encodeURIComponent(slug)}`;

// Публичные статические страницы для индексации (служебные/приватные НЕ включаем).
// changefreq/priority — подсказки для краулеров.
const STATIC_PATHS = [
    { path: '/memory.html',      changefreq: 'daily',   priority: '0.9' },
    { path: '/family-tree.html', changefreq: 'weekly',  priority: '0.7' },
    { path: '/timeline.html',    changefreq: 'weekly',  priority: '0.6' },
    { path: '/about.html',       changefreq: 'monthly', priority: '0.7' },
    { path: '/faq.html',         changefreq: 'monthly', priority: '0.7' },
    { path: '/blog.html',        changefreq: 'weekly',  priority: '0.7' },
    { path: '/qr-memory-vs-analogi.html',                          changefreq: 'monthly', priority: '0.7' },
    { path: '/blog-pochemu-zabyvayut-korni.html',                  changefreq: 'monthly', priority: '0.6' },
    { path: '/blog-qr-tablichka-na-pamyatnik.html',                changefreq: 'monthly', priority: '0.6' },
    { path: '/blog-qr-kod-kak-rabotaet.html',                      changefreq: 'monthly', priority: '0.6' },
    { path: '/blog-cifrovaya-stranica-pamyati.html',              changefreq: 'monthly', priority: '0.6' },
    { path: '/blog-semejnoe-drevo-onlajn.html',                    changefreq: 'monthly', priority: '0.6' },
    { path: '/blog-virtualnye-ekskursii-istoricheskie-mesta.html', changefreq: 'monthly', priority: '0.6' },
    { path: '/privacy.html',     changefreq: 'yearly',  priority: '0.3' },
    { path: '/terms.html',       changefreq: 'yearly',  priority: '0.3' },
];

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

    // Публичные статические страницы
    for (const s of STATIC_PATHS) {
        urls.push(
            '  <url>\n' +
            `    <loc>${xmlEscape(base + s.path)}</loc>\n` +
            `    <lastmod>${rootLastmod}</lastmod>\n` +
            `    <changefreq>${s.changefreq}</changefreq>\n` +
            `    <priority>${s.priority}</priority>\n` +
            '  </url>'
        );
    }

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
 * robots.txt.
 *
 * Стратегия:
 *  - Пускаем поисковые и ИИ-краулеры (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot)
 *    на ПУБЛИЧНЫЙ контент — это нужно, чтобы попадать в ИИ-выдачу (AI Overviews / ChatGPT / Perplexity).
 *  - Запрещаем всем /api/, /uploads/ и служебные/приватные страницы (admin, audit, trash, legacy,
 *    смена пароля) — чтобы непубличные данные не утекали в индекс/обучение.
 *  - Непубличные страницы памяти дополнительно помечаются noindex в SSR (см. ogRenderer).
 */
const DISALLOWED_PATHS = [
    '/api/',
    '/uploads/',
    '/admin.html',
    '/audit.html',
    '/trash.html',
    '/legacy-contact.html',
    '/forgot-password.html',
    '/reset-password.html',
    '/ai-mockup.html',          // дизайн-макет, не для индекса
    '/ai-constructor-test.html', // тестовая страница, не для индекса
];

// ИИ-краулеры, которым явно разрешаем публичный контент.
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'PerplexityBot', 'Google-Extended', 'CCBot', 'Applebot-Extended'];

function buildRobotsTxt(baseUrl) {
    const base = normalizeBaseUrl(baseUrl);
    const disallow = DISALLOWED_PATHS.map((p) => `Disallow: ${p}`).join('\n');

    const blocks = [];
    // Общий блок для всех
    blocks.push(`User-agent: *\nAllow: /\n${disallow}`);
    // Явные блоки для ИИ-ботов (тот же доступ: публичное — да, служебное — нет)
    for (const bot of AI_BOTS) {
        blocks.push(`User-agent: ${bot}\nAllow: /\n${disallow}`);
    }

    return blocks.join('\n\n') + `\n\nSitemap: ${base}/sitemap.xml\n`;
}

module.exports = { buildSitemap, buildRobotsTxt, normalizeBaseUrl };
