"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = {
  href: string;
  label: string;
  match?: (pathname: string) => boolean;
};

type NavGroup = {
  id: string;
  primary: NavLink;
  children?: NavLink[];
};

const employeeGroups: NavGroup[] = [
  {
    id: "overtime",
    primary: { href: "/overtime", label: "Внеурочное время" },
  },
  {
    id: "vacations",
    primary: { href: "/vacations", label: "Отпуска" },
  },
];

const workforcePaths = [
  "/hr/employees",
  "/hr/departments",
  "/hr/reference-data",
];

function isActive(pathname: string, item: NavLink) {
  if (item.match) return item.match(pathname);
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function hrGroups(canApprove: boolean): NavGroup[] {
  return [
    {
      id: "overtime",
      primary: {
        href: "/overtime",
        label: "Внеурочное время",
        match: (pathname) =>
          pathname === "/overtime" || pathname.startsWith("/overtime/"),
      },
      children: [
        {
          href: "/hr/reporting",
          label: "Свод",
          match: (pathname) =>
            pathname === "/hr/reporting" ||
            pathname.startsWith("/hr/reporting/"),
        },
      ],
    },
    {
      id: "vacations",
      primary: {
        href: "/vacations",
        label: "Отпуска",
        match: (pathname) =>
          pathname === "/vacations" || pathname.startsWith("/vacations/"),
      },
      children: [
        {
          href: "/hr/periods",
          label: "Периоды",
          match: (pathname) =>
            pathname === "/hr/periods" || pathname.startsWith("/hr/periods/"),
        },
      ],
    },
    {
      id: "hr-cabinet",
      primary: {
        href: "/hr",
        label: "Кабинет кадровика",
        match: (pathname) =>
          pathname === "/hr" ||
          pathname.startsWith("/hr/overtime/") ||
          pathname.startsWith("/hr/vacations/"),
      },
    },
    ...(canApprove
      ? [
          {
            id: "approvals",
            primary: { href: "/approvals", label: "Согласование" },
          } satisfies NavGroup,
        ]
      : []),
    {
      id: "workforce",
      primary: {
        href: "/hr/employees",
        label: "Структура и штат",
        match: (pathname) =>
          workforcePaths.some(
            (path) => pathname === path || pathname.startsWith(`${path}/`),
          ),
      },
    },
  ];
}

export function AppNavigation({
  isHr,
  canApprove,
}: {
  isHr: boolean;
  canApprove: boolean;
}) {
  const pathname = usePathname();
  const groups = isHr
    ? hrGroups(canApprove)
    : canApprove
      ? [
          ...employeeGroups,
          {
            id: "approvals",
            primary: { href: "/approvals", label: "Согласование" },
          },
        ]
      : employeeGroups;

  return (
    <nav className="nav" aria-label="Основная навигация">
      {groups.map((group) => {
        const primaryActive = isActive(pathname, group.primary);
        const childActive = group.children?.some((child) =>
          isActive(pathname, child),
        );
        const sectionActive = primaryActive || Boolean(childActive);
        return (
          <div
            className={`navGroup${sectionActive ? " navGroupActive" : ""}`}
            key={group.id}
          >
            <Link
              href={group.primary.href}
              aria-current={primaryActive ? "page" : undefined}
              className={
                sectionActive && !primaryActive ? "navSection" : undefined
              }
            >
              {group.primary.label}
            </Link>
            {group.children?.map((child) => {
              const active = isActive(pathname, child);
              return (
                <Link
                  href={child.href}
                  aria-current={active ? "page" : undefined}
                  className="navChild"
                  key={child.href}
                >
                  {child.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
