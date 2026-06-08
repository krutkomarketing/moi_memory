'use strict';

const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errors');
const auditService = require('./auditService');

const DEFAULT_INACTIVITY_DAYS = 90;
const INVITE_TTL_DAYS = 14;
const CLAIM_TTL_DAYS = 30;

const STANDARD_INCLUDE = {
  owner:    { select: { id: true, email: true, displayName: true, lastSeenAt: true, legacyInactivityDays: true } },
  heirUser: { select: { id: true, email: true, displayName: true } },
};
const CLAIM_INCLUDE = {
  legacyContact: { include: { owner: { select: { id: true, email: true, displayName: true } } } },
  claimant:      { select: { id: true, email: true, displayName: true } },
};

/* ───────────── utility ───────────── */

function isAdmin(actor) { return !!actor && actor.role === 'ADMIN'; }
function generateToken() { return crypto.randomBytes(32).toString('hex'); }
function hashToken(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

function sendInviteEmailMock({ to, ownerLabel, inviteToken, message, expiresAt }) {
  console.log(`[legacyContact] MOCK EMAIL → ${to}: invite from ${ownerLabel} | token=${inviteToken.slice(0, 8)}… | expires=${expiresAt.toISOString()} | msg="${(message || '').slice(0, 60)}"`);
  return { sent: true, channel: 'mock' };
}

function serialize(c) {
  if (!c) return null;
  return {
    id:               c.id,
    ownerId:          c.ownerId,
    owner:            c.owner ? { id: c.owner.id, email: c.owner.email, displayName: c.owner.displayName, lastSeenAt: c.owner.lastSeenAt, legacyInactivityDays: c.owner.legacyInactivityDays } : null,
    heirUserId:       c.heirUserId,
    heirUser:         c.heirUser ? { id: c.heirUser.id, email: c.heirUser.email, displayName: c.heirUser.displayName } : null,
    heirEmail:        c.heirEmail,
    heirName:         c.heirName,
    status:           c.status,
    inviteExpiresAt:  c.inviteExpiresAt,
    inviteSentAt:     c.inviteSentAt,
    verifiedAt:       c.verifiedAt,
    triggeredAt:      c.triggeredAt,
    revokedAt:        c.revokedAt,
    inactivityDays:   c.inactivityDays,
    message:          c.message,
    createdAt:        c.createdAt,
    updatedAt:        c.updatedAt,
    // inviteTokenHash намеренно не сериализуется
  };
}

function serializeClaim(cl) {
  if (!cl) return null;
  return {
    id:              cl.id,
    legacyContactId: cl.legacyContactId,
    legacyContact:   cl.legacyContact ? {
      id:        cl.legacyContact.id,
      status:    cl.legacyContact.status,
      ownerId:   cl.legacyContact.ownerId,
      owner:     cl.legacyContact.owner ? { id: cl.legacyContact.owner.id, email: cl.legacyContact.owner.email, displayName: cl.legacyContact.owner.displayName } : null,
      heirEmail: cl.legacyContact.heirEmail,
    } : null,
    claimantId:      cl.claimantId,
    claimant:        cl.claimant ? { id: cl.claimant.id, email: cl.claimant.email, displayName: cl.claimant.displayName } : null,
    status:          cl.status,
    evidence:        cl.evidence,
    reviewerId:      cl.reviewerId,
    reviewedAt:      cl.reviewedAt,
    reviewNotes:     cl.reviewNotes,
    expiresAt:       cl.expiresAt,
    createdAt:       cl.createdAt,
    updatedAt:       cl.updatedAt,
  };
}

/* ───────────── Owner flow ───────────── */

async function setContact({ ownerId, heirEmail, heirName, inactivityDays, message }) {
  if (!heirEmail || typeof heirEmail !== 'string') throw new ApiError('heir_email_required', 400, 'HEIR_EMAIL_REQUIRED');
  const email = heirEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError('heir_email_invalid', 400, 'HEIR_EMAIL_INVALID');

  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, email: true, displayName: true } });
  if (!owner) throw new ApiError('owner_not_found', 404, 'OWNER_NOT_FOUND');
  if (owner.email.toLowerCase() === email) throw new ApiError('cannot_set_self_as_heir', 400, 'CANNOT_SET_SELF_AS_HEIR');

  const days = Number.isInteger(inactivityDays) && inactivityDays > 0 ? inactivityDays : DEFAULT_INACTIVITY_DAYS;
  if (days < 7 || days > 365) throw new ApiError('inactivity_days_out_of_range_7_to_365', 400, 'INACTIVITY_DAYS_OUT_OF_RANGE_7_TO_365');

  const heirUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  const inviteToken     = generateToken();
  const inviteTokenHash = hashToken(inviteToken);
  const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000);
  const now = new Date();

  const contact = await prisma.legacyContact.upsert({
    where:  { ownerId },
    create: {
      ownerId, heirEmail: email, heirName: heirName || null, heirUserId: heirUser?.id || null,
      inactivityDays: days, message: message || null,
      status: 'PENDING',
      inviteTokenHash, inviteExpiresAt, inviteSentAt: now,
    },
    update: {
      heirEmail: email, heirName: heirName ?? undefined, heirUserId: heirUser?.id || null,
      inactivityDays: days, message: message ?? undefined,
      status: 'PENDING',
      inviteTokenHash, inviteExpiresAt, inviteSentAt: now,
      verifiedAt: null, triggeredAt: null, revokedAt: null,
    },
    include: STANDARD_INCLUDE,
  });

  // Sync User.legacyInactivityDays
  await prisma.user.update({ where: { id: ownerId }, data: { legacyInactivityDays: days } });

  sendInviteEmailMock({ to: email, ownerLabel: owner.displayName || owner.email, inviteToken, message, expiresAt: inviteExpiresAt });

  // Возвращаем raw token в ответе (frontend покажет ссылку owner'у для копирования; в продакшене — только email)
  return { ...serialize(contact), inviteToken };
}

async function getContact(ownerId) {
  const c = await prisma.legacyContact.findUnique({ where: { ownerId }, include: STANDARD_INCLUDE });
  return c ? serialize(c) : null;
}

async function revokeContact(ownerId) {
  const c = await prisma.legacyContact.findUnique({ where: { ownerId } });
  if (!c) throw new ApiError('legacy_contact_not_found', 404, 'LEGACY_CONTACT_NOT_FOUND');
  if (c.status === 'TRANSFERRED') throw new ApiError('cannot_revoke_transferred', 409, 'CANNOT_REVOKE_TRANSFERRED');
  if (c.status === 'REVOKED')     throw new ApiError('already_revoked', 409, 'ALREADY_REVOKED');
  const updated = await prisma.legacyContact.update({
    where: { ownerId },
    data:  { status: 'REVOKED', revokedAt: new Date(), inviteTokenHash: null },
    include: STANDARD_INCLUDE,
  });
  return serialize(updated);
}

async function resendInvite(ownerId) {
  const c = await prisma.legacyContact.findUnique({ where: { ownerId }, include: STANDARD_INCLUDE });
  if (!c) throw new ApiError('legacy_contact_not_found', 404, 'LEGACY_CONTACT_NOT_FOUND');
  if (c.status !== 'PENDING') throw new ApiError(`cannot_resend_status_${c.status}`, 409);
  const inviteToken     = generateToken();
  const inviteTokenHash = hashToken(inviteToken);
  const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000);
  const updated = await prisma.legacyContact.update({
    where: { ownerId },
    data:  { inviteTokenHash, inviteExpiresAt, inviteSentAt: new Date() },
    include: STANDARD_INCLUDE,
  });
  sendInviteEmailMock({ to: c.heirEmail, ownerLabel: c.owner?.displayName || c.owner?.email, inviteToken, message: c.message, expiresAt: inviteExpiresAt });
  return { ...serialize(updated), inviteToken };
}

/* ───────────── Heir flow ───────────── */

async function acceptInvite({ inviteToken, claimantId }) {
  if (!inviteToken) throw new ApiError('invite_token_required', 400, 'INVITE_TOKEN_REQUIRED');
  const tokenHash = hashToken(inviteToken);
  const contact = await prisma.legacyContact.findUnique({ where: { inviteTokenHash: tokenHash }, include: STANDARD_INCLUDE });
  if (!contact) throw new ApiError('invite_not_found', 404, 'INVITE_NOT_FOUND');
  if (contact.status !== 'PENDING') throw new ApiError(`invite_not_pending_${contact.status}`, 409);
  if (contact.inviteExpiresAt && contact.inviteExpiresAt < new Date()) throw new ApiError('invite_expired', 410, 'INVITE_EXPIRED');

  const claimant = await prisma.user.findUnique({ where: { id: claimantId }, select: { id: true, email: true } });
  if (!claimant) throw new ApiError('claimant_not_authenticated', 401, 'CLAIMANT_NOT_AUTHENTICATED');
  if (claimant.email.toLowerCase() !== contact.heirEmail.toLowerCase()) throw new ApiError('email_mismatch', 403, 'EMAIL_MISMATCH');
  if (contact.ownerId === claimantId) throw new ApiError('cannot_accept_own_invite', 400, 'CANNOT_ACCEPT_OWN_INVITE');

  const updated = await prisma.legacyContact.update({
    where: { id: contact.id },
    data:  { status: 'ACTIVE', heirUserId: claimantId, verifiedAt: new Date(), inviteTokenHash: null },
    include: STANDARD_INCLUDE,
  });
  return serialize(updated);
}

/* ───────────── Trigger flow (cron) ───────────── */

async function triggerInactive({ now = new Date() } = {}) {
  const candidates = await prisma.legacyContact.findMany({
    where:   { status: 'ACTIVE' },
    include: { owner: { select: { id: true, lastSeenAt: true, legacyInactivityDays: true, createdAt: true } } },
  });
  const triggered = [];
  for (const c of candidates) {
    const days = c.inactivityDays || c.owner?.legacyInactivityDays || DEFAULT_INACTIVITY_DAYS;
    const referenceTs = (c.owner?.lastSeenAt || c.owner?.createdAt || c.createdAt).getTime();
    if (now.getTime() - referenceTs > days * 24 * 3600 * 1000) {
      await prisma.legacyContact.update({ where: { id: c.id }, data: { status: 'TRIGGERED', triggeredAt: now } });
      try {
        await auditService.logAction({
          action: 'LEGACY_CONTACT_TRIGGER',
          userId: c.ownerId,
          entityType: 'LegacyContact',
          entityId: c.id,
          metadata: { ownerLastSeenAt: c.owner?.lastSeenAt, days, source: 'cron' },
        });
      } catch (e) { console.error('[legacyContact.trigger] audit error:', e.message); }
      triggered.push(c.id);
    }
  }
  return { triggeredIds: triggered, count: triggered.length };
}

/* ───────────── Claim flow ───────────── */

async function createClaim({ legacyContactId, claimantId, evidence }) {
  const contact = await prisma.legacyContact.findUnique({ where: { id: legacyContactId } });
  if (!contact) throw new ApiError('legacy_contact_not_found', 404, 'LEGACY_CONTACT_NOT_FOUND');
  if (contact.status !== 'TRIGGERED') throw new ApiError(`contact_not_triggered_${contact.status}`, 409);
  if (contact.heirUserId !== claimantId) throw new ApiError('not_heir', 403, 'NOT_HEIR');

  const existing = await prisma.legacyClaim.findFirst({ where: { legacyContactId, claimantId, status: 'PENDING' } });
  if (existing) throw new ApiError('pending_claim_exists', 409, 'PENDING_CLAIM_EXISTS');

  const expiresAt = new Date(Date.now() + CLAIM_TTL_DAYS * 24 * 3600 * 1000);
  const claim = await prisma.legacyClaim.create({
    data:    { legacyContactId, claimantId, evidence: evidence || null, status: 'PENDING', expiresAt },
    include: CLAIM_INCLUDE,
  });
  return serializeClaim(claim);
}

async function getClaim(claimId, actor) {
  const claim = await prisma.legacyClaim.findUnique({ where: { id: claimId }, include: CLAIM_INCLUDE });
  if (!claim) throw new ApiError('claim_not_found', 404, 'CLAIM_NOT_FOUND');
  if (!isAdmin(actor) && claim.claimantId !== actor.id) throw new ApiError('forbidden', 403, 'FORBIDDEN');
  return serializeClaim(claim);
}

async function listMyClaims(claimantId) {
  const rows = await prisma.legacyClaim.findMany({
    where:   { claimantId },
    orderBy: { createdAt: 'desc' },
    include: CLAIM_INCLUDE,
  });
  return rows.map(serializeClaim);
}

async function listPendingClaims() {
  const rows = await prisma.legacyClaim.findMany({
    where:   { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    include: CLAIM_INCLUDE,
  });
  return rows.map(serializeClaim);
}

async function approveClaim(claimId, actor, reviewNotes) {
  if (!isAdmin(actor)) throw new ApiError('admin_only', 403, 'ADMIN_ONLY');
  const claim = await prisma.legacyClaim.findUnique({ where: { id: claimId }, include: { legacyContact: true } });
  if (!claim) throw new ApiError('claim_not_found', 404, 'CLAIM_NOT_FOUND');
  if (claim.status !== 'PENDING') throw new ApiError(`claim_not_pending_${claim.status}`, 409);
  if (claim.expiresAt < new Date()) throw new ApiError('claim_expired', 410, 'CLAIM_EXPIRED');
  const contact = claim.legacyContact;
  if (contact.status !== 'TRIGGERED') throw new ApiError(`contact_not_triggered_${contact.status}`, 409);

  const result = await prisma.$transaction(async (tx) => {
    const profileResult = await tx.profile.updateMany({
      where: { ownerId: contact.ownerId, deletedAt: null },
      data:  { ownerId: claim.claimantId },
    });
    await tx.legacyContact.update({ where: { id: contact.id }, data: { status: 'TRANSFERRED' } });
    const updatedClaim = await tx.legacyClaim.update({
      where:   { id: claimId },
      data:    { status: 'APPROVED', reviewerId: actor.id, reviewedAt: new Date(), reviewNotes: reviewNotes || null },
      include: CLAIM_INCLUDE,
    });
    await tx.legacyClaim.updateMany({
      where: { legacyContactId: contact.id, status: 'PENDING', id: { not: claimId } },
      data:  { status: 'REJECTED', reviewerId: actor.id, reviewedAt: new Date(), reviewNotes: 'Auto-rejected: another claim approved' },
    });
    return { claim: updatedClaim, profilesTransferred: profileResult.count };
  }, { maxWait: 5000, timeout: 30000 });

  try {
    await auditService.logAction({
      action: 'OWNERSHIP_TRANSFER',
      userId: actor.id,
      entityType: 'User',
      entityId: claim.claimantId,
      metadata: { fromUserId: contact.ownerId, toUserId: claim.claimantId, profilesTransferred: result.profilesTransferred, claimId, legacyContactId: contact.id },
    });
  } catch (e) { console.error('[legacyContact.approve] audit OWNERSHIP_TRANSFER error:', e.message); }

  return { ...serializeClaim(result.claim), profilesTransferred: result.profilesTransferred };
}

async function rejectClaim(claimId, actor, reviewNotes) {
  if (!isAdmin(actor)) throw new ApiError('admin_only', 403, 'ADMIN_ONLY');
  const claim = await prisma.legacyClaim.findUnique({ where: { id: claimId } });
  if (!claim) throw new ApiError('claim_not_found', 404, 'CLAIM_NOT_FOUND');
  if (claim.status !== 'PENDING') throw new ApiError(`claim_not_pending_${claim.status}`, 409);
  const updated = await prisma.legacyClaim.update({
    where:   { id: claimId },
    data:    { status: 'REJECTED', reviewerId: actor.id, reviewedAt: new Date(), reviewNotes: reviewNotes || null },
    include: CLAIM_INCLUDE,
  });
  return serializeClaim(updated);
}

async function expireOldClaims({ now = new Date() } = {}) {
  const rows = await prisma.legacyClaim.findMany({
    where:  { status: 'PENDING', expiresAt: { lt: now } },
    select: { id: true, claimantId: true },
  });
  for (const r of rows) {
    await prisma.legacyClaim.update({
      where: { id: r.id },
      data:  { status: 'EXPIRED', reviewedAt: now, reviewNotes: 'Auto-expired (cron)' },
    });
    try {
      await auditService.logAction({
        action: 'LEGACY_CLAIM_EXPIRE',
        userId: r.claimantId,
        entityType: 'LegacyClaim',
        entityId: r.id,
        metadata: { source: 'cron' },
      });
    } catch (e) { console.error('[legacyContact.expire] audit error:', e.message); }
  }
  return { expiredIds: rows.map((r) => r.id), count: rows.length };
}

module.exports = {
  // owner
  setContact, getContact, revokeContact, resendInvite,
  // heir
  acceptInvite,
  // cron
  triggerInactive, expireOldClaims,
  // claims
  createClaim, getClaim, listMyClaims, listPendingClaims, approveClaim, rejectClaim,
  // constants
  DEFAULT_INACTIVITY_DAYS, INVITE_TTL_DAYS, CLAIM_TTL_DAYS,
};
