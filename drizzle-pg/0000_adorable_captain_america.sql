CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"details" text DEFAULT '' NOT NULL,
	"created_at" text DEFAULT (now())::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" text PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" text,
	"end_date" text,
	"created_by" text,
	"created_at" text DEFAULT (now())::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"job_title" text DEFAULT '' NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"manager_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT (now())::text NOT NULL,
	"updated_at" text DEFAULT (now())::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"score_bands" text DEFAULT '[]' NOT NULL,
	"sections" text DEFAULT '[]' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" text DEFAULT (now())::text NOT NULL,
	"updated_at" text DEFAULT (now())::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"cycle_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"success_measure" text DEFAULT '' NOT NULL,
	"due_date" text,
	"status" text DEFAULT 'not_started' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT (now())::text NOT NULL,
	"updated_at" text DEFAULT (now())::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"month" text NOT NULL,
	"pulse_score" real,
	"incidents" real,
	"dispatch_seconds" integer,
	"waiting_seconds" integer,
	"source" text DEFAULT '' NOT NULL,
	"created_at" text DEFAULT (now())::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"cycle_id" text NOT NULL,
	"stage" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_date" text,
	"template_id" text,
	"form_data" text DEFAULT '' NOT NULL,
	"employee_reflection" text DEFAULT '' NOT NULL,
	"manager_feedback" text DEFAULT '' NOT NULL,
	"shared_summary" text DEFAULT '' NOT NULL,
	"rating" integer,
	"employee_acknowledged" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" text DEFAULT (now())::text NOT NULL,
	"updated_at" text DEFAULT (now())::text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"auth_user_id" text,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'employee' NOT NULL,
	"employee_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"invited_by" text,
	"created_at" text DEFAULT (now())::text NOT NULL,
	"updated_at" text DEFAULT (now())::text NOT NULL,
	CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_employees_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_stats" ADD CONSTRAINT "monthly_stats_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cycles_year_unique" ON "cycles" USING btree ("year");--> statement-breakpoint
CREATE INDEX "employees_manager_idx" ON "employees" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "goals_employee_idx" ON "goals" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_stats_employee_month" ON "monthly_stats" USING btree ("employee_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_employee_cycle_stage_unique" ON "reviews" USING btree ("employee_id","cycle_id","stage");--> statement-breakpoint
CREATE INDEX "reviews_cycle_idx" ON "reviews" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "reviews_employee_idx" ON "reviews" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "users_employee_idx" ON "users" USING btree ("employee_id");