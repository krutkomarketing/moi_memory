'use strict';

/**
 * photo.js v2 — Telegram → sharp WebP → server/uploads/{uuid}.webp + Media запись
 */

const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const prisma = require('./lib/prisma');

const UPLOADS_DIR = path.join(__dirname, '..', 'server', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Скачивает фото из Telegram, конвертит в WebP, сохраняет файл и создаёт запись Media.
 * @returns {Promise<{id: string, url: string}>} — Media запись из Postgres
 */
async function downloadAndCreateMedia(ctx, fileId, uploadedById) {
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const url = fileLink.href || fileLink.toString();

  const original = await downloadBuffer(url);

  // sharp pipeline
  const pipeline = sharp(original).rotate();
  const meta = await pipeline.metadata();

  const webpBuffer = await pipeline
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
  const webpMeta = await sharp(webpBuffer).metadata();

  const filename = crypto.randomUUID() + '.webp';
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, webpBuffer);

  const publicUrl = '/uploads/' + filename;

  const media = await prisma.media.create({
    data: {
      kind: 'IMAGE',
      url: publicUrl,
      originalName: `tg_${fileId}.webp`,
      mimeType: 'image/webp',
      sizeBytes: webpBuffer.length,
      width: webpMeta.width || meta.width || null,
      height: webpMeta.height || meta.height || null,
      uploadedById: uploadedById || null,
    },
  });

  return media;
}

module.exports = { downloadAndCreateMedia };