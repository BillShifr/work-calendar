import type { Sql } from "postgres";
import {
  DEPARTMENT_DIRECTORY,
  JOB_TITLE_DIRECTORY,
  ORGANIZATION_NAME,
} from "../directory-data";

export async function seedReferenceData(sql: Sql) {
  let [organization] =
    await sql`SELECT id FROM organizations WHERE name = ${ORGANIZATION_NAME} ORDER BY created_at LIMIT 1`;
  if (!organization)
    [organization] =
      await sql`INSERT INTO organizations(name) VALUES (${ORGANIZATION_NAME}) RETURNING id`;
  const organizationId = organization.id;

  const departmentIds = new Map<string, string>();
  for (const department of DEPARTMENT_DIRECTORY) {
    let parentId: string | null = null;
    if (department.parentCode) {
      const resolvedParentId = departmentIds.get(department.parentCode);
      if (!resolvedParentId)
        throw new Error(`Unknown parent department: ${department.parentCode}`);
      parentId = resolvedParentId;
    }
    const [existing] = await sql`
      SELECT id FROM departments
      WHERE organization_id=${organizationId}
        AND parent_id IS NOT DISTINCT FROM ${parentId}
        AND name=${department.name}
      LIMIT 1
    `;
    const [saved] = existing
      ? await sql`
          UPDATE departments
          SET headcount=${department.headcount}, is_active=true, updated_at=now()
          WHERE id=${existing.id}
          RETURNING id
        `
      : await sql`
          INSERT INTO departments(
            organization_id, name, headcount, parent_id, is_active
          ) VALUES (
            ${organizationId}, ${department.name}, ${department.headcount}, ${parentId}, true
          )
          RETURNING id
        `;
    departmentIds.set(department.code, saved.id);
  }

  for (const title of JOB_TITLE_DIRECTORY)
    await sql`
      INSERT INTO job_titles(
        organization_id, name, irregular_leave_max_days, is_active
      ) VALUES (
        ${organizationId}, ${title.name}, ${title.irregularLeaveMaxDays}, true
      )
      ON CONFLICT (organization_id, name)
      DO UPDATE SET
        irregular_leave_max_days = EXCLUDED.irregular_leave_max_days,
        is_active = true,
        updated_at = now()
    `;

  await sql`
    INSERT INTO audit_events(
      organization_id, actor_id, action, object_type, object_id, metadata
    ) VALUES (
      ${organizationId},
      NULL,
      'directory.seed.synced',
      'organization',
      ${organizationId},
      ${sql.json({
        source: "Свод по ненорм.раб.дню (шаблон).xlsx",
        departments: DEPARTMENT_DIRECTORY.length,
        jobTitles: JOB_TITLE_DIRECTORY.length,
      })}
    )
  `;

  return {
    organizationId,
    departments: DEPARTMENT_DIRECTORY.length,
    jobTitles: JOB_TITLE_DIRECTORY.length,
  };
}
