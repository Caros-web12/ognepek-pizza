#!/usr/bin/env bash
# Перенос данных из Neon в Postgres на этом сервере. Запускать на сервере в РФ
# (доступ к Neon с российского IP может быть нестабильным; при ошибке сделайте
# дамп на своём компьютере и положите файл рядом под именем neon.dump).
set -euo pipefail
set -a; . ./.env; set +a
: "${NEON_URL:?Укажите NEON_URL в .env}"

echo "==> Запускаем базу"
docker compose up -d db
until docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do sleep 2; done

if [ ! -s neon.dump ]; then
  echo "==> Выгружаем данные из Neon"
  docker run --rm "postgres:${PG_VERSION:-17}-alpine" \
    pg_dump "$NEON_URL" -Fc --schema=public --no-owner --no-privileges > neon.dump
fi

echo "==> Загружаем в новую базу"
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --no-owner --no-privileges --clean --if-exists < neon.dump \
  || echo "pg_restore завершился с предупреждениями: проверьте количество строк ниже."

echo "==> Проверка: сколько строк в таблицах"
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT 'menu_items' AS t, count(*) FROM menu_items UNION ALL SELECT 'orders', count(*) FROM orders UNION ALL SELECT 'order_items', count(*) FROM order_items;"
echo "Сравните цифры с Neon. Файл neon.dump сохраните как копию вне сервера и удалите с сервера."
