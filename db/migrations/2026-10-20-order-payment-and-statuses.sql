-- Выполнить один раз в Neon Console → SQL Editor перед публикацией этой версии.
-- Добавляет способ оплаты при получении и приводит старые рабочие статусы к «Сборка».

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'Наличными';

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('Наличными', 'Переводом'));

UPDATE orders
SET status = 'Сборка'
WHERE status IN ('Готовится', 'В печи');
