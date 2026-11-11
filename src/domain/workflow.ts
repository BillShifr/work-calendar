export const workflowStatuses = [
  "draft",
  "manager_review",
  "submitted",
  "hr_proposed",
  "approved",
  "rejected",
  "withdrawn",
  "reopened",
] as const;

export type WorkflowStatus = (typeof workflowStatuses)[number];
export type ActorRole =
  "employee" | "department_head" | "hr" | "hr_lead" | "admin" | "system";

const transitions: Record<
  WorkflowStatus,
  Partial<Record<ActorRole, WorkflowStatus[]>>
> = {
  draft: {
    employee: ["manager_review", "submitted"],
    department_head: ["manager_review", "submitted"],
  },
  manager_review: {
    employee: ["draft", "withdrawn"],
    department_head: ["submitted", "draft"],
    hr: ["submitted"],
    hr_lead: ["submitted"],
  },
  submitted: {
    employee: ["withdrawn", "draft"],
    department_head: ["withdrawn", "draft"],
    hr: ["hr_proposed", "approved", "rejected"],
    hr_lead: ["hr_proposed", "approved", "rejected"],
  },
  hr_proposed: {
    employee: ["approved", "submitted"],
    department_head: ["approved", "submitted"],
    hr: ["rejected"],
    hr_lead: ["rejected"],
  },
  approved: { hr: ["reopened"], hr_lead: ["reopened"] },
  rejected: { employee: ["draft"], department_head: ["draft"] },
  withdrawn: { employee: ["draft"], department_head: ["draft"] },
  reopened: {
    employee: ["manager_review", "submitted"],
    department_head: ["manager_review", "submitted"],
    hr: ["hr_proposed", "approved"],
    hr_lead: ["hr_proposed", "approved"],
  },
};

export function canTransition(
  from: WorkflowStatus,
  to: WorkflowStatus,
  actor: ActorRole,
): boolean {
  return transitions[from][actor]?.includes(to) ?? false;
}

export function assertTransition(
  from: WorkflowStatus,
  to: WorkflowStatus,
  actor: ActorRole,
): void {
  if (!canTransition(from, to, actor))
    throw new Error(`Недопустимый переход ${from} → ${to} для роли ${actor}`);
}
