'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const prisma = require('./lib/prisma');
const router = require('./router');
const { errorHandler, notFoundHandler } = require('./middleware/errors');

const app = express();

/* ─── Config ─────────────────────────────────────────── */

const PORT = parseInt(process.env.PORT || '3000', 10);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
	fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/* ─── CORS allowlist ──────────────────────────────────── */

const corsAllowlist = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5500,http://127.0.0.1:5500')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);

app.use(cors({
	origin: (origin, cb) => {
		// Без Origin (curl, server-to-server) — пропускаем
		if (!origin) return cb(null, true);
		if (corsAllowlist.includes(origin)) return cb(null, true);
		return cb(new Error('CORS: origin not allowed: ' + origin));
	},
	credentials: true,
}));

/* ─── Body parsers ────────────────────────────────────── */

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/* ─── Healthcheck ─────────────────────────────────────── */

app.get('/health', async (req, res) => {
	try {
		await prisma.$queryRaw`SELECT 1`;
		res.json({ ok: true, db: 'up', uptime: process.uptime() });
	} catch (err) {
		res.status(503).json({ ok: false, error: 'db_down' });
	}
});

/* ─── API ─────────────────────────────────────────────── */

app.use('/api', router);

/* ─── Static: uploads + frontend ──────────────────────── */

app.use('/uploads', express.static(UPLOADS_DIR, {
	maxAge: '7d',
	immutable: true,
	fallthrough: true,
}));

// Раздача фронта из корня проекта (HTML/CSS/JS)
app.use(express.static(PROJECT_ROOT, {
	maxAge: '1h',
	index: ['index.html'],
}));

/* ─── 404 + error handler ─────────────────────────────── */

app.use(notFoundHandler);
app.use(errorHandler);

/* ─── Start ───────────────────────────────────────────── */

const server = app.listen(PORT, () => {
	console.log(`✅ Server listening on http://localhost:${PORT}`);
	console.log(`   API:      http://localhost:${PORT}/api`);
	console.log(`   Uploads:  http://localhost:${PORT}/uploads`);
	console.log(`   Frontend: http://localhost:${PORT}/`);
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

	// Force exit через 10 сек
	setTimeout(() => {
		console.error('[shutdown] force exit');
		process.exit(1);
	}, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));