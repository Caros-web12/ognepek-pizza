import { neon } from "@neondatabase/serverless";
import { parseJsonBody, requireAdmin } from "../../lib/adminAuth.js";

const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || "Europe/Moscow";
const VALID_STATUSES = new Set(["Новый", "Готовится", "В печи", "Готов", "Доставлен", "Отменён"]);

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return neon(process.env.DATABASE_URL);
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Метод не поддерживается." });
  }
  if (!requireAdmin(req, res)) return;

  let sql;
  try {
    sql = db();
  } catch (error) {
    console.error("Admin orders configuration error:", error);
    return res.status(500).json({ error: "Не настроено подключение к базе данных." });
  }

  if (req.method === "GET") {
    try {
      const rows = await sql`
        SELECT
          o.id,
          o.public_code,
          o.customer_name,
          o.phone,
          o.method,
          o.address,
          o.comment,
          to_char(o.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
          to_char(o.scheduled_time, 'HH24:MI') AS scheduled_time,
          o.status,
          o.total_rub,
          to_char(o.created_at AT TIME ZONE ${BUSINESS_TIME_ZONE}, 'HH24:MI') AS created_time,
          COALESCE(
            json_agg(
              json_build_object(
                'name', oi.item_name,
                'quantity', oi.quantity,
                'unitPrice', oi.unit_price_rub,
                'lineTotal', oi.line_total_rub
              ) ORDER BY oi.id
            ) FILTER (WHERE oi.id IS NOT NULL),
            '[]'::json
          ) AS line_items
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT 100
      `;

      const orders = rows.map(row => {
        const lineItems = Array.isArray(row.line_items) ? row.line_items : [];
        return {
          id: row.public_code || `OG-${String(row.id).padStart(6, "0")}`,
          customer: row.customer_name,
          phone: row.phone,
          method: row.method,
          address: row.address || "",
          comment: row.comment || "",
          items: lineItems.map(item => `${item.name} × ${item.quantity}`).join(", "),
          lineItems,
          total: Number(row.total_rub),
          status: row.status,
          time: row.created_time,
          scheduledDate: row.scheduled_date,
          scheduledTime: row.scheduled_time,
        };
      });
      return res.status(200).json({ orders });
    } catch (error) {
      console.error("Load admin orders failed:", error);
      return res.status(500).json({ error: "Не удалось загрузить заказы из базы." });
    }
  }

  let body;
  try {
    body = parseJsonBody(req);
  } catch {
    return res.status(400).json({ error: "Не удалось прочитать запрос." });
  }

  const publicCode = typeof body?.publicCode === "string" ? body.publicCode.trim() : "";
  const status = typeof body?.status === "string" ? body.status : "";
  if (!/^OG-\d{6,}$/.test(publicCode) || !VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: "Укажите корректный номер заказа и статус." });
  }

  try {
    const updated = await sql`
      UPDATE orders
      SET status = ${status}
      WHERE public_code = ${publicCode}
        AND (status <> 'Доставлен' OR status = ${status})
      RETURNING public_code, status
    `;
    if (updated.length === 0) {
      const existing = await sql`
        SELECT status FROM orders WHERE public_code = ${publicCode} LIMIT 1
      `;
      if (existing.length === 0) {
        return res.status(404).json({ error: "Заказ не найден." });
      }
      if (existing[0].status === "Доставлен" && status !== "Доставлен") {
        return res.status(409).json({
          error: "Доставленный заказ нельзя изменить через обычную смену статуса.",
        });
      }
      return res.status(409).json({ error: "Не удалось изменить статус заказа." });
    }
    return res.status(200).json({ order: { id: updated[0].public_code, status: updated[0].status } });
  } catch (error) {
    console.error("Update admin order status failed:", error);
    return res.status(500).json({ error: "Не удалось сохранить статус заказа." });
  }
}
