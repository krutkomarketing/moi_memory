'use strict';
const { requireAuth, optionalAuth, requireRole } = require('../auth');

// Уже реализовано в auth.js (мы делали в Stage 1). Просто реэкспорт для удобного импорта.
module.exports = { requireAuth, optionalAuth, requireRole };