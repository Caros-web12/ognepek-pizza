import { neon } from "@neondatabase/serverless";

const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || "Europe/Moscow";
const BAKE_DAYS = new Set([0, 4, 5, 6]); // Sunday, Thursday, Friday, Saturday
const OPEN_MINUTES = 12 * 60;
const CLOSE_MINUTES = 20 * 60;
const SLOT_STEP_MINUTES = 30;
const MIN_LEAD_MS = 3 * 60 * 60 * 1000;

function send(res, status, payload) {
  return res.status(status).json(payload);
}

function validDateValue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function weekdayForDate(value) {
  return new Date(`${value}T12:00:00.000Z`).getUTCDay();
}

function validTimeValue(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  const minutes = hour * 60 + minute;
  return minutes >= OPEN_MINUTES && minutes <= CLOSE_MINUTES && minute % 30 === 0;
}

// Convert a wall-clock date/time in BUSINESS_TIME_ZONE into a UTC instant.
// This avoids validating Moscow business hours using the hosting server's UTC clock.
function businessLocalTimeToUtc(dateValue, timeValue, timeZone) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = targetAsUtc;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map(part => [part.type, part.value])
    );
    const seenAsUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second), 0
    );
    const difference = targetAsUtc - seenAsUtc;
    guess += difference;
    if (difference === 0) break;
  }
  return new Date(guess);
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeRussianPhone(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || !/^[+\d\s().-]+$/.test(raw)) return null;
  if (raw.startsWith("+") && !raw.startsWith("+7")) return null;

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "+7" + digits;
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return "+7" + digits.slice(1);
  }
  return null;
}

function parseRequestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  return {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Этот адрес принимает только новые заказы." });
  }

  if (!process.env.DATABASE_URL) {
    return send(res, 500, { error: "Не настроено подключение к базе данных (DATABASE_URL)." });
  }

  let body;
  try {
    body = parseRequestBody(req);
  } catch {
    return send(res, 400, { error: "Не удалось прочитать данные заказа." });
  }

  const customerInput = body?.customer ?? {};
  const customerName = cleanText(customerInput.name, 100);
  const rawPhone = cleanText(customerInput.phone, 40);
  const phone = normalizeRussianPhone(rawPhone);
  const method = customerInput.method;
  const address = cleanText(customerInput.address, 250);
  const comment = cleanText(customerInput.comment, 1000);
  const scheduledDate = body?.scheduledDate;
  const scheduledTime = body?.scheduledTime;
  const cartInput = body?.items;

  if (!customerName) {
    return send(res, 400, { error: "Укажите имя." });
  }
  if (!phone) {
    return send(res, 400, { error: "Укажите корректный российский номер: 10 цифр, полный номер с +7 или с 8 в начале." });
  }
  if (!["Доставка", "Самовывоз"].includes(method)) {
    return send(res, 400, { error: "Выберите доставку или самовывоз." });
  }
  if (method === "Доставка" && !address) {
    return send(res, 400, { error: "Для доставки укажите адрес." });
  }
  if (!validDateValue(scheduledDate) || !BAKE_DAYS.has(weekdayForDate(scheduledDate))) {
    return send(res, 400, { error: "Выпечка доступна только с четверга по воскресенье." });
  }
  if (!validTimeValue(scheduledTime)) {
    return send(res, 400, { error: "Время выпечки должно быть с 12:00 до 20:00 с шагом 30 минут." });
  }

  const scheduledInstant = businessLocalTimeToUtc(scheduledDate, scheduledTime, BUSINESS_TIME_ZONE);
  if (!Number.isFinite(scheduledInstant.getTime()) || scheduledInstant.getTime() < Date.now() + MIN_LEAD_MS) {
    return send(res, 400, { error: "Оформить заказ нужно минимум за 3 часа до выпечки." });
  }

  if (!Array.isArray(cartInput) || cartInput.length < 1 || cartInput.length > 12) {
    return send(res, 400, { error: "Добавьте от 1 до 12 позиций в заказ." });
  }

  const normalizedItems = [];
  const seenIds = new Set();
  for (const rawItem of cartInput) {
    const menuItemId = Number(rawItem?.menuItemId);
    const quantity = Number(rawItem?.quantity);
    if (!Number.isInteger(menuItemId) || menuItemId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return send(res, 400, { error: "Некорректное количество пицц в заказе." });
    }
    if (seenIds.has(menuItemId)) {
      return send(res, 400, { error: "В заказе повторяется одна и та же позиция." });
    }
    seenIds.add(menuItemId);
    normalizedItems.push({ menuItemId, quantity });
  }

  const sql = neon(process.env.DATABASE_URL);
  let insertedOrderId = null;
  try {
    // Prices and names always come from the database, never from the browser.
    const pricedItems = [];
    for (const item of normalizedItems) {
      const menuRows = await sql`
        SELECT id, name, price_rub
        FROM menu_items
        WHERE id = ${item.menuItemId} AND is_available = TRUE
        LIMIT 1
      `;
      if (menuRows.length === 0) {
        return send(res, 400, { error: "Одна из выбранных пицц недоступна. Обновите страницу меню." });
      }
      pricedItems.push({
        menuItemId: Number(menuRows[0].id),
        name: menuRows[0].name,
        unitPrice: Number(menuRows[0].price_rub),
        quantity: item.quantity,
      });
    }

    const totalRub = pricedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const [created] = await sql`
      INSERT INTO orders (
        customer_name, phone, method, address, comment,
        scheduled_date, scheduled_time, status, total_rub
      ) VALUES (
        ${customerName}, ${phone}, ${method}, ${address || null}, ${comment || null},
        ${scheduledDate}::date, ${scheduledTime}::time, 'Новый', ${totalRub}
      )
      RETURNING id, created_at
    `;
    insertedOrderId = Number(created.id);
    const publicCode = `OG-${String(insertedOrderId).padStart(6, "0")}`;

    await sql`UPDATE orders SET public_code = ${publicCode} WHERE id = ${insertedOrderId}`;
    for (const item of pricedItems) {
      await sql`
        INSERT INTO order_items (
          order_id, menu_item_id, item_name, unit_price_rub, quantity, line_total_rub
        ) VALUES (
          ${insertedOrderId}, ${item.menuItemId}, ${item.name},
          ${item.unitPrice}, ${item.quantity}, ${item.unitPrice * item.quantity}
        )
      `;
    }

    const createdAt = new Date(created.created_at);
    const order = {
      id: publicCode,
      customer: customerName,
      items: pricedItems.map(item => `${item.name} × ${item.quantity}`).join(", "),
      total: totalRub,
      status: "Новый",
      time: createdAt.toLocaleTimeString("ru-RU", {
        timeZone: BUSINESS_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
      }),
      scheduledDate,
      scheduledTime,
      method,
      address,
      phone,
      comment,
    };
    return send(res, 201, { order });
  } catch (error) {
    if (insertedOrderId !== null) {
      try {
        // If a later insert fails, avoid leaving an incomplete order behind.
        await sql`DELETE FROM orders WHERE id = ${insertedOrderId}`;
      } catch { /* preserve the original error */ }
    }
    console.error("Create order failed:", error);
    return send(res, 500, {
      error: "Не удалось сохранить заказ. Проверьте таблицы Neon и попробуйте ещё раз.",
    });
  }
}
