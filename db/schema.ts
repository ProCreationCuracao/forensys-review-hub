import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const employees = pgTable(
  "employees",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull().default(""),
    jobTitle: text("job_title").notNull().default(""),
    department: text("department").notNull().default(""),
    managerId: text("manager_id").references((): AnyPgColumn => employees.id),
    isActive: boolean("is_active").notNull().default(true),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`(now())::text`),
    updatedAt: text("updated_at").notNull().default(sql`(now())::text`),
  },
  (table) => [index("employees_manager_idx").on(table.managerId)],
);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    authUserId: text("auth_user_id").unique(),
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["hr_admin", "manager", "employee"] })
      .notNull()
      .default("employee"),
    employeeId: text("employee_id").references(() => employees.id),
    isActive: boolean("is_active").notNull().default(true),
    invitedBy: text("invited_by"),
    createdAt: text("created_at").notNull().default(sql`(now())::text`),
    updatedAt: text("updated_at").notNull().default(sql`(now())::text`),
  },
  (table) => [
    index("users_employee_idx").on(table.employeeId),
  ],
);

export const cycles = pgTable(
  "cycles",
  {
    id: text("id").primaryKey(),
    year: integer("year").notNull(),
    name: text("name").notNull(),
    status: text("status", { enum: ["active", "closed"] })
      .notNull()
      .default("active"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    createdBy: text("created_by"),
    createdAt: text("created_at").notNull().default(sql`(now())::text`),
  },
  (table) => [uniqueIndex("cycles_year_unique").on(table.year)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    cycleId: text("cycle_id").notNull().references(() => cycles.id),
    stage: text("stage", { enum: ["planning", "check_in", "evaluation"] }).notNull(),
    status: text("status", {
      enum: ["draft", "scheduled", "in_progress", "completed"],
    })
      .notNull()
      .default("draft"),
    scheduledDate: text("scheduled_date"),
    templateId: text("template_id"),
    formData: text("form_data").notNull().default(""),
    employeeReflection: text("employee_reflection").notNull().default(""),
    managerFeedback: text("manager_feedback").notNull().default(""),
    sharedSummary: text("shared_summary").notNull().default(""),
    rating: integer("rating"),
    employeeAcknowledged: boolean("employee_acknowledged")
      .notNull()
      .default(false),
    isDemo: boolean("is_demo").notNull().default(false),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`(now())::text`),
    updatedAt: text("updated_at").notNull().default(sql`(now())::text`),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("reviews_employee_cycle_stage_unique").on(
      table.employeeId,
      table.cycleId,
      table.stage,
    ),
    index("reviews_cycle_idx").on(table.cycleId),
    index("reviews_employee_idx").on(table.employeeId),
  ],
);

export const goals = pgTable(
  "goals",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id").notNull().references(() => employees.id),
    cycleId: text("cycle_id").notNull().references(() => cycles.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    successMeasure: text("success_measure").notNull().default(""),
    dueDate: text("due_date"),
    status: text("status", {
      enum: ["not_started", "in_progress", "blocked", "completed"],
    })
      .notNull()
      .default("not_started"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`(now())::text`),
    updatedAt: text("updated_at").notNull().default(sql`(now())::text`),
  },
  (table) => [index("goals_employee_idx").on(table.employeeId)],
);

export const evaluationTemplates = pgTable(
  "evaluation_templates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    department: text("department").notNull().default(""),
    scoreBands: text("score_bands").notNull().default("[]"),
    sections: text("sections").notNull().default("[]"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: text("created_by"),
    createdAt: text("created_at").notNull().default(sql`(now())::text`),
    updatedAt: text("updated_at").notNull().default(sql`(now())::text`),
  },
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    details: text("details").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`(now())::text`),
  },
  (table) => [index("audit_created_at_idx").on(table.createdAt)],
);

export const employeeRelations = relations(employees, ({ one, many }) => ({
  manager: one(employees, {
    fields: [employees.managerId],
    references: [employees.id],
    relationName: "employee_manager",
  }),
  reports: many(employees, { relationName: "employee_manager" }),
  users: many(users),
  reviews: many(reviews),
  goals: many(goals),
}));

export const userRelations = relations(users, ({ one }) => ({
  employee: one(employees, {
    fields: [users.employeeId],
    references: [employees.id],
  }),
}));

// Monthly Pulse figures per employee (imported from the monthly Pulse export).
export const monthlyStats = pgTable(
  "monthly_stats",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // YYYY-MM
    pulseScore: real("pulse_score"),
    incidents: real("incidents"),
    dispatchSeconds: integer("dispatch_seconds"),
    waitingSeconds: integer("waiting_seconds"),
    source: text("source").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`(now())::text`),
  },
  (table) => [uniqueIndex("monthly_stats_employee_month").on(table.employeeId, table.month)],
);
