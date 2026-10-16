-- Выполнить один раз в Neon Console → SQL Editor.
-- Повторный запуск безопасен: существующие позиции меню не перезаписываются.

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price_rub INTEGER NOT NULL CHECK (price_rub >= 0),
  weight TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  emoji TEXT NOT NULL DEFAULT '🍕',
  image TEXT NOT NULL DEFAULT '',
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  public_code TEXT UNIQUE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('Доставка', 'Самовывоз')),
  address TEXT,
  comment TEXT,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'Новый',
  total_rub INTEGER NOT NULL CHECK (total_rub >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  unit_price_rub INTEGER NOT NULL CHECK (unit_price_rub >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_rub INTEGER NOT NULL CHECK (line_total_rub >= 0)
);

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_scheduled_idx ON orders (scheduled_date, scheduled_time);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);

INSERT INTO menu_items (id, name, tag, description, price_rub, weight, color, emoji, image, sort_order)
VALUES
  (1, 'Маргарита', 'КЛАССИКА', 'Тесто (полуфабрикат), семола, томатный соус (полуфабрикат), рассольная моцарелла, свежий базилик, оливковое масло, томаты для оформления.', 590, '400 г', 'tomato', '🍅', '/images/pizzas/margherita.jpg', 1),
  (2, 'Ветчина и грибы', 'СЫТНАЯ', 'Тесто (полуфабрикат), семола, томатный соус (полуфабрикат), тёртая моцарелла, ветчина «По-черкизовски», свежие шампиньоны, оливковое масло.', 790, '430 г', 'mushroom', '🍄', '/images/pizzas/ham-mushroom.jpg', 2),
  (3, 'Пепперони', 'С ОГОНЬКОМ', 'Тесто (полуфабрикат), семола, томатный соус (полуфабрикат), тёртая моцарелла, пепперони, оливковое масло.', 750, '430 г', 'pepper', '🌶️', '/images/pizzas/pepperoni.jpg', 3),
  (4, 'Гавайская', 'СОЧНО-СЛАДКАЯ', 'Тесто (полуфабрикат), семола, томатный соус (полуфабрикат), тёртая моцарелла, ветчина «По-черкизовски», ананасы, оливковое масло.', 820, '410 г', 'hawaiian', '🍍', '/images/pizzas/hawaiian.jpg', 4),
  (5, 'Четыре сыра', 'СЫРНЫЙ ХИТ', 'Тесто (полуфабрикат), семола, оливковое масло, тёртая моцарелла, блю чиз / дор блю, чеддер, пармезан и жидкий мёд.', 790, '420 г', 'cheese', '🧀', '/images/pizzas/four-cheese.jpg', 5)
ON CONFLICT (id) DO NOTHING;
