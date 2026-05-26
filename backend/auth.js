/* ═══════════════════════════════════════════════════════════════
   server/auth.js — финальная версия под schema.prisma v2
   ═══════════════════════════════════════════════════════════════ */
"use strict";

const crypto = require("node:crypto");
const prisma = require("./lib/prisma");
const { ApiError } = require("./middleware/errors");

/* ── Конфиг ───────────────────────────────────────────────── */
const JWT_SECRET =
  process.env.JWT_SECRET || "memory-site-secret-change-in-prod";
const JWT_EXPIRY = Number(process.env.JWT_EXPIRY_SEC) || 7 * 24 * 60 * 60;
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || "";

const PBKDF2_ITER = 100_000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = "sha512";

if (
  JWT_SECRET === "memory-site-secret-change-in-prod" &&
  process.env.NODE_ENV === "production"
) {
  console.error("[auth] FATAL: JWT_SECRET не задан в production");
  process.exit(1);
}

/* ═══════════════ JWT (HS256) ═══════════════ */
function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}
function signJWT(payload) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({ ...payload, iat: now, exp: now + JWT_EXPIRY }),
  );
  const sig = b64url(
    crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest(),
  );
  return `${header}.${body}.${sig}`;
}
function verifyJWT(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = b64url(
    crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest(),
  );
  const a = Buffer.from(sig),
    b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ═══════════════ Пароли — PBKDF2-SHA512 ═══════════════
   Новый формат:   iter:saltHex:hashHex
   Legacy формат:  saltHex:hashHex
*/
function hashPassword(password) {
  if (typeof password !== "string" || password.length < 6) {
    throw ApiError.badRequest("Пароль должен быть не короче 6 символов");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITER, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString("hex");
  return `${PBKDF2_ITER}:${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!password || !stored) return false;
  const parts = stored.split(":");
  let iter, salt, hash;
  if (parts.length === 3) {
    [iter, salt, hash] = parts;
    iter = Number(iter);
    if (!Number.isFinite(iter) || iter < 1000) return false;
  } else if (parts.length === 2) {
    [salt, hash] = parts;
    iter = PBKDF2_ITER;
  } else return false;

  const attempt = crypto
    .pbkdf2Sync(password, salt, iter, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString("hex");
  const a = Buffer.from(hash, "hex"),
    b = Buffer.from(attempt, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function needsRehash(stored) {
  if (!stored) return false;
  const parts = stored.split(":");
  if (parts.length !== 3) return true;
  const iter = Number(parts[0]);
  return !Number.isFinite(iter) || iter < PBKDF2_ITER;
}

/* ═══════════════ Короткие коды доступа (PIN) ═══════════════ */
function hashAccessCode(code) {
  if (typeof code !== "string" || code.length < 4) {
    throw ApiError.badRequest("Код доступа должен быть не короче 4 символов");
  }
  const salt = crypto.randomBytes(12).toString("hex");
  const hash = crypto
    .pbkdf2Sync(code, salt, 200_000, 32, "sha256")
    .toString("hex");
  return `200000:${salt}:${hash}`;
}
function verifyAccessCode(code, stored) {
  if (!code || !stored) return false;
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const [iter, salt, hash] = parts;
  const attempt = crypto
    .pbkdf2Sync(code, salt, Number(iter), 32, "sha256")
    .toString("hex");
  const a = Buffer.from(hash, "hex"),
    b = Buffer.from(attempt, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ═══════════════ Telegram Login Widget — HMAC ═══════════════ */
function verifyTelegramAuth(data) {
  if (!TG_BOT_TOKEN) return false;
  if (!data || !data.hash || !data.auth_date) return false;
  if (Math.floor(Date.now() / 1000) - Number(data.auth_date) > 86_400)
    return false;

  const { hash, ...fields } = data;
  const checkString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secretKey = crypto.createHash("sha256").update(TG_BOT_TOKEN).digest();
  const hmac = crypto
    .createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(hmac, "hex"),
    );
  } catch {
    return false;
  }
}

/* ═══════════════ Извлечение токена ═══════════════ */
function extractToken(req) {
  const header = req.headers["authorization"] || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  const cookieHeader = req.headers["cookie"] || "";
  for (const c of cookieHeader.split(";")) {
    const [k, ...v] = c.trim().split("=");
    if (k === "token") return decodeURIComponent(v.join("="));
  }
  return null;
}

/* ═══════════════ Middleware: requireAuth ═══════════════ */
async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    const payload = verifyJWT(token);
    if (!payload || !payload.sub) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, email: true, displayName: true },
    });
    if (!user)
      return res.status(401).json({ ok: false, error: "Account not found" });

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    console.error("[auth] requireAuth error:", err);
    return res.status(500).json({ ok: false, error: "Auth error" });
  }
}

/** Не требует логина, но если есть валидный токен — заполняет req.user. */
async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);
    const payload = verifyJWT(token);
    if (payload?.sub) {
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, email: true, displayName: true },
      });
      if (user) {
        req.user = user;
        req.token = token;
      }
    }
    next();
  } catch (err) {
    console.error("[auth] optionalAuth error:", err);
    next();
  }
}

/* ═══════════════ RBAC ═══════════════ */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user)
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    next();
  };
}

/* ═══════════════ ProfileAccess проверка ═══════════════
   permission: 'view' | 'edit'
   - view: PUBLIC видят все; UNLISTED/PASSWORD — по прямому гранту или владельцу; PRIVATE — только владелец + грант.
   - edit: только владелец, ADMIN, или ProfileAccess.canEdit=true.
*/
function requireProfileAccess(permission = "view") {
  return async (req, res, next) => {
    try {
      if (!req.user)
        return res.status(401).json({ ok: false, error: "Unauthorized" });

      const profileId = req.params.profileId || req.params.id;
      if (!profileId)
        return res
          .status(400)
          .json({ ok: false, error: "Profile id required" });

      if (req.user.role === "ADMIN") return next();

      const profile = await prisma.profile.findUnique({
        where: { id: profileId },
        select: { id: true, ownerId: true, visibility: true },
      });
      if (!profile)
        return res.status(404).json({ ok: false, error: "Profile not found" });

      // владелец — может всё
      if (profile.ownerId === req.user.id) {
        req.profile = profile;
        return next();
      }

      // view + публичный профиль
      if (permission === "view" && profile.visibility === "PUBLIC") {
        req.profile = profile;
        return next();
      }

      // ищем грант
      const access = await prisma.profileAccess.findUnique({
        where: { profileId_userId: { profileId, userId: req.user.id } },
        select: { canEdit: true },
      });

      const allowed =
        permission === "view"
          ? !!access // любой грант = можно смотреть
          : permission === "edit"
            ? access?.canEdit // только canEdit
            : false;

      if (!allowed)
        return res.status(403).json({ ok: false, error: "Forbidden" });

      req.profile = profile;
      req.profileAccess = access;
      next();
    } catch (err) {
      console.error("[auth] requireProfileAccess error:", err);
      return res.status(500).json({ ok: false, error: "Access check failed" });
    }
  };
}

/* ═══════════════ Сервисы регистрации / логина ═══════════════ */

async function registerUser({ email, password, displayName }) {
  if (!email || !password) throw ApiError.badRequest("Email и пароль обязательны");
  const normalizedEmail = String(email).trim().toLowerCase();

  const exists = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (exists) throw ApiError.conflict("Email уже зарегистрирован");

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      displayName: displayName || normalizedEmail.split("@")[0],
      role: "USER",
    },
    select: { id: true, email: true, displayName: true, role: true },
  });

  const token = signJWT({ sub: user.id, role: user.role, email: user.email });
  return { user, token };
}

async function loginUser({ email, password }) {
  if (!email || !password) throw ApiError.badRequest("Email и пароль обязательны");
  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      passwordHash: true,
    },
  });
  if (!user) throw ApiError.unauthorized("Неверный email или пароль");
  if (!verifyPassword(password, user.passwordHash))
    throw ApiError.unauthorized("Неверный email или пароль");

  if (needsRehash(user.passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(password) },
    });
  }

  const token = signJWT({ sub: user.id, role: user.role, email: user.email });
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
    token,
  };
}

/** Telegram Login Widget. Создаёт юзера при первом входе.
 *  Note: telegramId в схеме — BigInt, поэтому BigInt(tgData.id). */
async function loginByTelegram(tgData) {
  if (!verifyTelegramAuth(tgData)) throw ApiError.unauthorized("Неверная подпись Telegram");

  const telegramId = BigInt(tgData.id);
  const displayName =
    [tgData.first_name, tgData.last_name].filter(Boolean).join(" ") ||
    `tg_${tgData.id}`;

  // У Telegram-юзера может не быть email — генерим уникальный плейсхолдер,
  // т.к. email в User помечен как @unique и обязателен.
  const placeholderEmail = `tg_${tgData.id}@telegram.local`;

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: { displayName },
    create: {
      telegramId,
      email: placeholderEmail,
      passwordHash: hashPassword(crypto.randomBytes(16).toString("hex")), // случайный, всё равно неюзабельный
      displayName,
      role: "USER",
    },
    select: { id: true, email: true, displayName: true, role: true },
  });

  const token = signJWT({ sub: user.id, role: user.role, email: user.email });
  return { user, token };
}

/* ═══════════════════════════════════════════════════════════════ */
module.exports = {
  // JWT
  signJWT,
  verifyJWT,
  extractToken,
  // Passwords
  hashPassword,
  verifyPassword,
  needsRehash,
  // Access codes
  hashAccessCode,
  verifyAccessCode,
  // Telegram
  verifyTelegramAuth,
  // Middleware
  requireAuth,
  optionalAuth,
  requireRole,
  requireProfileAccess,
  // Services
  registerUser,
  loginUser,
  loginByTelegram,
};
