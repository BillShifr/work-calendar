import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const parsed = new URL(databaseUrl);
const localHost =
  parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
const allowedDb = ["hr", "hr_test", "hr_e2e"].includes(
  parsed.pathname.replace(/^\//, ""),
);
if (!localHost || !allowedDb) {
  throw new Error(
    "reset-e2e-fixtures refuses to run outside local hr/hr_test/hr_e2e",
  );
}

const sql = postgres(databaseUrl, { max: 1 });
try {
  await sql`
    TRUNCATE
      overtime_entries,
      overtime_reports,
      vacation_periods,
      vacation_plans,
      entry_windows,
      department_quarter_approvals,
      revisions,
      sessions,
      audit_events,
      outbox_events
    RESTART IDENTITY CASCADE
  `;
  await sql`
    DELETE FROM employee_irregular_leave_terms terms
    WHERE terms.user_id IN (
      SELECT users.id FROM users
      WHERE users.login NOT IN ('hr', 'employee', 'manager')
    )
  `;
  await sql`
    DELETE FROM notifications notice
    WHERE notice.user_id IN (
      SELECT users.id FROM users
      WHERE users.login NOT IN ('hr', 'employee', 'manager')
    )
  `;
  await sql`
    UPDATE departments department
    SET head_user_id = NULL
    WHERE department.head_user_id IN (
      SELECT users.id FROM users
      WHERE users.login NOT IN ('hr', 'employee', 'manager')
    )
  `;
  await sql`
    UPDATE departments department
    SET approver_user_id = NULL
    WHERE department.approver_user_id IN (
      SELECT users.id FROM users
      WHERE users.login NOT IN ('hr', 'employee', 'manager')
    )
  `;
  await sql`
    DELETE FROM department_assignments assignment
    WHERE assignment.user_id IN (
      SELECT users.id FROM users
      WHERE users.login NOT IN ('hr', 'employee', 'manager')
    )
  `;
  await sql`
    DELETE FROM users user_row
    WHERE user_row.login NOT IN ('hr', 'employee', 'manager')
  `;
  await sql`
    DELETE FROM job_titles WHERE name = 'Специалист E2E'
  `;
  await sql`
    DELETE FROM department_assignments assignment
    WHERE assignment.department_id IN (
      SELECT department.id FROM departments department
      WHERE department.name = 'Финансовое управление'
    )
  `;
  await sql`
    DELETE FROM departments department
    WHERE department.name = 'Финансовое управление'
  `;
  console.info("E2E fixtures reset");
} finally {
  await sql.end();
}
