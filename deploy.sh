#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
#  Memory · production deploy script
#  Запускается на сервере: ./deploy.sh
#
#  Что делает:
#   1. git pull (с проверкой что нет локальных изменений)
#   2. Pre-deploy backup БД (через сервис pg-backup, если запущен)
#   3. Build только тех образов, чьи Dockerfile/контекст изменились
#   4. Прогоняет prisma migrate deploy в одноразовом контейнере
#   5. docker compose up -d (пересоздаёт изменённые контейнеры)
#   6. Healthcheck /health через Caddy
#   7. Чистит висячие образы (docker image prune)
#   8. Шлёт отчёт в Telegram (если настроен BACKUP_TG_TOKEN + CHAT_ID)
#
#  Флаги (через env):
#    SKIP_BACKUP=1    — не делать pre-deploy бэкап (только для hotfix)
#    SKIP_PULL=1      — не делать git pull (код уже подтянут)
#    SKIP_MIGRATE=1   — не запускать prisma migrate deploy
#    NO_CACHE=1       — пересобрать ВСЕ образы без кеша слоёв
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")"

# ── Загружаем .env (для BACKUP_TG_TOKEN, BACKUP_TG_CHAT_ID и др.) ──
if [ -f .env ]; then
    set -a
    . ./.env
    set +a
fi

# ── Логирование с таймстампом ──
LOG_FILE="./deploy.log"
log() {
    local msg="[$(date '+%F %T %Z')] $*"
    echo "$msg" | tee -a "$LOG_FILE"
}

# ── Уведомления в Telegram (best-effort, не падаем если TG недоступен) ──
TG_TOKEN="${BACKUP_TG_TOKEN:-${BOT_TOKEN:-}}"
TG_CHAT="${BACKUP_TG_CHAT_ID:-}"

notify() {
    local text="$1"
    [ -z "$TG_TOKEN" ] || [ -z "$TG_CHAT" ] && return 0
    curl -sS --max-time 15 -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
        --data-urlencode "chat_id=${TG_CHAT}" \
        --data-urlencode "text=${text}" \
        --data-urlencode "parse_mode=HTML" \
        > /dev/null 2>&1 || true
}

# ── Обработчик ошибок: всегда сообщить в TG если деплой упал ──
DEPLOY_STAGE="init"
on_error() {
    local code=$?
    log "❌ Deploy failed at stage: ${DEPLOY_STAGE} (exit code $code)"
    notify "❌ <b>Memory deploy FAILED</b>%0A%0AStage: <code>${DEPLOY_STAGE}</code>%0AExit code: ${code}%0AServer: $(hostname)%0AСм. ${LOG_FILE} на сервере."
    exit "$code"
}
trap on_error ERR

START_TS=$(date +%s)
log "═══════════════════════════════════════════════════════"
log "🚀 Deploy started by $(whoami)@$(hostname)"

# ─── 1. Git pull ─────────────────────────────────────────
DEPLOY_STAGE="git-pull"
if [ "${SKIP_PULL:-0}" = "1" ]; then
    log "⏩ SKIP_PULL=1 — пропускаем git pull"
else
    log "📥 git pull"

    # Проверка: нет ли локальных незакоммиченных изменений
    if ! git diff --quiet || ! git diff --cached --quiet; then
        log "❌ Локальные изменения в репозитории!"
        log "   Закоммить или сбрось их перед деплоем:"
        log "     git status"
        log "     git stash       # временно убрать"
        log "     git checkout -- .   # выбросить"
        exit 1
    fi

    OLD_HEAD=$(git rev-parse --short HEAD)
    git fetch --quiet
    git pull --ff-only --quiet
    NEW_HEAD=$(git rev-parse --short HEAD)
    LAST_COMMIT=$(git log -1 --pretty=format:"%h · %an · %s")

    if [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
        log "ℹ Нет новых коммитов ($NEW_HEAD). Продолжаем (пересборка может быть полезна)."
    else
        log "✅ $OLD_HEAD → $NEW_HEAD"
        log "   $LAST_COMMIT"
    fi
fi

CURRENT_COMMIT=$(git log -1 --pretty=format:"%h · %an · %s" 2>/dev/null || echo "unknown")

notify "🚀 <b>Memory deploy STARTED</b>%0A%0ACommit: <code>${CURRENT_COMMIT}</code>%0AServer: $(hostname)"

# ─── 2. Pre-deploy backup БД ─────────────────────────────
DEPLOY_STAGE="pre-deploy-backup"
if [ "${SKIP_BACKUP:-0}" = "1" ]; then
    log "⏩ SKIP_BACKUP=1 — пропускаем pre-deploy бэкап"
else
    log "💾 Pre-deploy backup БД"
    if docker compose ps pg-backup --status running --quiet | grep -q .; then
        # pg-backup запущен — переиспользуем его
        docker compose exec -T pg-backup /usr/local/bin/backup.sh 2>&1 | tee -a "$LOG_FILE" \
            || { log "⚠ Backup завершился с ошибкой — продолжать? Прерываю для безопасности."; exit 1; }
    else
        log "⚠ Сервис pg-backup не запущен. Делаю прямой pg_dump через контейнер db..."
        mkdir -p ./backups
        FILE="./backups/predeploy_$(date +%Y%m%d_%H%M%S).sql.gz"
        docker compose exec -T db sh -c "PGPASSWORD=\"\$POSTGRES_PASSWORD\" pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --no-owner --no-acl" \
            | gzip -9 > "$FILE"
        if [ ! -s "$FILE" ]; then
            log "❌ Прямой pg_dump провалился"
            rm -f "$FILE"
            exit 1
        fi
        log "✅ Backup сохранён: $FILE ($(du -h "$FILE" | cut -f1))"
    fi
fi

# ─── 3. Build образов ────────────────────────────────────
# Cache-busting: версия = короткий git SHA (передаётся в frontend Dockerfile)
export COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || date +%s)
log "🔖 Cache-bust version: $COMMIT_SHA"

DEPLOY_STAGE="build"
log "🔨 Build (docker compose build)"
BUILD_ARGS=""
[ "${NO_CACHE:-0}" = "1" ] && BUILD_ARGS="--no-cache" && log "   с флагом --no-cache (это медленнее)"

# Используем явный compose-файл, чтобы случайный override.yml не повлиял на прод
docker compose -f docker-compose.yml build $BUILD_ARGS 2>&1 | tee -a "$LOG_FILE"

# ─── 4. Prisma migrate deploy ────────────────────────────
DEPLOY_STAGE="migrate"
if [ "${SKIP_MIGRATE:-0}" = "1" ]; then
    log "⏩ SKIP_MIGRATE=1 — пропускаем миграции"
else
    log "🗃 Prisma migrate deploy (одноразовый контейнер)"
    # БД должна быть healthy для миграции — поднимаем её отдельно если не запущена
    docker compose -f docker-compose.yml up -d db
    # Ждём healthy
    for i in 1 2 3 4 5 6 7 8 9 10; do
        if docker compose -f docker-compose.yml ps db --format json | grep -q '"Health":"healthy"'; then
            break
        fi
        log "   ⏳ Жду healthy db ($i/10)..."
        sleep 2
    done

    # migrate deploy — идемпотентная команда, безопасно вызывать на каждом деплое
    docker compose -f docker-compose.yml run --rm --no-deps backend \
        npx prisma migrate deploy 2>&1 | tee -a "$LOG_FILE"
    log "✅ Миграции применены"
fi

# ─── 5. Up -d (применить новые образы) ───────────────────
DEPLOY_STAGE="up"
log "🚢 docker compose up -d --remove-orphans"
docker compose -f docker-compose.yml up -d --remove-orphans 2>&1 | tee -a "$LOG_FILE"

# ─── 6. Healthcheck ──────────────────────────────────────
DEPLOY_STAGE="healthcheck"
log "🩺 Healthcheck /health (таймаут 60с)"
HEALTH_OK=0
for i in $(seq 1 30); do
    if curl -sSf --max-time 3 http://localhost/health > /dev/null 2>&1; then
        HEALTH_OK=1
        log "✅ /health отвечает (попытка $i/30)"
        break
    fi
    sleep 2
done

if [ "$HEALTH_OK" = "0" ]; then
    log "❌ /health не ответил за 60с"
    log "   Логи бэкенда:"
    docker compose -f docker-compose.yml logs --tail=50 backend | tee -a "$LOG_FILE"
    exit 1
fi

# ─── 7. Чистка висячих образов ───────────────────────────
DEPLOY_STAGE="cleanup"
log "🧹 Чистим висячие образы (dangling)"
docker image prune -f 2>&1 | tee -a "$LOG_FILE" || true

# ─── 8. Финал ─────────────────────────────────────────────
DEPLOY_STAGE="done"
trap - ERR
ELAPSED=$(($(date +%s) - START_TS))
log "✅ Deploy успешен за ${ELAPSED}с"
log "   Commit: $CURRENT_COMMIT"
log "═══════════════════════════════════════════════════════"

notify "✅ <b>Memory deploy OK</b> (${ELAPSED}с)%0A%0ACommit: <code>${CURRENT_COMMIT}</code>%0AServer: $(hostname)"
