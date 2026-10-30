"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/hr/employees", label: "Сотрудники" },
  { href: "/hr/departments", label: "Подразделения" },
  { href: "/hr/reference-data", label: "Должности" },
];

export function WorkforceNavigation() {
  const pathname = usePathname();

  return (
    <nav className="sectionTabs" aria-label="Структура и штат">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
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
