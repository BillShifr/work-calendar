import { and, eq, isNull } from "drizzle-orm";
import type { db as Db } from "@/db/client";
import { departmentAssignments, departments, users } from "@/db/schema";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

export async function currentDepartmentIdForUser(
  tx: Tx,
  userId: string,
): Promise<string | null> {
  const [assignment] = await tx
    .select({ departmentId: departmentAssignments.departmentId })
    .from(departmentAssignments)
    .where(
      and(
        eq(departmentAssignments.userId, userId),
        isNull(departmentAssignments.validTo),
      ),
    )
    .limit(1);
  return assignment?.departmentId ?? null;
}

export async function departmentApproverId(
  tx: Tx,
  organizationId: string,
  departmentId: string,
): Promise<string | null> {
  const [department] = await tx
    .select({
      approverUserId: departments.approverUserId,
      headUserId: departments.headUserId,
    })
    .from(departments)
    .where(
      and(
        eq(departments.id, departmentId),
        eq(departments.organizationId, organizationId),
        eq(departments.isActive, true),
      ),
    )
    .limit(1);
  return department?.approverUserId ?? department?.headUserId ?? null;
}

export async function actorApprovesDepartment(
  tx: Tx,
  actorId: string,
  organizationId: string,
  departmentId: string,
): Promise<boolean> {
  const approverId = await departmentApproverId(
    tx,
    organizationId,
    departmentId,
  );
  return approverId === actorId;
}

export async function actorApprovesUser(
  tx: Tx,
  actor: { id: string; organizationId: string },
  targetUserId: string,
): Promise<boolean> {
  const departmentId = await currentDepartmentIdForUser(tx, targetUserId);
  if (!departmentId) return false;
  return actorApprovesDepartment(
    tx,
    actor.id,
    actor.organizationId,
    departmentId,
  );
}

/** Vacation submit target: manager queue when a non-HR department approver exists. */
export async function vacationSubmitTarget(
  tx: Tx,
  actor: { id: string; organizationId: string },
): Promise<"manager_review" | "submitted"> {
  const departmentId = await currentDepartmentIdForUser(tx, actor.id);
  if (!departmentId) return "submitted";
  const approverId = await departmentApproverId(
    tx,
    actor.organizationId,
    departmentId,
  );
  if (!approverId || approverId === actor.id) return "submitted";
  const [approver] = await tx
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, approverId))
    .limit(1);
  if (!approver || ["hr", "hr_lead", "admin"].includes(approver.role))
    return "submitted";
  return "manager_review";
}

export async function ensureDepartmentApprover(
  tx: Tx,
  organizationId: string,
  departmentId: string,
  userId: string,
): Promise<void> {
  const [department] = await tx
    .select({ headUserId: departments.headUserId })
    .from(departments)
    .where(
      and(
        eq(departments.id, departmentId),
        eq(departments.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!department) throw new Error("DEPARTMENT_NOT_FOUND");
  await tx
    .update(departments)
    .set({
      approverUserId: userId,
      headUserId: department.headUserId ?? userId,
      updatedAt: new Date(),
    })
    .where(eq(departments.id, departmentId));
}
