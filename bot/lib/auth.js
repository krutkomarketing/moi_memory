'use strict';

const crypto = require('node:crypto');
const prisma = require('./prisma');

async function getOrCreateBotUser(tgUser) {
  const telegramId = String(tgUser.id);
  const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim() || `Telegram ${telegramId}`;

  let user = await prisma.user.findUnique({ where: { telegramId } });
  if (user) return user;

  const email = `tg_${telegramId}@bot.local`;
  // Случайный hash-плейсхолдер — вход через Telegram, пароль не используется
  const passwordHash = crypto.randomBytes(32).toString('hex');

  user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName,
      telegramId,
      role: 'USER',
    },
  });

  return user;
}

module.exports = { getOrCreateBotUser };