'use strict';

/**
 * scheduler.js v2 — анниверсари через Prisma.
 *
 * Раз в час чекает: сегодня день рождения или день смерти у любого Profile?
 * Если да — рассылает всем User-ам с заполненным telegramId.
 *
 * State (last_anniversary_check) храним in-memory (для прода — заменить на Redis или таблицу).
 */

const prisma = require('./lib/prisma');

let lastCheckedDate = '';

function declension(n, forms) {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (rem > 1 && rem < 5)   return forms[1];
  if (rem === 1)            return forms[0];
  return forms[2];
}

function formatDateRu(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
}

async function checkAnniversaries(bot) {
  console.log('[Scheduler] Checking anniversaries...');

  const today = new Date();
  const day = today.getDate();
  const month = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  // Берём все Profile у которых месяц/день дат совпадает с сегодняшним
  // (Postgres EXTRACT в Prisma через $queryRaw)
  const profiles = await prisma.$queryRaw`
    SELECT id, slug, "fullName", "birthDate", "deathDate"
    FROM "Profile"
    WHERE
      (EXTRACT(MONTH FROM "birthDate") = ${month} AND EXTRACT(DAY FROM "birthDate") = ${day})
      OR
      (EXTRACT(MONTH FROM "deathDate") = ${month} AND EXTRACT(DAY FROM "deathDate") = ${day})
  `;

  if (!profiles.length) {
    console.log('[Scheduler] No anniversaries today.');
    return;
  }

  // Все юзеры бота
  const users = await prisma.user.findMany({
    where: { telegramId: { not: null } },
    select: { telegramId: true },
  });

  console.log(`[Scheduler] Found ${profiles.length} anniversaries, broadcasting to ${users.length} users.`);

  const messages = [];

  for (const p of profiles) {
    const birth = p.birthDate ? new Date(p.birthDate) : null;
    const death = p.deathDate ? new Date(p.deathDate) : null;

    // День смерти
    if (death && death.getDate() === day && death.getMonth() + 1 === month) {
      const yearsPassed = currentYear - death.getFullYear();
      messages.push(
        `🕯️ День памяти сегодня\n\n` +
        `Сегодня исполняется ${yearsPassed} ${declension(yearsPassed, ['год','года','лет'])} ` +
        `со дня ухода из жизни:\n` +
        `${p.fullName}\n` +
        `(${formatDateRu(p.birthDate)} — ${formatDateRu(p.deathDate)})\n\n` +
        `🕊️ Светлая память.`
      );
    }

    // День рождения
    if (birth && birth.getDate() === day && birth.getMonth() + 1 === month) {
      const age = currentYear - birth.getFullYear();
      const isDeceased = !!death;
      messages.push(
        isDeceased
          ? (`🕯️ День памяти (день рождения)\n\n` +
             `Сегодня исполнилось бы ${age} ${declension(age, ['год','года','лет'])}:\n` +
             `${p.fullName}\n(${formatDateRu(p.birthDate)} — ${formatDateRu(p.deathDate)})\n\n🕊️ Светлая память.`)
          : (`🎉 День рождения сегодня!\n\n` +
             `${p.fullName} (род. ${formatDateRu(p.birthDate)})\n` +
             `Исполняется ${age} ${declension(age, ['год','года','лет'])} 🎂`)
      );
    }
  }

  for (const text of messages) {
    for (const u of users) {
      try {
        await bot.telegram.sendMessage(u.telegramId, text);
      } catch (sendErr) {
        console.warn(`[Scheduler] Send failed → ${u.telegramId}:`, sendErr.message);
      }
    }
  }
}

function runCheck(bot) {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const currentHour = today.getHours();

  if (lastCheckedDate === dateStr) return;
  if (currentHour < 9 && lastCheckedDate !== '') return;

  lastCheckedDate = dateStr;
  checkAnniversaries(bot).catch((err) => {
    console.error('[Scheduler] Error:', err);
  });
}

function startScheduler(bot) {
  console.log('⏳ [Scheduler] Initialization...');
  setTimeout(() => runCheck(bot), 5000);
  setInterval(() => runCheck(bot), 60 * 60 * 1000);
}

module.exports = { startScheduler };