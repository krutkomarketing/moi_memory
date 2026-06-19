FROM node:24-slim AS base

ENV SHARP_DIST_BASE_URL=https://npmmirror.com/mirrors/sharp


RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com && \
    npm config set maxsockets 1 && \
    npm config set fetch-retry-mintimeout 100000 && \
    npm config set fetch-retry-maxtimeout 600000 && \
    npm install --omit=dev --no-package-lock --no-audit --prefer-offline

COPY prisma ./prisma
# Pin Prisma CLI на ту же версию, что @prisma/client в package.json (6.19.3)
RUN npx prisma generate

COPY . .

RUN mkdir -p uploads && cp -R uploads uploads_dist && chown -R node:node /app

ENV NODE_ENV=production
EXPOSE 3000

# Безопасность: процесс не под root. В node:24-slim есть пользователь node (uid 1000).
# Свежий named-volume uploads наследует владельца node из образа. Если том uploads
# уже создавался под root — однократно выполнить:
#   docker compose run --rm --user root backend chown -R node:node /app/uploads
USER node

CMD ["sh", "-c", "cp -rf /app/uploads_dist/* /app/uploads/ 2>/dev/null || true; test -d node_modules/@aws-sdk/client-s3 || (echo '[boot] Installing @aws-sdk on first run...' && npm install --omit=dev --no-save --no-audit --prefer-offline @aws-sdk/client-s3@^3.1055.0 @aws-sdk/lib-storage@^3.1055.0); npx prisma migrate deploy && node index.js"]