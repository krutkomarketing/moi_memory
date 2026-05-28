// __PASSWORD_RESET_ROUTES_V2__
const express = require("express");
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { hashPassword } = require("../auth");
const { sendMail } = require("../lib/mailer");

const prisma = new PrismaClient();
const router = express.Router();

const TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_URL_BASE = process.env.PUBLIC_BASE_URL || "http://localhost";

const rlStore = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const cutoff = now - windowMs;
  const arr = (rlStore.get(ip) || []).filter(t => t > cutoff);
  if (arr.length >= 3) return false;
  arr.push(now); rlStore.set(ip, arr);
  return true;
}

router.post("/forgot-password", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";

  if (!email || !email.includes("@")) return res.json({ ok: true });
  if (!rateLimit(ip)) return res.status(429).json({ ok: false, error: "Слишком много запросов, попробуйте позже" });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const raw = crypto.randomBytes(32).toString("hex");
      const hash = crypto.createHash("sha256").update(raw).digest("hex");
      await prisma.passwordResetToken.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
          ip,
        },
      });
      const link = `${RESET_URL_BASE}/reset-password.html?token=${raw}`;
      await sendMail({
        to: email,
        subject: "Сброс пароля — Память",
        text: `Здравствуйте.\n\nДля сброса пароля перейдите по ссылке (действует 1 час):\n${link}\n\nЕсли вы не запрашивали сброс — просто проигнорируйте это письмо.`,
        html: `<p>Здравствуйте.</p><p>Для сброса пароля перейдите по ссылке (действует 1 час):</p><p><a href="${link}">${link}</a></p><p>Если вы не запрашивали сброс — просто проигнорируйте это письмо.</p>`,
      });
    }
  } catch (e) {
    console.error("[forgot-password]", e.message);
  }
  return res.json({ ok: true });
});

router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || typeof token !== "string") return res.status(400).json({ ok: false, error: "Токен обязателен" });
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ ok: false, error: "Пароль минимум 8 символов" });

  const hash = crypto.createHash("sha256").update(token).digest("hex");

  try {
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hash } });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      return res.status(400).json({ ok: false, error: "Ссылка недействительна или истекла" });
    }
    const passwordHash = hashPassword(newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: row.userId }, data: { passwordHash, jwtVersion: { increment: 1 } } }),
      prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      prisma.passwordResetToken.updateMany({
        where: { userId: row.userId, usedAt: null, id: { not: row.id } },
        data: { usedAt: new Date() },
      }),
    ]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[reset-password]", e.message);
    return res.status(500).json({ ok: false, error: "Внутренняя ошибка" });
  }
});

module.exports = router;
