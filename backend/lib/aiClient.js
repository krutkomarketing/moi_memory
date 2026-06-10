'use strict';

/**
 * Тонкий клиент к OpenAI-совместимому API (aihubmix и т.п.).
 * Конфигурация — через env: AI_BASE_URL, AI_API_KEY, AI_MODEL.
 * На Node >=22 fetch/AbortController доступны глобально — доп. зависимостей нет.
 */

const AI_BASE_URL = (process.env.AI_BASE_URL || 'https://aihubmix.com/v1').replace(/\/+$/, '');
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || '30000', 10);
const AI_IMAGE_MODEL = process.env.AI_IMAGE_MODEL || 'gpt-image-2-free';
const AI_IMAGE_TIMEOUT_MS = parseInt(process.env.AI_IMAGE_TIMEOUT_MS || '120000', 10);
const AI_IMAGE_PROVIDER = (process.env.AI_IMAGE_PROVIDER || 'openai').toLowerCase();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const GEMINI_BASE_URL = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
const PIXAZO_API_KEY = process.env.PIXAZO_API_KEY || '';
const PIXAZO_MODEL = process.env.PIXAZO_MODEL || 'flux-1-schnell';
const PIXAZO_EDIT_MODEL = process.env.PIXAZO_EDIT_MODEL || '';
const PIXAZO_BASE_URL = (process.env.PIXAZO_BASE_URL || 'https://gateway.pixazo.ai').replace(/\/+$/, '');

async function chatCompletion(messages, opts = {}) {
  const { temperature = 0.75, maxTokens = 900, json = true } = opts;

  if (!AI_API_KEY) {
    const e = new Error('AI_API_KEY is not set');
    e.code = 'AI_NOT_CONFIGURED';
    throw e;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + AI_API_KEY,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const e = new Error(`AI upstream ${res.status}: ${body.slice(0, 300)}`);
      e.code = 'AI_UPSTREAM';
      e.status = res.status;
      throw e;
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Генерация изображения через Gemini-совместимый API.
 * Работает и с Google AI Studio (generativelanguage.googleapis.com),
 * и с aihubmix-прокси (https://aihubmix.com/gemini) — переключение через GEMINI_BASE_URL.
 * POST {GEMINI_BASE_URL}/v1beta/models/{model}:generateContent
 * Картинка приходит в candidates[].content.parts[].inlineData (base64).
 */
async function geminiImageGeneration(prompt, opts = {}) {
  if (!GEMINI_API_KEY) {
    const e = new Error('GEMINI_API_KEY is not set');
    e.code = 'AI_NOT_CONFIGURED';
    throw e;
  }

  // Части запроса: текст + опциональный референс лица (data URL → inlineData)
  const parts = [{ text: prompt }];
  const refMatch = (opts.referenceImage || '').match(/^data:(image\/[a-z+.-]+);base64,(.+)$/s);
  if (refMatch) {
    parts.push({ inlineData: { mimeType: refMatch[1], data: refMatch[2] } });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_IMAGE_TIMEOUT_MS);

  try {
    const url = `${GEMINI_BASE_URL}/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: { aspectRatio: '4:3' },
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const e = new Error(`Gemini image upstream ${res.status}: ${body.slice(0, 300)}`);
      e.code = 'AI_UPSTREAM';
      e.status = res.status;
      throw e;
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) return { b64: null, mime: null, url: null };
    return {
      b64: imgPart.inlineData.data,
      mime: imgPart.inlineData.mimeType || 'image/png',
      url: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Генерация изображения через Pollinations (бесплатно; у free-тарифа лимит
 * 1 одновременный запрос с IP, поэтому: сериализация всех запросов через
 * очередь + ретраи с паузой на 402/429 «Queue full».
 * POLLINATIONS_TOKEN (env, опционально) снимает лимиты.
 */
const POLLINATIONS_TOKEN = process.env.POLLINATIONS_TOKEN || '';
let pollinationsQueue = Promise.resolve();

function pollinationsImageGeneration(prompt, opts = {}) {
  const task = () => pollinationsFetchWithRetry(prompt, opts);
  const p = pollinationsQueue.then(task, task);
  pollinationsQueue = p.catch(() => {}); // очередь не должна ломаться от ошибок
  return p;
}

async function pollinationsFetchWithRetry(prompt, opts = {}) {
  const { width = 1024, height = 768 } = opts;
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 8000;

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_IMAGE_TIMEOUT_MS);

    try {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 1500))}?width=${width}&height=${height}&nologo=true&model=flux`;
      const headers = POLLINATIONS_TOKEN ? { Authorization: 'Bearer ' + POLLINATIONS_TOKEN } : {};
      const res = await fetch(url, { headers, signal: controller.signal });

      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        return {
          b64: buf.toString('base64'),
          mime: res.headers.get('content-type') || 'image/jpeg',
          url: null,
        };
      }

      const body = await res.text().catch(() => '');
      const e = new Error(`Pollinations upstream ${res.status}: ${body.slice(0, 200)}`);
      e.code = 'AI_UPSTREAM';
      e.status = res.status;
      lastErr = e;

      // 402/429 = очередь IP занята / rate limit — ждём и пробуем ещё
      if ((res.status === 402 || res.status === 429) && attempt < MAX_ATTEMPTS) {
        console.warn(`[pollinations] queue busy (attempt ${attempt}/${MAX_ATTEMPTS}), retry in ${RETRY_DELAY_MS / 1000}s`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw e;
    } catch (err) {
      lastErr = err;
      if (err.name === 'AbortError') {
        const e = new Error('Pollinations timeout');
        e.code = 'AI_UPSTREAM';
        throw e;
      }
      if (err.code === 'AI_UPSTREAM' && (err.status === 402 || err.status === 429) && attempt < MAX_ATTEMPTS) {
        continue; // пауза уже была выше
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/**
 * Скачивает картинку по URL и возвращает { b64, mime }.
 */
async function downloadImageAsB64(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const e = new Error(`Image download failed ${res.status}`);
    e.code = 'AI_UPSTREAM';
    throw e;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { b64: buf.toString('base64'), mime: res.headers.get('content-type') || 'image/png' };
}

/**
 * Асинхронный цикл Pixazo для nano-banana-моделей:
 * POST {slug}/v1/{slug}-request → { request_id, polling_url } →
 * GET /v2/requests/status/{id} → COMPLETED → output.media_url[0].
 */
async function pixazoAsyncFlow(slug, requestBody, headers, controller) {
  const asyncRes = await fetch(`${PIXAZO_BASE_URL}/${slug}/v1/${slug}-request`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal: controller.signal,
  });

  if (!asyncRes.ok) {
    const body = await asyncRes.text().catch(() => '');
    const e = new Error(`Pixazo upstream ${asyncRes.status}: ${body.slice(0, 300)}`);
    e.code = 'AI_UPSTREAM';
    e.status = asyncRes.status;
    throw e;
  }

  const queued = await asyncRes.json();
  if (!queued.request_id) {
    const e = new Error('Pixazo: нет request_id в ответе');
    e.code = 'AI_UPSTREAM';
    throw e;
  }
  const pollingUrl = queued.polling_url ||
    `${PIXAZO_BASE_URL}/v2/requests/status/${queued.request_id}`;

  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    if (controller.signal.aborted) break;

    const st = await fetch(pollingUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': PIXAZO_API_KEY },
      signal: controller.signal,
    });
    if (!st.ok) continue;

    const status = await st.json();
    if (status.status === 'COMPLETED') {
      const outUrl = status?.output?.media_url?.[0];
      if (!outUrl) {
        const e = new Error('Pixazo: COMPLETED без media_url');
        e.code = 'AI_UPSTREAM';
        throw e;
      }
      const img = await downloadImageAsB64(outUrl, controller.signal);
      return { ...img, url: outUrl };
    }
    if (status.status === 'ERROR') {
      const e = new Error(`Pixazo generation error: ${status.error || 'unknown'}`);
      e.code = 'AI_UPSTREAM';
      throw e;
    }
    // QUEUED / PROCESSING → ждём дальше
  }

  const e = new Error('Pixazo timeout');
  e.code = 'AI_UPSTREAM';
  throw e;
}

/**
 * Генерация изображения через Pixazo (gateway.pixazo.ai).
 * Free tier: flux-1-schnell, sdxl, stable-diffusion-1-5 (через getData/checkStatus).
 * nano-banana-2 (t2i) и nano-banana-2-edit (референс лица) — через {slug}-request + поллинг.
 */
async function pixazoImageGeneration(prompt, opts = {}) {
  if (!PIXAZO_API_KEY) {
    const e = new Error('PIXAZO_API_KEY is not set');
    e.code = 'AI_NOT_CONFIGURED';
    throw e;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Ocp-Apim-Subscription-Key': PIXAZO_API_KEY,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_IMAGE_TIMEOUT_MS);

  try {
    const cleanPrompt = prompt.slice(0, 2000);
    const ref = opts.referenceImage || '';

    // ── Image-to-Image с референсом лица (nano-banana-2-edit) ──
    if (ref && PIXAZO_EDIT_MODEL) {
      return await pixazoAsyncFlow(PIXAZO_EDIT_MODEL, {
        prompt: cleanPrompt,
        image_urls: [ref],
        num_images: 1,
        output_format: 'png',
      }, headers, controller);
    }

    // ── Text-to-Image на nano-banana — документированный async-формат ──
    if (PIXAZO_MODEL.startsWith('nano-banana')) {
      return await pixazoAsyncFlow(PIXAZO_MODEL, {
        prompt: cleanPrompt,
        num_images: 1,
        aspect_ratio: '4:3',
        output_format: 'png',
        resolution: '1K',
        sync_mode: false,
      }, headers, controller);
    }

    // ── Попытка 1: Посылаем запрос на получение данных / генерацию ──
    const syncRes = await fetch(`${PIXAZO_BASE_URL}/${PIXAZO_MODEL}/v1/getData`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: prompt.slice(0, 2000),
        width: 1024,
        height: 1024,
        num_steps: 4,
        seed: Math.floor(Math.random() * 100000)
      }),
      signal: controller.signal,
    });

    if (syncRes.ok) {
      const data = await syncRes.json();
      const outUrl = typeof data.output === 'string' ? data.output : data?.output?.media_url?.[0];
      if (outUrl) {
        const img = await downloadImageAsB64(outUrl, controller.signal);
        return { ...img, url: outUrl };
      }

      // Если вернулся requestId, переходим к асинхронному поллингу
      const requestId = data.requestId || data.request_id;
      if (requestId) {
        // Поллинг каждые 3 секунды до общего таймаута
        for (;;) {
          await new Promise((r) => setTimeout(r, 3000));
          if (controller.signal.aborted) break;

          const st = await fetch(`${PIXAZO_BASE_URL}/${PIXAZO_MODEL}/v1/checkStatus`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ requestId }),
            signal: controller.signal,
          });
          if (!st.ok) continue;

          const status = await st.json();
          const pollUrl = typeof status.output === 'string' ? status.output : status?.output?.media_url?.[0];
          if (pollUrl) {
            const img = await downloadImageAsB64(pollUrl, controller.signal);
            return { ...img, url: pollUrl };
          }
          if (status.status === 'ERROR' || status.error) {
            const e = new Error(`Pixazo generation error: ${status.error || 'unknown'}`);
            e.code = 'AI_UPSTREAM';
            throw e;
          }
          // PROCESSING / PENDING → ждём дальше
        }
        const e = new Error('Pixazo timeout');
        e.code = 'AI_UPSTREAM';
        throw e;
      }

      const e = new Error('Pixazo: пустой ответ модели');
      e.code = 'AI_UPSTREAM';
      throw e;
    }

    const body = await syncRes.text().catch(() => '');
    const e = new Error(`Pixazo upstream ${syncRes.status}: ${body.slice(0, 300)}`);
    e.code = 'AI_UPSTREAM';
    e.status = syncRes.status;
    throw e;
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('Pixazo timeout');
      e.code = 'AI_UPSTREAM';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Генерация изображения по текстовому промпту.
 * Провайдер выбирается через env AI_IMAGE_PROVIDER: gemini | openai | pollinations | pixazo.
 * openai-ветка: POST {AI_BASE_URL}/images/generations (aihubmix-совместимо).
 * Возвращает { b64, mime, url }.
 */
async function imageGeneration(prompt, opts = {}) {
  const refSupported = AI_IMAGE_PROVIDER === 'gemini' ||
    (AI_IMAGE_PROVIDER === 'pixazo' && PIXAZO_EDIT_MODEL);
  if (opts.referenceImage && !refSupported) {
    console.warn(`[imageGeneration] провайдер "${AI_IMAGE_PROVIDER}" не поддерживает референс-фото — игнорирую`);
  }
  if (AI_IMAGE_PROVIDER === 'gemini') {
    return geminiImageGeneration(prompt, opts);
  }
  if (AI_IMAGE_PROVIDER === 'pollinations') {
    return pollinationsImageGeneration(prompt, opts);
  }
  if (AI_IMAGE_PROVIDER === 'pixazo') {
    return pixazoImageGeneration(prompt, opts);
  }

  const { size = '1536x1024', quality = 'auto', n = 1 } = opts;

  if (!AI_API_KEY) {
    const e = new Error('AI_API_KEY is not set');
    e.code = 'AI_NOT_CONFIGURED';
    throw e;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_IMAGE_TIMEOUT_MS);

  try {
    const res = await fetch(`${AI_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + AI_API_KEY,
      },
      body: JSON.stringify({
        model: AI_IMAGE_MODEL,
        prompt,
        n,
        size,
        quality,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const e = new Error(`AI image upstream ${res.status}: ${body.slice(0, 300)}`);
      e.code = 'AI_UPSTREAM';
      e.status = res.status;
      throw e;
    }

    const data = await res.json();
    const item = data?.data?.[0] || {};
    return { b64: item.b64_json || null, mime: 'image/png', url: item.url || null };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chatCompletion, imageGeneration, AI_MODEL, AI_IMAGE_MODEL, AI_BASE_URL };