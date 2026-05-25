'use strict';

/**
 * create-profile.js v3 — wizard сохраняет напрямую в Postgres через Prisma.
 * Изменение от v2: 6 ContentBlock создаются ВСЕГДА, даже если у блока пустой текст.
 */

const { Markup } = require('telegraf');
const { blockWizard } = require('./block-wizard');
const { downloadAndCreateMedia } = require('../photo');
const { getOrCreateBotUser } = require('../lib/auth');
const { generateUniqueSlug } = require('../lib/slug');
const { parseRange } = require('../lib/dates');
const prisma = require('../lib/prisma');

const BLOCK_TYPE_BY_INDEX  = ['CHILDHOOD', 'EDUCATION', 'CAREER', 'FAMILY', 'HOBBIES', 'LEGACY'];
const BLOCK_TITLE_BY_INDEX = ['Детство и юность', 'Образование', 'Профессиональный путь', 'Семья', 'Хобби и увлечения', 'Наследие'];

function detectGender(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  const firstName = parts[1] || parts[0] || '';
  if (/[аяь]$/i.test(firstName)) return 'FEMALE';
  return 'MALE';
}

function blockKeyByIndex(i) {
  return ['childhood', 'education', 'career', 'family', 'hobbies', 'legacy'][i];
}

const createProfile = {
  start(ctx) {
    ctx.session.wizard = {
      step: 'fullName',
      data: {
        telegramId: String(ctx.from.id),
        fullName: '',
        dates: '',
        mainPhotoMediaId: null,
        mainText: '',
        blocks: [],
        quotes: [],
      },
    };
    return ctx.reply(
      '🕯 Создание страницы памяти\n\n' +
      'Сейчас я проведу вас через несколько шагов.\n\n' +
      '📝 Шаг 1/10 — ФИО\n\nВведите полное имя:\n(Например: Иванова Мария Петровна)',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_wizard')]])
    );
  },

  handleFullName(ctx) {
    const name = ctx.message.text.trim();
    if (name.length < 3)   return ctx.reply('⚠️ Имя слишком короткое. Введите полное ФИО:');
    if (name.length > 100) return ctx.reply('⚠️ Слишком длинное (макс. 100). Попробуйте ещё раз:');

    ctx.session.wizard.data.fullName = name;
    ctx.session.wizard.step = 'dates';
    return ctx.reply(
      '📝 Шаг 2/10 — Даты жизни\n\n' +
      'Введите даты рождения и смерти:\n(Например: 12.03.1918 — 05.11.1987)'
    );
  },

  handleDates(ctx) {
    const dates = ctx.message.text.trim();
    if (dates.length < 4) return ctx.reply('⚠️ Введите хотя бы год рождения (например: 1950–2020):');

    const range = parseRange(dates);
    if (!range.from && !range.to) {
      return ctx.reply('⚠️ Не понял даты. Попробуйте формат: 12.03.1918 — 05.11.1987 или 1950–2020');
    }

    ctx.session.wizard.data.dates = dates;
    ctx.session.wizard.data._birthDate = range.from || null;
    ctx.session.wizard.data._deathDate = range.to   || null;
    ctx.session.wizard.step = 'mainPhoto';

    return ctx.reply(
      '📷 Шаг 3/10 — Главное фото\n\n' +
      'Отправьте главную фотографию для шапки страницы.\n\n⚠️ Главное фото обязательно.',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_wizard')]])
    );
  },

  async handleMainPhoto(ctx) {
    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;

    await ctx.reply('⏳ Обрабатываю фото...');

    try {
      const user  = await getOrCreateBotUser(ctx.from);
      const media = await downloadAndCreateMedia(ctx, fileId, user.id);
      ctx.session.wizard.data.mainPhotoMediaId = media.id;
      ctx.session.wizard.data._ownerId = user.id;
    } catch (err) {
      await ctx.reply('⚠️ Не удалось обработать фото: ' + err.message + '\nПопробуйте другое:');
      return;
    }

    return this.askMainText(ctx);
  },

  skipMainPhoto(ctx) {
    ctx.answerCbQuery('Главное фото обязательно');
    return ctx.reply('⚠️ Главное фото обязательно. Отправьте фотографию:');
  },

  askMainText(ctx) {
    ctx.session.wizard.step = 'mainText';
    return ctx.reply(
      '📝 Шаг 4/10 — Основной текст\n\n' +
      'Напишите краткую эпитафию (1-3 предложения, до 500 символов).'
    );
  },

  handleMainText(ctx) {
    const text = ctx.message.text.trim();
    if (text.length < 10)  return ctx.reply('⚠️ Текст слишком короткий (минимум 10):');
    if (text.length > 500) return ctx.reply('⚠️ Слишком длинный (макс. 500):');

    ctx.session.wizard.data.mainText = text;
    return blockWizard.startBlocks(ctx);
  },

  async confirmPublish(ctx) {
    ctx.answerCbQuery('Публикуем...');
    await ctx.reply('⏳ Сохраняю страницу и обрабатываю фото...');

    const data = ctx.session.wizard.data;
    const ownerId = data._ownerId;

    try {
      // 1. Качаем фото блоков (Media записи) — один раз, по индексу
      const blockMedia = [];
      for (let i = 0; i < BLOCK_TYPE_BY_INDEX.length; i++) {
        const block = data.blocks[i];
        if (!block || !block.photo) {
          blockMedia.push(null);
          continue;
        }
        try {
          const media = await downloadAndCreateMedia(ctx, block.photo, ownerId);
          blockMedia.push(media);
        } catch (err) {
          console.error('[create-profile] block photo failed:', err);
          blockMedia.push(null);
        }
      }

      // 2. Slug
      const slug = await generateUniqueSlug(data.fullName);

      // 3. Транзакция: Profile + 6 ContentBlock'ов (всегда) + цитаты (опционально)
      const profile = await prisma.$transaction(async (tx) => {
        const created = await tx.profile.create({
          data: {
            slug,
            fullName:     data.fullName,
            birthDate:    data._birthDate,
            deathDate:    data._deathDate,
            bio:          data.mainText,
            gender:       detectGender(data.fullName),
            visibility:   data.isPublic === false ? 'UNLISTED' : 'PUBLIC',
            ownerId,
            coverPhotoId: data.mainPhotoMediaId,
          },
        });

        // 6 основных блоков — создаём ВСЕ, даже пустые,
        // чтобы фронт всегда видел все секции.
        let order = 0;
        for (let i = 0; i < BLOCK_TYPE_BY_INDEX.length; i++) {
          const block = data.blocks[i] || {};

          await tx.contentBlock.create({
            data: {
              profileId: created.id,
              type:      BLOCK_TYPE_BY_INDEX[i],
              title:     BLOCK_TITLE_BY_INDEX[i],
              body:      block.text || '',
              photoId:   blockMedia[i] ? blockMedia[i].id : null,
              order,
              isHidden:  false,
            },
          });
          order += 10;

          // Цитата после этого блока (если есть в data.quotes)
          const quotesAfterBlock = (data.quotes || []).filter(
            (q) => q.after === blockKeyByIndex(i)
          );
          for (const q of quotesAfterBlock) {
            await tx.contentBlock.create({
              data: {
                profileId: created.id,
                type:     'CUSTOM',
                title:    'Цитата',
                body:     q.text,
                order:    order - 5, // между блоками
                isHidden: false,
              },
            });
          }
        }

        return created;
      });

      // 4. Формируем ссылку (через slug — фронт person.html?id=slug)
      const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
      const pageUrl = `${siteUrl}/person.html?id=${profile.slug}`;

      const TITLES = BLOCK_TITLE_BY_INDEX;
      const blocksPreview = TITLES
        .map((title, i) => {
          const b = data.blocks[i] || {};
          const hasPhoto = b.photo ? '📷' : '—';
          const textPreview = b.text ? b.text.slice(0, 40) + '...' : '(пусто)';
          return `  ${i + 1}. ${title} ${hasPhoto} ${textPreview}`;
        })
        .join('\n');

      ctx.session = {};

      return ctx.reply(
        '✅ Страница памяти создана!\n\n' +
        `👤 ${data.fullName}\n` +
        `📅 ${data.dates}\n` +
        `📷 Главное фото: ✅\n\n` +
        `📄 Блоки:\n${blocksPreview}\n\n` +
        `🔗 ${pageUrl}\n\n` +
        `🆔 slug: ${profile.slug}`
      );
    } catch (err) {
      console.error('[create-profile] Failed:', err);
      return ctx.reply('❌ Не удалось сохранить: ' + err.message);
    }
  },

  cancel(ctx) {
    ctx.answerCbQuery('Отменено');
    ctx.session = {};
    return ctx.reply(
      '❌ Создание отменено.\n\nНажмите /start чтобы начать заново.',
      Markup.keyboard([
        ['🕯 Создать страницу памяти'],
        ['📋 Мои страницы', '❓ Помощь'],
      ]).resize()
    );
  },
};

module.exports = { createProfile };