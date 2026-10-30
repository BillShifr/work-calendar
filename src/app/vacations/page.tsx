import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { VacationMatrix } from "@/components/VacationMatrix";
import { getVacationPlan } from "@/domain/vacation-service";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Планирование отпусков" };
const statusLabels: Record<string, string> = {
  draft: "Черновик",
  submitted: "На проверке",
  hr_proposed: "Есть правка кадровика",
  approved: "Утверждено",
  rejected: "Отклонено",
  withdrawn: "Отозвано",
  reopened: "Открыто повторно",
};
export default async function VacationsPage() {
  const user = await requireUser();
  const nextYear = new Date().getFullYear() + 1;
  const plan = await getVacationPlan(user, nextYear);
  return (
    <AppShell>
      <header className="pageHeader">
        <h1>Отпуска</h1>
        <span className="statusPill">
          {statusLabels[plan.status]} · {plan.allowanceDays} дней
        </span>
      </header>
      <VacationMatrix initial={plan} />
    </AppShell>
  );
}
