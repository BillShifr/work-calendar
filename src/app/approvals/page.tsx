import { AppShell } from "@/components/AppShell";
import { DepartmentApprovalDashboard } from "@/components/DepartmentApprovalDashboard";
import { getDepartmentApprovalDashboard } from "@/domain/department-approval-service";
import { getDepartmentVacationBoard } from "@/domain/department-vacation-board";
import { requireDepartmentApprover } from "@/lib/auth";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const actor = await requireDepartmentApprover();
  const requestedYear = Number((await searchParams).year);
  const year =
    Number.isInteger(requestedYear) &&
    requestedYear >= 2020 &&
    requestedYear <= 2100
      ? requestedYear
      : new Date().getFullYear();
  const vacationYear = year + 1;
  const [departments, vacationDepartments] = await Promise.all([
    getDepartmentApprovalDashboard(actor, year),
    getDepartmentVacationBoard(actor, vacationYear),
  ]);
  return (
    <AppShell>
      <header className="pageHeader">
        <h1>Согласование</h1>
      </header>
      <DepartmentApprovalDashboard
        departments={departments}
        vacationDepartments={vacationDepartments}
        year={year}
      />
    </AppShell>
  );
}
