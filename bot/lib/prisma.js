'use strict';

/**
 * Реэкспортируем тот же Prisma client что и сервер.
 * Так у нас один пул соединений и общая схема.
 */
module.exports = require('../../server/lib/prisma');