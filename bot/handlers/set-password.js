'use strict';
/* set-password.js — wizard смены пароля для логина на сайте.
   Шаги:
     1. start: предупреждение + просьба ввести новый пароль
     2. setpw_input: принимает текст, валидирует, хеширует, сохраняет, удаляет сообщение
*/
const { Markup } = require('telegraf');
const prisma = require('../lib/prisma');
const { getOrCreateBotUser } = require('../lib/auth');
const { hashPassword } = require('../lib/passwordHash');

async function start(ctx) {
    const user = await getOrCreateBotUser(ctx.from);
    ctx.session.wizard = { step: 'setpw_input', data: { userId: user.id, email: user.email } };
    return ctx.reply(
        '🔑 Установка пароля для входа на сайт\n\n' +
        `Ваш email: \`${user.email}\`\n\n` +
        'Отправьте новый пароль одним сообщением (минимум 8 символов).\n\n' +
        '⚠️ В целях безопасности я удалю ваше сообщение с паролем сразу после сохранения. ' +
        'Используйте сложный пароль и сохраните его в менеджере паролей.',
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Отмена', 'setpw_cancel')],
            ]),
        }
    );
}

async function handleInput(ctx) {
    const password = (ctx.message?.text || '').trim();
    if (password.length < 8) {
        return ctx.reply('❌ Пароль слишком короткий (минимум 8 символов). Попробуйте ещё раз.');
    }
    if (password.length > 128) {
        return ctx.reply('❌ Пароль слишком длинный (максимум 128 символов). Попробуйте ещё раз.');
    }

    const { userId, email } = ctx.session.wizard.data;

    try {
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: hashPassword(password) },
        });
    } catch (e) {
        ctx.session = {};
        return ctx.reply('❌ Не удалось сохранить пароль: ' + e.message);
    }

    // Удаляем сообщение с паролем
    try { await ctx.deleteMessage(ctx.message.message_id); } catch {}

    ctx.session = {};

    return ctx.reply(
        '✅ Пароль установлен.\n\n' +
        `Теперь вы можете войти на сайте:\n` +
        `• Email: \`${email}\`\n` +
        `• Пароль: тот что вы только что ввели\n\n` +
        'Сообщение с паролем удалено из чата.',
        { parse_mode: 'Markdown' }
    );
}

async function cancel(ctx) {
    ctx.session = {};
    await ctx.answerCbQuery('Отменено');
    return ctx.editMessageText('🔑 Смена пароля отменена.');
}

module.exports = { start, handleInput, cancel };
