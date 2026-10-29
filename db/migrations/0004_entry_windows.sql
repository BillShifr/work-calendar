CREATE TABLE IF NOT EXISTS entry_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  kind text NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL DEFAULT 0,
  is_open boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entry_windows_kind_check CHECK (kind IN ('vacation','overtime')),
  CONSTRAINT entry_windows_year_check CHECK (year BETWEEN 2020 AND 2100),
  CONSTRAINT entry_windows_period_check CHECK (
    (kind = 'vacation' AND month = 0) OR
    (kind = 'overtime' AND month BETWEEN 1 AND 12)
  ),
  CONSTRAINT entry_windows_org_period_uq UNIQUE (organization_id, kind, year, month)
);

INSERT INTO entry_windows (organization_id, kind, year, month, is_open)
SELECT DISTINCT organization_id, 'vacation', year, 0, true
FROM vacation_plans
ON CONFLICT (organization_id, kind, year, month) DO NOTHING;

INSERT INTO entry_windows (organization_id, kind, year, month, is_open)
SELECT DISTINCT organization_id, 'overtime', year, month, true
FROM overtime_reports
ON CONFLICT (organization_id, kind, year, month) DO NOTHING;

CREATE INDEX IF NOT EXISTS entry_windows_org_year_idx
  ON entry_windows(organization_id, year, kind);
