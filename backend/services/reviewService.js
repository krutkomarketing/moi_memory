'use strict';

const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errors');

/* mapping старого фронта → DB enum */
const REVIEW_TYPE_TO_DB = {
    text:   'TEXT',
    photo:  'PHOTO',
    audio:  'AUDIO',
    video:  'VIDEO',
    quote:  'TEXT',
    memory: 'TEXT',
};

function serialize(m, { includeModeration = false } = {}) {
    const base = {
        id:           m.id,
        author:       m.authorName,
        text:         m.text || '',
        reviewType:   (m.type || 'TEXT').toLowerCase(),
        photoDataUrl: m.media?.url || null,
        created_at:   m.createdAt,
    };
    if (includeModeration) {
        base.isApproved   = m.isApproved;
        base.approvedAt   = m.approvedAt;
        base.approvedById = m.approvedById;
    }
    return base;
}

async function findProfileMin(idOrSlug) {
    const p = await prisma.profile.findFirst({
        where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
        select: { id: true, visibility: true, ownerId: true },
    });
    if (!p) throw ApiError.notFound('Профиль не найден');
    return p;
}

function isOwnerOrAdmin(profile, actor) {
    if (!actor) return false;
    if (actor.role === 'ADMIN') return true;
    return profile.ownerId === actor.id;
}

/**
 * Публичный список: только одобренные.
 * Если actor — owner/ADMIN, добавляются и pending (с пометкой isApproved=false).
 */
async function list(idOrSlug, actor = null) {
    const profile = await findProfileMin(idOrSlug);
    const canSeeAll = isOwnerOrAdmin(profile, actor);

    const memories = await prisma.guestMemory.findMany({
        where: {
            profileId: profile.id,
            ...(canSeeAll ? {} : { isApproved: true }),
        },
        include: { media: true },
        orderBy: { createdAt: 'desc' },
    });
    return memories.map((m) => serialize(m, { includeModeration: canSeeAll }));
}

/**
 * Список только pending — для owner/ADMIN.
 */
async function listPending(idOrSlug, actor) {
    const profile = await findProfileMin(idOrSlug);
    if (!isOwnerOrAdmin(profile, actor)) {
        throw ApiError.forbidden('Только владелец или администратор');
    }
    const memories = await prisma.guestMemory.findMany({
        where: { profileId: profile.id, isApproved: false },
        include: { media: true },
        orderBy: { createdAt: 'desc' },
    });
    return memories.map((m) => serialize(m, { includeModeration: true }));
}

/**
 * Создание воспоминания.
 * По умолчанию isApproved=false (требует модерации).
 * Если автор — owner/ADMIN, авто-аппрув.
 */
async function create(idOrSlug, data, viewerId) {
    const author = (data.author || '').toString().trim().slice(0, 120);
    const text   = (data.text   || '').toString().trim().slice(0, 4000);
    if (!author || !text) throw ApiError.badRequest('author и text обязательны');

    const profile = await findProfileMin(idOrSlug);

    if (profile.visibility === 'PRIVATE' && profile.ownerId !== viewerId) {
        throw ApiError.forbidden('Профиль закрыт');
    }

    const type = REVIEW_TYPE_TO_DB[data.reviewType] || 'TEXT';

    let mediaId = null;
    if (data.photoDataUrl && /^\/uploads\//.test(data.photoDataUrl)) {
        const media = await prisma.media.findFirst({ where: { url: data.photoDataUrl } });
        if (media) mediaId = media.id;
    }

    // Авто-аппрув если автор — owner или ADMIN (через User.role)
    let autoApprove = false;
    if (viewerId) {
        if (profile.ownerId === viewerId) {
            autoApprove = true;
        } else {
            const u = await prisma.user.findUnique({
                where: { id: viewerId },
                select: { role: true },
            });
            if (u?.role === 'ADMIN') autoApprove = true;
        }
    }

    const memory = await prisma.guestMemory.create({
        data: {
            profileId:    profile.id,
            authorUserId: viewerId || null,
            authorName:   author,
            type,
            text,
            mediaId,
            isApproved:   autoApprove,
            approvedAt:   autoApprove ? new Date() : null,
            approvedById: autoApprove ? viewerId : null,
        },
        include: { media: true },
    });

    return serialize(memory, { includeModeration: true });
}

async function approve(memoryId, actorId, actorRole) {
    const m = await prisma.guestMemory.findUnique({
        where: { id: memoryId },
        include: { profile: { select: { ownerId: true } } },
    });
    if (!m) throw ApiError.notFound('Воспоминание не найдено');
    if (actorRole !== 'ADMIN' && m.profile.ownerId !== actorId) {
        throw ApiError.forbidden('Нет прав на модерацию');
    }
    if (m.isApproved) return serialize(m, { includeModeration: true });

    const updated = await prisma.guestMemory.update({
        where: { id: memoryId },
        data:  {
            isApproved:   true,
            approvedAt:   new Date(),
            approvedById: actorId,
        },
        include: { media: true },
    });
    return serialize(updated, { includeModeration: true });
}

/**
 * Отклонение = удаление записи. Альтернатива — soft-reject через флаг,
 * но в схеме его сейчас нет, поэтому удаляем (с правами модератора).
 */
async function reject(memoryId, actorId, actorRole) {
    const m = await prisma.guestMemory.findUnique({
        where: { id: memoryId },
        include: { profile: { select: { ownerId: true } } },
    });
    if (!m) throw ApiError.notFound('Воспоминание не найдено');
    if (actorRole !== 'ADMIN' && m.profile.ownerId !== actorId) {
        throw ApiError.forbidden('Нет прав на модерацию');
    }
    await prisma.guestMemory.delete({ where: { id: memoryId } });
    return { ok: true, deleted: memoryId };
}

async function del(memoryId, userId, userRole) {
    const m = await prisma.guestMemory.findUnique({
        where: { id: memoryId },
        include: { profile: { select: { ownerId: true } } },
    });
    if (!m) throw ApiError.notFound('Воспоминание не найдено');
    if (userRole !== 'ADMIN' && m.profile.ownerId !== userId) {
        throw ApiError.forbidden('Нет прав на удаление');
    }
    await prisma.guestMemory.delete({ where: { id: memoryId } });
    return { ok: true };
}

module.exports = { list, listPending, create, approve, reject, del };