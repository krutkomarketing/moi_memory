'use strict';
const path = require('node:path');
const fs   = require('node:fs');
const crypto = require('node:crypto');
const sharp = (() => { try { return require('sharp'); } catch { return null; } })();
const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errors');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_BYTES = {
  IMAGE: 16 * 1024 * 1024,
  AUDIO: 32 * 1024 * 1024,
  VIDEO: 64 * 1024 * 1024,
};

const EXT_TO_KIND = {
  '.jpg': 'IMAGE', '.jpeg': 'IMAGE', '.png': 'IMAGE',
  '.webp': 'IMAGE', '.gif': 'IMAGE',
  '.mp3': 'AUDIO', '.wav': 'AUDIO', '.m4a': 'AUDIO',
  '.ogg': 'AUDIO', '.aac': 'AUDIO',
  '.mp4': 'VIDEO', '.mov': 'VIDEO', '.webm': 'VIDEO',
  '.m4v': 'VIDEO', '.avi': 'VIDEO',
};

function pickKind(originalName, requested) {
  if (requested && ['IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT'].includes(requested)) return requested;
  const ext = path.extname(originalName || '').toLowerCase();
  return EXT_TO_KIND[ext] || null;
}

/**
 * Сохранить файл и создать запись Media.
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} mimetype
 * @param {object} opts { prefix?, uploadedById?, requestedKind? }
 */
async function saveFile(buffer, originalName, mimetype, opts = {}) {
  if (!buffer || !buffer.length) throw new ApiError('Пустой файл', 400);

  const kind = pickKind(originalName, opts.requestedKind);
  if (!kind) throw new ApiError(`Тип файла не поддерживается: ${originalName}`, 400);

  const limit = MAX_BYTES[kind] || MAX_BYTES.IMAGE;
  if (buffer.length > limit) {
    throw new ApiError(`Файл превышает лимит ${(limit / 1024 / 1024).toFixed(0)} МБ`, 413);
  }

  const ext = path.extname(originalName).toLowerCase();
  let outBuf = buffer;
  let outExt = ext || '';
  let outMime = mimetype || '';

  // Картинки → WebP через sharp
  if (sharp && kind === 'IMAGE' && ext !== '.gif') {
    try {
      outBuf = await sharp(buffer)
        .rotate()
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      outExt = '.webp';
      outMime = 'image/webp';
    } catch (e) {
      console.warn('[media] sharp failed, fallback to original:', e.message);
    }
  }

  const filename = `${opts.prefix || 'file'}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${outExt}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), outBuf);

  let width = null, height = null;
  if (sharp && kind === 'IMAGE') {
    try {
      const meta = await sharp(outBuf).metadata();
      width  = meta.width  || null;
      height = meta.height || null;
    } catch {}
  }

  const url = `/uploads/${filename}`;
  const media = await prisma.media.create({
    data: {
      url,
      kind,
      originalName: originalName || null,
      mimeType:     outMime || 'application/octet-stream',
      sizeBytes:    outBuf.length,
      width, height,
      uploadedById: opts.uploadedById || null,
    },
  });
  return media;
}

module.exports = { saveFile, UPLOAD_DIR };