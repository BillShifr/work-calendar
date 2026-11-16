CREATE TABLE IF NOT EXISTS department_month_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  department_id uuid NOT NULL REFERENCES departments(id),
  year integer NOT NULL,
  month integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT department_month_approvals_year_check CHECK (year BETWEEN 2020 AND 2100),
  CONSTRAINT department_month_approvals_month_check CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT department_month_approvals_status_check CHECK (status IN ('draft','approved','reopened')),
  CONSTRAINT department_month_approvals_period_uq UNIQUE (department_id, year, month)
);

CREATE INDEX IF NOT EXISTS department_month_approvals_queue_idx
  ON department_month_approvals(organization_id, year, month, status);

INSERT INTO department_month_approvals (
  organization_id,
  department_id,
  year,
  month,
  status,
  approved_by,
  approved_at,
  version,
  created_at,
  updated_at
)
SELECT
  approval.organization_id,
  approval.department_id,
  approval.year,
  month_number.month,
  approval.status,
  approval.approved_by,
  approval.approved_at,
  approval.version,
  approval.created_at,
  approval.updated_at
FROM department_quarter_approvals approval
CROSS JOIN LATERAL generate_series(
  (approval.quarter - 1) * 3 + 1,
  approval.quarter * 3
) AS month_number(month)
ON CONFLICT (department_id, year, month) DO NOTHING;

DROP TABLE IF EXISTS department_quarter_approvals;
