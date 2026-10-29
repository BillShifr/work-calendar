ALTER TABLE overtime_entries
  DROP CONSTRAINT IF EXISTS overtime_entries_minutes_check;

ALTER TABLE overtime_entries
  ADD CONSTRAINT overtime_entries_minutes_check
  CHECK (minutes BETWEEN 5 AND 1440 AND minutes % 5 = 0);
