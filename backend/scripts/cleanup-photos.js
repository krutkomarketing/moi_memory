'use strict';

const fs = require('node:fs');
const path = require('node:path');

const prisma = require('../lib/prisma');
const { UPLOAD_DIR } = require('../services/mediaService');

function parseArgs(argv) {
  const out = { dryRun: true, apply: false, limit: 50 };
  for (const a of argv) {
    if (a === '--apply') out.apply = true;
    if (a === '--dry-run') out.dryRun = true;
    if (a.startsWith('--limit=')) {
      const n = parseInt(a.split('=')[1], 10);
      if (Number.isFinite(n) && n > 0) out.limit = n;
    }
  }
  if (out.apply) out.dryRun = false;
  return out;
}

function fileExists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function filenameFromUrl(url) {
  if (!url) return null;
  return path.basename(String(url));
}

async function findOrphanMedia(limit = 1000) {
  const rows = await prisma.media.findMany({
    take: Math.min(5000, Math.max(1, limit)),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      url: true,
      kind: true,
      createdAt: true,
      sizeBytes: true,
      mimeType: true,
      originalName: true,
      uploadedById: true,
      profileCover: { select: { id: true } },
      blockPhotos: { select: { id: true }, take: 1 },
      nodePhotos: { select: { id: true }, take: 1 },
      memoryAttachments: { select: { id: true }, take: 1 },
      galleryItems: { select: { id: true }, take: 1 },
    },
  });

  const orphan = rows.filter((m) => {
    const usedByProfile = !!m.profileCover;
    const usedByBlock = (m.blockPhotos || []).length > 0;
    const usedByNode = (m.nodePhotos || []).length > 0;
    const usedByMemory = (m.memoryAttachments || []).length > 0;
    const usedByGallery = (m.galleryItems || []).length > 0;
    return !(usedByProfile || usedByBlock || usedByNode || usedByMemory || usedByGallery);
  });

  return orphan.map((m) => ({
    id: m.id,
    url: m.url,
    kind: m.kind,
    createdAt: m.createdAt,
    sizeBytes: m.sizeBytes,
    mimeType: m.mimeType,
    originalName: m.originalName,
    uploadedById: m.uploadedById,
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('[cleanup:photos] mode:', args.apply ? 'APPLY' : 'DRY-RUN');
  console.log('[cleanup:photos] upload dir:', UPLOAD_DIR);

  const orphan = await findOrphanMedia(5000);

  const orphanWithDisk = orphan.map((m) => {
    const fn = filenameFromUrl(m.url);
    const diskPath = fn ? path.join(UPLOAD_DIR, fn) : null;
    const exists = diskPath ? fileExists(diskPath) : false;
    return { ...m, filename: fn, diskPath, fileExists: exists };
  });

  const missingFiles = orphanWithDisk.filter((m) => m.filename && !m.fileExists);
  const existingFiles = orphanWithDisk.filter((m) => m.filename && m.fileExists);

  console.log('[cleanup:photos] orphan media:', orphanWithDisk.length);
  console.log('[cleanup:photos] orphan but file exists:', existingFiles.length);
  console.log('[cleanup:photos] orphan but file missing:', missingFiles.length);

  const preview = orphanWithDisk.slice(0, args.limit).map((m) => ({
    id: m.id,
    kind: m.kind,
    url: m.url,
    fileExists: m.fileExists,
    createdAt: m.createdAt.toISOString(),
    sizeBytes: m.sizeBytes,
    originalName: m.originalName,
  }));

  console.log('[cleanup:photos] preview (first ' + args.limit + '):');
  console.log(JSON.stringify(preview, null, 2));

  if (!args.apply) {
    console.log('[cleanup:photos] DRY-RUN: no DB changes.');
    await prisma.$disconnect();
    return;
  }

  const ids = orphanWithDisk.map((m) => m.id);
  if (ids.length === 0) {
    console.log('[cleanup:photos] nothing to delete.');
    await prisma.$disconnect();
    return;
  }

  const res = await prisma.media.deleteMany({ where: { id: { in: ids } } });
  console.log('[cleanup:photos] deleted media rows:', res.count);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('[cleanup:photos] fatal:', e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
