ALTER TYPE role ADD VALUE IF NOT EXISTS 'department_head';
ALTER TYPE actor_role ADD VALUE IF NOT EXISTS 'department_head';

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS head_user_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approver_user_id uuid REFERENCES users(id);

ALTER TABLE job_titles
  ADD COLUMN IF NOT EXISTS irregular_leave_max_days integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_titles_irregular_leave_max_days_check'
  ) THEN
    ALTER TABLE job_titles
      ADD CONSTRAINT job_titles_irregular_leave_max_days_check
      CHECK (irregular_leave_max_days BETWEEN 0 AND 30);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS employee_irregular_leave_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  year integer NOT NULL,
  max_days_override integer,
  actual_days integer,
  proposed_next_year_days integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_irregular_leave_terms_year_check CHECK (year BETWEEN 2020 AND 2100),
  CONSTRAINT employee_irregular_leave_terms_max_check CHECK (max_days_override IS NULL OR max_days_override BETWEEN 0 AND 30),
  CONSTRAINT employee_irregular_leave_terms_actual_check CHECK (actual_days IS NULL OR actual_days BETWEEN 0 AND 30),
  CONSTRAINT employee_irregular_leave_terms_proposed_check CHECK (proposed_next_year_days IS NULL OR proposed_next_year_days BETWEEN 0 AND 30),
  CONSTRAINT employee_irregular_leave_terms_user_year_uq UNIQUE (user_id, year)
);

ALTER TABLE overtime_reports
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id);

UPDATE overtime_reports report
SET department_id = (
  SELECT current_assignment.department_id
  FROM department_assignments current_assignment
  WHERE current_assignment.user_id = report.user_id
    AND current_assignment.valid_from <= make_date(report.year, report.month, 1) + interval '1 month - 1 day'
    AND (current_assignment.valid_to IS NULL OR current_assignment.valid_to >= make_date(report.year, report.month, 1))
  ORDER BY current_assignment.valid_from DESC
  LIMIT 1
)
WHERE report.department_id IS NULL;

CREATE INDEX IF NOT EXISTS overtime_reports_department_period_idx
  ON overtime_reports(department_id, year, month, status);

CREATE TABLE IF NOT EXISTS department_quarter_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  department_id uuid NOT NULL REFERENCES departments(id),
  year integer NOT NULL,
  quarter integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT department_quarter_approvals_year_check CHECK (year BETWEEN 2020 AND 2100),
  CONSTRAINT department_quarter_approvals_quarter_check CHECK (quarter BETWEEN 1 AND 4),
  CONSTRAINT department_quarter_approvals_status_check CHECK (status IN ('draft','approved','reopened')),
  CONSTRAINT department_quarter_approvals_period_uq UNIQUE (department_id, year, quarter)
);

CREATE INDEX IF NOT EXISTS department_quarter_approvals_queue_idx
  ON department_quarter_approvals(organization_id, year, quarter, status);
