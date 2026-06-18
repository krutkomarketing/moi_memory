'use strict';

/*
 * lib/seo.js — генераторы Schema.org JSON-LD для SEO и GEO (ИИ-выдача).
 *
 * Машиночитаемые факты, которые извлекают Google Rich Results и ИИ-движки
 * (AI Overviews / ChatGPT / Perplexity). Всё — про ПУБЛИЧНЫЙ бренд и публичные
 * страницы памяти. Непубличные профили сюда НЕ попадают (см. ogRenderer).
 */

const BRAND_NAME = 'QR-Память';
const BRAND_DESC =
  'Белорусский сервис для сохранения истории семьи и заказа QR-табличек на памятники: ' +
  'страницы памяти близких (биография, фото, воспоминания), семейное древо и летопись рода. ' +
  'Каждая страница открывается по QR-коду с мемориальной таблички. Есть ИИ-помощник для ' +
  'заполнения и поддержка в Telegram. Языки: русский и белорусский.';

// U+2028 / U+2029 ломают встраивание JSON в <script>; экранируем их и закрывающий тег.
const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

function jsonLdScript(obj) {
  const json = JSON.stringify(obj)
    .replace(/<\/script/gi, '<\\/script')
    .split(LINE_SEP).join('\\u2028')
    .split(PARA_SEP).join('\\u2029');
  return `<script type="application/ld+json">${json}</script>`;
}

function organization(baseUrl) {
  return {
    '@type': 'Organization',
    '@id': `${baseUrl}/#organization`,
    name: BRAND_NAME,
    legalName: BRAND_NAME,
    alternateName: ['Куар-Память', 'Кьюар-Память', 'куар память', 'кьюар память', 'QR память'],
    url: `${baseUrl}/`,
    description: BRAND_DESC,
    areaServed: { '@type': 'Country', name: 'Беларусь' },
    knowsLanguage: ['ru', 'be'],
    // sameAs появятся, когда будут соцсети/контакты
  };
}

function website(baseUrl) {
  return {
    '@type': 'WebSite',
    '@id': `${baseUrl}/#website`,
    name: BRAND_NAME,
    url: `${baseUrl}/`,
    inLanguage: 'ru',
    description: BRAND_DESC,
    publisher: { '@id': `${baseUrl}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${baseUrl}/memory.html?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** Граф для главной: Organization + WebSite. */
function homeGraph(baseUrl) {
  return jsonLdScript({
    '@context': 'https://schema.org',
    '@graph': [organization(baseUrl), website(baseUrl)],
  });
}

/**
 * Person для ПУБЛИЧНОЙ страницы памяти.
 * @param {object} profile  serialized detail (name, years, born, died, city, bio, photo)
 * @param {string} canonicalUrl
 * @param {string} baseUrl
 */
function personGraph(profile, canonicalUrl, baseUrl) {
  const yearsMatch = /(\d{3,4})[^\d]+(\d{3,4})/.exec(profile.years || '');
  const birthYear = yearsMatch ? yearsMatch[1] : null;
  const deathYear = yearsMatch ? yearsMatch[2] : null;

  const person = {
    '@type': 'Person',
    '@id': `${canonicalUrl}#person`,
    name: profile.name || 'Страница памяти',
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
  };
  if (birthYear) person.birthDate = birthYear;
  if (deathYear) person.deathDate = deathYear;
  if (profile.city) person.deathPlace = { '@type': 'Place', name: profile.city };
  if (profile.bio) person.description = String(profile.bio).replace(/\s+/g, ' ').slice(0, 500);
  if (profile.photo) {
    person.image = /^https?:\/\//i.test(profile.photo)
      ? profile.photo
      : `${baseUrl}${profile.photo.startsWith('/') ? '' : '/'}${profile.photo}`;
  }

  const webpage = {
    '@type': 'ProfilePage',
    '@id': canonicalUrl,
    url: canonicalUrl,
    inLanguage: 'ru',
    name: `${profile.name || 'Страница памяти'} — ${BRAND_NAME}`,
    isPartOf: { '@id': `${baseUrl}/#website` },
    mainEntity: { '@id': `${canonicalUrl}#person` },
    breadcrumb: { '@id': `${canonicalUrl}#breadcrumb` },
  };

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': `${canonicalUrl}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${baseUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Страницы памяти', item: `${baseUrl}/memory.html` },
      { '@type': 'ListItem', position: 3, name: profile.name || 'Страница памяти', item: canonicalUrl },
    ],
  };

  return jsonLdScript({
    '@context': 'https://schema.org',
    '@graph': [organization(baseUrl), webpage, person, breadcrumb],
  });
}

/** FAQPage для GEO — ИИ любит вытягивать прямые ответы. */
function faqGraph(baseUrl, qa) {
  return jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${baseUrl}/faq.html#faq`,
    inLanguage: 'ru',
    mainEntity: (qa || []).map((x) => ({
      '@type': 'Question',
      name: x.q,
      acceptedAnswer: { '@type': 'Answer', text: x.a },
    })),
  });
}

module.exports = {
  BRAND_NAME,
  BRAND_DESC,
  jsonLdScript,
  organization,
  website,
  homeGraph,
  personGraph,
  faqGraph,
};
