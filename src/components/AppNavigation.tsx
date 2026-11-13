export type NavLink = {
  href: string;
  label: string;
  match?: (pathname: string) => boolean;
};

export type NavGroup = {
  id: string;
  primary: NavLink;
  children?: NavLink[];
};

const scheduleChild: NavLink = {
  href: "/vacations/board",
  label: "График",
  match: (pathname) =>
    pathname === "/vacations/board" || pathname.startsWith("/vacations/board/"),
};

const employeeGroups: NavGroup[] = [
  {
    id: "overtime",
    primary: { href: "/overtime", label: "Внеурочное время" },
  },
  {
    id: "vacations",
    primary: {
      href: "/vacations",
      label: "Отпуска",
      match: (pathname) => pathname === "/vacations",
    },
    children: [scheduleChild],
  },
];

const workforcePaths = [
  "/hr/employees",
  "/hr/departments",
  "/hr/reference-data",
];

export function isNavActive(pathname: string, item: NavLink) {
  if (item.match) return item.match(pathname);
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function isNavSectionActive(pathname: string, group: NavGroup) {
  return (
    isNavActive(pathname, group.primary) ||
    Boolean(group.children?.some((child) => isNavActive(pathname, child)))
  );
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
        match: (pathname) => pathname === "/vacations",
      },
      children: [
        scheduleChild,
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

export function getAppNavGroups(
  isHr: boolean,
  canApprove: boolean,
): NavGroup[] {
  if (isHr) return hrGroups(canApprove);
  if (canApprove) {
    return [
      ...employeeGroups,
      {
        id: "approvals",
        primary: { href: "/approvals", label: "Согласование" },
      },
    ];
  }
  return employeeGroups;
}
