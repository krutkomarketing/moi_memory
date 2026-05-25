'use strict';
const { PrismaClient } = require('@prisma/client');

// Singleton, чтобы не плодить connections при hot-reload в dev
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

// Graceful shutdown
async function shutdown() {
  await prisma.$disconnect();
}
process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });

module.exports = prisma;