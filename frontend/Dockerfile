# __CACHE_BUST_V1__
FROM caddy:2-alpine

# GNU sed (надёжнее busybox для ERE)
RUN apk add --no-cache sed

ARG VERSION=dev
ENV BUILD_VERSION=${VERSION}

WORKDIR /srv

COPY Caddyfile /etc/caddy/Caddyfile
COPY *.html /srv/
COPY js /srv/js
COPY styles /srv/styles
COPY images /srv/images

# Cache-bust: ?v=${VERSION} на все локальные js/styles ссылки в HTML.
# Идемпотентно: существующий ?v=... заменяется.
RUN find /srv -maxdepth 1 -name '*.html' -exec sed -i -E \
    "s#((src|href)=\"(js|styles)/[^\"?]+)(\?v=[^\"]*)?\"#\1?v=${VERSION}\"#g" {} + \
 && echo "[cache-bust] applied VERSION=${VERSION}" \
 && grep -h -oE '(src|href)="(js|styles)/[^"]+"' /srv/index.html | head -3
