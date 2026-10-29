import Link from "next/link";
import { requireUser } from "@/lib/auth";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isHr = user.role === "hr" || user.role === "hr_lead";
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/overtime">
          <span className="brandMark" aria-hidden="true">
            T
          </span>
          <span>TFOMS Time</span>
        </Link>
        <nav className="nav" aria-label="Основная навигация">
          <Link href="/overtime">Внеурочное время</Link>
          <Link href="/vacations">Отпуска</Link>
          {isHr && <Link href="/hr">Кабинет кадровика</Link>}
        </nav>
        <div className="userBox">
          <span>
            <strong>{user.fullName}</strong>
            {user.role === "employee" ? "Сотрудник" : "Кадровая служба"}
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
