'use strict';
const { Prisma } = require('@prisma/client');
const crypto = require('node:crypto');
const prisma = require('../lib/prisma');
const { parseDate, formatDate, getYear } = require('../lib/dates');
const { verifyProfileAccessToken } = require('./codeService');

/* ─── Локальные обёртки над lib/dates ─────────────────── */

function parseFlexibleDate(raw) {
  if (raw == null || raw === '') return null;
  const { date } = parseDate(raw);
  return date;
}

function dateToDisplay(date) {
  if (!date) return '';
  return formatDate(date, 'day');
}

/* ─── Helpers ─────────────────────────────────────────── */

function slugify(text) {
  const base = (text || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return base || 'profile';
}

async function uniqueSlug(base) {
  let candidate = base;
  let i = 0;
  while (await prisma.profile.findUnique({ where: { slug: candidate } })) {
    i++;
    candidate = `${base}-${i}`;
    if (i > 50) {
      candidate = `${base}-${crypto.randomBytes(3).toString('hex')}`;
      break;
    }
  }
  return candidate;
}

async function resolveProfile(idOrSlug) {
  if (!idOrSlug) return null;
  return prisma.profile.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true, slug: true, ownerId: true, visibility: true },
  });
}

function visibilityWhere(actor) {
  if (actor && actor.role === 'ADMIN') return {};
  if (actor) {
    return {
      OR: [
        { visibility: 'PUBLIC' },
        { ownerId: actor.id },
      ],
    };
  }
  return { visibility: 'PUBLIC' };
}
/**
 * Собирает tsquery для Postgres FTS из пользовательского ввода.
 * Каждое слово ≥2 символов получает prefix-match (:*) и соединяется через ' & '.
 * Возвращает null если ничего полезного не нашлось → caller fallback'нется на старый путь.
 *
 * Примеры:
 *   "Иван"          → "иван:*"
 *   "Иван Москва"   → "иван:* & москва:*"
 *   "  / , ! "      → null
 */
function buildTsQuery(q) {
  if (!q || typeof q !== 'string') return null;
  const words = q
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.length >= 2);
  if (words.length === 0) return null;
  return words.map((w) => `${w}:*`).join(' & ');
}
const DEFAULT_BLOCKS = [
  { type: 'CHILDHOOD', title: 'Детство и юность',      order: 0  },
  { type: 'EDUCATION', title: 'Образование',           order: 10 },
  { type: 'CAREER',    title: 'Профессиональный путь', order: 20 },
  { type: 'FAMILY',    title: 'Семья',                 order: 30 },
  { type: 'HOBBIES',   title: 'Хобби и увлечения',     order: 40 },
  { type: 'LEGACY',    title: 'Наследие',              order: 50 },
];
/* ─── Serializers ─────────────────────────────────────── */

function serializeForList(profile) {
  return {
    id: profile.id,
    slug: profile.slug,
    name: profile.fullName,
    born: profile.birthDate ? dateToDisplay(profile.birthDate) : '',
    died: profile.deathDate ? dateToDisplay(profile.deathDate) : '',
    years: yearsString(profile.birthDate, profile.deathDate),
    city: profile.burialPlace || '',
    photo: profile.coverPhoto ? profile.coverPhoto.url : '',
    bio: profile.bio ? profile.bio.slice(0, 200) : '',
    gender: (profile.gender || 'UNKNOWN').toLowerCase(),
    visibility: profile.visibility,
  };
}

function yearsString(birth, death) {
  const b = getYear(birth);
  const d = getYear(death);
  if (b && d) return `${b} — ${d}`;
  if (b) return `${b} — …`;
  if (d) return `… — ${d}`;
  return '';
}

function serializeForDetail(profile) {
  const SECTION_BY_TYPE = {
    CHILDHOOD: 'childhood',
    EDUCATION: 'education',
    CAREER:    'career',
    FAMILY:    'family',
    HOBBIES:   'hobbies',
    LEGACY:    'legacy',
  };

  const sections = {};
  let customIdx = 1;
  const blocks = (profile.blocks || []).filter((b) => !b.isHidden);
  for (const b of blocks) {
    const key = SECTION_BY_TYPE[b.type] || ('custom' + customIdx++);
    sections[key] = {
      title: b.title || '',
      text:  b.body  || '',
      image: b.photo ? b.photo.url : '',
    };
  }

  const media = (profile.galleryItems || []).map((g) => ({
    src:     g.media ? g.media.url : '',
    caption: g.caption || '',
  }));

  const reviews = (profile.guestMemories || [])
    .filter((m) => m.isApproved)
    .map((m) => ({
      id:     m.id,
      author: m.authorName,
      text:   m.text || '',
      photo:  m.media && m.media.kind === 'IMAGE' ? m.media.url : null,
    }));

  return {
    id:           profile.id,
    slug:         profile.slug,
    name:         profile.fullName,
    born:         profile.birthDate ? dateToDisplay(profile.birthDate) : '',
    died:         profile.deathDate ? dateToDisplay(profile.deathDate) : '',
    years:        yearsString(profile.birthDate, profile.deathDate),
    city:         profile.burialPlace || '',
    bio:          profile.bio || '',
    photo:        profile.coverPhoto ? profile.coverPhoto.url : '',
    gender:       (profile.gender || 'UNKNOWN').toLowerCase(),
    visibility:   profile.visibility,
    burial:       profile.burialPlace || '',
    burial_query: profile.burialPlace || '',
    sections,
    media,
    reviews,
    quotes: [],
  };
}

/**
 * Урезанный вид для PASSWORD-страницы без валидного access-токена.
 * Возвращает только то, что нужно, чтобы показать форму ввода PIN.
 */
function serializeTeaser(profile) {
  return {
    id:                  profile.id,
    slug:                profile.slug,
    name:                profile.fullName,
    born:                profile.birthDate ? dateToDisplay(profile.birthDate) : '',
    died:                profile.deathDate ? dateToDisplay(profile.deathDate) : '',
    years:               yearsString(profile.birthDate, profile.deathDate),
    photo:               profile.coverPhoto ? profile.coverPhoto.url : '',
    visibility:          profile.visibility,
    requiresAccessCode:  true,
    isProtected:         true,
    sections:            {},
    media:               [],
    reviews:             [],
    quotes:              [],
  };
}

/* ─── Normalizers ─────────────────────────────────────── */

function normalizeGender(g) {
  if (!g) return 'UNKNOWN';
  const s = g.toString().toUpperCase();
  if (s === 'M' || s === 'MALE'   || s === 'М' || s === 'МУЖ' || s === 'МУЖСКОЙ')   return 'MALE';
  if (s === 'F' || s === 'FEMALE' || s === 'Ж' || s === 'ЖЕН' || s === 'ЖЕНСКИЙ')   return 'FEMALE';
  return 'UNKNOWN';
}

function normalizeVisibility(v) {
  if (!v) return null;
  const s = v.toString().toUpperCase();
  if (['PUBLIC', 'UNLISTED', 'PASSWORD', 'PRIVATE'].includes(s)) return s;
  return null;
}

/* ─── PUBLIC API ──────────────────────────────────────── */

async function listProfiles({ page = 1, limit = 9, q = '', city = '', actor = null } = {}) {
  const tsQuery = buildTsQuery(q);
  const offset  = (page - 1) * limit;

  /* ── FAST PATH: запрос без поиска — старая логика через findMany ──────── */
  if (!tsQuery) {
    const where = visibilityWhere(actor);
    if (city) {
      where.AND = where.AND || [];
      where.AND.push({ burialPlace: { contains: city, mode: 'insensitive' } });
    }
    const [total, rows] = await Promise.all([
      prisma.profile.count({ where }),
      prisma.profile.findMany({
        where,
        orderBy: [{ birthDate: 'asc' }, { fullName: 'asc' }],
        skip:  offset,
        take:  limit,
        include: { coverPhoto: true },
      }),
    ]);
    return { items: rows.map(serializeForList), total };
  }

  /* ── FTS PATH: searchVector @@ to_tsquery(...) + ts_rank_cd ─────────────── */

  // visibility filter как Prisma.sql фрагмент
  const visFilter = (() => {
    if (actor && actor.role === 'ADMIN') return Prisma.empty;
    if (actor) return Prisma.sql`AND (p."visibility" = 'PUBLIC' OR p."ownerId" = ${actor.id})`;
    return Prisma.sql`AND p."visibility" = 'PUBLIC'`;
  })();

  // city filter
  const cityFilter = city
    ? Prisma.sql`AND p."burialPlace" ILIKE ${'%' + city + '%'}`
    : Prisma.empty;

  // tsquery-фрагмент (параметризован — безопасно)
  const tsq = Prisma.sql`to_tsquery('russian', ${tsQuery})`;

  const rows = await prisma.$queryRaw`
    SELECT
      p.id, p.slug, p."fullName", p."birthDate", p."deathDate",
      p."burialPlace", p.bio, p.gender, p.visibility, p."coverPhotoId",
      m.url AS "coverUrl",
      ts_rank_cd(p."searchVector", ${tsq}) AS rank
    FROM "Profile" p
    LEFT JOIN "Media" m ON m.id = p."coverPhotoId"
    WHERE p."searchVector" @@ ${tsq}
      ${cityFilter}
      ${visFilter}
    ORDER BY rank DESC, p."fullName" ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const totalRow = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total
    FROM "Profile" p
    WHERE p."searchVector" @@ ${tsq}
      ${cityFilter}
      ${visFilter}
  `;

  const items = rows.map((r) => serializeForList({
    id:           r.id,
    slug:         r.slug,
    fullName:     r.fullName,
    birthDate:    r.birthDate,
    deathDate:    r.deathDate,
    burialPlace:  r.burialPlace,
    bio:          r.bio,
    gender:       r.gender,
    visibility:   r.visibility,
    coverPhoto:   r.coverUrl ? { url: r.coverUrl } : null,
  }));

  return { items, total: totalRow[0]?.total ?? 0 };
}

/**
 * @param {string} idOrSlug
 * @param {object|null} actor — req.user
 * @param {object} [options]
 * @param {string} [options.accessToken] — PIN-токен с фронта (header x-profile-access или query ?accessToken=)
 */
async function getProfileDetail(idOrSlug, actor = null, options = {}) {
  const profile = await prisma.profile.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: {
      coverPhoto: true,
      blocks: {
        orderBy: { order: 'asc' },
        include: { photo: true },
      },
      galleryItems: {
        orderBy: { order: 'asc' },
        include: { media: true },
      },
      guestMemories: {
        orderBy: { createdAt: 'desc' },
        include: { media: true },
      },
    },
  });

  if (!profile) {
    const err = new Error('profile_not_found');
    err.status = 404;
    throw err;
  }

  const isAdmin = !!actor && actor.role === 'ADMIN';
  const isOwner = !!actor && profile.ownerId === actor.id;

  // PRIVATE — только владелец или ADMIN; всем остальным 404 (не раскрываем существование)
  if (profile.visibility === 'PRIVATE' && !isOwner && !isAdmin) {
    const err = new Error('profile_not_found');
    err.status = 404;
    throw err;
  }

  // PASSWORD — нужен валидный access-токен (или owner/ADMIN)
  if (profile.visibility === 'PASSWORD' && !isOwner && !isAdmin) {
    const token = options.accessToken;
    if (!token || !verifyProfileAccessToken(token, profile.id)) {
      return serializeTeaser(profile);
    }
  }

  return serializeForDetail(profile);
}
async function createProfile(input, actor, options = {}) {
  if (!actor) {
    const err = new Error('auth_required');
    err.status = 401;
    throw err;
  }

  const fullName = (input.name || input.fullName || '').toString().trim().slice(0, 200);
  if (!fullName) {
    const err = new Error('name_required');
    err.status = 400;
    throw err;
  }

  const slug = await uniqueSlug(slugify(fullName));
  const birthDate = parseFlexibleDate(input.born || input.birthDate);
  const deathDate = parseFlexibleDate(input.died || input.deathDate);

  const skipDefaultBlocks = options.skipDefaultBlocks === true;

  const created = await prisma.$transaction(async (tx) => {
    const profile = await tx.profile.create({
      data: {
        slug,
        fullName,
        birthDate,
        deathDate,
        burialPlace: (input.city || input.burialPlace || '').toString().slice(0, 200) || null,
        bio:         (input.bio  || '').toString().slice(0, 5000) || null,
        gender:      normalizeGender(input.gender),
        visibility:  normalizeVisibility(input.visibility) || 'PUBLIC',
        ownerId:     actor.id,
      },
      include: { coverPhoto: true },
    });

    if (!skipDefaultBlocks) {
      await tx.contentBlock.createMany({
        data: DEFAULT_BLOCKS.map((b) => ({
          profileId: profile.id,
          type:      b.type,
          title:     b.title,
          body:      '',
          order:     b.order,
          isHidden:  false,
        })),
      });
    }

    return profile;
  });

  return serializeForList(created);
}

async function updateProfile(idOrSlug, updates, actor) {
  const profile = await resolveProfile(idOrSlug);
  if (!profile) {
    const err = new Error('profile_not_found');
    err.status = 404;
    throw err;
  }

  const data = {};
  if (updates.name !== undefined || updates.fullName !== undefined) {
    const newName = (updates.name || updates.fullName || '').toString().trim().slice(0, 200);
    if (newName) data.fullName = newName;
  }
  if (updates.born !== undefined || updates.birthDate !== undefined) {
    data.birthDate = parseFlexibleDate(updates.born || updates.birthDate);
  }
  if (updates.died !== undefined || updates.deathDate !== undefined) {
    data.deathDate = parseFlexibleDate(updates.died || updates.deathDate);
  }
  if (updates.city !== undefined || updates.burialPlace !== undefined) {
    const place = (updates.city || updates.burialPlace || '').toString().slice(0, 200);
    data.burialPlace = place || null;
  }
  if (updates.bio !== undefined) {
    data.bio = (updates.bio || '').toString().slice(0, 5000) || null;
  }
  if (updates.gender !== undefined) {
    data.gender = normalizeGender(updates.gender);
  }
  if (updates.visibility !== undefined) {
    const v = normalizeVisibility(updates.visibility);
    if (v) data.visibility = v;
  }

  if (Object.keys(data).length === 0) {
    return serializeForList(await prisma.profile.findUnique({
      where: { id: profile.id },
      include: { coverPhoto: true },
    }));
  }

  const updated = await prisma.profile.update({
    where: { id: profile.id },
    data,
    include: { coverPhoto: true },
  });
  return serializeForList(updated);
}

async function deleteProfile(idOrSlug, actor) {
  const profile = await resolveProfile(idOrSlug);
  if (!profile) {
    const err = new Error('profile_not_found');
    err.status = 404;
    throw err;
  }
  await prisma.profile.delete({ where: { id: profile.id } });
  return { ok: true };
}

module.exports = {
  listProfiles,
  getProfileDetail,
  createProfile,
  updateProfile,
  deleteProfile,
  resolveProfile,
  serializeForList,
  serializeForDetail,
  serializeTeaser,
};