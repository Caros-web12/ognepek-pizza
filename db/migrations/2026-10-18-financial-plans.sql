CREATE TABLE IF NOT EXISTS owner_financial_plans (
  id BIGSERIAL PRIMARY KEY,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  planned_revenue_rub NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ingredients_rub NUMERIC(14, 2) NOT NULL DEFAULT 0,
  salaries_rub NUMERIC(14, 2) NOT NULL DEFAULT 0,
  rent_rub NUMERIC(14, 2) NOT NULL DEFAULT 0,
  other_expenses_rub NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT owner_financial_plans_valid_period
    CHECK (period_end >= period_start),
  CONSTRAINT owner_financial_plans_nonnegative_amounts
    CHECK (
      planned_revenue_rub >= 0
      AND ingredients_rub >= 0
      AND salaries_rub >= 0
      AND rent_rub >= 0
      AND other_expenses_rub >= 0
    )
);

CREATE INDEX IF NOT EXISTS owner_financial_plans_period_idx
  ON owner_financial_plans (period_start, period_end);
CREATE UNIQUE INDEX IF NOT EXISTS owner_financial_plans_unique_period_idx
  ON owner_financial_plans (period_start, period_end);