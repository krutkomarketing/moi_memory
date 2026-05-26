'use strict';
/* Хэшер паролей: PBKDF2-SHA512, 100k iter, 64B → "iterations:saltHex:hashHex".
   Совместим с backend/auth.js — salt передаётся в pbkdf2 КАК HEX STRING, не Buffer.
   Это критично — backend читает saltHex как строку и хэширует её же. */
const crypto = require('node:crypto');

const ITERATIONS = 100000;
const KEYLEN     = 64;
const DIGEST     = 'sha512';

function hashPassword(plain) {
    const saltHex = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(String(plain), saltHex, ITERATIONS, KEYLEN, DIGEST);
    return `${ITERATIONS}:${saltHex}:${hash.toString('hex')}`;
}

module.exports = { hashPassword };
