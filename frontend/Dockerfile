FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile

# Статика
COPY index.html memory.html person.html family-tree.html timeline.html /srv/
COPY js /srv/js
COPY styles /srv/styles
COPY images /srv/images