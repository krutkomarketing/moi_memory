'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Корректное определение клиентского IP за прокси (nginx, cloudflare).
 * Учитываем x-forwarded-for, иначе берём socket.remoteAddress.
 */
function getClientIp(req) {
    const xff = (req.headers['x-forwarded-for'] || '').toString();
    if (xff) return xff.split(',')[0].trim();
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Единый JSON-формат ответа при превышении.
 * Совпадает со стилем остального API: { ok: false, error, ... }.
 */
function rateLimitHandler(req, res, next, options) {
    const retryAfterSec = Math.ceil(options.windowMs / 1000);
    res.set('Retry-After', String(retryAfterSec));
    res.status(429).json({
        ok: false,
        error: 'rate_limit_exceeded',
        message: options.message || 'Too many requests. Please slow down.',
        retryAfter: retryAfterSec,
    });
}

/**
 * Login: 5 неудач за 15 минут на пару (IP + email).
 * Удачный login (HTTP 2xx) не считается за попытку.
 */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        const ip = getClientIp(req);
        const email = (req.body?.email || '').toString().toLowerCase().trim();
        return email ? `${ip}::${email}` : ip;
    },
    handler: (req, res, next, options) => {
        rateLimitHandler(req, res, next, {
            ...options,
            message: 'Too many login attempts. Try again later.',
        });
    },
});

/**
 * Register: 3 регистрации в час с одного IP.
 * Любой результат регистрации считается за попытку (антиспам аккаунтов).
 */
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    keyGenerator: (req) => getClientIp(req),
    handler: (req, res, next, options) => {
        rateLimitHandler(req, res, next, {
            ...options,
            message: 'Too many registration attempts. Try again later.',
        });
    },
});

/**
 * Общий лимит на остальные /auth/* (me, refresh, logout и т.п.).
 * 30 req / 15 минут — мягкий потолок.
 */
const authGeneralLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    handler: rateLimitHandler,
});

module.exports = {
    loginLimiter,
    registerLimiter,
    authGeneralLimiter,
    getClientIp,
};
