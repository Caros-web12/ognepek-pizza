# Развёртывание в Yandex Cloud Serverless Containers

Контейнер запускает витрину, страницу `/admin` и все API заказа в одном Node.js-процессе на порту `8080`.

## Перед первым развёртыванием

1. Выполните миграцию `db/migrations/2026-10-20-order-payment-and-statuses.sql` в Neon SQL Editor.
2. Создайте Container Registry и сервисный аккаунт в Yandex Cloud.
3. Добавьте секреты в Yandex Lockbox или в переменные окружения ревизии контейнера:
   - `DATABASE_URL` — строка подключения Neon;
   - `ADMIN_PASSWORD` — пароль страницы `/admin`;
   - `ADMIN_SESSION_SECRET` — случайная строка длиной не менее 32 символов;
   - `BUSINESS_TIME_ZONE=Europe/Moscow`.

Не добавляйте эти значения в Git, Dockerfile или клиентский код.

## Локальная проверка контейнера

```sh
docker build -t pechka-pizza .
docker run --rm -p 8080:8080 --env-file .env.local pechka-pizza
```

После запуска проверьте `/`, `/admin` и `/api/admin/session`.

## Публикация

1. Соберите Docker-образ и загрузите его в Yandex Container Registry.
2. Создайте ревизию Serverless Container с портом `8080` и передайте секреты как переменные окружения.
3. Сделайте контейнер публичным только для HTTP-вызовов.
4. Откройте выданный URL и выполните сценарий: заказ → `/admin` → смена статуса.
5. После проверки подключите собственный домен и включите HTTPS через API Gateway или балансировщик Yandex Cloud.

Для маленького стартового трафика следите за free tier и расходом в Billing: Serverless Containers тарифицуются по вызовам, времени выполнения и исходящему трафику.
