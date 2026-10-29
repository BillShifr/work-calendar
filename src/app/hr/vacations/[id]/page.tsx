import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { VacationMatrix } from "@/components/VacationMatrix";
import { db } from "@/db/client";
import { users, vacationPeriods, vacationPlans } from "@/db/schema";
import { requireHr } from "@/lib/auth";

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
  const rows = await db
    .select()
    .from(vacationPeriods)
    .where(eq(vacationPeriods.planId, id));
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
          <p className="eyebrow">Кадровая правка · {plan.year}</p>
          <h1>{plan.fullName}</h1>
          <p className="lead">
            Измените периоды прямо в матрице и обязательно объясните причину.
            Сотрудник увидит предложение янтарным цветом и должен его
            подтвердить.
          </p>
        </div>
        <span className="statusPill">
          {plan.status === "submitted"
            ? "Ожидает проверки"
            : plan.status === "hr_proposed"
              ? "Ожидает сотрудника"
              : plan.status === "approved"
                ? "Утверждено"
                : "На редактировании"}
        </span>
      </header>
      <VacationMatrix initial={{ ...plan, periods }} mode="hr" />
    </AppShell>
  );
}
