import { sql } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { JobTitleDirectory } from "@/components/JobTitleDirectory";
import { db } from "@/db/client";
import { requireHr } from "@/lib/auth";

export default async function ReferenceDataPage() {
  const actor = await requireHr();
  const jobTitles = await db.execute<{
    id: string;
    name: string;
    isActive: boolean;
    employeeCount: number;
    irregularLeaveMaxDays: number;
  }>(sql`
    SELECT title.id::text, title.name, title.is_active AS "isActive",
      title.irregular_leave_max_days AS "irregularLeaveMaxDays",
      COUNT(assignment.id)::int AS "employeeCount"
    FROM job_titles title
    LEFT JOIN department_assignments assignment
      ON assignment.job_title_id = title.id AND assignment.valid_to IS NULL
    WHERE title.organization_id = ${actor.organizationId}
    GROUP BY title.id
    ORDER BY title.is_active DESC, title.name
  `);
  return (
    <AppShell>
      <header className="pageHeader">
        <h1>Справочники</h1>
        <span className="statusPill">{jobTitles.length} должностей</span>
      </header>
      <JobTitleDirectory
        key={jobTitles.map((title) => title.id).join(":")}
        jobTitles={jobTitles}
      />
    </AppShell>
  );
}
