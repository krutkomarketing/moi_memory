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

    if (val !== null && typeof val === 'object') {
      out[key] = sanitize(val);
    } else {
      out[key] = val;
    }
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

/**
 * Query audit logs (route should enforce ADMIN check).
 */
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
    where.user = {
      email: { contains: String(userEmail).trim(), mode: 'insensitive' },
    };
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
        user: {
          select: { id: true, email: true, displayName: true, role: true },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      action: r.action,
      userId: r.userId,
      user: r.user || null,
      entityType: r.entityType,
      entityId: r.entityId,
      oldValue: r.oldValue,
      newValue: r.newValue,
      metadata: r.metadata,
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