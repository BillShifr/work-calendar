export const workflowStatuses = [
  "draft",
  "submitted",
  "hr_proposed",
  "approved",
  "rejected",
  "withdrawn",
  "reopened",
] as const;

export type WorkflowStatus = (typeof workflowStatuses)[number];
export type ActorRole = "employee" | "hr" | "hr_lead" | "admin" | "system";

const transitions: Record<
  WorkflowStatus,
  Partial<Record<ActorRole, WorkflowStatus[]>>
> = {
  draft: { employee: ["submitted"] },
  submitted: {
    employee: ["withdrawn"],
    hr: ["hr_proposed", "approved", "rejected"],
    hr_lead: ["hr_proposed", "approved", "rejected"],
  },
  hr_proposed: {
    employee: ["approved", "submitted"],
    hr: ["rejected"],
    hr_lead: ["rejected"],
  },
  approved: { hr: ["reopened"], hr_lead: ["reopened"] },
  rejected: { employee: ["draft"] },
  withdrawn: { employee: ["draft"] },
  reopened: {
    employee: ["submitted"],
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
