import { neon } from "../../lib/pg-compat.js";
import { requireAdmin } from "../../lib/adminAuth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Метод не поддерживается." });
  }
  if (!requireAdmin(req, res)) return;
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: "Не настроено подключение к базе данных." });
  }
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      SELECT source_file, imported_at, sales_period_start, sales_period_end, last_activity_date, payload
      FROM owner_business_report_snapshots
      ORDER BY imported_at DESC, id DESC
      LIMIT 1
    `;
    if (!rows.length) return res.status(200).json({ snapshot: null });
    const row = rows[0];
    let payload = row.payload;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); }
      catch { return res.status(500).json({ error: "Сохранённый отчёт имеет неверный формат." }); }
    }
    return res.status(200).json({
      snapshot: {
        sourceFile: row.source_file,
        importedAt: row.imported_at ? new Date(row.imported_at).toISOString() : null,
        salesPeriodStart: row.sales_period_start,
        salesPeriodEnd: row.sales_period_end,
        lastActivityDate: row.last_activity_date,
        payload,
      },
    });
  } catch (error) {
    console.error("Load owner business reports failed:", error);
    return res.status(500).json({ error: "Не удалось загрузить финансовые отчёты." });
  }
}
