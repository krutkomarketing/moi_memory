'use strict';

const express = require('express');
const multer = require('multer');

const profileService  = require('./services/profileService');
const reviewService   = require('./services/reviewService');
const candleService   = require('./services/candleService');
const codeService     = require('./services/codeService');
const mediaService    = require('./services/mediaService');
const familyService   = require('./services/familyService');
const timelineService = require('./services/timelineService');
const accessService   = require('./services/accessService');
const accessCodeService = require('./services/accessCodeService');
const auditService    = require('./services/auditService');
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

/* ─── Small helpers ───────────────────────────────────── */
const ok  = (res, data, code = 200) => res.status(code).json({ ok: true, ...data });
const err = (res, status, message)  => res.status(status).json({ ok: false, error: message });

function wrap(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function getIp(req) {
    return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
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
    const { name, displayName, email, password } = req.body || {};
    if (!email || !password) return err(res, 400, 'email and password required');
    const result = await auth.registerUser({
        email,
        password,
        displayName: displayName || name || email.split('@')[0],
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
    return ok(res, { data: { people, reviews, candles, cities: citiesAgg.length } });
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

    const { items, total } = await profileService.listProfiles({
        page, limit, q, city,
        bornYearFrom, bornYearTo, diedYearFrom, diedYearTo,
        gender, visibility,
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
    const accessToken =
        req.headers['x-profile-access'] ||
        req.query.accessToken ||
        null;
    const data = await profileService.getProfileDetail(
        req.params.id,
        req.user || null,
        { accessToken },
    );
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
    req.url = `/people/${req.params.id}/photo`;
    return router.handle(req, res);
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
router.post('/upload-audio', optionalAuth, upload.single('photo'), wrap(makeUploadHandler('audio')));
router.post('/upload-video', optionalAuth, upload.single('photo'), wrap(makeUploadHandler('video')));

/* ═══════════════════════════════════════════════════════ */
/*  FAMILY TREES                                           */
/* ═══════════════════════════════════════════════════════ */
router.get('/family-trees', optionalAuth, wrap(async (req, res) => {
    const data = await familyService.listTrees(req.user);
    return ok(res, { data });
}));

router.post('/family-trees', requireAuth, wrap(async (req, res) => {
    const data = await familyService.createTree(req.body || {}, req.user);
    await auditService.logAction({
        action: 'TREE_CREATE',
        userId: req.user.id,
        entityType: 'FamilyTree',
        entityId: data?.id || null,
        newValue: { id: data?.id, name: data?.name, visibility: data?.visibility },
        req,
    });
    return ok(res, { data }, 201);
}));

router.get('/family-trees/:id', optionalAuth, wrap(async (req, res) => {
    const data = await familyService.getTree(req.params.id, req.user);
    return ok(res, { data });
}));

router.put('/family-trees/:id', requireAuth, wrap(async (req, res) => {
    const data = await familyService.updateTree(req.params.id, req.body || {}, req.user);
    return ok(res, { data });
}));

router.delete('/family-trees/:id', requireAuth, wrap(async (req, res) => {
    await familyService.deleteTree(req.params.id, req.user);
    await auditService.logAction({
        action: 'TREE_DELETE',
        userId: req.user.id,
        entityType: 'FamilyTree',
        entityId: req.params.id,
        req,
    });
    return ok(res, {});
}));

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

router.post('/timeline/historical', requireAuth, wrap(async (req, res) => {
    const data = await timelineService.createHistoricalEvent(req.body || {}, req.user);
    return ok(res, { data }, 201);
}));

router.put('/timeline/historical/:id', requireAuth, wrap(async (req, res) => {
    const data = await timelineService.updateHistoricalEvent(req.params.id, req.body || {}, req.user);
    return ok(res, { data });
}));

router.delete('/timeline/historical/:id', requireAuth, wrap(async (req, res) => {
    await timelineService.softDeleteHistoricalEvent(req.params.id, req.user);
    return ok(res, {});
}));

router.get('/timeline-events', optionalAuth, wrap(async (req, res) => {
    const data = await timelineService.listEvents({
        treeId:    req.query.treeId    || null,
        nodeId:    req.query.nodeId    || null,
        profileId: req.query.profileId || null,
    }, req.user || null);
    return ok(res, { data });
}));

router.post('/timeline-events', requireAuth, wrap(async (req, res) => {
    const data = await timelineService.createEvent(req.body || {}, req.user);
    return ok(res, { data }, 201);
}));

router.put('/timeline-events/:id', requireAuth, wrap(async (req, res) => {
    const data = await timelineService.updateEvent(req.params.id, req.body || {}, req.user);
    return ok(res, { data });
}));

router.delete('/timeline-events/:id', requireAuth, wrap(async (req, res) => {
    await timelineService.deleteEvent(req.params.id, req.user);
    return ok(res, {});
}));

/* ═══════════════════════════════════════════════════════ */
/*  PROFILE ACCESS GRANTS                                  */
/* ═══════════════════════════════════════════════════════ */

router.get('/profiles/:idOrSlug/access', requireAuth, wrap(async (req, res) => {
    const data = await accessService.listGrants(req.params.idOrSlug, req.user);
    return ok(res, { data });
}));

router.post('/profiles/:idOrSlug/access', requireAuth, wrap(async (req, res) => {
    const data = await accessService.addGrant(req.params.idOrSlug, req.body || {}, req.user);
    return ok(res, { data }, 201);
}));

router.patch('/profiles/:idOrSlug/access/:userId', requireAuth, wrap(async (req, res) => {
    const data = await accessService.updateGrant(req.params.idOrSlug, req.params.userId, req.body || {}, req.user);
    return ok(res, { data });
}));

router.delete('/profiles/:idOrSlug/access/:userId', requireAuth, wrap(async (req, res) => {
    const data = await accessService.removeGrant(req.params.idOrSlug, req.params.userId, req.user);
    return ok(res, { data });
}));

/* ═══════════════════════════════════════════════════════ */
/*  PROFILE ACCESS CODES (ротируемые одноразовые)          */
/* ═══════════════════════════════════════════════════════ */

router.get('/profiles/:idOrSlug/access-codes', requireAuth, wrap(async (req, res) => {
    const data = await accessCodeService.listCodes(req.params.idOrSlug, req.user);
    return ok(res, { data });
}));

router.post('/profiles/:idOrSlug/access-codes', requireAuth, wrap(async (req, res) => {
    const data = await accessCodeService.createCode(req.params.idOrSlug, req.body || {}, req.user);
    await auditService.logAction({
        action: 'ACCESS_CODE_GENERATE',
        userId: req.user.id,
        entityType: 'ProfileAccessCode',
        entityId: data?.id || null,
        metadata: { profileSlug: req.params.idOrSlug, label: data?.label || null, expiresAt: data?.expiresAt || null },
        req,
    });
    return ok(res, { data }, 201);
}));

router.post('/profiles/:idOrSlug/access-codes/:codeId/revoke', requireAuth, wrap(async (req, res) => {
    const data = await accessCodeService.revokeCode(req.params.idOrSlug, req.params.codeId, req.user);
    return ok(res, { data });
}));

router.delete('/profiles/:idOrSlug/access-codes/:codeId', requireAuth, wrap(async (req, res) => {
    const data = await accessCodeService.deleteCode(req.params.idOrSlug, req.params.codeId, req.user);
    return ok(res, { data });
}));

router.post('/profiles/:idOrSlug/verify-access-code', optionalAuth, wrap(async (req, res) => {
    const { code } = req.body || {};
    const data = await accessCodeService.verifyAccessCode(req.params.idOrSlug, code, req.user || null);
    await auditService.logAction({
        action: 'ACCESS_CODE_REDEEM',
        userId: req.user?.id || null,
        entityType: 'ProfileAccessCode',
        entityId: data?.codeId || null,
        metadata: { profileSlug: req.params.idOrSlug, grantCreated: data?.grantCreated || false },
        req,
    });
    return ok(res, { data });
}));

module.exports = router;
