import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["employee", "hr", "hr_lead", "admin"]);
export const workflowStatusEnum = pgEnum("workflow_status", [
  "draft",
  "submitted",
  "hr_proposed",
  "approved",
  "rejected",
  "withdrawn",
  "reopened",
]);
export const actorRoleEnum = pgEnum("actor_role", [
  "employee",
  "hr",
  "hr_lead",
  "admin",
  "system",
]);

const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Yekaterinburg"),
  ...auditColumns,
});

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    headcount: integer("headcount").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("departments_org_name_uq").on(table.organizationId, table.name),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    login: text("login").notNull(),
    fullName: text("full_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("employee"),
    isActive: boolean("is_active").notNull().default(true),
    oidcSubject: text("oidc_subject"),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("users_org_login_uq").on(table.organizationId, table.login),
  ],
);

export const departmentAssignments = pgTable(
  "department_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
    jobTitle: text("job_title"),
    isCritical: boolean("is_critical").notNull().default(false),
    ...auditColumns,
  },
  (table) => [
    index("department_assignments_user_dates_idx").on(
      table.userId,
      table.validFrom,
      table.validTo,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_uq").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const overtimeReports = pgTable(
  "overtime_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    status: workflowStatusEnum("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    zeroConfirmed: boolean("zero_confirmed").notNull().default(false),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("overtime_reports_user_month_uq").on(
      table.userId,
      table.year,
      table.month,
    ),
    index("overtime_reports_queue_idx").on(
      table.organizationId,
      table.status,
      table.year,
      table.month,
    ),
  ],
);

export const overtimeEntries = pgTable(
  "overtime_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => overtimeReports.id, { onDelete: "cascade" }),
    workDate: date("work_date").notNull(),
    minutes: integer("minutes").notNull(),
    source: actorRoleEnum("source").notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("overtime_entries_report_date_uq").on(
      table.reportId,
      table.workDate,
    ),
  ],
);

export const vacationPlans = pgTable(
  "vacation_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    year: integer("year").notNull(),
    allowanceDays: integer("allowance_days").notNull().default(28),
    status: workflowStatusEnum("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("vacation_plans_user_year_uq").on(table.userId, table.year),
  ],
);

export const vacationPeriods = pgTable(
  "vacation_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => vacationPlans.id, { onDelete: "cascade" }),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    source: actorRoleEnum("source").notNull(),
    ...auditColumns,
  },
  (table) => [
    index("vacation_periods_dates_idx").on(table.startsOn, table.endsOn),
  ],
);

export const revisions = pgTable(
  "revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    version: integer("version").notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    actorRole: actorRoleEnum("actor_role").notNull(),
    reason: text("reason"),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("revisions_aggregate_version_uq").on(
      table.aggregateType,
      table.aggregateId,
      table.version,
    ),
  ],
);

export const approvalEvents = pgTable("approval_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  fromStatus: workflowStatusEnum("from_status").notNull(),
  toStatus: workflowStatusEnum("to_status").notNull(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const departmentAbsenceRules = pgTable("department_absence_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id),
  maxAbsent: integer("max_absent"),
  minPresent: integer("min_present"),
  ...auditColumns,
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_events_object_idx").on(
      table.objectType,
      table.objectId,
      table.occurredAt,
    ),
  ],
);
