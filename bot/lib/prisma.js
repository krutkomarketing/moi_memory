'use strict';

/**
 * Prisma client для бота.
 * Schema/миграции шарятся с backend (копируется в образ при билде),
 * но в Docker каждый сервис имеет свой клиент и свой пул соединений.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
});

// Graceful shutdown — закрываем коннекты к БД при остановке процесса
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
module.exports.prisma = prisma;
module.exports.default = prisma;
