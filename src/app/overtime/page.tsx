import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { OvertimeCalendar } from "@/components/OvertimeCalendar";
import { getOvertimeReport } from "@/domain/overtime-service";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Внеурочное время" };
export default async function OvertimePage() {
  const user = await requireUser();
  const now = new Date();
  const report = await getOvertimeReport(
    user,
    now.getFullYear(),
    now.getMonth() + 1,
  );
  return (
    <AppShell>
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Личный кабинет</p>
          <h1>Внеурочное время</h1>
          <p className="lead">
            Выберите день, затем одно из пяти точных значений. Будущие даты
            закрыты, выходные остаются доступными.
          </p>
        </div>
        <span className="statusPill">Черновик · версия {report.version}</span>
      </header>
      <OvertimeCalendar initial={report} />
    </AppShell>
  );
}
