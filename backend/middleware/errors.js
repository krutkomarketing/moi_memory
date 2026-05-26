'use strict';

/**
 * Кастомная ошибка API с HTTP-статусом и опциональным кодом.
 * Используется во всех services/* для контролируемых ошибок.
 *
 *   throw ApiError.notFound('Дерево не найдено');
 *   throw ApiError.unauthorized();
 */
class ApiError extends Error {
    constructor(message, status = 500, code) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.isApiError = true;
    }

    static badRequest(msg = 'Некорректный запрос')      { return new ApiError(msg, 400, 'BAD_REQUEST'); }
    static unauthorized(msg = 'Требуется авторизация')  { return new ApiError(msg, 401, 'UNAUTHORIZED'); }
    static forbidden(msg = 'Доступ запрещён')           { return new ApiError(msg, 403, 'FORBIDDEN'); }
    static notFound(msg = 'Не найдено')                 { return new ApiError(msg, 404, 'NOT_FOUND'); }
    static conflict(msg = 'Конфликт состояния')         { return new ApiError(msg, 409, 'CONFLICT'); }
    static tooLarge(msg = 'Слишком большой запрос')     { return new ApiError(msg, 413, 'PAYLOAD_TOO_LARGE'); }
    static unprocessable(msg = 'Невалидные данные')     { return new ApiError(msg, 422, 'UNPROCESSABLE'); }
    static rateLimited(msg = 'Слишком много запросов')  { return new ApiError(msg, 429, 'RATE_LIMITED'); }
    static internal(msg = 'Внутренняя ошибка сервера')  { return new ApiError(msg, 500, 'INTERNAL'); }
}

/**
 * Async-обёртка для express-роутов. Прокидывает reject в next(err).
 *
 *   router.get('/x', wrap(async (req, res) => { ... }));
 */
function wrap(handler) {
    return (req, res, next) =>
        Promise.resolve(handler(req, res, next)).catch(next);
}

/**
 * Глобальный обработчик ошибок (последний app.use).
 * Понимает:
 *  - ApiError (наши контролируемые)
 *  - Prisma ошибки (P2025/P2002/P2003)
 *  - всё остальное → 500
 */
function errorHandler(err, req, res, _next) {
    // 1. Наши ApiError
    if (err && err.isApiError) {
        return res.status(err.status).json({
            ok: false,
            error: err.message,
            ...(err.code ? { code: err.code } : {}),
        });
    }

    // 2. Prisma known errors (Prisma 6.x)
    if (err && typeof err.code === 'string' && err.code.startsWith('P')) {
        if (err.code === 'P2025') {
            return res.status(404).json({ ok: false, error: 'Не найдено', code: err.code });
        }
        if (err.code === 'P2002') {
            return res.status(409).json({ ok: false, error: 'Запись уже существует', code: err.code });
        }
        if (err.code === 'P2003') {
            return res.status(400).json({ ok: false, error: 'Нарушение связи (foreign key)', code: err.code });
        }
        // Прочие Prisma — отдадим как 400 с кодом
        return res.status(400).json({ ok: false, error: 'Ошибка базы данных', code: err.code });
    }

    // 3. Multer / прочие известные
    if (err && err.name === 'MulterError') {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ ok: false, error: err.message, code: err.code });
    }

    // 4. JSON parse error от express.json
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ ok: false, error: 'Невалидный JSON' });
    }

    // 5. CORS ошибка
    if (err && typeof err.message === 'string' && err.message.startsWith('CORS:')) {
        return res.status(403).json({ ok: false, error: err.message });
    }

    // 6. Fallback
    console.error('[errorHandler] Unhandled error:', err);
    res.status(err && err.status ? err.status : 500).json({
        ok: false,
        error: 'Внутренняя ошибка сервера',
    });
}

/**
 * 404 handler — ставим ПЕРЕД errorHandler, после всех роутов и static.
 */
function notFoundHandler(req, res, _next) {
    res.status(404).json({
        ok: false,
        error: 'Маршрут не найден',
        path: req.originalUrl,
    });
}

module.exports = {
    ApiError,
    wrap,
    errorHandler,
    notFoundHandler,
};