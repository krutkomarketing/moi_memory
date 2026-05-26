'use strict';
/* trash.js — корзина: список удалённых страниц + restore / hard delete.
   Использует deletedAt soft-delete. ADMIN видит все удалённые, USER — только свои. */
const { Markup } = require('telegraf');
const prisma = require('../lib/prisma');
const { getOrCreateBotUser } = require('../lib/auth');

const MAIN_MENU = Markup.keyboard([
    ['🕯 Создать страницу памяти'],
    ['📋 Мои страницы', '🔑 Пароль'],
    ['🗑 Корзина', '❓ Помощь'],
]).resize();

async function showTrash(ctx) {
    const user = await getOrCreateBotUser(ctx.from);

    const where = user.role === 'ADMIN'
        ? { deletedAt: { not: null } }
        : { ownerId: user.id, deletedAt: { not: null } };

    const profiles = await prisma.profile.findMany({
        where,
        orderBy: { deletedAt: 'desc' },
        select: { id: true, slug: true, fullName: true, deletedAt: true },
        take: 30,
    });

    if (!profiles.length) {
        return ctx.reply(
            '🗑 Корзина пуста.\n\nЗдесь будут страницы которые вы удалили. Они хранятся 30 дней, затем удаляются автоматически.',
            MAIN_MENU
        );
    }

    const fmtDate = (d) => {
        if (!d) return '';
        const dt = new Date(d);
        const now = new Date();
        const days = Math.floor((now - dt) / (1000 * 60 * 60 * 24));
        const left = Math.max(0, 30 - days);
        return `удалено ${days} дн. назад, осталось ${left} дн.`;
    };

    const list = profiles.map((p, i) =>
        `${i + 1}. ${p.fullName}\n   🕐 ${fmtDate(p.deletedAt)}`
    ).join('\n\n');

    const buttons = profiles.map((p) => [
        Markup.button.callback(`↩️ ${p.fullName.slice(0, 18)}`, `trash_restore_${p.id}`),
        Markup.button.callback('🔥', `trash_hard_${p.id}`),
    ]);

    return ctx.reply(
        `🗑 Корзина (${profiles.length}):\n\n${list}\n\n↩️ Восстановить · 🔥 Удалить навсегда`,
        Markup.inlineKeyboard(buttons)
    );
}

async function handleRestore(ctx, profileId) {
    const user = await getOrCreateBotUser(ctx.from);
    const profile = await prisma.profile.findUnique({ where: { id: profileId } });
    if (!profile) {
        ctx.answerCbQuery('Не найдено');
        return ctx.reply('⚠️ Страница не найдена.');
    }
    if (profile.ownerId !== user.id && user.role !== 'ADMIN') {
        ctx.answerCbQuery('Доступ запрещён');
        return ctx.reply('⛔ Это не ваша страница.');
    }
    if (!profile.deletedAt) {
        ctx.answerCbQuery('Уже восстановлена');
        return ctx.reply('ℹ️ Страница уже активна.');
    }

    await prisma.profile.update({
        where: { id: profileId },
        data: { deletedAt: null },
    });

    ctx.answerCbQuery('Восстановлено');
    return ctx.reply(`✅ Страница «${profile.fullName}» восстановлена.\n\nПосмотреть: /menu → 📋 Мои страницы`);
}

async function handleHardDelete(ctx, profileId) {
    ctx.answerCbQuery();
    return ctx.reply(
        '⚠️ Удалить страницу НАВСЕГДА?\n\nЭто действие необратимо. Будут удалены: основной текст, все блоки, фотографии, история событий, гостевые воспоминания.',
        Markup.inlineKeyboard([
            [Markup.button.callback('🔥 Да, удалить навсегда', `trash_confirm_${profileId}`)],
            [Markup.button.callback('↩️ Отмена', 'trash_cancel')],
        ])
    );
}

async function confirmHardDelete(ctx, profileId) {
    const user = await getOrCreateBotUser(ctx.from);
    const profile = await prisma.profile.findUnique({ where: { id: profileId } });
    if (!profile) {
        ctx.answerCbQuery('Не найдено');
        return ctx.editMessageText('⚠️ Страница уже удалена.');
    }
    if (profile.ownerId !== user.id && user.role !== 'ADMIN') {
        ctx.answerCbQuery('Доступ запрещён');
        return ctx.editMessageText('⛔ Это не ваша страница.');
    }

    await prisma.profile.delete({ where: { id: profileId } });
    ctx.answerCbQuery('Удалено навсегда');
    return ctx.editMessageText(`🔥 Страница «${profile.fullName}» удалена навсегда.`);
}

async function cancelHardDelete(ctx) {
    await ctx.answerCbQuery('Отменено');
    return ctx.editMessageText('↩️ Удаление отменено. Страница осталась в корзине.');
}

module.exports = { showTrash, handleRestore, handleHardDelete, confirmHardDelete, cancelHardDelete };
