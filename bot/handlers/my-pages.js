'use strict';

/**
 * my-pages.js v2 — список профилей юзера через Prisma.
 */

const { Markup } = require('telegraf');
const prisma = require('../lib/prisma');
const { getOrCreateBotUser } = require('../lib/auth');

async function myPages(ctx) {
  const user = await getOrCreateBotUser(ctx.from);

  const profiles = await prisma.profile.findMany({
    where: { ownerId: user.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, slug: true, fullName: true, birthDate: true, deathDate: true },
  });

  if (!profiles.length) {
    return ctx.reply(
      '📋 У вас пока нет страниц памяти.\n\nНажмите «Создать страницу памяти» чтобы начать.',
      Markup.keyboard([
        ['🕯 Создать страницу памяти'],
        ['📋 Мои страницы', '❓ Помощь'],
      ]).resize()
    );
  }

  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';

  const formatYear = (d) => (d ? new Date(d).getFullYear() : '?');
  const list = profiles.map((p, i) => {
    const dates = `${formatYear(p.birthDate)}–${formatYear(p.deathDate)}`;
    return `${i + 1}. ${p.fullName} (${dates})\n   🔗 ${siteUrl}/person.html?id=${p.slug}`;
  }).join('\n\n');

  const buttons = profiles.map((p) => [
    Markup.button.callback(`✏️ ${p.fullName.slice(0, 20)}`, `edit_${p.id}`),
    Markup.button.callback('🗑', `delete_${p.id}`),
  ]);

  return ctx.reply(
    `📋 Ваши страницы памяти (${profiles.length}):\n\n${list}`,
    Markup.inlineKeyboard(buttons)
  );
}

function handleEdit(ctx, data) {
  const profileId = data.replace('edit_', '');
  ctx.answerCbQuery();
  return ctx.reply(
    '✏️ Редактирование\n\nСкоро здесь будет Mini App для редактирования.\n' +
    `ID: ${profileId}`
  );
}

function handleDelete(ctx, data) {
  const profileId = data.replace('delete_', '');
  ctx.answerCbQuery();
  return ctx.reply(
    '⚠️ Перенести страницу в корзину?\n\nЕё можно будет восстановить из 🗑 Корзины в течение 30 дней.',
    Markup.inlineKeyboard([
      [Markup.button.callback('🗑 Да, удалить', `confirm_delete_${profileId}`)],
      [Markup.button.callback('↩️ Отмена', 'cancel_delete')],
    ])
  );
}

async function confirmDelete(ctx, profileId) {
  const user = await getOrCreateBotUser(ctx.from);
  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!profile) {
    ctx.answerCbQuery('Не найдено');
    return ctx.reply('⚠️ Страница уже удалена.');
  }
  if (profile.ownerId !== user.id && user.role !== 'ADMIN') {
    ctx.answerCbQuery('Доступ запрещён');
    return ctx.reply('⛔ Это не ваша страница.');
  }

  await prisma.profile.update({
	where: { id: profileId },
	data: { deletedAt: new Date() },
});
	ctx.answerCbQuery('В корзину');
	return ctx.reply('🗑 Страница перенесена в корзину.\n\nВосстановить можно через /trash в течение 30 дней.');
}

module.exports = { myPages, handleEdit, handleDelete, confirmDelete };