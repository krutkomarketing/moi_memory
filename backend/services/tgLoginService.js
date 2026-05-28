'use strict';

const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { signJWT } = require('../auth');

const TOKEN_TTL_SEC = 5 * 60; // 5 минут

function generateToken() {
    return crypto.randomBytes(24).toString('base64url');
}

/**
 * Создаёт PENDING-токен и возвращает t.me URL для перехода в бот.
 * Не требует аутентификации.
 */
async function createToken() {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SEC * 1000);
    await prisma.tgLoginToken.create({
        data: { token, status: 'PENDING', expiresAt },
    });
    const botUsername = process.env.BOT_USERNAME || 'SvyazPokoleniy_bot';
    return {
        token,
        ttlSec: TOKEN_TTL_SEC,
        botUrl: `https://t.me/${botUsername}?start=login_${token}`,
    };
}

/**
 * Polled фронтом. Если READY — возвращает JWT и помечает CONSUMED.
 * Если просрочен — помечает EXPIRED.
 */
async function pollToken(token) {
    if (!token || typeof token !== 'string') {
        return { status: 'INVALID' };
    }
    const t = await prisma.tgLoginToken.findUnique({
        where: { token },
        include: {
            user: { select: { id: true, email: true, displayName: true, role: true, jwtVersion: true } },
        },
    });
    if (!t) return { status: 'NOT_FOUND' };

    // Просрочен
    if (t.status === 'PENDING' && t.expiresAt < new Date()) {
        await prisma.tgLoginToken.update({
            where: { token },
            data: { status: 'EXPIRED' },
        });
        return { status: 'EXPIRED' };
    }

    // Готов — возвращаем JWT, помечаем CONSUMED
    if (t.status === 'READY' && t.user) {
        await prisma.tgLoginToken.update({
            where: { token },
            data: { status: 'CONSUMED', consumedAt: new Date() },
        });
        const jwt = signJWT({ sub: t.user.id, role: t.user.role, email: t.user.email, jwtVersion: t.user.jwtVersion ?? 0 });
        return { status: 'READY', token: jwt, user: t.user };
    }

    // Уже использован или просрочен
    return { status: t.status };
}

module.exports = { createToken, pollToken, TOKEN_TTL_SEC };
