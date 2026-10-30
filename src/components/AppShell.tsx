import Link from "next/link";
import { approverDepartmentIds, requireUser } from "@/lib/auth";
import { AppNavigation } from "./AppNavigation";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isHr = user.role === "hr" || user.role === "hr_lead";
  const canApprove = (await approverDepartmentIds(user)).length > 0;
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/overtime">
          <span className="brandMark" aria-hidden="true">
            T
          </span>
          <span>HR</span>
        </Link>
        <AppNavigation isHr={isHr} canApprove={canApprove} />
        <div className="userBox">
          <span>
            <strong>{user.fullName}</strong>
            {isHr
              ? "Кадровая служба"
              : canApprove
                ? "Руководитель подразделения"
                : "Сотрудник"}
          </span>
          <form action="/api/auth/logout" method="post">
            <button className="plainButton" type="submit">
              Выйти
            </button>
          </form>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
