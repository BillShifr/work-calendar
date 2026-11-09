ALTER TABLE overtime_entries
  DROP CONSTRAINT IF EXISTS overtime_entries_minutes_check;

-- Existing values above the new business limit are preserved for an explicit
-- HR correction. PostgreSQL still enforces the constraint for every new or
-- changed row while it is NOT VALID.
ALTER TABLE overtime_entries
  ADD CONSTRAINT overtime_entries_minutes_check
  CHECK (minutes BETWEEN 5 AND 240 AND minutes % 5 = 0)
  NOT VALID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM overtime_entries WHERE minutes > 240
  ) THEN
    ALTER TABLE overtime_entries
      VALIDATE CONSTRAINT overtime_entries_minutes_check;
  END IF;
END $$;
