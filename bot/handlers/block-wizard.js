'use strict';

/**
 * block-wizard.js v2 — без изменений в логике, только cleanup и совместимость.
 */

const { Markup } = require('telegraf');

const BLOCK_SCHEMA = [
  { key: 'childhood', title: 'Детство и юность',
    prompt: 'Расскажите о детстве и юности.\n(Где родился, как рос, семья, первые воспоминания)' },
  { key: 'education', title: 'Образование',
    prompt: 'Расскажите об учёбе и становлении.\n(Школа, институт, учителя)' },
  { key: 'career', title: 'Профессиональный путь',
    prompt: 'Расскажите о работе и карьере.\n(Где работал, чем занимался, достижения)' },
  { key: 'family', title: 'Семья',
    prompt: 'Расскажите о семье.\n(Супруг/а, дети, внуки, традиции)' },
  { key: 'hobbies', title: 'Хобби и увлечения',
    prompt: 'Расскажите о хобби.\n(Что любил, чем увлекался, таланты)' },
  { key: 'legacy', title: 'Наследие',
    prompt: 'Каким мы его/её помним?\n(Главные качества, что оставил, чему научил)' },
];

const blockWizard = {

  startBlocks(ctx) {
    ctx.session.wizard.data.blocks = [];
    ctx.session.wizard.data.quotes = [];
    ctx.session.wizard.currentBlock = 0;
    return this._askBlockText(ctx, 0);
  },

  _askBlockText(ctx, index) {
    const block = BLOCK_SCHEMA[index];
    const stepNum = 5 + index;
    ctx.session.wizard.step = 'blockText';
    ctx.session.wizard.currentBlock = index;

    return ctx.reply(
      `📝 Шаг ${stepNum}/10 — ${block.title}\n\n${block.prompt}\n\n` +
      `(Блок ${index + 1} из 6. Минимум 20 символов, максимум 1000)`,
      Markup.inlineKeyboard([
        [Markup.button.callback('⏭ Пропустить блок', 'skip_block')],
        [Markup.button.callback('❌ Отмена', 'cancel_wizard')],
      ])
    );
  },

  handleBlockText(ctx) {
    const text = ctx.message.text.trim();
    const index = ctx.session.wizard.currentBlock;
    if (text.length < 20) return ctx.reply('⚠️ Слишком короткий (минимум 20). Расскажите подробнее или нажмите «Пропустить».');
    if (text.length > 1000) return ctx.reply('⚠️ Слишком длинный (макс. 1000):');

    ctx.session.wizard.pendingBlockText = text;
    ctx.session.wizard.step = 'blockPhoto';
    const block = BLOCK_SCHEMA[index];

    return ctx.reply(
      `📷 Фото для блока «${block.title}»\n\nОтправьте фото или нажмите «Без фото».`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📝 Без фото', 'skip_block_photo')],
        [Markup.button.callback('❌ Отмена', 'cancel_wizard')],
      ])
    );
  },

  handleBlockPhoto(ctx) {
    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;
    const text = ctx.session.wizard.pendingBlockText || '';

    ctx.session.wizard.data.blocks.push({ text, photo: fileId });
    ctx.session.wizard.pendingBlockText = null;
    return this._nextBlock(ctx);
  },

  skipBlockPhoto(ctx) {
    ctx.answerCbQuery('Без фото');
    const text = ctx.session.wizard.pendingBlockText || '';
    ctx.session.wizard.data.blocks.push({ text, photo: null });
    ctx.session.wizard.pendingBlockText = null;
    return this._nextBlock(ctx);
  },

  skipBlock(ctx) {
    ctx.answerCbQuery('Блок пропущен');
    ctx.session.wizard.data.blocks.push({ text: '', photo: null });
    ctx.session.wizard.pendingBlockText = null;
    return this._nextBlock(ctx);
  },

  _nextBlock(ctx) {
    const currentIndex = ctx.session.wizard.data.blocks.length - 1;
    const lastBlock = ctx.session.wizard.data.blocks[currentIndex];

    if (lastBlock && lastBlock.text) {
      return this._askQuoteAfterBlock(ctx, currentIndex);
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex >= 6) return this._showPreview(ctx);
    return this._askBlockText(ctx, nextIndex);
  },

  _askQuoteAfterBlock(ctx, blockIndex) {
    const block = BLOCK_SCHEMA[blockIndex];
    ctx.session.wizard.step = 'quoteAfterBlock';
    ctx.session.wizard.quoteBlockIndex = blockIndex;

    return ctx.reply(
      `💬 Цитата после блока «${block.title}»\n\nНапишите цитату или нажмите «Пропустить».`,
      Markup.inlineKeyboard([
        [Markup.button.callback('⏭ Пропустить', 'skip_quote_after_block')],
        [Markup.button.callback('❌ Отмена', 'cancel_wizard')],
      ])
    );
  },

  handleQuoteAfterBlock(ctx) {
    const text = ctx.message.text.trim();
    const blockIndex = ctx.session.wizard.quoteBlockIndex;
    if (text.length < 3) return ctx.reply('⚠️ Слишком короткая.');
    if (text.length > 300) return ctx.reply('⚠️ Макс. 300:');

    if (!ctx.session.wizard.data.quotes) ctx.session.wizard.data.quotes = [];
    const afterKey = BLOCK_SCHEMA[blockIndex].key;
    ctx.session.wizard.data.quotes.push({ text, after: afterKey });

    const nextIndex = blockIndex + 1;
    if (nextIndex >= 6) return this._showPreview(ctx);
    return this._askBlockText(ctx, nextIndex);
  },

  skipQuoteAfterBlock(ctx) {
    ctx.answerCbQuery('Без цитаты');
    const blockIndex = ctx.session.wizard.quoteBlockIndex;
    const nextIndex = blockIndex + 1;
    if (nextIndex >= 6) return this._showPreview(ctx);
    return this._askBlockText(ctx, nextIndex);
  },

  _showPreview(ctx) {
    const data = ctx.session.wizard.data;
    const blocksInfo = data.blocks.map((b, i) => {
      const title = BLOCK_SCHEMA[i].title;
      const hasText = b.text ? '✅' : '⬜';
      const hasPhoto = b.photo ? '📷' : '—';
      return `  ${hasText} ${title} ${hasPhoto}`;
    }).join('\n');
    const filledBlocks = data.blocks.filter((b) => b.text).length;

    ctx.session.wizard.step = 'visibility';

    return ctx.reply(
      '📋 Превью страницы памяти\n\n' +
      `👤 ${data.fullName}\n` +
      `📅 ${data.dates}\n` +
      `📷 Главное фото: ${data.mainPhotoMediaId ? '✅' : '—'}\n` +
      `📝 Основной текст: ${data.mainText.slice(0, 50)}...\n\n` +
      `📄 Блоки (${filledBlocks}/6):\n${blocksInfo}\n\n` +
      '🔒 Выберите видимость:\n\n• Публичная — видна всем\n• Приватная — только по ссылке',
      Markup.inlineKeyboard([
        [Markup.button.callback('🌐 Публичная', 'visibility_public')],
        [Markup.button.callback('🔒 Приватная', 'visibility_private')],
        [Markup.button.callback('❌ Отмена', 'cancel_wizard')],
      ])
    );
  },

  setVisibility(ctx, isPublic) {
    ctx.answerCbQuery(isPublic ? 'Публичная' : 'Приватная');
    ctx.session.wizard.data.isPublic = isPublic;
    ctx.session.wizard.step = 'confirm';

    return ctx.reply(
      `Видимость: ${isPublic ? '🌐 Публичная' : '🔒 Приватная'}\n\nПодтвердите публикацию:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Опубликовать', 'confirm_publish')],
        [Markup.button.callback('❌ Отмена', 'cancel_wizard')],
      ])
    );
  },
};

module.exports = { blockWizard };