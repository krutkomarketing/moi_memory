'use strict';

const TRANSLIT_MAP = {
  а: 'a',  б: 'b',  в: 'v',  г: 'g',  д: 'd',  е: 'e',  ё: 'yo',
  ж: 'zh', з: 'z',  и: 'i',  й: 'y',  к: 'k',  л: 'l',  м: 'm',
  н: 'n',  о: 'o',  п: 'p',  р: 'r',  с: 's',  т: 't',  у: 'u',
  ф: 'f',  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '',   ы: 'y',  ь: '',   э: 'e',  ю: 'yu', я: 'ya',
  і: 'i',  ї: 'yi', є: 'ye', ґ: 'g',
  ў: 'u',
};

function transliterate(input) {
  return String(input || '')
    .toLowerCase()
    .split('')
    .map((ch) => (TRANSLIT_MAP[ch] !== undefined ? TRANSLIT_MAP[ch] : ch))
    .join('');
}

function slugify(input, maxLen = 80) {
  if (!input) return '';
  const translit = transliterate(input);
  return translit
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/, '');
}

async function generateUniqueSlug(fullName, prismaOrTx, excludeId = null) {
  const crypto = require('node:crypto');
  const base = slugify(fullName) || 'profile';
  let candidate = base;
  let i = 0;
  while (true) {
    const existing = await prismaOrTx.profile.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return candidate;
    i++;
    if (i > 50) {
      return base + '-' + crypto.randomBytes(3).toString('hex');
    }
    candidate = base + '-' + i;
  }
}

module.exports = { slugify, transliterate, generateUniqueSlug };
