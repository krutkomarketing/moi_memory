'use strict';

const express = require('express');
const router = express.Router();

const { wrap, ApiError } = require('../middleware/errors');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const { aiGenerationLimiter } = require('../middleware/rateLimit');
const { chatCompletion, imageGeneration } = require('../lib/aiClient');
const { buildSystemPrompt } = require('../lib/aiPrompt');
const { containsProfanity, cleanProfanity } = require('../lib/profanity');
const aiService = require('../services/aiService');

const MAX_MESSAGES = 24;
const MAX_LEN = 4000;

function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, MAX_LEN) }));
}

/**
 * POST /api/ai/chat
 * body: { messages: [{role, content}], context: { field, originalText?, name?, dates? } }
 * resp: { ok, chatResponse, proposedText }
 *
 * optionalAuth   — если есть JWT, лимит считаем по пользователю, иначе по IP.
 * aiGenerationLimiter — 3 генерации, затем ~минута кулдауна.
 */
router.post('/chat', optionalAuth, aiGenerationLimiter, wrap(async (req, res) => {
  const { messages, context } = req.body || {};
  const ctx = context && typeof context === 'object' ? context : {};

  const field = typeof ctx.field === 'string' ? ctx.field.slice(0, 64) : 'text';
  const originalText = typeof ctx.originalText === 'string' ? ctx.originalText.slice(0, MAX_LEN) : '';
  const personName = typeof ctx.name === 'string' ? ctx.name.slice(0, 200) : '';
  const personDates = typeof ctx.dates === 'string' ? ctx.dates.slice(0, 120) : '';

  const history = sanitizeMessages(messages);
  if (!history.length) throw ApiError.badRequest('Пустой запрос к ИИ');

  // --- защита от матов на входе ---
  const userText = history.filter((m) => m.role === 'user').map((m) => m.content).join('\n') + '\n' + originalText;
  if (containsProfanity(userText)) {
    return res.json({
      ok: true,
      chatResponse:
        'Пожалуйста, переформулируйте запрос без нецензурной лексики — это страница памяти, и текст должен быть уважительным. Опишите обычными словами, о чём рассказать.',
      proposedText: '',
    });
  }

  const system = buildSystemPrompt({ field, originalText, personName, personDates });
  const aiMessages = [{ role: 'system', content: system }, ...history];

  let content;
  try {
    content = await chatCompletion(aiMessages, { temperature: 0.75, maxTokens: 900, json: true });
  } catch (err) {
    if (err.code === 'AI_NOT_CONFIGURED') {
      throw ApiError.internal('ИИ не настроен на сервере (не задан AI_API_KEY)');
    }
    console.error('[ai] upstream error:', err.message);
    throw new ApiError('Сервис ИИ временно недоступен, попробуйте позже', 502, 'AI_UNAVAILABLE');
  }

  // --- парсинг JSON-ответа модели ---
  let chatResponse = '';
  let proposedText = '';
  try {
    const parsed = JSON.parse(content);
    chatResponse = typeof parsed.chatResponse === 'string' ? parsed.chatResponse : '';
    proposedText = typeof parsed.proposedText === 'string' ? parsed.proposedText : '';
  } catch (_) {
    // модель вернула не-JSON — считаем весь ответ текстом
    proposedText = String(content || '').trim();
    chatResponse = 'Готово! Вот предложенный вариант — можно применить или попросить изменить.';
  }

  // --- защита от матов на выходе ---
  if (proposedText && containsProfanity(proposedText)) proposedText = cleanProfanity(proposedText);
  if (chatResponse && containsProfanity(chatResponse)) chatResponse = cleanProfanity(chatResponse);

  if (!chatResponse && proposedText) chatResponse = 'Вот предложенный вариант текста.';

  return res.json({ ok: true, chatResponse, proposedText });
}));

/**
 * POST /api/ai/structure-bio
 * body: { text: "длинный сырой текст истории", context?: { name?, dates? } }
 *
 * Возвращает структурированные блоки, которые фронт может сразу применить
 * к редактору страницы памяти.
 */
router.post('/structure-bio', requireAuth, aiGenerationLimiter, wrap(async (req, res) => {
  const { text, context = {} } = req.body || {};
  if (!text || typeof text !== 'string' || text.trim().length < 30) {
    throw ApiError.badRequest('Нужно надиктовать или написать более длинный текст истории');
  }

  const cleanText = text.trim().slice(0, 15000);
  const personName = context.name || '';
  const personDates = context.dates || '';

  // profanity guard on input
  if (containsProfanity(cleanText)) {
    return res.json({
      ok: true,
      bio: '',
      blocks: [],
      chatResponse: 'Пожалуйста, переформулируйте без нецензурных слов. Мы хотим сохранить уважительный тон страницы памяти.'
    });
  }

  let result;
  try {
    result = await aiService.structureFullBiography(cleanText, { name: personName, dates: personDates });
  } catch (e) {
    console.error('[ai/structure-bio]', e.message);
    throw ApiError.internal('Не удалось обработать текст с помощью ИИ. Попробуйте позже.');
  }

  // light cleanup on output
  if (result.bio && containsProfanity(result.bio)) result.bio = cleanProfanity(result.bio);
  result.blocks = (result.blocks || []).map(b => {
    if (b.text && containsProfanity(b.text)) b.text = cleanProfanity(b.text);
    return b;
  });

  return res.json({
    ok: true,
    bio: result.bio || '',
    blocks: result.blocks || [],
    chatResponse: 'ИИ проанализировал вашу историю и распределил её по разделам страницы памяти. Проверьте и отредактируйте блоки при необходимости.'
  });
}));

/**
 * POST /api/ai/generate-image
 * body: { prompt: string }  — готовый мастер-промпт с фронта
 *   либо { title, text, context?: { name?, dates? }, key? } — промпт соберём здесь.
 * resp: { ok, image: "data:image/png;base64,..." }
 *
 * optionalAuth — тест-страница конструктора работает без JWT.
 */
router.post('/generate-image', optionalAuth, aiGenerationLimiter, wrap(async (req, res) => {
  const body = req.body || {};

  let prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 2500) : '';

  // Если готового промпта нет — собираем из данных блока
  if (!prompt) {
    const title = typeof body.title === 'string' ? body.title.slice(0, 200) : '';
    const text = typeof body.text === 'string' ? body.text.slice(0, 1500) : '';
    if (!title && !text) {
      throw ApiError.badRequest('Нужен prompt либо title/text блока');
    }
    prompt = `A warm vintage memorial illustration. Depicting: ${title}. Soft emotional oil painting, nostalgic lighting, one single person. Context: "${text}". Timeless, respectful, no text in image.`;
  }

  if (containsProfanity(prompt)) {
    throw ApiError.badRequest('Промпт содержит недопустимые слова');
  }

  // Референс лица (data URL); поддерживается провайдером gemini
  let referenceImage = typeof body.referenceImage === 'string' ? body.referenceImage : '';
  if (referenceImage && !/^data:image\/(png|jpe?g|webp);base64,/.test(referenceImage)) referenceImage = '';
  if (referenceImage.length > 1800000) referenceImage = ''; // ~1.3MB бинарных данных

  let result;
  try {
    result = await imageGeneration(prompt, { size: '1536x1024', referenceImage });
  } catch (err) {
    if (err.code === 'AI_NOT_CONFIGURED') {
      throw ApiError.internal('ИИ не настроен на сервере (не задан AI_API_KEY)');
    }
    console.error('[ai/generate-image] upstream error:', err.message);
    throw new ApiError('Сервис генерации изображений временно недоступен', 502, 'AI_UNAVAILABLE');
  }

  if (result.b64) {
    return res.json({ ok: true, image: `data:${result.mime || 'image/png'};base64,${result.b64}` });
  }
  if (result.url) {
    return res.json({ ok: true, image: result.url });
  }
  throw new ApiError('Модель не вернула изображение', 502, 'AI_EMPTY_IMAGE');
}));

/**
 * POST /api/ai/reconstruct-page
 * body: { text: string, currentBlocks: Array }
 * resp: { ok: true, commands: Array }
 */
router.post('/reconstruct-page', optionalAuth, aiGenerationLimiter, wrap(async (req, res) => {
  const { text, currentBlocks } = req.body || {};
  if (!text || typeof text !== 'string') {
    throw ApiError.badRequest('Нужен текст истории для анализа');
  }

  const cleanText = text.trim().slice(0, 15000);
  const blocks = Array.isArray(currentBlocks) ? currentBlocks : [];

  if (containsProfanity(cleanText)) {
    return res.json({
      ok: true,
      commands: []
    });
  }

  let result;
  try {
    result = await aiService.reconstructPage(cleanText, blocks);
  } catch (err) {
    console.error('[ai/reconstruct-page] error:', err.message);
    throw ApiError.internal('Не удалось проанализировать страницу через ИИ.');
  }

  // Очистка от матов на выходе
  const commands = (result.commands || []).map(cmd => {
    if (cmd.title && containsProfanity(cmd.title)) cmd.title = cleanProfanity(cmd.title);
    if (cmd.text && containsProfanity(cmd.text)) cmd.text = cleanProfanity(cmd.text);
    return cmd;
  });

  return res.json({ ok: true, commands });
}));

module.exports = router;