"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const employeeItems = [
  { href: "/overtime", label: "Внеурочное время" },
  { href: "/vacations", label: "Отпуска" },
];

export function AppNavigation({ isHr }: { isHr: boolean }) {
  const pathname = usePathname();
  const items = isHr
    ? [
        ...employeeItems,
        { href: "/hr", label: "Кабинет кадровика" },
        { href: "/hr/employees", label: "Сотрудники" },
        { href: "/hr/departments", label: "Подразделения" },
      ]
    : employeeItems;

  return (
    <nav className="nav" aria-label="Основная навигация">
      {items.map((item) => {
        const active =
          item.href === "/hr"
            ? pathname === item.href ||
              pathname.startsWith("/hr/overtime/") ||
              pathname.startsWith("/hr/vacations/")
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
