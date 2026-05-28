'use strict';

const express = require('express')
const QRCode = require('qrcode')
const PDFDocument = require('pdfkit');
const multer = require('multer');

const profileService  = require('./services/profileService');
const reviewService   = require('./services/reviewService');
const disputeService = require('./services/disputeService');
const mergeService   = require('./services/mergeService');
const candleService   = require('./services/candleService');
const codeService     = require('./services/codeService');
const mediaService    = require('./services/mediaService');
const familyService   = require('./services/familyService');
const timelineService = require('./services/timelineService');
const accessService   = require('./services/accessService');
const accessCodeService = require('./services/accessCodeService');
const auditService    = require('./services/auditService');
const legacyContactService = require('./services/legacyContactService');
const tgLoginService  = require('./services/tgLoginService');
const prisma          = require('./lib/prisma');
const pkg             = require('./package.json');

const auth = require('./auth');
const { requireAuth, optionalAuth } = auth;
const { loginLimiter, registerLimiter, authGeneralLimiter } = require('./middleware/rateLimit');

const router = express.Router();

/* ─── Multer 2.x (memory) ─────────────────────────────── */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 },
});

/**
 * Гибкий upload: принимает файл под ЛЮБЫМ именем multipart-поля
 * и кладёт его в req.file (совместимо с upload.single()).
 * Нужен чтобы фронт мог слать audio под полем 'audio', video под 'video' и т.д.
 */
const uploadAnyAsSingle = (req, res, next) => {
    upload.any()(req, res, (uploadErr) => {
        if (uploadErr) return next(uploadErr);
        if (Array.isArray(req.files) && req.files.length > 0) {
            req.file = req.files[0];
        }
        next();
    });
};

/* ─── Small helpers ───────────────────────────────────── */
const ok  = (res, data, code = 200) => res.status(code).json({ ok: true, ...data });
const err = (res, status, message)  => res.status(status).json({ ok: false, error: message });

function wrap(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function getIp(req) {
    return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
}

function requireAdmin(req, res, next) {
  if (!req.user) return err(res, 401, 'Unauthorized');
  if (req.user.role !== 'ADMIN') return err(res, 403, 'Доступ только для администраторов');
  return next();
}

function auditWrap({ action, entityType, getEntityId, getOldValue, getNewValue, getMetadata }) {
  return (handler) =>
    wrap(async (req, res) => {
      const result = await handler(req, res);

      // Логируем только если есть actor и запрос реально “успешный”
      // (ok(...) уже отдал ответ 2xx; но мы не можем надёжно вытащить status из res после send,
      // поэтому считаем успехом факт выполнения handler без throw)
      try {
        if (req.user && action) {
          await auditService.logAction({
            action,
            userId: req.user.id,
            entityType: entityType || null,
            entityId: getEntityId ? (await getEntityId(req, result)) : null,
            oldValue: getOldValue ? (await getOldValue(req, result)) : null,
            newValue: getNewValue ? (await getNewValue(req, result)) : null,
            metadata: {
              method: req.method,
              path: req.originalUrl,
              ...(getMetadata ? (await getMetadata(req, result)) : {}),
            },
            req,
          });
        }
      } catch (e) {
        // audit never blocks business flow
        console.error('[auditWrap] failed:', e.message);
      }

      return result;
    });
}

/* ═══════════════════════════════════════════════════════ */
/*  HEALTH CHECK                                           */
/* ═══════════════════════════════════════════════════════ */
const SERVER_STARTED_AT = Date.now();

router.get('/health', async (req, res) => {
    const startedAt = new Date(SERVER_STARTED_AT).toISOString();
    const uptimeSec = Math.floor((Date.now() - SERVER_STARTED_AT) / 1000);

    const result = {
        ok: true,
        service: pkg.name || 'memorial-site-server',
        version: pkg.version,
        node: process.version,
        env: process.env.NODE_ENV || 'development',
        uptime: uptimeSec,
        startedAt,
        time: new Date().toISOString(),
        db: { ok: false, latencyMs: null },
    };

    const t0 = Date.now();
    try {
        await prisma.$queryRaw`SELECT 1`;
        result.db.ok = true;
        result.db.latencyMs = Date.now() - t0;
    } catch (e) {
        result.ok = false;
        result.db.ok = false;
        result.db.latencyMs = Date.now() - t0;
        result.db.error = e.message;
    }

    res.status(result.ok ? 200 : 503).json(result);
});

/* ═══════════════════════════════════════════════════════ */
/*  AUTH                                                   */
/* ═══════════════════════════════════════════════════════ */
router.post('/auth/register', registerLimiter, wrap(async (req, res) => {
    /* __GDPR_ROUTER_V1__ */
    const { name, displayName, email, password, accept } = req.body || {};
    if (!email || !password) return err(res, 400, 'email and password required');
    if (!accept) return err(res, 400, 'consent required: accept must be true');
    const clientIp = req.ip || ((req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim() || null;
    const result = await auth.registerUser({
        email,
        password,
        displayName: displayName || name || email.split('@')[0],
        accept: true,
        ip: clientIp,
    });
    return ok(res, result, 201);
}));

router.post('/auth/login', loginLimiter, wrap(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return err(res, 400, 'email and password required');
    try {
        const result = await auth.loginUser({ email, password });
        await auditService.logAction({
            action: 'LOGIN',
            userId: result.user?.id || null,
            metadata: { email },
            req,
        });
        return ok(res, result);
    } catch (e) {
        await auditService.logAction({
            action: 'LOGIN_FAILED',
            metadata: { email, reason: e.message },
            req,
        });
        throw e;
    }
}));

router.get('/auth/me', authGeneralLimiter, requireAuth, wrap(async (req, res) => {
    return ok(res, { user: req.user });
}));

router.post('/auth/logout', requireAuth, wrap(async (req, res) => {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { jwtVersion: { increment: 1 } },
    });
    await auditService.logAction({
        action: 'LOGOUT',
        userId: req.user.id,
        req,
    });
    return ok(res, {});
}));

/* ═══════════════════════════════════════════════════════ */
/*  STATS                                                  */
/* ═══════════════════════════════════════════════════════ */
router.get('/stats', wrap(async (req, res) => {
    const [people, reviews, candles, citiesAgg] = await Promise.all([
        prisma.profile.count(),
        prisma.guestMemory.count({ where: { isApproved: true } }),
        candleService.count(),
        prisma.profile.findMany({
            where: { burialPlace: { not: null } },
            select: { burialPlace: true },
            distinct: ['burialPlace'],
        }),
    ]);
    // Generations: sum of per-account-max of per-tree generation ranges (MAX-MIN+1)
    const generationsRows = await prisma.$queryRawUnsafe(`
      SELECT COALESCE(SUM(per_owner_max), 0)::int AS total
      FROM (
        SELECT MAX(per_tree_range) AS per_owner_max
        FROM (
          SELECT t."ownerId",
                 (MAX(n.generation) - MIN(n.generation) + 1) AS per_tree_range
          FROM "FamilyTree" t
          INNER JOIN "FamilyNode" n ON n."treeId" = t.id
          WHERE n.generation IS NOT NULL
          GROUP BY t.id, t."ownerId"
        ) per_tree
        GROUP BY per_tree."ownerId"
      ) per_owner
    `);
    const generations = Number(generationsRows?.[0]?.total ?? 0);
    return ok(res, { data: { people, reviews, candles, cities: citiesAgg.length, generations } });
}));
// ========== AUDIT LOGS (ADMIN only) ==========
router.get('/admin/audit-logs', requireAuth, wrap(async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return err(res, 403, 'Доступ только для администраторов');
    }
    const result = await auditService.queryLogs({
        userId: req.query.userId,
        userEmail: req.query.userEmail,
        action: req.query.action,
        entityType: req.query.entityType,
        entityId: req.query.entityId,
        fromDate: req.query.fromDate,
        toDate: req.query.toDate,
        page: parseInt(req.query.page || '1', 10),
        limit: parseInt(req.query.limit || '50', 10),
    });
    return ok(res, result);
}));

// ========== USER ROLE CHANGE (ADMIN only) ==========
router.put('/admin/users/:id/role', requireAuth, wrap(async (req, res) => {
    if (req.user.role !== 'ADMIN') return err(res, 403, 'Доступ только для администраторов');
    const { role } = req.body || {};
    if (!['USER', 'ADMIN'].includes(role)) return err(res, 400, 'Invalid role (USER|ADMIN)');
    const before = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: { id: true, email: true, role: true },
    });
    if (!before) return err(res, 404, 'User not found');
    if (before.id === req.user.id) return err(res, 400, 'Нельзя менять роль себе');
    const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: { role },
        select: { id: true, email: true, displayName: true, role: true },
    });
    await auditService.logAction({
        action: 'USER_ROLE_CHANGE',
        userId: req.user.id,
        entityType: 'User',
        entityId: updated.id,
        oldValue: { role: before.role },
        newValue: { role: updated.role },
        metadata: { targetEmail: updated.email },
        req,
    });
    return ok(res, { user: updated });
}));
/* ═══════════════════════════════════════════════════════ */
/*  PROFILES / PEOPLE (alias)                              */
/* ═══════════════════════════════════════════════════════ */
/*  PROFILE TRASH / RESTORE (soft delete)                  */
/* ═══════════════════════════════════════════════════════ */



router.get('/profiles/trash', requireAuth, wrap(async (req, res) => {
    const page  = parseInt(req.query.page, 10)  || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const data = await profileService.listDeletedProfiles({ page, limit, actor: req.user });
    return ok(res, data);
}));

router.post('/profiles/:idOrSlug/restore', requireAuth, wrap(async (req, res) => {
    const data = await profileService.restoreProfile(req.params.idOrSlug, req.user);
    await auditService.logAction({
        action: 'PROFILE_RESTORE',
        userId: req.user.id,
        entityType: 'Profile',
        entityId: data?.id || req.params.idOrSlug,
        metadata: { idOrSlug: req.params.idOrSlug },
        req,
    });
    return ok(res, { data });
}));

/* ═══════════════════════════════════════════════════════ */
async function listHandler(req, res) {
    const page  = Math.max(1, parseInt(req.query.page  || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '9', 10)));
    const q     = (req.query.q    || '').toString().trim();
    const city  = (req.query.city || '').toString().trim();

    const bornYearFrom = req.query.bornYearFrom;
    const bornYearTo   = req.query.bornYearTo;
    const diedYearFrom = req.query.diedYearFrom;
    const diedYearTo   = req.query.diedYearTo;
    const gender       = (req.query.gender     || '').toString().trim();
    const visibility   = (req.query.visibility || '').toString().trim();
    const mine         = req.query.mine === '1' || req.query.mine === 'true';

    const { items, total } = await profileService.listProfiles({
        page, limit, q, city,
        bornYearFrom, bornYearTo, diedYearFrom, diedYearTo,
        gender, visibility, mine,
        actor: req.user || null,
    });
    return ok(res, {
        data:  items,
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
    });
}

async function detailHandler(req, res) {
    const idOrSlug = req.params.id;
    const accessToken =
        req.headers['x-profile-access'] ||
        req.query.accessToken ||
        null;
    const actor = req.user || null;
    const isAdmin = !!actor && actor.role === 'ADMIN';

    // 302 redirect: если profile soft-deleted и для не-владельца/не-админа,
    // и существует последний EXECUTED MergeRequest source→target — отправляем на canonical.
    if (!isAdmin) {
        const candidate = await prisma.profile.findFirst({
            where:  { OR: [{ id: idOrSlug }, { slug: idOrSlug }], deletedAt: { not: null } },
            select: { id: true, ownerId: true },
        });
        if (candidate && (!actor || candidate.ownerId !== actor.id)) {
            const mr = await prisma.profileMergeRequest.findFirst({
                where:   { sourceProfileId: candidate.id, status: 'EXECUTED' },
                orderBy: { executedAt: 'desc' },
                select:  { targetProfile: { select: { slug: true, deletedAt: true } } },
            });
            if (mr && mr.targetProfile && !mr.targetProfile.deletedAt) {
                const toSlug = mr.targetProfile.slug;
                return res.status(302)
                    .set('Location', `/profiles/${toSlug}`)
                    .json({ ok: false, redirect: { type: 'merge', toSlug }, error: 'Профиль объединён в другой' });
            }
        }
    }

    const data = await profileService.getProfileDetail(idOrSlug, actor, { accessToken });
    return ok(res, { data });
}

async function createHandler(req, res) {
    const data = await profileService.createProfile(req.body || {}, req.user);
    await auditService.logAction({
        action: 'PROFILE_CREATE',
        userId: req.user.id,
        entityType: 'Profile',
        entityId: data?.id || null,
        newValue: { id: data?.id, slug: data?.slug, fullName: data?.fullName, visibility: data?.visibility },
        req,
    });
    return ok(res, { data }, 201);
}

async function updateHandler(req, res) {
    let oldSnapshot = null;
    try {
        const p = await profileService.resolveProfile(req.params.id);
        if (p) oldSnapshot = { id: p.id, slug: p.slug, fullName: p.fullName, visibility: p.visibility };
    } catch (_) {}
    const data = await profileService.updateProfile(req.params.id, req.body || {}, req.user);
    await auditService.logAction({
        action: 'PROFILE_UPDATE',
        userId: req.user.id,
        entityType: 'Profile',
        entityId: data?.id || req.params.id,
        oldValue: oldSnapshot,
        newValue: { id: data?.id, slug: data?.slug, fullName: data?.fullName, visibility: data?.visibility },
        req,
    });
    return ok(res, { data });
}

async function deleteHandler(req, res) {
    const hard = req.query.hard === 'true';
    let snapshot = null;
    try {
        const p = await profileService.resolveProfile(req.params.id);
        if (p) snapshot = { id: p.id, slug: p.slug, fullName: p.fullName, visibility: p.visibility };
    } catch (_) {}
    await profileService.deleteProfile(req.params.id, req.user, { hard });
    await auditService.logAction({
        action: hard ? 'PROFILE_HARD_DELETE' : 'PROFILE_SOFT_DELETE',
        userId: req.user.id,
        entityType: 'Profile',
        entityId: snapshot?.id || req.params.id,
        oldValue: snapshot,
        req,
    });
    return ok(res, {});
}

/* ── QR for memorial plates ─────────────────────────────
   GET /api/profiles/:idOrSlug/qr.png
   GET /api/profiles/:idOrSlug/qr.pdf
   QR points to: {origin}/person.html?id={slugOrId}
──────────────────────────────────────────────────────── */
router.get('/profiles/:idOrSlug/qr.png', requireAuth, wrap(async (req, res) => {
  const idOrSlug = req.params.idOrSlug;
  const r = await profileService.getProfileDetail(idOrSlug, req.user, req.headers);
  if (!r || !r.data) return res.status(404).json({ ok: false, error: 'Not found' });

  const slug = r.data.slug || r.data.id || idOrSlug;

  const origin = (req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']) : req.protocol) +
    '://' + (req.headers['x-forwarded-host'] ? String(req.headers['x-forwarded-host']) : req.get('host'));

  const url = origin + '/person.html?id=' + encodeURIComponent(slug);

  const png = await QRCode.toBuffer(url, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 8,
  });

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.send(png);
}));

router.get('/profiles/:idOrSlug/qr.pdf', requireAuth, wrap(async (req, res) => {
  const idOrSlug = req.params.idOrSlug;
  const r = await profileService.getProfileDetail(idOrSlug, req.user, req.headers);
  if (!r || !r.data) return res.status(404).json({ ok: false, error: 'Not found' });

  const slug = r.data.slug || r.data.id || idOrSlug;

  const origin = (req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']) : req.protocol) +
    '://' + (req.headers['x-forwarded-host'] ? String(req.headers['x-forwarded-host']) : req.get('host'));

  const url = origin + '/person.html?id=' + encodeURIComponent(slug);

  const qrPng = await QRCode.toBuffer(url, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 10,
  });

  // A4 portrait
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="qr-${slug}.pdf"`);

  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  doc.pipe(res);

  const title = (r.data.fullName || r.data.name || 'Страница памяти').toString();
  const years = (r.data.years || '').toString();

  doc.fontSize(22).text(title, { align: 'center' });
  if (years) doc.moveDown(0.3).fontSize(14).fillColor('#444').text(years, { align: 'center' }).fillColor('#000');
  doc.moveDown(1.2);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const qrSize = 260;
  const x = doc.page.margins.left + (pageWidth - qrSize) / 2;
  const y = doc.y;

  doc.image(qrPng, x, y, { width: qrSize, height: qrSize });
  doc.moveDown(18);

  doc.fontSize(12).fillColor('#333').text('Сканируйте QR-код камерой телефона, чтобы открыть страницу памяти.', {
    align: 'center',
  });

  doc.moveDown(0.6);
  doc.fontSize(10).fillColor('#666').text(url, { align: 'center' });

  doc.end();
}));

for (const base of ['/people', '/profiles']) {
    router.get   (`${base}`,         optionalAuth, wrap(listHandler));
    router.post  (`${base}`,         requireAuth,  wrap(createHandler));
    router.get   (`${base}/:id`,     optionalAuth, wrap(detailHandler));
    router.put   (`${base}/:id`,     requireAuth,  wrap(updateHandler));
    router.delete(`${base}/:id`,     requireAuth,  wrap(deleteHandler));
}

/* ── Photo upload (main cover) ── */
router.post('/people/:id/photo', requireAuth, upload.single('photo'), wrap(async (req, res) => {
    if (!req.file) return err(res, 400, 'photo file required');
    const media = await mediaService.saveFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        { kind: 'image', userId: req.user.id },
    );
    const profile = await profileService.resolveProfile(req.params.id);
    if (!profile) return err(res, 404, 'profile_not_found');
    await prisma.profile.update({
        where: { id: profile.id },
        data:  { coverPhotoId: media.id },
    });
    return ok(res, { photo: media.url, url: media.url });
}));

router.post('/profiles/:id/photo', requireAuth, upload.single('photo'), wrap(async (req, res) => {
    // Идентичная логика с /people/:id/photo
    // (раньше был хрупкий router.handle hack — multer падал на повторном парсинге)
    if (!req.file) return err(res, 400, 'photo file required');
    const media = await mediaService.saveFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        { kind: 'image', userId: req.user.id },
    );
    const profile = await profileService.resolveProfile(req.params.id);
    if (!profile) return err(res, 404, 'profile_not_found');
    await prisma.profile.update({
        where: { id: profile.id },
        data:  { coverPhotoId: media.id },
    });
    return ok(res, { photo: media.url, url: media.url });
}));

/* ── Access code (per-profile password) ── */
router.post('/people/:id/verify-code', wrap(async (req, res) => {
    const { code } = req.body || {};
    const result = await codeService.verify(req.params.id, code);
    return ok(res, result);
}));

router.post('/people/:id/unset-code', requireAuth, wrap(async (req, res) => {
    const { visibility } = req.body || {};
    const result = await codeService.unset(req.params.id, req.user.id, req.user.role, visibility);
    return ok(res, result);
}));

router.post('/people/:id/set-code', requireAuth, wrap(async (req, res) => {
    const { code } = req.body || {};
    await codeService.set(req.params.id, code, req.user.id, req.user.role);
    return ok(res, {});
}));

/* ═══════════════════════════════════════════════════════ */
/*  REVIEWS / GUEST MEMORIES                               */
/* ═══════════════════════════════════════════════════════ */
router.get('/reviews/:personId', optionalAuth, wrap(async (req, res) => {
    const data = await reviewService.list(req.params.personId, req.user || null);
    return ok(res, { data });
}));

router.post('/reviews/:personId', optionalAuth, wrap(async (req, res) => {
    const data = await reviewService.create(req.params.personId, req.body || {}, req.user?.id || null);
    return ok(res, { data }, 201);
}));

router.get('/reviews/:personId/pending', requireAuth, wrap(async (req, res) => {
    const data = await reviewService.listPending(req.params.personId, req.user);
    return ok(res, { data });
}));

router.put('/reviews/:id/approve', requireAuth, wrap(async (req, res) => {
    const data = await reviewService.approve(req.params.id, req.user.id, req.user.role);
    return ok(res, { data });
}));

router.put('/reviews/:id/reject', requireAuth, wrap(async (req, res) => {
    const result = await reviewService.reject(req.params.id, req.user.id, req.user.role);
    return ok(res, result);
}));

router.delete('/reviews/delete/:id', requireAuth, wrap(async (req, res) => {
    await reviewService.del(req.params.id, req.user.id, req.user.role);
    return ok(res, {});
}));

/* ═══════════════════════════════════════════════════════ */
/*  CANDLES                                                */
/* ═══════════════════════════════════════════════════════ */
router.get('/candles', wrap(async (req, res) => {
    const profileId = req.query.profileId || null;
    const count = await candleService.count(profileId);
    return ok(res, { count });
}));

router.post('/candles/light', optionalAuth, wrap(async (req, res) => {
    const { profileId } = req.body || {};
    const result = await candleService.light({
        profileId: profileId || null,
        ip:        getIp(req),
        userAgent: req.headers['user-agent'] || '',
        userId:    req.user?.id || null,
    });
    return ok(res, { count: result.count, lit: result.lit });
}));

/* ═══════════════════════════════════════════════════════ */
/*  MEDIA UPLOADS                                          */
/* ═══════════════════════════════════════════════════════ */
function makeUploadHandler(kind) {
    return async (req, res) => {
        if (!req.file) return err(res, 400, 'file required');
        const media = await mediaService.saveFile(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype,
            { kind, userId: req.user?.id || null },
        );
        return ok(res, { url: media.url, id: media.id });
    };
}

router.post('/upload-photo', optionalAuth, upload.single('photo'), wrap(makeUploadHandler('image')));
router.post('/upload-audio', optionalAuth, uploadAnyAsSingle, wrap(makeUploadHandler('audio')));
router.post('/upload-video', optionalAuth, uploadAnyAsSingle, wrap(makeUploadHandler('video')));

/* ═══════════════════════════════════════════════════════ */
/*  FAMILY TREES                                           */
/* ═══════════════════════════════════════════════════════ */
router.get('/family-trees', optionalAuth, wrap(async (req, res) => {
    const data = await familyService.listTrees(req.user);
    return ok(res, { data });
}));

router.post('/family-trees', requireAuth,
  auditWrap({
    action: 'TREE_CREATE',
    entityType: 'FamilyTree',
    getEntityId: async (_req, result) => result?.data?.id || null,
    getNewValue: async (_req, result) =>
      result?.data ? { id: result.data.id, name: result.data.name, visibility: result.data.visibility } : null,
  })(async (req, res) => {
    const data = await familyService.createTree(req.body || {}, req.user);
    const payload = { data };
    ok(res, payload, 201);
    return payload;
  })
);

router.get('/family-trees/:id', optionalAuth, wrap(async (req, res) => {
    const data = await familyService.getTree(req.params.id, req.user);
    return ok(res, { data });
}));

router.put('/family-trees/:id', requireAuth,
  auditWrap({
    action: 'TREE_UPDATE',
    entityType: 'FamilyTree',
    getEntityId: async (req, _result) => req.params.id,
    getNewValue: async (_req, result) =>
      result?.data ? { id: result.data.id, name: result.data.name, visibility: result.data.visibility } : null,
  })(async (req, res) => {
    const data = await familyService.updateTree(req.params.id, req.body || {}, req.user);
    const payload = { data };
    ok(res, payload);
    return payload;
  })
);

router.delete('/family-trees/:id', requireAuth,
  auditWrap({
    action: 'TREE_DELETE',
    entityType: 'FamilyTree',
    getEntityId: async (req, _result) => req.params.id,
  })(async (req, res) => {
    await familyService.deleteTree(req.params.id, req.user);
    const payload = {};
    ok(res, payload);
    return payload;
  })
);

/* ── Clans ── */
router.get('/family-clans', requireAuth, wrap(async (req, res) => {
    const treeId = req.query.treeId;
    if (!treeId) return err(res, 400, 'treeId required');
    const data = await familyService.listClans(treeId, req.user);
    return ok(res, { data });
}));

router.post('/family-clans', requireAuth, wrap(async (req, res) => {
    const data = await familyService.createClan(req.body || {}, req.user);
    return ok(res, { data }, 201);
}));

router.put('/family-clans/:id', requireAuth, wrap(async (req, res) => {
    const data = await familyService.updateClan(req.params.id, req.body || {}, req.user);
    return ok(res, { data });
}));

router.delete('/family-clans/:id', requireAuth, wrap(async (req, res) => {
    await familyService.deleteClan(req.params.id, req.user);
    return ok(res, {});
}));

/* ── Nodes ── */
router.get('/family-nodes', requireAuth, wrap(async (req, res) => {
    const treeId = req.query.treeId;
    if (!treeId) return err(res, 400, 'treeId required');
    const tree = await familyService.getTree(treeId, req.user);
    return ok(res, { data: tree.nodes || [] });
}));

router.post('/family-nodes', requireAuth, wrap(async (req, res) => {
    const data = await familyService.createNode(req.body || {}, req.user);
    return ok(res, { data }, 201);
}));

router.put('/family-nodes/:id', requireAuth, wrap(async (req, res) => {
    const data = await familyService.updateNode(req.params.id, req.body || {}, req.user);
    return ok(res, { data });
}));

router.delete('/family-nodes/:id', requireAuth, wrap(async (req, res) => {
    await familyService.deleteNode(req.params.id, req.user);
    return ok(res, {});
}));

/* ── Connections ── */
router.get('/family-connections', requireAuth, wrap(async (req, res) => {
    const treeId = req.query.treeId;
    if (!treeId) return err(res, 400, 'treeId required');
    const tree = await familyService.getTree(treeId, req.user);
    return ok(res, { data: tree.connections || [] });
}));

router.post('/family-connections', requireAuth, wrap(async (req, res) => {
    const data = await familyService.createConnection(req.body || {}, req.user);
    return ok(res, { data }, 201);
}));

router.delete('/family-connections/:id', requireAuth, wrap(async (req, res) => {
    await familyService.deleteConnection(req.params.id, req.user);
    return ok(res, {});
}));

/* ═══════════════════════════════════════════════════════ */
/*  TIMELINE EVENTS                                        */
/* ═══════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════ */
/*  HISTORICAL TIMELINE (общая летопись страны)            */
/* ═══════════════════════════════════════════════════════ */

router.get('/timeline/historical', wrap(async (req, res) => {
    const data = await timelineService.listHistoricalEvents();
    return ok(res, { data });
}));

router.post('/timeline/historical', requireAuth, requireAdmin,
  auditWrap({
    action: 'TIMELINE_EVENT_CREATE',
    entityType: 'TimelineEvent',
    getEntityId: async (_req, result) => result?.data?.id || null,
    getNewValue: async (_req, result) => result?.data ? { id: result.data.id, category: result.data.category, title: result.data.title } : null,
    getMetadata: async () => ({ scope: 'historical' }),
  })(async (req, res) => {
    const data = await timelineService.createHistoricalEvent(req.body || {}, req.user);
    const payload = { data };
    ok(res, payload, 201);
    return payload;
  })
);

router.put('/timeline/historical/:id', requireAuth, requireAdmin,
  auditWrap({
    action: 'TIMELINE_EVENT_UPDATE',
    entityType: 'TimelineEvent',
    getEntityId: async (req, _result) => req.params.id,
    getNewValue: async (_req, result) => result?.data ? { id: result.data.id, category: result.data.category, title: result.data.title } : null,
    getMetadata: async () => ({ scope: 'historical' }),
  })(async (req, res) => {
    const data = await timelineService.updateHistoricalEvent(req.params.id, req.body || {}, req.user);
    const payload = { data };
    ok(res, payload);
    return payload;
  })
);

router.delete('/timeline/historical/:id', requireAuth, requireAdmin,
  auditWrap({
    action: 'TIMELINE_EVENT_DELETE',
    entityType: 'TimelineEvent',
    getEntityId: async (req, _result) => req.params.id,
    getMetadata: async () => ({ scope: 'historical' }),
  })(async (req, res) => {
    await timelineService.softDeleteHistoricalEvent(req.params.id, req.user);
    const payload = {};
    ok(res, payload);
    return payload;
  })
);

router.get('/timeline-events', optionalAuth, wrap(async (req, res) => {
    const data = await timelineService.listEvents({
        treeId: req.query.treeId || null,
        nodeId: req.query.nodeId || null,
        profileId: req.query.profileId || null,

        scope: req.query.scope || 'all',
        includeWitnesses: req.query.includeWitnesses === '1',

        // legacy toggles (optional)
        includeHistorical: req.query.includeHistorical,
        includeAuto: req.query.includeAuto,
    }, req.user || null);
    return ok(res, { data });
}));

router.post('/timeline-events', requireAuth,
  auditWrap({
    action: 'TIMELINE_EVENT_CREATE',
    entityType: 'TimelineEvent',
    getEntityId: async (_req, result) => result?.data?.id || null,
    getNewValue: async (_req, result) => result?.data ? { id: result.data.id, category: result.data.category, title: result.data.title } : null,
  })(async (req, res) => {
    const data = await timelineService.createEvent(req.body || {}, req.user);
    const payload = { data };
    ok(res, payload, 201);
    return payload;
  })
);

router.put('/timeline-events/:id', requireAuth,
  auditWrap({
    action: 'TIMELINE_EVENT_UPDATE',
    entityType: 'TimelineEvent',
    getEntityId: async (req, _result) => req.params.id,
    getNewValue: async (_req, result) => result?.data ? { id: result.data.id, category: result.data.category, title: result.data.title } : null,
  })(async (req, res) => {
    const data = await timelineService.updateEvent(req.params.id, req.body || {}, req.user);
    const payload = { data };
    ok(res, payload);
    return payload;
  })
);

router.delete('/timeline-events/:id', requireAuth,
  auditWrap({
    action: 'TIMELINE_EVENT_DELETE',
    entityType: 'TimelineEvent',
    getEntityId: async (req, _result) => req.params.id,
  })(async (req, res) => {
    await timelineService.softDeleteEvent(req.params.id, req.user);
    const payload = {};
    ok(res, payload);
    return payload;
  })
);

/* ═══════════════════════════════════════════════════════ */
/*  PROFILE ACCESS GRANTS                                  */
/* ═══════════════════════════════════════════════════════ */


router.get('/profiles/:idOrSlug/access', requireAuth, wrap(async (req, res) => {
    const data = await accessService.listGrants(req.params.idOrSlug, req.user);
    return ok(res, { data });
}));

router.post('/profiles/:idOrSlug/access', requireAuth,
  auditWrap({
    action: 'ACCESS_GRANT_CREATE',
    entityType: 'ProfileAccess',
    getEntityId: async (req, _result) => req.params.idOrSlug,
    getMetadata: async (req, result) => ({
      profile: req.params.idOrSlug,
      targetUserId: result?.data?.userId || null,
    }),
  })(async (req, res) => {
    const data = await accessService.addGrant(req.params.idOrSlug, req.body || {}, req.user);
    const payload = { data };
    ok(res, payload, 201);
    return payload;
  })
);

router.patch('/profiles/:idOrSlug/access/:userId', requireAuth,
  auditWrap({
    action: 'ACCESS_GRANT_UPDATE',
    entityType: 'ProfileAccess',
    getEntityId: async (req, _result) => req.params.idOrSlug,
    getMetadata: async (req) => ({
      profile: req.params.idOrSlug,
      targetUserId: req.params.userId,
    }),
  })(async (req, res) => {
    const data = await accessService.updateGrant(req.params.idOrSlug, req.params.userId, req.body || {}, req.user);
    const payload = { data };
    ok(res, payload);
    return payload;
  })
);

router.delete('/profiles/:idOrSlug/access/:userId', requireAuth,
  auditWrap({
    action: 'ACCESS_GRANT_DELETE',
    entityType: 'ProfileAccess',
    getEntityId: async (req, _result) => req.params.idOrSlug,
    getMetadata: async (req) => ({
      profile: req.params.idOrSlug,
      targetUserId: req.params.userId,
    }),
  })(async (req, res) => {
    const data = await accessService.removeGrant(req.params.idOrSlug, req.params.userId, req.user);
    const payload = { data };
    ok(res, payload);
    return payload;
  })
);

/* ═══════════════════════════════════════════════════════ */
/*  PROFILE ACCESS CODES (ротируемые одноразовые)          */
/* ═══════════════════════════════════════════════════════ */

router.get('/profiles/:idOrSlug/access-codes', requireAuth, wrap(async (req, res) => {
    const data = await accessCodeService.listCodes(req.params.idOrSlug, req.user);
    return ok(res, { data });
}));

router.post('/profiles/:idOrSlug/access-codes', requireAuth,
  auditWrap({
    action: 'ACCESS_CODE_GENERATE',
    entityType: 'ProfileAccessCode',
    getEntityId: async (_req, result) => result?.data?.id || null,
    getMetadata: async (req, result) => ({
      profileSlug: req.params.idOrSlug,
      label: result?.data?.label || null,
      expiresAt: result?.data?.expiresAt || null,
    }),
  })(async (req, res) => {
    const data = await accessCodeService.createCode(req.params.idOrSlug, req.body || {}, req.user);
    const payload = { data };
    ok(res, payload, 201);
    return payload;
  })
);

router.post('/profiles/:idOrSlug/access-codes/:codeId/revoke', requireAuth,
  auditWrap({
    action: 'ACCESS_CODE_REVOKE',
    entityType: 'ProfileAccessCode',
    getEntityId: async (req, _result) => req.params.codeId,
    getMetadata: async (req) => ({ profileSlug: req.params.idOrSlug }),
  })(async (req, res) => {
    const data = await accessCodeService.revokeCode(req.params.idOrSlug, req.params.codeId, req.user);
    const payload = { data };
    ok(res, payload);
    return payload;
  })
);

router.delete('/profiles/:idOrSlug/access-codes/:codeId', requireAuth,
  auditWrap({
    action: 'ACCESS_CODE_DELETE',
    entityType: 'ProfileAccessCode',
    getEntityId: async (req, _result) => req.params.codeId,
    getMetadata: async (req) => ({ profileSlug: req.params.idOrSlug }),
  })(async (req, res) => {
    const data = await accessCodeService.deleteCode(req.params.idOrSlug, req.params.codeId, req.user);
    const payload = { data };
    ok(res, payload);
    return payload;
  })
);

router.post('/profiles/:idOrSlug/verify-access-code', optionalAuth,
  auditWrap({
    action: 'ACCESS_CODE_REDEEM',
    entityType: 'ProfileAccessCode',
    getEntityId: async (_req, result) => result?.data?.codeId || null,
    getMetadata: async (req, result) => ({
      profileSlug: req.params.idOrSlug,
      grantCreated: result?.data?.grantCreated || false,
    }),
  })(async (req, res) => {
    const { code } = req.body || {};
    const data = await accessCodeService.verifyAccessCode(req.params.idOrSlug, code, req.user || null);
    const payload = { data };
    ok(res, payload);
    return payload;
  })
);

/* ═══════════════════════════════════════════════════════ */
/*  DISPUTES                                               */
/* ═══════════════════════════════════════════════════════ */

// Создать спор на профиль
router.post('/profiles/:idOrSlug/disputes', requireAuth,
  auditWrap({
    action: 'DISPUTE_CREATE',
    entityType: 'ProfileDispute',
    getEntityId: async (_req, result) => result?.data?.id || null,
    getNewValue: async (_req, result) => result?.data ? {
      id: result.data.id,
      profileId: result.data.profileId,
      reason: result.data.reason,
      status: result.data.status,
      duplicateOfProfileId: result.data.duplicateOfProfileId,
    } : null,
    getMetadata: async (req) => ({ idOrSlug: req.params.idOrSlug }),
  })(async (req, res) => {
    const data = await disputeService.create(req.params.idOrSlug, req.body || {}, req.user);
    const payload = { data };
    ok(res, payload, 201);
    return payload;
  })
);

// Список споров по профилю
router.get('/profiles/:idOrSlug/disputes', requireAuth, wrap(async (req, res) => {
  const data = await disputeService.listForProfile(
    req.params.idOrSlug,
    req.user,
    { status: req.query.status }
  );
  return ok(res, { data });
}));

// Мои поданные споры
router.get('/disputes/me', requireAuth, wrap(async (req, res) => {
  const data = await disputeService.listMine(req.user);
  return ok(res, { data });
}));

// Все споры (ADMIN)
router.get('/disputes', requireAuth, requireAdmin, wrap(async (req, res) => {
  const data = await disputeService.listAll(req.user, {
    status: req.query.status,
    reason: req.query.reason,
    page:   req.query.page,
    limit:  req.query.limit,
  });
  return ok(res, data);
}));

// Детали спора
router.get('/disputes/:id', requireAuth, wrap(async (req, res) => {
  const data = await disputeService.getById(req.params.id, req.user);
  return ok(res, { data });
}));

// Отозвать (reporter)
router.post('/disputes/:id/withdraw', requireAuth,
  auditWrap({
    action: 'DISPUTE_WITHDRAW',
    entityType: 'ProfileDispute',
    getEntityId: async (req) => req.params.id,
    getNewValue: async (_req, result) => result?.data ? {
      id: result.data.id, status: result.data.status,
    } : null,
  })(async (req, res) => {
    const data = await disputeService.withdraw(req.params.id, req.user);
    const payload = { data };
    ok(res, payload);
    return payload;
  })
);

// Изменить статус (ADMIN: OPEN → UNDER_REVIEW)
router.patch('/disputes/:id/status', requireAuth, requireAdmin,
  auditWrap({
    action: 'DISPUTE_UPDATE_STATUS',
    entityType: 'ProfileDispute',
    getEntityId: async (req) => req.params.id,
    getNewValue: async (_req, result) => result?.data ? {
      id: result.data.id, status: result.data.status,
    } : null,
  })(async (req, res) => {
    const data = await disputeService.updateStatus(req.params.id, req.body?.status, req.user);
    const payload = { data };
    ok(res, payload);
    return payload;
  })
);

// Resolve (ADMIN)
router.post('/disputes/:id/resolve', requireAuth, requireAdmin,
  auditWrap({
    action: 'DISPUTE_RESOLVE',
    entityType: 'ProfileDispute',
    getEntityId: async (req) => req.params.id,
    getNewValue: async (_req, result) => result?.data ? {
      id: result.data.id,
      status: result.data.status,
      resolution: result.data.resolution,
    } : null,
  })(async (req, res) => {
    const data = await disputeService.resolve(req.params.id, req.body || {}, req.user);
    const payload = { data };
    ok(res, payload);
    return payload;
  })
);



/* ═══════════════════════════════════════════════════════ */
/*  MERGE REQUESTS (Task 5.3 / Phase 2.2)                  */
/* ═══════════════════════════════════════════════════════ */

router.post('/profiles/:idOrSlug/merge-requests',
  requireAuth,
  auditWrap({
    action: 'MERGE_REQUEST_CREATE',
    entityType: 'ProfileMergeRequest',
    getEntityId: (req) => req._auditEntityId || null,
    getNewValue: (req) => req._auditNewValue || null,
    getMetadata: (req) => ({
      source: req.params.idOrSlug,
      target: req.body?.targetIdOrSlug,
    }),
  })(wrap(async (req, res) => {
    const { targetIdOrSlug, reason } = req.body || {};
    if (!targetIdOrSlug) return err(res, 400, 'targetIdOrSlug обязателен');
    const result = await mergeService.createRequest({
      sourceSlug: req.params.idOrSlug,
      targetSlug: targetIdOrSlug,
      reason,
      actor: req.user,
    });
    req._auditEntityId = result?.id;
    req._auditNewValue = result;
    return ok(res, result, 201);
  }))
);

router.get('/profiles/:idOrSlug/merge-requests', requireAuth, wrap(async (req, res) => {
  const rows = await mergeService.listForProfile({ slug: req.params.idOrSlug, actor: req.user });
  return ok(res, { rows });
}));

router.get('/merge-requests/me', requireAuth, wrap(async (req, res) => {
  const rows = await mergeService.listMine({ actor: req.user });
  return ok(res, { rows });
}));

router.get('/merge-requests', requireAuth, requireAdmin, wrap(async (req, res) => {
  const { status, limit, page } = req.query || {};
  const result = await mergeService.listAll({ status, limit, page, actor: req.user });
  return res.json({ ok: true, ...result });
}));

router.get('/merge-requests/:id', requireAuth, wrap(async (req, res) => {
  const result = await mergeService.getById({ id: req.params.id, actor: req.user });
  return ok(res, result);
}));

router.post('/merge-requests/:id/owner-approve', requireAuth,
  auditWrap({
    action: 'MERGE_REQUEST_OWNER_APPROVE',
    entityType: 'ProfileMergeRequest',
    getEntityId: (req) => req.params.id,
    getNewValue: () => null,
  })(wrap(async (req, res) => {
    const result = await mergeService.ownerApprove({ requestId: req.params.id, actor: req.user });
    return ok(res, result);
  }))
);

router.post('/merge-requests/:id/admin-approve', requireAuth, requireAdmin,
  auditWrap({
    action: 'MERGE_REQUEST_ADMIN_APPROVE',
    entityType: 'ProfileMergeRequest',
    getEntityId: (req) => req.params.id,
    getNewValue: () => null,
  })(wrap(async (req, res) => {
    const result = await mergeService.adminApprove({ requestId: req.params.id, actor: req.user });
    return ok(res, result);
  }))
);

router.post('/merge-requests/:id/reject', requireAuth,
  auditWrap({
    action: 'MERGE_REQUEST_REJECT',
    entityType: 'ProfileMergeRequest',
    getEntityId: (req) => req.params.id,
    getNewValue: () => null,
    getMetadata: (req) => ({ reason: req.body?.reason }),
  })(wrap(async (req, res) => {
    const { reason } = req.body || {};
    const result = await mergeService.reject({ requestId: req.params.id, actor: req.user, reason });
    return ok(res, result);
  }))
);

router.post('/merge-requests/:id/cancel', requireAuth,
  auditWrap({
    action: 'MERGE_REQUEST_CANCEL',
    entityType: 'ProfileMergeRequest',
    getEntityId: (req) => req.params.id,
    getNewValue: () => null,
  })(wrap(async (req, res) => {
    const result = await mergeService.cancel({ requestId: req.params.id, actor: req.user });
    return ok(res, result);
  }))
);

router.post('/merge-requests/:id/execute', requireAuth, requireAdmin,
  auditWrap({
    action: 'MERGE_REQUEST_EXECUTE',
    entityType: 'ProfileMergeRequest',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req._auditNewValue || null,
    getMetadata: (req) => ({ stats: req._auditStats || null }),
  })(wrap(async (req, res) => {
    const result = await mergeService.execute({ requestId: req.params.id, actor: req.user });
    req._auditNewValue = result?.request;
    req._auditStats = result?.stats;
    return ok(res, result);
  }))
);


/* ═══════════════════════════════════════════════════════════════
   LEGACY CONTACT (Task 5.4) — Phase 2.3
   ═══════════════════════════════════════════════════════════════ */

// ───── Owner flow ─────
router.get('/legacy-contact', requireAuth, wrap(async (req, res) => {
    const data = await legacyContactService.getContact(req.user.id);
    return ok(res, { data });
}));

router.put('/legacy-contact', requireAuth,
    auditWrap({
        action: 'LEGACY_CONTACT_INVITE_SEND',
        entityType: 'LegacyContact',
        getEntityId: (req) => req._auditEntityId,
        getNewValue: (req) => req._auditNewValue,
    })(wrap(async (req, res) => {
        const data = await legacyContactService.setContact({
            ownerId:        req.user.id,
            heirEmail:      req.body?.heirEmail,
            heirName:       req.body?.heirName,
            inactivityDays: req.body?.inactivityDays,
            message:        req.body?.message,
        });
        req._auditEntityId = data?.id;
        req._auditNewValue = { heirEmail: data?.heirEmail, heirName: data?.heirName, inactivityDays: data?.inactivityDays, status: data?.status };
        return ok(res, { data });
    }))
);

router.post('/legacy-contact/resend', requireAuth,
    auditWrap({
        action: 'LEGACY_CONTACT_INVITE_SEND',
        entityType: 'LegacyContact',
        getEntityId: (req) => req._auditEntityId,
    })(wrap(async (req, res) => {
        const data = await legacyContactService.resendInvite(req.user.id);
        req._auditEntityId = data?.id;
        return ok(res, { data });
    }))
);

router.delete('/legacy-contact', requireAuth,
    auditWrap({
        action: 'LEGACY_CONTACT_REVOKE',
        entityType: 'LegacyContact',
        getEntityId: (req) => req._auditEntityId,
    })(wrap(async (req, res) => {
        const data = await legacyContactService.revokeContact(req.user.id);
        req._auditEntityId = data?.id;
        return ok(res, { data });
    }))
);

// ───── Heir flow ─────
router.post('/legacy-invites/accept', requireAuth,
    auditWrap({
        action: 'LEGACY_CONTACT_INVITE_ACCEPT',
        entityType: 'LegacyContact',
        getEntityId: (req) => req._auditEntityId,
    })(wrap(async (req, res) => {
        const data = await legacyContactService.acceptInvite({
            inviteToken: req.body?.inviteToken,
            claimantId:  req.user.id,
        });
        req._auditEntityId = data?.id;
        return ok(res, { data });
    }))
);

// ───── Claims (heir + admin) ─────
router.post('/legacy-contacts/:id/claims', requireAuth,
    auditWrap({
        action: 'LEGACY_CLAIM_CREATE',
        entityType: 'LegacyClaim',
        getEntityId: (req) => req._auditEntityId,
        getNewValue: (req) => req._auditNewValue,
    })(wrap(async (req, res) => {
        const data = await legacyContactService.createClaim({
            legacyContactId: req.params.id,
            claimantId:      req.user.id,
            evidence:        req.body?.evidence,
        });
        req._auditEntityId = data?.id;
        req._auditNewValue = { legacyContactId: data?.legacyContactId, claimantId: data?.claimantId, status: data?.status };
        return ok(res, { data }, 201);
    }))
);

router.get('/legacy-claims/me', requireAuth, wrap(async (req, res) => {
    const rows = await legacyContactService.listMyClaims(req.user.id);
    return ok(res, { rows });
}));

router.get('/legacy-claims/:id', requireAuth, wrap(async (req, res) => {
    const data = await legacyContactService.getClaim(req.params.id, req.user);
    return ok(res, { data });
}));

// ───── Admin endpoints ─────
router.get('/admin/legacy-claims', requireAuth, requireAdmin, wrap(async (req, res) => {
    const rows = await legacyContactService.listPendingClaims();
    return ok(res, { rows });
}));

router.post('/admin/legacy-claims/:id/approve', requireAuth, requireAdmin,
    auditWrap({
        action: 'LEGACY_CLAIM_APPROVE',
        entityType: 'LegacyClaim',
        getEntityId: (req) => req.params.id,
        getMetadata: (req) => req._auditMetadata,
    })(wrap(async (req, res) => {
        const data = await legacyContactService.approveClaim(req.params.id, req.user, req.body?.notes);
        req._auditMetadata = { profilesTransferred: data?.profilesTransferred };
        return ok(res, { data });
    }))
);

router.post('/admin/legacy-claims/:id/reject', requireAuth, requireAdmin,
    auditWrap({
        action: 'LEGACY_CLAIM_REJECT',
        entityType: 'LegacyClaim',
        getEntityId: (req) => req.params.id,
    })(wrap(async (req, res) => {
        const data = await legacyContactService.rejectClaim(req.params.id, req.user, req.body?.notes);
        return ok(res, { data });
    }))
);

// ───── Admin manual cron triggers (для smoke tests + ops) ─────
router.post('/admin/legacy/trigger-check', requireAuth, requireAdmin, wrap(async (req, res) => {
    const data = await legacyContactService.triggerInactive();
    return ok(res, { data });
}));

router.post('/admin/legacy/expire-claims', requireAuth, requireAdmin, wrap(async (req, res) => {
    const data = await legacyContactService.expireOldClaims();
    return ok(res, { data });
}));


/* ═══════════════════════════════════════════════════════ */
/*  TELEGRAM DEEP-LINK LOGIN (Phase 3)                     */
/*  Without TG Widget — works on localhost / any origin    */
/* ═══════════════════════════════════════════════════════ */
router.post('/auth/telegram/init', authGeneralLimiter, wrap(async (req, res) => {
    const data = await tgLoginService.createToken();
    return ok(res, { data });
}));

router.get('/auth/telegram/poll', authGeneralLimiter, wrap(async (req, res) => {
    const token = (req.query.token || '').toString();
    if (!token) return err(res, 400, 'token required');
    const result = await tgLoginService.pollToken(token);
    if (result.status === 'READY' && result.user) {
        try {
            await auditService.logAction({
                action: 'LOGIN',
                userId: result.user.id,
                metadata: { method: 'telegram_deep_link' },
                req,
            });
        } catch (e) {
            console.error('[tg-login] audit failed:', e.message);
        }
    }
    return ok(res, result);
}));

module.exports = router;
