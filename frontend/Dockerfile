# __CACHE_BUST_V2__  (content-hash)
FROM caddy:2-alpine

# GNU sed (надёжнее busybox для ERE)
RUN apk add --no-cache sed

ARG VERSION=dev
ENV BUILD_VERSION=${VERSION}

WORKDIR /srv

COPY Caddyfile /etc/caddy/Caddyfile
COPY *.html /srv/
COPY llms.txt /srv/llms.txt
COPY js /srv/js
COPY styles /srv/styles
COPY images /srv/images
COPY assets-v2 /srv/assets-v2
# Фавиконки лежат в корне frontend/ и не попадают под COPY выше
COPY favicon*.png favicon.svg apple-touch-icon.png /srv/
COPY letopis.webm letopis.mp4 tree.webm tree.mp4 /srv/


# Тестовые/черновые страницы в прод не отдаём
RUN rm -f /srv/ai-constructor-test.html /srv/ai-mockup.html

# Cache-bust по хешу содержимого (см. cache-bust.sh).
# ?v= меняется только у тех ассетов, чьё содержимое изменилось.
COPY cache-bust.sh /usr/local/bin/cache-bust.sh
RUN sh /usr/local/bin/cache-bust.sh
