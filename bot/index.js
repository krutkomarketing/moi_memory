'use strict';

require('dotenv').config();

const { Telegraf, Markup, session } = require('telegraf');
const { createProfile } = require('./handlers/create-profile');
const { blockWizard } = require('./handlers/block-wizard');
const { myPages, handleEdit, handleDelete, confirmDelete } = require('./handlers/my-pages');
const setPassword = require('./handlers/set-password');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не задан в .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

bot.use(session());
bot.use((ctx, next) => {
  if (!ctx.session) ctx.session = {};
  return next();
});

const MAIN_MENU = Markup.keyboard([
	['🕯 Создать страницу памяти'],
	['📋 Мои страницы', '🔑 Пароль'],
	['❓ Помощь'],
]).resize();

bot.start(async (ctx) => {
  ctx.session = {};
  // Регистрируем юзера в Postgres при /start
  try { await require('./lib/auth').getOrCreateBotUser(ctx.from); } catch (_) {}

  await ctx.reply(
    '🕯 Память — Хранители воспоминаний\n\n' +
    'Этот бот создаёт мемориальные страницы для ваших близких.\n\n' +
    'Вы заполняете информацию шаг за шагом — имя, даты, фото, историю жизни — ' +
    'а бот собирает из этого красивую веб-страницу с уникальной ссылкой и QR-кодом.'
  );

  await ctx.reply('🔄 Обновляю меню…', Markup.removeKeyboard());
  await ctx.reply('👇 Выберите действие:', MAIN_MENU);
});

bot.command('menu', async (ctx) => {
  await ctx.reply('🔄 Обновляю меню…', Markup.removeKeyboard());
  return ctx.reply('👇 Выберите действие:', MAIN_MENU);
});

bot.hears('❓ Помощь', (ctx) => {
  return ctx.reply(
    '📖 Как это работает\n\n' +
    'Вы создаёте мемориальную страницу за 5-10 минут:\n\n' +
    '1. ФИО и даты жизни\n' +
    '2. Главное фото (обязательно)\n' +
    '3. Краткий текст-эпитафия\n' +
    '4. 6 блоков истории жизни:\n' +
    '    • Детство и юность\n    • Образование\n    • Профессиональный путь\n' +
    '    • Семья\n    • Хобби и увлечения\n    • Наследие\n\n' +
    'К каждому блоку можно прикрепить фото. Любой блок можно пропустить.'
  );
});

bot.hears('📋 Мои страницы', (ctx) => myPages(ctx));
bot.hears('🕯 Создать страницу памяти', (ctx) => createProfile.start(ctx));
bot.hears('🔑 Пароль', (ctx) => setPassword.start(ctx));

bot.on('text', (ctx) => {
  const state = ctx.session?.wizard;
  if (!state) return;
  switch (state.step) {
    case 'fullName':        return createProfile.handleFullName(ctx);
    case 'dates':           return createProfile.handleDates(ctx);
    case 'mainText':        return createProfile.handleMainText(ctx);
    case 'blockText':       return blockWizard.handleBlockText(ctx);
    case 'quoteAfterBlock': return blockWizard.handleQuoteAfterBlock(ctx);
		case 'setpw_input':     return setPassword.handleInput(ctx);
    default: return;
  }
});

bot.on('photo', (ctx) => {
  const state = ctx.session?.wizard;
  if (!state) return;
  switch (state.step) {
    case 'mainPhoto':  return createProfile.handleMainPhoto(ctx);
    case 'blockPhoto': return blockWizard.handleBlockPhoto(ctx);
    default: return;
  }
});

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data === 'skip_main_photo')        return createProfile.skipMainPhoto(ctx);
  if (data === 'skip_block_photo')       return blockWizard.skipBlockPhoto(ctx);
  if (data === 'skip_block')             return blockWizard.skipBlock(ctx);
  if (data === 'skip_quote_after_block') return blockWizard.skipQuoteAfterBlock(ctx);
  if (data === 'visibility_public')      return blockWizard.setVisibility(ctx, true);
  if (data === 'visibility_private')     return blockWizard.setVisibility(ctx, false);
  if (data === 'confirm_publish')        return createProfile.confirmPublish(ctx);
  if (data === 'cancel_wizard')          return createProfile.cancel(ctx);
	if (data === 'setpw_cancel')          return setPassword.cancel(ctx);
  if (data === 'cancel_delete')          { ctx.answerCbQuery('Отменено'); return; }

  if (data.startsWith('confirm_delete_')) {
    const id = data.replace('confirm_delete_', '');
    return confirmDelete(ctx, id);
  }
  if (data.startsWith('edit_'))   return handleEdit(ctx, data);
  if (data.startsWith('delete_')) return handleDelete(ctx, data);

  return ctx.answerCbQuery();
});

const { startScheduler } = require('./scheduler');

bot.launch()
  .then(() => {
    process.stdout.write('🤖 Memorial Bot запущен\n');
    startScheduler(bot);
  })
  .catch((err) => {
    process.stderr.write('❌ Ошибка запуска: ' + err.message + '\n');
    process.exit(1);
  });

bot.catch((err) => console.error('Bot error:', err.message));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));