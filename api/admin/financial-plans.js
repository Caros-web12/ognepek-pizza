
import { neon } from "../../lib/pg-compat.js";
import { requireAdmin, parseJsonBody } from "../../lib/adminAuth.js";

const amountFields = [
  "plannedRevenue",
  "ingredients",
  "salaries",
  "rent",
  "otherExpenses",
];

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function validAmount(value) {
  if (value === "" || value === null || value === undefined) {
    return false;
  }

  const amount = Number(value);
  return Number.isFinite(amount) &&
    amount >= 0 &&
    amount <= 999999999999.99;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Метод не поддерживается." });
  }

  if (!requireAdmin(req, res)) return;

  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({
      error: "Не настроено подключение к базе данных.",
    });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          id,
          period_start,
          period_end,
          planned_revenue_rub,
          ingredients_rub,
          salaries_rub,
          rent_rub,
          other_expenses_rub,
          created_at,
          updated_at
        FROM owner_financial_plans
        ORDER BY period_start DESC, period_end DESC
      `;

      return res.status(200).json({
        plans: rows.map((row) => ({
          id: row.id,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          plannedRevenue: Number(row.planned_revenue_rub),
          ingredients: Number(row.ingredients_rub),
          salaries: Number(row.salaries_rub),
          rent: Number(row.rent_rub),
          otherExpenses: Number(row.other_expenses_rub),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      });
    }

    let body;

    try {
      body = parseJsonBody(req);
    } catch {
      return res.status(400).json({ error: "Некорректный JSON." });
    }

    const { periodStart, periodEnd } = body;

    if (!isValidDate(periodStart) || !isValidDate(periodEnd)) {
      return res.status(400).json({
        error: "Укажи корректные даты начала и окончания периода.",
      });
    }

    if (periodEnd < periodStart) {
      return res.status(400).json({
        error: "Дата окончания не может быть раньше даты начала.",
      });
    }

    for (const field of amountFields) {
      if (!validAmount(body[field])) {
        return res.status(400).json({
          error: "Все суммы должны быть числами от 0 до 999999999999.99.",
        });
      }
    }

    const [
      plannedRevenue,
      ingredients,
      salaries,
      rent,
      otherExpenses,
    ] = amountFields.map((field) => Number(body[field]));

    const rows = await sql`
      INSERT INTO owner_financial_plans (
        period_start,
        period_end,
        planned_revenue_rub,
        ingredients_rub,
        salaries_rub,
        rent_rub,
        other_expenses_rub
      )
      VALUES (
        ${periodStart},
        ${periodEnd},
        ${plannedRevenue},
        ${ingredients},
        ${salaries},
        ${rent},
        ${otherExpenses}
      )
      ON CONFLICT (period_start, period_end)
      DO UPDATE SET
        planned_revenue_rub = EXCLUDED.planned_revenue_rub,
        ingredients_rub = EXCLUDED.ingredients_rub,
        salaries_rub = EXCLUDED.salaries_rub,
        rent_rub = EXCLUDED.rent_rub,
        other_expenses_rub = EXCLUDED.other_expenses_rub,
        updated_at = NOW()
      RETURNING
        id,
        period_start,
        period_end,
        planned_revenue_rub,
        ingredients_rub,
        salaries_rub,
        rent_rub,
        other_expenses_rub,
        created_at,
        updated_at
    `;

    const row = rows[0];

    return res.status(200).json({
      message: "Финансовый план сохранён.",
      plan: {
        id: row.id,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        plannedRevenue: Number(row.planned_revenue_rub),
        ingredients: Number(row.ingredients_rub),
        salaries: Number(row.salaries_rub),
        rent: Number(row.rent_rub),
        otherExpenses: Number(row.other_expenses_rub),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error("Financial plans API failed:", error);
    return res.status(500).json({
      error: "Не удалось обработать финансовый план.",
    });
  }
}
