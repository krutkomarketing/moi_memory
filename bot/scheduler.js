'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const BOT_DB_PATH = path.join(__dirname, 'data', 'bot.db');
const SERVER_DB_PATH = path.join(__dirname, '..', 'server', 'data', 'memory.db');

function parseDDMMYYYY(str) {
  if (!str) return null;
  const clean = str.replace(/,/g, '.').replace(/\//g, '.').trim();
  const m = clean.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) {
    return {
      day: parseInt(m[1], 10),
      month: parseInt(m[2], 10),
      year: parseInt(m[3], 10)
    };
  }
  return null;
}

function declension(n, forms) {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (rem > 1 && rem < 5)   return forms[1];
  if (rem === 1)             return forms[0];
  return forms[2];
}

async function checkAnniversaries(bot) {
  console.log('[Scheduler] Checking anniversaries...');
  
  if (!fs.existsSync(SERVER_DB_PATH) || !fs.existsSync(BOT_DB_PATH)) {
    console.warn('[Scheduler] Database files not found. Skipping check.');
    return;
  }

  const today = new Date();
  const day = today.getDate();
  const month = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const serverDb = new DatabaseSync(SERVER_DB_PATH, { open: true });
  const botDb = new DatabaseSync(BOT_DB_PATH, { open: true });

  // Ensure settings table exists in bot.db
  botDb.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Query all static people from family tree
  let people = [];
  try {
    people = serverDb.prepare('SELECT id, name, born, died, city, bio FROM people').all();
  } catch (err) {
    console.error('[Scheduler] Failed to query people from memory.db:', err.message);
  }

  // Find anniversaries
  const birthAnniversaries = [];
  const deathAnniversaries = [];

  for (const p of people) {
    const birth = parseDDMMYYYY(p.born);
    const death = parseDDMMYYYY(p.died);

    if (birth && birth.day === day && birth.month === month) {
      const age = currentYear - birth.year;
      // If the person is deceased, it's a "would have been X years old" anniversary
      const isDeceased = !!p.died;
      birthAnniversaries.push({ person: p, age, isDeceased, birthYear: birth.year });
    }

    if (death && death.day === day && death.month === month) {
      const yearsPassed = currentYear - death.year;
      birthAnniversaries.push({ person: p, yearsPassed, isDeathAnniversary: true, deathYear: death.year });
    }
  }

  // If there are anniversaries, broadcast to all bot users
  if (birthAnniversaries.length > 0 || deathAnniversaries.length > 0) {
    let users = [];
    try {
      users = botDb.prepare("SELECT telegram_id FROM users WHERE telegram_id NOT LIKE 'site_user%'").all();
    } catch (err) {
      console.error('[Scheduler] Failed to query users from bot.db:', err.message);
    }

    console.log(`[Scheduler] Found ${birthAnniversaries.length + deathAnniversaries.length} anniversaries. Broadcasting to ${users.length} users.`);

    for (const ann of birthAnniversaries) {
      let text = '';
      if (ann.isDeathAnniversary) {
        text = `🕯️ *День памяти сегодня*\n\n` +
               `Сегодня исполняется *${ann.yearsPassed} ${declension(ann.yearsPassed, ['год', 'года', 'лет'])}* со дня ухода из жизни нашего близкого:\n` +
               `*${ann.person.name}*\n` +
               `(${ann.person.born} — ${ann.person.died})\n\n` +
               `${ann.person.city ? `📍 Место: ${ann.person.city}\n` : ''}` +
               `🕊️ Вспомним добрым словом и почтим его память.`;
      } else if (ann.isDeceased) {
        text = `🕯️ *День памяти (день рождения)*\n\n` +
               `Сегодня исполнилось бы *${ann.age} ${declension(ann.age, ['год', 'года', 'лет'])}* нашему родственнику:\n` +
               `*${ann.person.name}*\n` +
               `(${ann.person.born} — ${ann.person.died})\n\n` +
               `🕊️ Светлая память!`;
      } else {
        text = `🎉 *День рождения сегодня!*\n\n` +
               `Сегодня празднует свой день рождения:\n` +
               `*${ann.person.name}* (род. ${ann.person.born})\n` +
               `Исполняется *${ann.age} ${declension(ann.age, ['год', 'года', 'лет'])}*! 🎂\n\n` +
               `Поздравляем и желаем крепкого здоровья!`;
      }

      for (const u of users) {
        try {
          await bot.telegram.sendMessage(u.telegram_id, text, { parse_mode: 'Markdown' });
        } catch (sendErr) {
          console.warn(`[Scheduler] Failed to send message to user ${u.telegram_id}:`, sendErr.message);
        }
      }
    }
  } else {
    console.log('[Scheduler] No anniversaries found for today.');
  }

  serverDb.close();
  botDb.close();
}

function runCheck(bot) {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentHour = today.getHours();

  let botDb = null;
  try {
    botDb = new DatabaseSync(BOT_DB_PATH, { open: true });
    botDb.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    const row = botDb.prepare("SELECT value FROM settings WHERE key = 'last_anniversary_check'").get();
    const lastChecked = row ? row.value : '';

    // Only run if not run today, and it is 9:00 AM or later (or first run ever)
    if (lastChecked !== dateStr) {
      if (currentHour >= 9 || lastChecked === '') {
        botDb.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_anniversary_check', ?)")
             .run(dateStr);
        botDb.close();
        botDb = null;
        
        checkAnniversaries(bot).catch(err => {
          console.error('[Scheduler] Error checking anniversaries:', err);
        });
      }
    }
  } catch (dbErr) {
    console.error('[Scheduler] Database error during scheduler loop:', dbErr.message);
  } finally {
    if (botDb) botDb.close();
  }
}

function startScheduler(bot) {
  console.log('⏳ [Scheduler] Initialization...');
  
  // Run checks initially on boot
  setTimeout(() => runCheck(bot), 5000);

  // Poll every hour to see if we should trigger today's checks
  setInterval(() => {
    runCheck(bot);
  }, 60 * 60 * 1000); // 1 hour
}

module.exports = { startScheduler };
