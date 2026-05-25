#!/bin/bash

# Имя итогового файла
OUTPUT="project_dump.txt"

# Очищаем старый файл, если он есть
> "$OUTPUT"

echo "Сборка файлов проекта (без HTML и CSS)..."

# Используем команду find с исключениями
find . -type f \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/uploads/*" \
  -not -path "*/data/*" \
  -not -path "*/styles/*" \
  -not -name "*.html" \
  -not -name "*.db" \
  -not -name "*.png" \
  -not -name "*.jpg" \
  -not -name "*.webp" \
  -not -name "project_dump.txt" \
  -not -name "copy-ts.sh" | sort | while read -r file; do
    
    echo "Добавляю: $file"
    
    echo -e "\n\n============================================================" >> "$OUTPUT"
    echo "FILE: $file" >> "$OUTPUT"
    echo "============================================================" >> "$OUTPUT"
    
    cat "$file" >> "$OUTPUT"
done

echo "Готово! Результат сохранен в $OUTPUT"