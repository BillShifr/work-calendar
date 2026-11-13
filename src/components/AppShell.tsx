import { approverDepartmentIds, requireUser } from "@/lib/auth";
import { AppHeader } from "./AppHeader";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isHr = user.role === "hr" || user.role === "hr_lead";
  const canApprove = (await approverDepartmentIds(user)).length > 0;
  return (
    <div className="shell">
      <AppHeader fullName={user.fullName} isHr={isHr} canApprove={canApprove} />
      <main className="main">{children}</main>
    </div>
  );
}
