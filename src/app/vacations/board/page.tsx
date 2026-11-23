import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { OrgVacationMatrix } from "@/components/OrgVacationMatrix";
import { getOrgVacationMatrix } from "@/domain/org-vacation-matrix";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "График отпусков" };

function boardYear(raw: string | undefined) {
  const year = Number(raw);
  if (Number.isInteger(year) && year >= 2020 && year <= 2100) return year;
  return new Date().getFullYear() + 1;
}

function boardMonth(raw: string | undefined) {
  const month = Number(raw);
  if (Number.isInteger(month) && month >= 1 && month <= 12) return month;
  return undefined;
}

function boardDate(raw: string | undefined) {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return undefined;
}

export default async function VacationBoardPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
    department?: string;
    date?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const year = boardYear(params.year);
  const departments = await getOrgVacationMatrix(user, year);
  return (
    <AppShell>
      <OrgVacationMatrix
        key={`${year}:${params.department ?? ""}:${params.month ?? ""}:${params.date ?? ""}`}
        year={year}
        actorUserId={user.id}
        departments={departments}
        focusDepartmentId={params.department}
        focusMonth={boardMonth(params.month)}
        highlightDate={boardDate(params.date)}
      />
    </AppShell>
  );
}
