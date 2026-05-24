/**
 * Memorial Bot — Telegram-бот для создания страниц памяти
 * 
 * Сценарий:
 * /start → Главное меню
 * "Создать страницу" → Пошаговый wizard:
 *   1. ФИО
 *   2. Даты жизни
 *   3. Главное фото (или пропустить)
 *   4. Основной текст (эпитафия для Hero)
 *   5-10. 6 контент-блоков (текст + фото/пропустить)
 *   11. Подтверждение → Сохранение → Ссылка + QR
 */

'use strict';

/* Load .env */
const path = require('node:path');
const fs = require('node:fs');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
    });
}

const { Telegraf, Markup, session } = require('telegraf');
const { createProfile } = require('./handlers/create-profile');
const { blockWizard } = require('./handlers/block-wizard');
const { myPages, handleEdit, handleDelete } = require('./handlers/my-pages');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не задан в .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Сессия для хранения состояния wizard
bot.use(session());

// Инициализация сессии
bot.use((ctx, next) => {
  if (!ctx.session) ctx.session = {};
  return next();
});

/* ══════════════════════════════════════
   ГЛАВНОЕ МЕНЮ
   ══════════════════════════════════════ */

const MAIN_MENU = Markup.keyboard([
  ['🕯 Создать страницу памяти'],
  ['📋 Мои страницы', '❓ Помощь'],
]).resize();

bot.start(async (ctx) => {
  ctx.session = {};

  await ctx.reply(
    '🕯 *Память — Хранители воспоминаний*\n\n' +
    'Этот бот создаёт мемориальные страницы для ваших близких.\n\n' +
    'Вы заполняете информацию шаг за шагом — имя, даты, фото, историю жизни — ' +
    'а бот собирает из этого красивую веб-страницу с уникальной ссылкой и QR-кодом.\n\n' +
    'QR-код можно разместить на памятнике — любой человек отсканирует его камерой телефона и попадёт на страницу памяти вашего близкого.',
    { parse_mode: 'Markdown' }
  );

  await ctx.reply(
    '📱 *Как это выглядит:*\n\n' +
    '🔗 Пример страницы: http://localhost:3000/person.html?id=ivanova-maria\n\n' +
    '_(Скриншот будет добавлен позже)_\n\n' +
    'Табличка с QR-кодом крепится на памятник.\n' +
    'Посетитель сканирует → открывается страница.',
    { parse_mode: 'Markdown' }
  );

  await ctx.reply('👇 Выберите действие:', MAIN_MENU);
});

bot.hears('❓ Помощь', (ctx) => {
  return ctx.reply(
    '📖 *Как это работает*\n\n' +
    'Вы создаёте мемориальную страницу за 5-10 минут:\n\n' +
    '*1.* ФИО и даты жизни\n' +
    '*2.* Главное фото (обязательно)\n' +
    '*3.* Краткий текст-эпитафия\n' +
    '*4.* 6 блоков истории жизни:\n' +
    '    • Детство и юность\n' +
    '    • Образование\n' +
    '    • Профессиональный путь\n' +
    '    • Семья\n' +
    '    • Хобби и увлечения\n' +
    '    • Наследие\n\n' +
    'К каждому блоку можно прикрепить фото. Любой блок можно пропустить.\n\n' +
    '*Результат:* красивая веб-страница с уникальной ссылкой.\n' +
    'QR-код можно распечатать и разместить на памятнике.\n\n' +
    '💡 _Все фото автоматически оптимизируются для быстрой загрузки._',
    { parse_mode: 'Markdown' }
  );
});

bot.hears('📋 Мои страницы', (ctx) => myPages(ctx));
bot.hears('🕯 Создать страницу памяти', (ctx) => createProfile.start(ctx));

/* ══════════════════════════════════════
   WIZARD — обработка текста и фото
   ══════════════════════════════════════ */

// Обработка текстовых сообщений (шаги wizard)
bot.on('text', (ctx) => {
  const state = ctx.session?.wizard;
  if (!state) return;

  switch (state.step) {
    case 'fullName':      return createProfile.handleFullName(ctx);
    case 'dates':         return createProfile.handleDates(ctx);
    case 'mainText':      return createProfile.handleMainText(ctx);
    case 'blockText':     return blockWizard.handleBlockText(ctx);
    case 'quote':         return blockWizard.handleQuoteText(ctx);
    case 'quoteAfterBlock': return blockWizard.handleQuoteAfterBlock(ctx);
    default: return;
  }
});

// Обработка фото
bot.on('photo', (ctx) => {
  const state = ctx.session?.wizard;
  if (!state) return;

  switch (state.step) {
    case 'mainPhoto':     return createProfile.handleMainPhoto(ctx);
    case 'blockPhoto':    return blockWizard.handleBlockPhoto(ctx);
    default: return;
  }
});

// Callback кнопки (inline)
bot.on('callback_query', (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data === 'skip_main_photo')  return createProfile.skipMainPhoto(ctx);
  if (data === 'skip_block_photo') return blockWizard.skipBlockPhoto(ctx);
  if (data === 'skip_block')       return blockWizard.skipBlock(ctx);
  if (data === 'skip_quote_after_block') return blockWizard.skipQuoteAfterBlock(ctx);
  if (data === 'visibility_public')  return blockWizard.setVisibility(ctx, true);
  if (data === 'visibility_private') return blockWizard.setVisibility(ctx, false);
  if (data === 'confirm_publish')  return createProfile.confirmPublish(ctx);
  if (data === 'cancel_wizard')    return createProfile.cancel(ctx);
  if (data === 'cancel_delete')    { ctx.answerCbQuery('Отменено'); return; }
  if (data.startsWith('confirm_delete_')) {
    const id = data.replace('confirm_delete_', '');
    const db = require('./db');
    db.deleteProfile(id);
    ctx.answerCbQuery('Удалено');
    return ctx.reply('✅ Страница удалена.');
  }
  if (data.startsWith('edit_'))    return handleEdit(ctx, data);
  if (data.startsWith('delete_'))  return handleDelete(ctx, data);

  return ctx.answerCbQuery();
});

/* ══════════════════════════════════════
   ЗАПУСК
   ══════════════════════════════════════ */

const { startScheduler } = require('./scheduler');

bot.launch()
  .then(() => {
    process.stdout.write('🤖 Memorial Bot запущен\n');
    startScheduler(bot);
  })
  .catch(err => {
    process.stderr.write('❌ Ошибка запуска бота: ' + err.message + '\n');
    process.exit(1);
  });

bot.catch((err) => {
  console.error('Bot error:', err.message);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
