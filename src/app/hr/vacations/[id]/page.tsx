import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ApprovalHistory } from "@/components/ApprovalHistory";
import { VacationMatrix } from "@/components/VacationMatrix";
import { db } from "@/db/client";
import {
  approvalEvents,
  users,
  vacationPeriods,
  vacationPlans,
} from "@/db/schema";
import { requireHr } from "@/lib/auth";

const statusLabels: Record<string, string> = {
  draft: "Черновик",
  manager_review: "У руководителя",
  submitted: "Требуется решение",
  hr_proposed: "Ожидает сотрудника",
  approved: "Утверждено",
  rejected: "Отклонено",
  withdrawn: "Отозвано",
  reopened: "Открыто повторно",
};

export default async function HrVacationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireHr();
  const { id } = await params;
  const [plan] = await db
    .select({
      id: vacationPlans.id,
      organizationId: vacationPlans.organizationId,
      year: vacationPlans.year,
      version: vacationPlans.version,
      status: vacationPlans.status,
      allowanceDays: vacationPlans.allowanceDays,
      fullName: users.fullName,
    })
    .from(vacationPlans)
    .innerJoin(users, eq(users.id, vacationPlans.userId))
    .where(
      and(
        eq(vacationPlans.id, id),
        eq(vacationPlans.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  if (!plan) notFound();
  if (plan.status === "manager_review") notFound();
  const [rows, history] = await Promise.all([
    db.select().from(vacationPeriods).where(eq(vacationPeriods.planId, id)),
    db
      .select({
        id: approvalEvents.id,
        fromStatus: approvalEvents.fromStatus,
        toStatus: approvalEvents.toStatus,
        comment: approvalEvents.comment,
        createdAt: approvalEvents.createdAt,
        actorName: users.fullName,
      })
      .from(approvalEvents)
      .innerJoin(users, eq(users.id, approvalEvents.actorId))
      .where(
        and(
          eq(approvalEvents.aggregateType, "vacation_plan"),
          eq(approvalEvents.aggregateId, id),
        ),
      )
      .orderBy(desc(approvalEvents.createdAt))
      .limit(10),
  ]);
  const periods = rows.map((period) => ({
    id: period.id,
    startsOn: period.startsOn,
    endsOn: period.endsOn,
    source: (period.source === "hr" || period.source === "hr_lead"
      ? "hr"
      : "employee") as "hr" | "employee",
  }));
  return (
    <AppShell>
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Проверка отпуска · {plan.year}</p>
          <h1>{plan.fullName}</h1>
        </div>
        <span className="statusPill">
          {statusLabels[plan.status] ?? plan.status}
        </span>
      </header>
      <VacationMatrix initial={{ ...plan, periods }} mode="hr" />
      <ApprovalHistory
        events={history}
        statusLabels={statusLabels}
        emptyLabel="Это первая кадровая проверка плана."
      />
    </AppShell>
  );
}
