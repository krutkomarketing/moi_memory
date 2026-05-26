'use strict';

/*
 * accessCodeService.js — ротируемые одноразовые коды доступа к Profile
 *
 *   GET    /api/profiles/:idOrSlug/access-codes                       → список (без codeHash)
 *   POST   /api/profiles/:idOrSlug/access-codes                       → создать, body { label?, expiresAt?, code? }
 *                                                                       ★ Возвращает plaintextCode ОДИН РАЗ
 *   POST   /api/profiles/:idOrSlug/access-codes/:codeId/revoke        → soft revoke
 *   DELETE /api/profiles/:idOrSlug/access-codes/:codeId               → hard delete
 *   POST   /api/profiles/:idOrSlug/verify-access-code                 → body { code }; создаёт ProfileAccess для actor
 *
 * codeHash формат: "iterations:saltHex:hashHex" (PBKDF2-SHA512, 100k iter, 64B) — как в auth.js.
 */

const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errors');

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN     = 64;
const PBKDF2_DIGEST     = 'sha512';

// Алфавит без неоднозначных символов (нет 0/O/1/I/l)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/* ─────────── crypto helpers ─────────── */

function _hashCode(plain) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(plain, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
    return `${PBKDF2_ITERATIONS}:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function _verifyHash(plain, stored) {
    if (!stored || typeof stored !== 'string') return false;
    const parts = stored.split(':');
    if (parts.length !== 3) return false;
    const iterations = parseInt(parts[0], 10);
    if (!iterations) return false;
    const salt     = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (!salt.length || !expected.length) return false;
    const actual = crypto.pbkdf2Sync(plain, salt, iterations, expected.length, PBKDF2_DIGEST);
    try {
        return crypto.timingSafeEqual(expected, actual);
    } catch {
        return false;
    }
}

function _generateCode(length = 8) {
    const bytes = crypto.randomBytes(length);
    let s = '';
    for (let i = 0; i < length; i++) {
        s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return s;
}

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
    throw ApiError.forbidden('Только владелец профиля может управлять кодами доступа');
}

function _serializeCode(c) {
    // ВНИМАНИЕ: НИКОГДА не отдавать codeHash клиенту
    const now = new Date();
    const isExpired = c.expiresAt && new Date(c.expiresAt) <= now;
    const isRevoked = !!c.revokedAt;
    return {
        id: c.id,
        profileId: c.profileId,
        label: c.label || '',
        expiresAt: c.expiresAt,
        revokedAt: c.revokedAt,
        createdAt: c.createdAt,
        isActive: !isExpired && !isRevoked,
        isExpired: !!isExpired,
        isRevoked,
    };
}

/* ─────────── operations ─────────── */

async function listCodes(profileIdOrSlug, actor) {
    const profile = await _loadProfileByIdOrSlug(profileIdOrSlug);
    _assertOwnerOrAdmin(profile, actor);
    const codes = await prisma.profileAccessCode.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: 'desc' },
    });
    return codes.map(_serializeCode);
}

async function createCode(profileIdOrSlug, input, actor) {
    const profile = await _loadProfileByIdOrSlug(profileIdOrSlug);
    _assertOwnerOrAdmin(profile, actor);

    const { label, expiresAt, code: customCode } = input || {};

    let plain;
    if (customCode) {
        plain = String(customCode).trim();
        if (plain.length < 4) throw ApiError.badRequest('Код слишком короткий (минимум 4 символа)');
        if (plain.length > 64) throw ApiError.badRequest('Код слишком длинный (максимум 64 символа)');
    } else {
        plain = _generateCode(8);
    }

    let expDate = null;
    if (expiresAt) {
        expDate = new Date(expiresAt);
        if (isNaN(expDate.getTime())) {
            throw ApiError.badRequest('Невалидная дата expiresAt (ISO-8601 ожидается)');
        }
        if (expDate <= new Date()) {
            throw ApiError.badRequest('expiresAt должна быть в будущем');
        }
    }

    const created = await prisma.profileAccessCode.create({
        data: {
            profileId: profile.id,
            codeHash: _hashCode(plain),
            label: label ? String(label).trim() : null,
            expiresAt: expDate,
        },
    });

    return {
        ..._serializeCode(created),
        plaintextCode: plain,
        warning: 'Plaintext-код показывается только один раз. Сохраните его сейчас — восстановить нельзя.',
    };
}

async function revokeCode(profileIdOrSlug, codeId, actor) {
    const profile = await _loadProfileByIdOrSlug(profileIdOrSlug);
    _assertOwnerOrAdmin(profile, actor);

    const code = await prisma.profileAccessCode.findUnique({ where: { id: codeId } });
    if (!code || code.profileId !== profile.id) throw ApiError.notFound('Код не найден');
    if (code.revokedAt) throw ApiError.badRequest('Код уже отозван');

    const updated = await prisma.profileAccessCode.update({
        where: { id: codeId },
        data: { revokedAt: new Date() },
    });
    return _serializeCode(updated);
}

async function deleteCode(profileIdOrSlug, codeId, actor) {
    const profile = await _loadProfileByIdOrSlug(profileIdOrSlug);
    _assertOwnerOrAdmin(profile, actor);

    const code = await prisma.profileAccessCode.findUnique({ where: { id: codeId } });
    if (!code || code.profileId !== profile.id) throw ApiError.notFound('Код не найден');

    await prisma.profileAccessCode.delete({ where: { id: codeId } });
    return { id: codeId, profileId: profile.id };
}

async function verifyAccessCode(profileIdOrSlug, plain, actor) {
    const profile = await _loadProfileByIdOrSlug(profileIdOrSlug);

    if (!plain || typeof plain !== 'string' || !plain.trim()) {
        throw ApiError.badRequest('Не указан код');
    }
    const code = plain.trim();

    const now = new Date();
    const candidates = await prisma.profileAccessCode.findMany({
        where: {
            profileId: profile.id,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
    });

    let matched = null;
    for (const c of candidates) {
        if (_verifyHash(code, c.codeHash)) {
            matched = c;
            break;
        }
    }

    if (!matched) throw ApiError.unauthorized('Код неверный, отозван или истёк');

    // Если actor авторизован — создаём ProfileAccess (view-only)
    let grantCreated = false;
    if (actor && actor.id && actor.id !== profile.ownerId) {
        try {
            await prisma.profileAccess.create({
                data: {
                    profileId: profile.id,
                    userId: actor.id,
                    grantedBy: profile.ownerId,
                    canEdit: false,
                },
            });
            grantCreated = true;
        } catch (err) {
            if (err.code !== 'P2002') throw err;
            // P2002 = уже есть грант, это норм
        }
    }

    return {
        ok: true,
        codeId: matched.id,
        label: matched.label || '',
        profileId: profile.id,
        profileSlug: profile.slug,
        grantCreated,
    };
}

module.exports = {
    listCodes,
    createCode,
    revokeCode,
    deleteCode,
    verifyAccessCode,
    // exposed for testing
    _hashCode,
    _verifyHash,
    _generateCode,
};
