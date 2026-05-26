'use strict';

const crypto = require('node:crypto');
const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errors');

/* ── Хеширование самого PIN-кода ─────────────────────────── */
const ITERATIONS = 200_000;
const KEY_LEN    = 32;
const DIGEST     = 'sha256';

function hashCode(code) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(code, salt, ITERATIONS, KEY_LEN, DIGEST).toString('hex');
  return `${ITERATIONS}:${salt}:${hash}`;
}

function verifyCodeHash(code, stored) {
  if (!stored || !code) return false;
  const parts = stored.split(':');
  if (parts.length !== 3) return false;
  const [iterStr, salt, hash] = parts;
  try {
    const test = crypto.pbkdf2Sync(code, salt, +iterStr, KEY_LEN, DIGEST).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

/* ── Profile-access token (HMAC, не JWT) ──────────────────
 * Формат: `${profileId}.${expSec}.${sigB64url}`
 * Подпись: HMAC-SHA256(secret, `${profileId}.${expSec}`)
 * Секрет: JWT_SECRET + ':profile-access' (отдельный namespace).
 */
const PROFILE_ACCESS_TTL_SEC = 3600;
function getAccessSecret() {
  return (process.env.JWT_SECRET || 'memory-site-secret-change-in-prod') + ':profile-access';
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signProfileAccessToken(profileId, ttlSec = PROFILE_ACCESS_TTL_SEC) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const data = `${profileId}.${exp}`;
  const sig = b64url(crypto.createHmac('sha256', getAccessSecret()).update(data).digest());
  return `${data}.${sig}`;
}

function verifyProfileAccessToken(token, profileId) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [tokId, expStr, sig] = parts;
  if (tokId !== profileId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = b64url(crypto.createHmac('sha256', getAccessSecret())
    .update(`${tokId}.${expStr}`).digest());
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ── verify: проверка введённого PIN; для PASSWORD выдаёт accessToken ── */
async function verify(idOrSlug, code) {
  if (!code || code.length < 4) {
    throw ApiError.badRequest('Введите код доступа');
  }

  const p = await prisma.profile.findFirst({
    where:  { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true, visibility: true, accessHash: true },
  });
  if (!p) throw ApiError.notFound('Профиль не найден');

  // PUBLIC/UNLISTED — код не требуется
  if (p.visibility !== 'PASSWORD') return { ok: true, required: false };

  if (!p.accessHash) throw ApiError.conflict('Код доступа не настроен');

  if (!verifyCodeHash(code, p.accessHash)) {
    throw ApiError.forbidden('Неверный код. Обратитесь к администратору.');
  }

  const accessToken = signProfileAccessToken(p.id);
  return { ok: true, accessToken, expiresIn: PROFILE_ACCESS_TTL_SEC };
}

/* ── set: установить PIN, переключить visibility=PASSWORD ── */
async function set(idOrSlug, code, userId, userRole) {
  if (!code || code.length < 4 || code.length > 32) {
    throw ApiError.badRequest('Код должен быть от 4 до 32 символов');
  }

  const p = await prisma.profile.findFirst({
    where:  { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true, ownerId: true },
  });
  if (!p) throw ApiError.notFound('Профиль не найден');

  if (userRole !== 'ADMIN' && p.ownerId !== userId) {
    throw ApiError.forbidden('Нет прав');
  }

  await prisma.profile.update({
    where: { id: p.id },
    data:  { accessHash: hashCode(code), visibility: 'PASSWORD' },
  });

  return { ok: true };
}

/* ── unset: снять PIN, переключить visibility ── */
async function unset(idOrSlug, userId, userRole, newVisibility = 'UNLISTED') {
  const allowed = ['PUBLIC', 'UNLISTED', 'PRIVATE'];
  if (!allowed.includes(newVisibility)) {
    throw ApiError.badRequest('visibility должен быть PUBLIC, UNLISTED или PRIVATE');
  }

  const p = await prisma.profile.findFirst({
    where:  { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true, ownerId: true },
  });
  if (!p) throw ApiError.notFound('Профиль не найден');

  if (userRole !== 'ADMIN' && p.ownerId !== userId) {
    throw ApiError.forbidden('Нет прав');
  }

  await prisma.profile.update({
    where: { id: p.id },
    data:  { accessHash: null, visibility: newVisibility },
  });

  return { ok: true, visibility: newVisibility };
}

module.exports = {
  verify,
  set,
  unset,
  hashCode,
  verifyCodeHash,
  signProfileAccessToken,
  verifyProfileAccessToken,
};