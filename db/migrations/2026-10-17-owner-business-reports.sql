-- Таблица хранит импортированные снимки внутренних отчётов владельца.
-- Финансовые данные добавляются отдельно и не попадают в Git.
CREATE TABLE IF NOT EXISTS owner_business_report_snapshots (
  id BIGSERIAL PRIMARY KEY,
  source_file TEXT NOT NULL,
  sales_period_start DATE,
  sales_period_end DATE,
  last_activity_date DATE,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS owner_business_report_snapshots_imported_at_idx
  ON owner_business_report_snapshots (imported_at DESC, id DESC);
