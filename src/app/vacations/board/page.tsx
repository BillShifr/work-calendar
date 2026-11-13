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

export default async function VacationBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await requireUser();
  const year = boardYear((await searchParams).year);
  const departments = await getOrgVacationMatrix(user, year);
  return (
    <AppShell>
      <OrgVacationMatrix
        year={year}
        actorUserId={user.id}
        departments={departments}
      />
    </AppShell>
  );
}
