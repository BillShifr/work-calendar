CREATE TABLE IF NOT EXISTS job_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_titles_org_name_uq UNIQUE (organization_id, name)
);

ALTER TABLE department_assignments
  ADD COLUMN IF NOT EXISTS job_title_id uuid;

INSERT INTO job_titles (organization_id, name)
SELECT DISTINCT employee.organization_id, btrim(assignment.job_title)
FROM department_assignments assignment
JOIN users employee ON employee.id = assignment.user_id
WHERE assignment.job_title IS NOT NULL AND btrim(assignment.job_title) <> ''
ON CONFLICT (organization_id, name) DO NOTHING;

UPDATE department_assignments assignment
SET job_title_id = title.id
FROM users employee, job_titles title
WHERE employee.id = assignment.user_id
  AND title.organization_id = employee.organization_id
  AND title.name = btrim(assignment.job_title)
  AND assignment.job_title_id IS NULL
  AND assignment.job_title IS NOT NULL
  AND btrim(assignment.job_title) <> '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'department_assignments'::regclass
      AND conname = 'department_assignments_job_title_id_job_titles_id_fk'
  ) THEN
    ALTER TABLE department_assignments
      ADD CONSTRAINT department_assignments_job_title_id_job_titles_id_fk
      FOREIGN KEY (job_title_id) REFERENCES job_titles(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS department_assignments_job_title_idx
  ON department_assignments(job_title_id);
