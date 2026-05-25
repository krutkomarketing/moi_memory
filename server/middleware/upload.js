'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
	fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/* ─── Multer 2.x — memory storage, validation ─────────── */

const MAX_IMAGE_MB    = 8;
const MAX_AUDIO_MB    = 25;
const MAX_VIDEO_MB    = 200;

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
const AUDIO_MIMES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']);

function buildUpload({ allowedMimes, maxMb, fieldName }) {
	return multer({
		storage: multer.memoryStorage(),
		limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
		fileFilter: (req, file, cb) => {
			if (!allowedMimes.has(file.mimetype)) {
				return cb(new Error(`Недопустимый формат: ${file.mimetype}`));
			}
			cb(null, true);
		},
	}).single(fieldName);
}

const uploadImage = buildUpload({ allowedMimes: IMAGE_MIMES, maxMb: MAX_IMAGE_MB, fieldName: 'photo' });
const uploadAudio = buildUpload({ allowedMimes: AUDIO_MIMES, maxMb: MAX_AUDIO_MB, fieldName: 'audio' });
const uploadVideo = buildUpload({ allowedMimes: VIDEO_MIMES, maxMb: MAX_VIDEO_MB, fieldName: 'video' });

/* ─── Image pipeline: buffer → WebP → /uploads ─────────── */

async function saveImageBuffer(buffer, { maxSize = 1600, quality = 78 } = {}) {
	const id = crypto.randomUUID();
	const filename = `${id}.webp`;
	const filepath = path.join(UPLOADS_DIR, filename);

	const meta = await sharp(buffer).metadata();
	const processed = await sharp(buffer)
		.rotate()
		.resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
		.webp({ quality, effort: 4 })
		.toBuffer({ resolveWithObject: true });

	fs.writeFileSync(filepath, processed.data);

	return {
		url: `/uploads/${filename}`,
		mimeType: 'image/webp',
		sizeBytes: processed.data.length,
		width: processed.info.width,
		height: processed.info.height,
		originalWidth: meta.width || null,
		originalHeight: meta.height || null,
	};
}

/* ─── Raw save (audio/video) ──────────────────────────── */

function saveRawBuffer(buffer, originalName, mimeType) {
	const id = crypto.randomUUID();
	const ext = (path.extname(originalName || '') || mimeExt(mimeType) || '.bin').toLowerCase();
	const filename = `${id}${ext}`;
	const filepath = path.join(UPLOADS_DIR, filename);

	fs.writeFileSync(filepath, buffer);

	return {
		url: `/uploads/${filename}`,
		mimeType,
		sizeBytes: buffer.length,
	};
}

function mimeExt(mime) {
	const map = {
		'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav',
		'audio/ogg': '.ogg', 'audio/webm': '.webm', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a',
		'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'video/x-matroska': '.mkv',
	};
	return map[mime] || '';
}

module.exports = {
	uploadImage,
	uploadAudio,
	uploadVideo,
	saveImageBuffer,
	saveRawBuffer,
};