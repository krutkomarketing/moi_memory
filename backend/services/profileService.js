'use strict';

const { Prisma } = require('@prisma/client');
const prisma = require('../lib/prisma');
const { generateUniqueSlug } = require('../lib/slug');
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

/**
 * Resolve a profile by id or slug.
 * By default ignores soft-deleted (deletedAt != null).
 * Pass { includeDeleted: true } to opt-in.
 */
async function resolveProfile(idOrSlug, { includeDeleted = false } = {}) {
    if (!idOrSlug) return null;
    const where = { OR: [{ id: idOrSlug }, { slug: idOrSlug }] };
    if (!includeDeleted) where.deletedAt = null;
    return prisma.profile.findFirst({
        where,
        select: { id: true, slug: true, ownerId: true, visibility: true, deletedAt: true },
    });
}

/**
 * Visibility-фильтр для списков (alive only).
 * deletedAt: null — всегда применяется, даже для ADMIN.
 * Для trash используется отдельная функция listDeletedProfiles.
 */
function visibilityWhere(actor) {
    const alive = { deletedAt: null };
    if (actor && actor.role === 'ADMIN') return alive;
    if (actor) {
        return {
            ...alive,
            OR: [{ visibility: 'PUBLIC' }, { ownerId: actor.id }],
        };
    }
    return { ...alive, visibility: 'PUBLIC' };
}

function parseYear(raw) {
    if (raw == null || raw === '') return null;
    const n = parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 2999) return null;
    return n;
}

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
        deletedAt: profile.deletedAt || null,
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
        deletedAt: profile.deletedAt || null,
    };
}

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

function parseGenderFilter(g) {
    if (!g) return null;
    const s = g.toString().toUpperCase();
    if (s === 'M' || s === 'MALE'    || s === 'М' || s === 'МУЖ' || s === 'МУЖСКОЙ')   return 'MALE';
    if (s === 'F' || s === 'FEMALE'  || s === 'Ж' || s === 'ЖЕН' || s === 'ЖЕНСКИЙ')   return 'FEMALE';
    if (s === 'UNKNOWN' || s === 'U' || s === 'НЕИЗВЕСТНО')                            return 'UNKNOWN';
    return null;
}

function normalizeVisibility(v) {
    if (!v) return null;
    const s = v.toString().toUpperCase();
    if (['PUBLIC', 'UNLISTED', 'PASSWORD', 'PRIVATE'].includes(s)) return s;
    return null;
}

/* ─── PUBLIC API ──────────────────────────────────────── */

async function listProfiles(opts = {}) {
    const {
        page = 1,
        limit = 9,
        q = '',
        city = '',
        bornYearFrom: bornFromRaw = null,
        bornYearTo:   bornToRaw   = null,
        diedYearFrom: diedFromRaw = null,
        diedYearTo:   diedToRaw   = null,
        gender:       genderRaw      = '',
        visibility:   visibilityRaw  = '',
        actor = null,
    } = opts;

    const tsQuery = buildTsQuery(q);
    const offset  = (page - 1) * limit;

    const bornFrom = parseYear(bornFromRaw);
    const bornTo   = parseYear(bornToRaw);
    const diedFrom = parseYear(diedFromRaw);
    const diedTo   = parseYear(diedToRaw);
    const gender   = parseGenderFilter(genderRaw);
    const reqVis   = normalizeVisibility(visibilityRaw);

    let visibilityHardFilter = null;
    let visibilityHardFilterSql = null;
    let forceEmpty = false;

    if (reqVis) {
        if (actor && actor.role === 'ADMIN') {
            visibilityHardFilter = { visibility: reqVis, deletedAt: null };
            visibilityHardFilterSql = Prisma.sql`AND p."visibility"::text = ${reqVis}`;
        } else if (actor) {
            if (reqVis === 'PUBLIC') {
                visibilityHardFilter = { visibility: 'PUBLIC', deletedAt: null };
                visibilityHardFilterSql = Prisma.sql`AND p."visibility" = 'PUBLIC'`;
            } else {
                visibilityHardFilter = { visibility: reqVis, ownerId: actor.id, deletedAt: null };
                visibilityHardFilterSql = Prisma.sql`AND p."visibility"::text = ${reqVis} AND p."ownerId" = ${actor.id}`;
            }
        } else {
            if (reqVis === 'PUBLIC') {
                visibilityHardFilter = { visibility: 'PUBLIC', deletedAt: null };
                visibilityHardFilterSql = Prisma.sql`AND p."visibility" = 'PUBLIC'`;
            } else {
                forceEmpty = true;
            }
        }
    }
    if (forceEmpty) return { items: [], total: 0 };

    /* FAST PATH */
    if (!tsQuery) {
        const baseWhere = visibilityHardFilter ? visibilityHardFilter : visibilityWhere(actor);
        const andClauses = [];
        if (city) andClauses.push({ burialPlace: { contains: city, mode: 'insensitive' } });
        if (bornFrom != null || bornTo != null) {
            const f = {};
            if (bornFrom != null) f.gte = new Date(Date.UTC(bornFrom, 0, 1));
            if (bornTo   != null) f.lte = new Date(Date.UTC(bornTo, 11, 31, 23, 59, 59, 999));
            andClauses.push({ birthDate: f });
        }
        if (diedFrom != null || diedTo != null) {
            const f = {};
            if (diedFrom != null) f.gte = new Date(Date.UTC(diedFrom, 0, 1));
            if (diedTo   != null) f.lte = new Date(Date.UTC(diedTo, 11, 31, 23, 59, 59, 999));
            andClauses.push({ deathDate: f });
        }
        if (gender) andClauses.push({ gender });

        const where = andClauses.length ? { AND: [baseWhere, ...andClauses] } : baseWhere;

        const [total, rows] = await Promise.all([
            prisma.profile.count({ where }),
            prisma.profile.findMany({
                where,
                orderBy: [{ birthDate: 'asc' }, { fullName: 'asc' }],
                skip: offset,
                take: limit,
                include: { coverPhoto: true },
            }),
        ]);
        return { items: rows.map(serializeForList), total };
    }

    /* FTS PATH — всегда дополнительно фильтруем deletedAt IS NULL */
    const aliveSql = Prisma.sql`AND p."deletedAt" IS NULL`;
    const visFilter = (() => {
        if (visibilityHardFilterSql) return visibilityHardFilterSql;
        if (actor && actor.role === 'ADMIN') return Prisma.empty;
        if (actor) return Prisma.sql`AND (p."visibility" = 'PUBLIC' OR p."ownerId" = ${actor.id})`;
        return Prisma.sql`AND p."visibility" = 'PUBLIC'`;
    })();

    const cityFilter      = city ? Prisma.sql`AND p."burialPlace" ILIKE ${'%' + city + '%'}` : Prisma.empty;
    const bornFromFilter  = bornFrom != null ? Prisma.sql`AND p."birthDate" >= ${new Date(Date.UTC(bornFrom, 0, 1))}` : Prisma.empty;
    const bornToFilter    = bornTo   != null ? Prisma.sql`AND p."birthDate" <= ${new Date(Date.UTC(bornTo, 11, 31, 23, 59, 59, 999))}` : Prisma.empty;
    const diedFromFilter  = diedFrom != null ? Prisma.sql`AND p."deathDate" >= ${new Date(Date.UTC(diedFrom, 0, 1))}` : Prisma.empty;
    const diedToFilter    = diedTo   != null ? Prisma.sql`AND p."deathDate" <= ${new Date(Date.UTC(diedTo, 11, 31, 23, 59, 59, 999))}` : Prisma.empty;
    const genderFilter    = gender   ? Prisma.sql`AND p."gender"::text = ${gender}` : Prisma.empty;

    const tsq = Prisma.sql`to_tsquery('russian', ${tsQuery})`;
    const rows = await prisma.$queryRaw`
        SELECT
            p.id, p.slug, p."fullName", p."birthDate", p."deathDate",
            p."burialPlace", p.bio, p.gender, p.visibility, p."deletedAt",
            p."coverPhotoId",
            m.url AS "coverUrl",
            ts_rank_cd(p."searchVector", ${tsq}) AS rank
        FROM "Profile" p
        LEFT JOIN "Media" m ON m.id = p."coverPhotoId"
        WHERE p."searchVector" @@ ${tsq}
          ${aliveSql}
          ${cityFilter}
          ${bornFromFilter}
          ${bornToFilter}
          ${diedFromFilter}
          ${diedToFilter}
          ${genderFilter}
          ${visFilter}
        ORDER BY rank DESC, p."fullName" ASC
        LIMIT ${limit} OFFSET ${offset}
    `;
    const totalRow = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS total
        FROM "Profile" p
        WHERE p."searchVector" @@ ${tsq}
          ${aliveSql}
          ${cityFilter}
          ${bornFromFilter}
          ${bornToFilter}
          ${diedFromFilter}
          ${diedToFilter}
          ${genderFilter}
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
        deletedAt:    r.deletedAt,
        coverPhoto:   r.coverUrl ? { url: r.coverUrl } : null,
    }));
    return { items, total: totalRow[0]?.total ?? 0 };
}

/**
 * Список soft-deleted профилей. ADMIN видит все; обычный юзер — только свои.
 */
async function listDeletedProfiles(opts = {}) {
    const { page = 1, limit = 20, actor = null } = opts;
    if (!actor) {
        const err = new Error('auth_required'); err.status = 401; throw err;
    }
    const where = { deletedAt: { not: null } };
    if (actor.role !== 'ADMIN') where.ownerId = actor.id;

    const offset = (page - 1) * limit;
    const [total, rows] = await Promise.all([
        prisma.profile.count({ where }),
        prisma.profile.findMany({
            where,
            orderBy: { deletedAt: 'desc' },
            skip: offset,
            take: limit,
            include: { coverPhoto: true },
        }),
    ]);
    return { items: rows.map(serializeForList), total };
}

async function getProfileDetail(idOrSlug, actor = null, options = {}) {
    const isAdmin = !!actor && actor.role === 'ADMIN';
    const profile = await prisma.profile.findFirst({
        where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
        include: {
            coverPhoto: true,
            blocks: { orderBy: { order: 'asc' }, include: { photo: true } },
            galleryItems: { orderBy: { order: 'asc' }, include: { media: true } },
            guestMemories: { orderBy: { createdAt: 'desc' }, include: { media: true } },
        },
    });
    if (!profile) {
        const err = new Error('profile_not_found'); err.status = 404; throw err;
    }

    const isOwner = !!actor && profile.ownerId === actor.id;

    // Soft-deleted: видят только owner и ADMIN (для возможного restore)
    if (profile.deletedAt && !isOwner && !isAdmin) {
        const err = new Error('profile_not_found'); err.status = 404; throw err;
    }

    if (profile.visibility === 'PRIVATE' && !isOwner && !isAdmin) {
        const err = new Error('profile_not_found'); err.status = 404; throw err;
    }

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
        const err = new Error('auth_required'); err.status = 401; throw err;
    }

    const fullName = (input.name || input.fullName || '').toString().trim().slice(0, 200);
    if (!fullName) {
        const err = new Error('name_required'); err.status = 400; throw err;
    }

    const birthDate = parseFlexibleDate(input.born || input.birthDate);
    const deathDate = parseFlexibleDate(input.died || input.deathDate);

    const skipDefaultBlocks = options.skipDefaultBlocks === true;

    const created = await prisma.$transaction(async (tx) => {
        const slug = await generateUniqueSlug(fullName, tx);
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
    // Не даём редактировать soft-deleted (нужно restore сначала)
    const profile = await resolveProfile(idOrSlug);
    if (!profile) {
        const err = new Error('profile_not_found'); err.status = 404; throw err;
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
            where: { id: profile.id }, include: { coverPhoto: true },
        }));
    }

    const updated = await prisma.profile.update({
        where: { id: profile.id }, data, include: { coverPhoto: true },
    });
    return serializeForList(updated);
}

/**
 * Soft delete by default. Pass { hard: true } для hard-delete (ADMIN only).
 */
async function deleteProfile(idOrSlug, actor, { hard = false } = {}) {
    // Здесь ищем включая soft-deleted, чтобы можно было hard-удалить уже soft-deleted
    const profile = await resolveProfile(idOrSlug, { includeDeleted: true });
    if (!profile) {
        const err = new Error('profile_not_found'); err.status = 404; throw err;
    }

    if (hard) {
        if (!actor || actor.role !== 'ADMIN') {
            const err = new Error('admin_required'); err.status = 403; throw err;
        }
        await prisma.profile.delete({ where: { id: profile.id } });
        return { ok: true, hard: true, id: profile.id };
    }

    // Soft delete (idempotent: если уже удалён — не трогаем deletedAt)
    if (profile.deletedAt) {
        return { ok: true, hard: false, id: profile.id, deletedAt: profile.deletedAt, alreadyDeleted: true };
    }

    const updated = await prisma.profile.update({
        where: { id: profile.id },
        data: { deletedAt: new Date() },
        select: { id: true, deletedAt: true },
    });
    return { ok: true, hard: false, id: updated.id, deletedAt: updated.deletedAt };
}

async function restoreProfile(idOrSlug, actor) {
    if (!actor) {
        const err = new Error('auth_required'); err.status = 401; throw err;
    }
    const profile = await resolveProfile(idOrSlug, { includeDeleted: true });
    if (!profile) {
        const err = new Error('profile_not_found'); err.status = 404; throw err;
    }
    const isOwner = profile.ownerId === actor.id;
    const isAdmin = actor.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
        const err = new Error('forbidden'); err.status = 403; throw err;
    }
    if (!profile.deletedAt) {
        const err = new Error('not_deleted'); err.status = 400; throw err;
    }
    const restored = await prisma.profile.update({
        where: { id: profile.id },
        data: { deletedAt: null },
        include: { coverPhoto: true },
    });
    return serializeForList(restored);
}

module.exports = {
    listProfiles,
    listDeletedProfiles,
    getProfileDetail,
    createProfile,
    updateProfile,
    deleteProfile,
    restoreProfile,
    resolveProfile,
    serializeForList,
    serializeForDetail,
    serializeTeaser,
};
