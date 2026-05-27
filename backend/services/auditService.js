'use strict';

const prisma = require('../lib/prisma');

const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'token',
  'jwt',
  'accesscode',
  'code',
  'accesshash',
  'codehash',
  'authorization',
  'cookie',
];

function stripMarkdownLinks(s) {
  if (typeof s !== 'string') return s;

  // [label](mailto:label) -> label
  s = s.replace(/\[([^\]]+)\]\(mailto:[^\)]+\)/gi, '$1');

  // [url](url) -> url
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/gi, '$2');

  return s;
}

function normalizeKey(k) {
  if (typeof k !== 'string') return k;
  if (k.startsWith('[')) return k.slice(1);
  return k;
}

function normalizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalizeObject);

  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const nk = normalizeKey(k);
    if (v && typeof v === 'object') out[nk] = normalizeObject(v);
    else if (typeof v === 'string') out[nk] = stripMarkdownLinks(v);
    else out[nk] = v;
  }
  return out;
}

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);

  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    const lower = String(key).toLowerCase();

    if (SENSITIVE_KEYS.some((s) => lower.includes(s))) {
      out[key] = '***REDACTED***';
      continue;
    }

    if (val !== null && typeof val === 'object') out[key] = sanitize(val);
    else if (typeof val === 'string') out[key] = stripMarkdownLinks(val);
    else out[key] = val;
  }
  return out;
}

/**
 * Log an audit event. NEVER throws.
 */
async function logAction({
  action,
  userId = null,
  entityType = null,
  entityId = null,
  oldValue = null,
  newValue = null,
  metadata = null,
  req = null,
} = {}) {
  try {
    const ipAddress = req
      ? (req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
          req.socket?.remoteAddress ||
          null)
      : null;

    const userAgent = req ? (req.headers?.['user-agent'] || null) : null;

    await prisma.auditLog.create({
      data: {
        action,
        userId,
        entityType,
        entityId,
        oldValue: oldValue ? sanitize(oldValue) : null,
        newValue: newValue ? sanitize(newValue) : null,
        metadata: metadata ? sanitize(metadata) : null,
        ipAddress,
        userAgent,
      },
    });
  } catch (err) {
    console.error('[audit] logAction failed:', err.message);
  }
}

async function queryLogs({
  userId,
  userEmail,
  action,
  entityType,
  entityId,
  fromDate,
  toDate,
  page = 1,
  limit = 50,
} = {}) {
  const where = {};

  if (userId) where.userId = userId;

  if (userEmail && String(userEmail).trim()) {
    where.user = { email: { contains: String(userEmail).trim(), mode: 'insensitive' } };
  }

  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;

  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = new Date(fromDate);
    if (toDate) where.createdAt.lte = new Date(toDate);
  }

  const take = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * take;

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        user: { select: { id: true, email: true, displayName: true, role: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      action: r.action,
      userId: r.userId,
      user: r.user ? normalizeObject(r.user) : null,
      entityType: r.entityType,
      entityId: r.entityId,
      oldValue: r.oldValue ? normalizeObject(r.oldValue) : null,
      newValue: r.newValue ? normalizeObject(r.newValue) : null,
      metadata: r.metadata ? normalizeObject(r.metadata) : null,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page: parseInt(page, 10) || 1,
    limit: take,
    hasMore: skip + rows.length < total,
  };
}

module.exports = { logAction, queryLogs };
