-- Выполнить один раз в Neon Console → SQL Editor перед публикацией кода архивации.
-- Архивация сохраняет заказ и все его позиции; физического удаления не происходит.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS orders_archived_created_at_idx
  ON orders (archived_at, created_at DESC);
