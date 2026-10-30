"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const employeeItems = [
  { href: "/overtime", label: "Внеурочное время" },
  { href: "/vacations", label: "Отпуска" },
];

export function AppNavigation({
  isHr,
  canApprove,
}: {
  isHr: boolean;
  canApprove: boolean;
}) {
  const pathname = usePathname();
  const workforcePaths = [
    "/hr/employees",
    "/hr/departments",
    "/hr/reference-data",
  ];
  const items = isHr
    ? [
        ...employeeItems,
        { href: "/hr", label: "Кабинет кадровика" },
        ...(canApprove ? [{ href: "/approvals", label: "Согласование" }] : []),
        { href: "/hr/reporting", label: "Свод" },
        { href: "/hr/periods", label: "Периоды" },
        { href: "/hr/employees", label: "Структура и штат" },
      ]
    : canApprove
      ? [...employeeItems, { href: "/approvals", label: "Согласование" }]
      : employeeItems;

  return (
    <nav className="nav" aria-label="Основная навигация">
      {items.map((item) => {
        const active =
          item.href === "/hr/employees"
            ? workforcePaths.some(
                (path) => pathname === path || pathname.startsWith(`${path}/`),
              )
            : item.href === "/hr"
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
