ALTER TABLE departments
  DROP CONSTRAINT IF EXISTS departments_organization_id_name_key;

DROP INDEX IF EXISTS departments_org_name_uq;

CREATE UNIQUE INDEX IF NOT EXISTS departments_org_root_name_uq
  ON departments (organization_id, name)
  WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS departments_org_parent_name_uq
  ON departments (organization_id, parent_id, name)
  WHERE parent_id IS NOT NULL;
