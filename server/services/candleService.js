'use strict';
const crypto = require('node:crypto');
const prisma = require('../lib/prisma');

const RATE_LIMIT_PER_FP_PER_MIN = 5;

function makeFingerprint(ip, userAgent) {
  if (!ip && !userAgent) return null;
  return crypto.createHash('sha256')
    .update(String(ip || '') + '|' + String(userAgent || ''))
    .digest('hex')
    .slice(0, 32);
}

async function count(profileId = null) {
  const where = profileId ? { profileId } : {};
  return await prisma.candleLight.count({ where });
}

async function light({ profileId = null, ip = null, userAgent = null, userId = null } = {}) {
  const fingerprint = makeFingerprint(ip, userAgent);

  if (fingerprint) {
    const minuteAgo = new Date(Date.now() - 60_000);
    const recent = await prisma.candleLight.count({
      where: { fingerprint, createdAt: { gte: minuteAgo } },
    });
    if (recent >= RATE_LIMIT_PER_FP_PER_MIN) {
      return { ok: false, count: await count(profileId), error: 'Слишком часто, попробуйте чуть позже' };
    }
  }

  await prisma.candleLight.create({
    data: { profileId, userId, fingerprint },
  });
  return { ok: true, count: await count(profileId) };
}

module.exports = { count, light };