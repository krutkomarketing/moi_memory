/* ═══════════════════════════════════════════════
   FILE UPLOAD — multipart/form-data parser
   Pure Node.js, no multer dependency
   ═══════════════════════════════════════════════ */
'use strict';

const fs   = require('node:fs');
const path = require('node:path');

// Try loading sharp dynamically for optional compression and WebP conversion
let sharp = null;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('⚠️ [Upload] sharp library not loaded. Image compression and WebP conversion disabled. Original files will be saved.');
}

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_SIZE   = 16 * 1024 * 1024; // Increase max size to 16 MB for media files
const ALLOWED    = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const ALLOWED_AUDIO = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.webm', '.aac']);
const ALLOWED_VIDEO = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi']);

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * Parse a multipart/form-data request and save the first file field.
 * Returns the saved filename.
 */
function parseUpload(req, prefix, allowedExts = ALLOWED) {
  return new Promise((resolve, reject) => {
    const ct = req.headers['content-type'] || '';
    const boundaryMatch = ct.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) return reject(new Error('Not a multipart request'));

    const boundary = '--' + boundaryMatch[1];
    const chunks = [];
    let totalSize = 0;

    req.on('data', chunk => {
      totalSize += chunk.length;
      if (totalSize > MAX_SIZE) { req.destroy(); return reject(new Error('File too large (max 8MB)')); }
      chunks.push(chunk);
    });

    req.on('error', reject);

    req.on('end', async () => {
      try {
        const body = Buffer.concat(chunks);
        const bodyStr = body.toString('binary');

        // Split by boundary
        const parts = bodyStr.split(boundary).slice(1); // first is empty before first boundary

        for (const part of parts) {
          if (part.startsWith('--')) continue; // final boundary

          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd === -1) continue;

          const headers  = part.slice(0, headerEnd);
          const fileData = part.slice(headerEnd + 4, part.length - 2); // strip trailing \r\n

          const cdMatch   = headers.match(/Content-Disposition:[^\r\n]*filename="([^"]+)"/i);
          if (!cdMatch) continue; // not a file field

          const origName = cdMatch[1];
          const ext      = path.extname(origName).toLowerCase();
          if (!allowedExts.has(ext)) { return reject(new Error(`File type not allowed: ${ext}`)); }

          // If sharp is available and it is a static image (not GIF), compress and convert to WebP
          if (sharp && ALLOWED.has(ext) && ext !== '.gif') {
            try {
              const safeName = `${prefix}-${Date.now()}.webp`;
              const savePath = path.join(UPLOAD_DIR, safeName);
              const fileBuffer = Buffer.from(fileData, 'binary');

              const compressedBuffer = await sharp(fileBuffer)
                .resize({
                  width: 2048,
                  height: 2048,
                  fit: 'inside',
                  withoutEnlargement: true
                })
                .webp({ quality: 80 })
                .toBuffer();

              fs.writeFileSync(savePath, compressedBuffer);
              return resolve(safeName);
            } catch (err) {
              console.error('⚠️ [Upload] sharp compression failed, falling back to original upload:', err.message);
            }
          }

          // Fallback if sharp is missing, fails, or for GIF images
          const safeName = `${prefix}-${Date.now()}${ext}`;
          const savePath = path.join(UPLOAD_DIR, safeName);

          // Write binary-encoded string back to buffer
          fs.writeFileSync(savePath, Buffer.from(fileData, 'binary'));
          return resolve(safeName);
        }
        reject(new Error('No file found in request'));
      } catch (err) {
        reject(err);
      }
    });
  });
}

module.exports = { parseUpload, ALLOWED, ALLOWED_AUDIO, ALLOWED_VIDEO };
