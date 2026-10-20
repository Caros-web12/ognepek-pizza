import { neon } from "@neondatabase/serverless";
import { requireAdmin } from "../../lib/adminAuth.js";

const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || "Europe/Moscow";

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return neon(process.env.DATABASE_URL);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Метод не поддерживается." });
  }
  if (!requireAdmin(req, res)) return;

  res.setHeader("Cache-Control", "no-store, max-age=0");
  const requestedDays = String(req.query?.days ?? "7");
  const days = requestedDays === "30" ? 30 : 7;

  let sql;
  try {
    sql = db();
  } catch (error) {
    console.error("Admin statistics configuration error:", error);
    return res.status(500).json({ error: "Не настроено подключение к базе данных." });
  }

  try {
    const [summaryRows, dailyRows, topRows] = await Promise.all([
      sql`
        WITH local_today AS (
          SELECT (NOW() AT TIME ZONE ${BUSINESS_TIME_ZONE})::date AS day
        ), order_data AS (
          SELECT
            status,
            total_rub,
            (created_at AT TIME ZONE ${BUSINESS_TIME_ZONE})::date AS business_day
          FROM orders
          WHERE archived_at IS NULL
        )
        SELECT
          CAST(COUNT(*) FILTER (WHERE order_data.business_day = local_today.day) AS INTEGER) AS today_orders,
          CAST(COUNT(*) FILTER (WHERE order_data.business_day = local_today.day AND order_data.status = 'Отменён') AS INTEGER) AS today_cancelled,
          COALESCE(SUM(order_data.total_rub) FILTER (WHERE order_data.business_day = local_today.day AND order_data.status <> 'Отменён'), 0)::numeric AS today_amount,
          COALESCE(AVG(order_data.total_rub) FILTER (WHERE order_data.business_day = local_today.day AND order_data.status <> 'Отменён'), 0)::numeric AS today_average,
          CAST(COUNT(*) FILTER (WHERE order_data.status IN ('Новый', 'Сборка')) AS INTEGER) AS active_orders,
          CAST(COUNT(*) FILTER (WHERE order_data.status = 'Готов') AS INTEGER) AS ready_orders
        FROM local_today
        LEFT JOIN order_data ON TRUE
        GROUP BY local_today.day
      `,
      sql`
        WITH params AS (
          SELECT (NOW() AT TIME ZONE ${BUSINESS_TIME_ZONE})::date AS today
        ), calendar AS (
          SELECT generate_series(
            params.today - (${days}::integer - 1),
            params.today,
            INTERVAL '1 day'
          )::date AS day
          FROM params
        ), order_data AS (
          SELECT
            id,
            status,
            total_rub,
            (created_at AT TIME ZONE ${BUSINESS_TIME_ZONE})::date AS business_day
          FROM orders
          WHERE archived_at IS NULL
        )
        SELECT
          to_char(calendar.day, 'YYYY-MM-DD') AS day,
          CAST(COUNT(order_data.id) AS INTEGER) AS orders,
          CAST(COUNT(order_data.id) FILTER (WHERE order_data.status = 'Отменён') AS INTEGER) AS canceled_orders,
          COALESCE(SUM(order_data.total_rub) FILTER (WHERE order_data.status <> 'Отменён'), 0)::numeric AS amount_rub
        FROM calendar
        LEFT JOIN order_data ON order_data.business_day = calendar.day
        GROUP BY calendar.day
        ORDER BY calendar.day
      `,
      sql`
        WITH params AS (
          SELECT (NOW() AT TIME ZONE ${BUSINESS_TIME_ZONE})::date AS today
        )
        SELECT
          order_items.item_name AS name,
          CAST(SUM(order_items.quantity) AS INTEGER) AS quantity,
          COALESCE(SUM(order_items.line_total_rub), 0)::numeric AS amount_rub
        FROM order_items
        JOIN orders ON orders.id = order_items.order_id
        CROSS JOIN params
        WHERE orders.archived_at IS NULL
          AND orders.status <> 'Отменён'
          AND (orders.created_at AT TIME ZONE ${BUSINESS_TIME_ZONE})::date >= params.today - (${days}::integer - 1)
          AND (orders.created_at AT TIME ZONE ${BUSINESS_TIME_ZONE})::date <= params.today
        GROUP BY order_items.item_name
        ORDER BY SUM(order_items.quantity) DESC, SUM(order_items.line_total_rub) DESC, order_items.item_name ASC
        LIMIT 5
      `,
    ]);

    const summary = summaryRows[0] || {};
    const todayOrders = Number(summary.today_orders) || 0;
    const canceledOrders = Number(summary.today_cancelled) || 0;
    return res.status(200).json({
      days,
      today: {
        orders: todayOrders,
        canceledOrders,
        amountRub: Number(summary.today_amount) || 0,
        averageCheckRub: Number(summary.today_average) || 0,
        activeOrders: Number(summary.active_orders) || 0,
        readyOrders: Number(summary.ready_orders) || 0,
        cancelSharePercent: todayOrders ? Math.round(canceledOrders / todayOrders * 100) : 0,
      },
      chart: dailyRows.map(row => ({
        day: row.day,
        orders: Number(row.orders) || 0,
        canceledOrders: Number(row.canceled_orders) || 0,
        amountRub: Number(row.amount_rub) || 0,
      })),
      topItems: topRows.map(row => ({
        name: row.name,
        quantity: Number(row.quantity) || 0,
        amountRub: Number(row.amount_rub) || 0,
      })),
    });
  } catch (error) {
    console.error("Load admin statistics failed:", error);
    return res.status(500).json({ error: "Не удалось загрузить статистику." });
  }
}
