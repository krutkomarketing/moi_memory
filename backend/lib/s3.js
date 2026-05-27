'use strict';

const {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
} = require('@aws-sdk/client-s3');

const trim = (v) => (v || '').trim();

let _client = null;
let _checked = false;
let _enabled = false;
let _bucket = '';
let _publicBase = '';

function ensureChecked() {
    if (_checked) return;
    _checked = true;

    const bucket          = trim(process.env.S3_BUCKET);
    const endpoint        = trim(process.env.S3_ENDPOINT);
    const region          = trim(process.env.S3_REGION) || 'auto';
    const accessKeyId     = trim(process.env.S3_ACCESS_KEY_ID);
    const secretAccessKey = trim(process.env.S3_SECRET_ACCESS_KEY);
    const publicBase      = trim(process.env.S3_PUBLIC_URL_BASE);

    const isAscii = (s) => /^[\x20-\x7E]*$/.test(s);

    if (!bucket || !endpoint || !accessKeyId || !secretAccessKey || !publicBase) {
        console.log('[s3] disabled — missing S3_* env vars (using local /uploads)');
        return;
    }
    if (!isAscii(accessKeyId) || !isAscii(secretAccessKey)) {
        console.warn('[s3] disabled — S3 credentials contain non-ASCII chars (placeholder?); using local /uploads');
        return;
    }

    _client = new S3Client({
        region,
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
    });
    _bucket = bucket;
    _publicBase = publicBase.replace(/\/+$/, '');
    _enabled = true;
    console.log(`[s3] enabled — bucket=${bucket}, public=${_publicBase}`);
}

function isEnabled() {
    ensureChecked();
    return _enabled;
}

async function uploadBuffer(filename, buffer, mimeType) {
    ensureChecked();
    if (!_enabled) throw new Error('[s3] not enabled');
    const key = `media/${filename}`;
    await _client.send(new PutObjectCommand({
        Bucket: _bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType || 'application/octet-stream',
    }));
    return `${_publicBase}/${key}`;
}

async function deleteByUrl(url) {
    ensureChecked();
    if (!_enabled || !url) return false;
    if (!url.startsWith(_publicBase + '/')) return false;
    const key = url.slice(_publicBase.length + 1);
    try {
        await _client.send(new DeleteObjectCommand({ Bucket: _bucket, Key: key }));
        return true;
    } catch (e) {
        console.warn('[s3] delete failed:', e.name, '-', e.message);
        return false;
    }
}

module.exports = { isEnabled, uploadBuffer, deleteByUrl };
