import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { PeriodAccessManager } from "@/components/PeriodAccessManager";
import { getEntryWindowsForYear } from "@/domain/entry-window-service";
import { requireHr } from "@/lib/auth";

export const metadata: Metadata = { title: "Периоды заполнения" };

export default async function PeriodsPage() {
  const actor = await requireHr();
  const year = new Date().getFullYear();
  const initial = await getEntryWindowsForYear(actor.organizationId, year);
  return (
    <AppShell>
      <header className="pageHeader">
        <h1>Периоды заполнения</h1>
      </header>
      <PeriodAccessManager initial={initial} />
    </AppShell>
  );
}
