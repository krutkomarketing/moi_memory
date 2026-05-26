'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const prisma = require('./lib/prisma');
const router = require('./router');
const { errorHandler, notFoundHandler } = require('./middleware/errors');
const { buildSitemap, buildRobotsTxt } = require('./lib/sitemap');

const app = express();

/* ─── Config ─────────────────────────────────────────── */
const PORT = parseInt(process.env.PORT || '3000', 10);
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/* ─── Trust proxy (Caddy впереди) ─────────────────────── */
// Чтобы req.ip и rate limit видели реальный клиентский IP из X-Forwarded-For
app.set('trust proxy', 1);
/* ─── HTTP access log ─────────────────────────────────── */
// Кастомный токен — реальный IP клиента (через X-Forwarded-For)
morgan.token('real-ip', (req) => req.ip);
// Не логируем шумные эндпоинты (health, статика) — иначе логи забьются
const skipNoise = (req) =>
  req.path === '/health' ||
  req.path === '/api/health' ||
  req.path.startsWith('/uploads/');

app.use(
  morgan(
    process.env.NODE_ENV === 'production'
      ? ':real-ip :method :url :status :res[content-length] - :response-time ms'
      : 'dev',
    { skip: skipNoise }
  )
);
/* ─── CORS allowlist ──────────────────────────────────── */
// В Docker фронт ходит same-origin через Caddy → CORS не нужен.
// Список нужен для dev-режима, когда фронт открыт через Live Server / прямой :3000.
const corsAllowlist = (process.env.CORS_ORIGINS ||
  'http://localhost,http://localhost:3000,http://localhost:5500,http://127.0.0.1,http://127.0.0.1:3000,http://127.0.0.1:5500')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Без Origin (curl, same-origin запросы через Caddy) — пропускаем
    if (!origin) return cb(null, true);
    if (corsAllowlist.includes(origin)) return cb(null, true);
    return cb(new Error('CORS: origin not allowed: ' + origin));
  },
  credentials: true,
}));

/* ─── Body parsers ────────────────────────────────────── */
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/* ─── Healthcheck (доступен и как /health, и как /api/health) ─── */
const healthHandler = async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'up', uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ ok: false, error: 'db_down' });
  }
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

/* ─── SEO: sitemap.xml + robots.txt ───────────────────── */
// Эти роуты прокинуты через Caddy на корень фронта
app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const profiles = await prisma.profile.findMany({
      where: { visibility: 'PUBLIC', deletedAt: null },
      select: { slug: true, updatedAt: true, createdAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 50000,
    });
    const xml = buildSitemap({ baseUrl: SITE_URL, profiles });
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    next(err);
  }
});

app.get('/robots.txt', (req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(buildRobotsTxt(SITE_URL));
});

/* ─── API ─────────────────────────────────────────────── */
app.use('/api', router);

/* ─── Static: uploads ─────────────────────────────────── */
// Фронт отдаёт Caddy — здесь раздаём только загруженные файлы.
// Caddy с фронта тоже монтирует uploads volume read-only и отдаёт сам,
// но оставляем этот роут для прямого dev-доступа к :3000.
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '7d',
  immutable: true,
  fallthrough: true,
}));

/* ─── 404 + error handler ─────────────────────────────── */
app.use(notFoundHandler);
app.use(errorHandler);

/* ─── Start ───────────────────────────────────────────── */
const server = app.listen(PORT, () => {
  console.log(`✅ Server listening on :${PORT}`);
  console.log(`   API:     /api`);
  console.log(`   Uploads: /uploads`);
  console.log(`   Health:  /health, /api/health`);
});

/* ─── Graceful shutdown ───────────────────────────────── */
async function shutdown(signal) {
  console.log(`\n[shutdown] ${signal} received, closing...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log('[shutdown] Prisma disconnected, bye');
      process.exit(0);
    } catch (err) {
      console.error('[shutdown] error:', err);
      process.exit(1);
    }
  });
  setTimeout(() => {
    console.error('[shutdown] force exit');
    process.exit(1);
  }, 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));