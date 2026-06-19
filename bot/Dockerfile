FROM node:24-slim


RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Манифесты — отдельным слоем
COPY bot/package*.json ./
RUN npm config set registry https://registry.npmmirror.com && \
    npm config set maxsockets 1 && \
    npm config set fetch-retry-mintimeout 100000 && \
    npm config set fetch-retry-maxtimeout 600000 && \
    npm install --omit=dev --no-package-lock --no-audit --prefer-offline

# 3. Код бота (благодаря .dockerignore сюда не попадёт node_modules)
COPY bot/ .

# 4. Схема из backend (одна схема на всю монорепу)
COPY backend/prisma ./prisma

# 5. Генерация клиента — ПОСЛЕДНИМ шагом, чтобы никакой COPY не затёр .prisma/client
RUN npx prisma generate

CMD ["node", "index.js"]
