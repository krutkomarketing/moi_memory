
'use strict';

/*
 * accessService.js — ProfileAccess grants CRUD
 *
 * Управление доступом к профилю на уровне сущности (RBAC):
 *   - owner / ADMIN могут выдать другому пользователю view / edit доступ
 *   - запись в ProfileAccess читается existing middleware/requireProfileAccess.js
 *     для PASSWORD / PRIVATE профилей и для edit-операций
 *
 * Контракт API:
 *   GET    /api/profiles/:idOrSlug/access            → список грантов
 *   POST   /api/profiles/:idOrSlug/access            → { userId?, userEmail?, canEdit? }
 *   PATCH  /api/profiles/:idOrSlug/access/:userId    → { canEdit }
 *   DELETE /api/profiles/:idOrSlug/access/:userId    → удалить грант
 */

const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errors');

/* ─────────── helpers ─────────── */

async function _loadProfileByIdOrSlug(idOrSlug) {
    if (!idOrSlug) throw ApiError.badRequest('Не указан идентификатор профиля');
    const profile = await prisma.profile.findFirst({
        where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], deletedAt: null },
        select: { id: true, slug: true, ownerId: true, fullName: true, visibility: true },
    });
    if (!profile) throw ApiError.notFound('Профиль не найден');
    return profile;
}

function _assertOwnerOrAdmin(profile, actor) {
    if (!actor) throw ApiError.unauthorized();
    if (actor.role === 'ADMIN') return;
    if (profile.ownerId === actor.id) return;
    throw ApiError.forbidden('Только владелец профиля может управлять доступами');
}

function _serializeUserShort(u) {
    if (!u) return null;
    return { id: u.id, email: u.email, displayName: u.displayName || '' };
}

function _serializeGrant(g) {
    return {
        id: g.id,
        profileId: g.profileId,
        userId: g.userId,
        user: _serializeUserShort(g.user),
        grantedBy: g.grantedBy,
        grantor: _serializeUserShort(g.grantor),
        canEdit: !!g.canEdit,
        createdAt: g.createdAt,
    };
}

const GRANT_INCLUDE = {
    user:    { select: { id: true, email: true, displayName: true } },
    grantor: { select: { id: true, email: true, displayName: true } },
};

/* ─────────── operations ─────────── */

async function listGrants(profileIdOrSlug, actor) {
    const profile = await _loadProfileByIdOrSlug(profileIdOrSlug);
    _assertOwnerOrAdmin(profile, actor);
    const grants = await prisma.profileAccess.findMany({
        where: { profileId: profile.id },
        include: GRANT_INCLUDE,
        orderBy: { createdAt: 'desc' },
    });
    return grants.map(_serializeGrant);
}

async function addGrant(profileIdOrSlug, input, actor) {
    const profile = await _loadProfileByIdOrSlug(profileIdOrSlug);
    _assertOwnerOrAdmin(profile, actor);

    const { userId, userEmail, canEdit } = input || {};
    if (!userId && !userEmail) {
        throw ApiError.badRequest('Укажите userId или userEmail');
    }

    let targetUser = null;
    if (userId) {
        targetUser = await prisma.user.findUnique({
            where: { id: String(userId) },
            select: { id: true, email: true, displayName: true },
        });
    } else {
        const email = String(userEmail).trim().toLowerCase();
        if (!email.includes('@')) {
            throw ApiError.badRequest('Некорректный email');
        }
        targetUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, displayName: true },
        });
    }

    if (!targetUser) throw ApiError.notFound('Пользователь не найден');
    if (targetUser.id === profile.ownerId) {
        throw ApiError.badRequest('Владелец профиля не нуждается в гранте');
    }

    try {
        const grant = await prisma.profileAccess.create({
            data: {
                profileId: profile.id,
                userId:    targetUser.id,
                grantedBy: actor.id,
                canEdit:   !!canEdit,
            },
            include: GRANT_INCLUDE,
        });
        return _serializeGrant(grant);
    } catch (err) {
        if (err.code === 'P2002') {
            throw ApiError.conflict('У этого пользователя уже есть доступ к профилю');
        }
        throw err;
    }
}

async function updateGrant(profileIdOrSlug, userId, input, actor) {
    const profile = await _loadProfileByIdOrSlug(profileIdOrSlug);
    _assertOwnerOrAdmin(profile, actor);
    if (!userId) throw ApiError.badRequest('Не указан userId');

    const data = {};
    if (input && input.canEdit !== undefined) data.canEdit = !!input.canEdit;
    if (Object.keys(data).length === 0) {
        throw ApiError.badRequest('Нечего обновлять (передайте canEdit)');
    }

    try {
        const updated = await prisma.profileAccess.update({
            where: { profileId_userId: { profileId: profile.id, userId } },
            data,
            include: GRANT_INCLUDE,
        });
        return _serializeGrant(updated);
    } catch (err) {
        if (err.code === 'P2025') throw ApiError.notFound('Грант не найден');
        throw err;
    }
}

async function removeGrant(profileIdOrSlug, userId, actor) {
    const profile = await _loadProfileByIdOrSlug(profileIdOrSlug);
    _assertOwnerOrAdmin(profile, actor);
    if (!userId) throw ApiError.badRequest('Не указан userId');

    try {
        await prisma.profileAccess.delete({
            where: { profileId_userId: { profileId: profile.id, userId } },
        });
    } catch (err) {
        if (err.code === 'P2025') throw ApiError.notFound('Грант не найден');
        throw err;
    }
    return { profileId: profile.id, userId };
}

module.exports = { listGrants, addGrant, updateGrant, removeGrant };
