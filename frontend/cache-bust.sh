#!/bin/sh
# ─────────────────────────────────────────────────────────────────────
#  Cache-busting по ХЕШУ СОДЕРЖИМОГО файла.
#
#  Для каждой локальной ссылки на ассет в *.html подставляет
#  ?v=<md5, первые 10 символов>. Ключевое отличие от старой схемы
#  (?v=<git-SHA>): URL ассета меняется ТОЛЬКО когда меняется сам файл.
#
#  Что это чинит:
#   (а) картинки/шрифты теперь тоже версионируются → заменил .webp,
#       оставил имя — клиент сразу получит новый (раньше висел кеш год);
#   (б) правка одного js больше НЕ сбрасывает кеш всех остальных js/css →
#       вернувшийся посетитель докачивает только изменённое, а не весь
#       бандл на каждый деплой.
#
#  Поскольку каждый URL теперь уникален по содержимому, Caddy спокойно
#  отдаёт эти файлы immutable на год (см. Caddyfile @static).
#
#  Защищённый js/counters.js НЕ трогаем — его ?v=1 правит владелец
#  вручную (см. CLAUDE.md).
# ─────────────────────────────────────────────────────────────────────
set -eu
cd /srv

find js styles images assets-v2 -type f \
  \( -name '*.js'   -o -name '*.css'  -o -name '*.png'  -o -name '*.jpg'  \
  -o -name '*.jpeg' -o -name '*.webp' -o -name '*.svg'  -o -name '*.gif'  \
  -o -name '*.ico'  -o -name '*.woff' -o -name '*.woff2' -o -name '*.ttf' \) \
  2>/dev/null \
| while IFS= read -r f; do
    case "$f" in
      js/counters.js) continue ;;   # защищённый файл — пропускаем
    esac

    h=$(md5sum "$f" | cut -c1-10)

    # экранируем спецсимволы regex в пути (delimiter sed = #, поэтому / не трогаем)
    esc=$(printf '%s' "$f" | sed 's/[.[\*^$]/\\&/g')

    # заменить href/src="<f>" или "<f>?v=..." → "<f>?v=<hash>" во всех html
    sed -i -E "s#((src|href)=\"${esc})(\?v=[^\"]*)?\"#\1?v=${h}\"#g" *.html
  done

echo "[cache-bust] content-hash version applied to js/css/images/fonts"
grep -hoE '(src|href)="(js|styles|images|assets-v2)/[^\"]+\?v=[^\"]+"' index.html | head -5
