import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, cycles, employees, evaluationTemplates, goals, monthlyStats, reviews, users } from "../../../db/schema";
import { getSignedInUser } from "../../auth";
import { DEFAULT_EVALUATION_TEMPLATES } from "../../../lib/evaluation-forms";

export const dynamic = "force-dynamic";

type Role = "hr_admin" | "manager" | "employee";
type Identity = NonNullable<Awaited<ReturnType<typeof getSignedInUser>>>;
type Member = typeof users.$inferSelect;
type Stage = "planning" | "check_in" | "evaluation";
const stageOrder: Record<Stage, number> = { planning: 0, check_in: 1, evaluation: 2 };

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function text(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function email(value: unknown) {
  const normalized = text(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

function slugKey(value: string, fallback: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || fallback;
}

function safeJson(value: string) {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function cleanBands(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map((entry, index) => {
    const band = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    let min = Number(band.min), max = Number(band.max);
    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = 0;
    min = Math.max(0, Math.min(100, Math.round(min)));
    max = Math.max(0, Math.min(100, Math.round(max)));
    if (min > max) [min, max] = [max, min];
    return { min, max, rating: index + 1, label: text(band.label, 80) || `Rating ${index + 1}` };
  });
}

function cleanSections(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const sectionKeys = new Set<string>();
  return raw.slice(0, 15).map((entry, index) => {
    const section = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const title = text(section.title, 120) || `Section ${index + 1}`;
    let key = text(section.key, 60) || slugKey(title, `section-${index + 1}`);
    while (sectionKeys.has(key)) key = `${key}-x`;
    sectionKeys.add(key);
    const itemKeys = new Set<string>();
    const items = (Array.isArray(section.items) ? section.items : []).slice(0, 60).map((item, itemIndex) => {
      const record = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const label = text(record.label ?? item, 120);
      let itemKey = text(record.key, 60) || slugKey(label, `item-${itemIndex + 1}`);
      while (itemKeys.has(itemKey)) itemKey = `${itemKey}-x`;
      itemKeys.add(itemKey);
      return { key: itemKey, label };
    }).filter((item) => item.label);
    return { key, title, items };
  }).filter((section) => section.items.length);
}

function cleanFormData(raw: unknown) {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const items: Record<string, { rating: string; note: string }> = {};
  if (data.items && typeof data.items === "object") {
    for (const [key, value] of Object.entries(data.items as Record<string, unknown>).slice(0, 400)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Record<string, unknown>;
      const rating = text(entry.rating, 30);
      items[text(key, 140)] = {
        rating: ["needs_improvement", "good", "exceptional"].includes(rating) ? rating : "",
        note: text(entry.note, 500),
      };
    }
  }
  const score = data.pulseScore === "" || data.pulseScore == null ? null : Number(data.pulseScore);
  return {
    templateId: text(data.templateId, 64) || null,
    templateName: text(data.templateName, 120),
    employmentDate: text(data.employmentDate, 40),
    period: text(data.period, 60),
    evaluationDate: text(data.evaluationDate, 40),
    supervisor: text(data.supervisor, 160),
    pulseScore: score !== null && Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null,
    items,
    supervisorSupport: text(data.supervisorSupport, 4000),
    employeeFeedback: text(data.employeeFeedback, 4000),
    overallScore: (() => { const n = Number(data.overallScore); return data.overallScore == null || data.overallScore === "" || !Number.isFinite(n) ? null : Math.max(0, Math.min(100, Math.round(n * 10) / 10)); })(),
    metrics: (() => {
      const m = (data.metrics && typeof data.metrics === "object" ? data.metrics : {}) as Record<string, unknown>;
      const num = (v: unknown) => { if (v === "" || v == null) return null; const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1000000, Math.round(n))) : null; };
      return { incidents: num(m.incidents), calls: num(m.calls), dispatchTime: text(m.dispatchTime, 12), longWaitCount: num(m.longWaitCount) };
    })(),
  };
}

async function ensureTemplates() {
  const db = getDb();
  const rows = await db.select().from(evaluationTemplates).orderBy(evaluationTemplates.name);
  if (rows.length) return rows;
  for (const template of DEFAULT_EVALUATION_TEMPLATES) {
    await db.insert(evaluationTemplates).values({
      id: template.id,
      name: template.name,
      department: template.department,
      scoreBands: JSON.stringify(template.scoreBands),
      sections: JSON.stringify(template.sections),
    }).onConflictDoNothing();
  }
  return db.select().from(evaluationTemplates).orderBy(evaluationTemplates.name);
}

async function audit(member: Member, action: string, entity: string, entityId = "") {
  const db = getDb();
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorUserId: member.authUserId ?? member.id,
    actorEmail: member.email,
    action,
    entity,
    entityId,
  });
}

async function resolveMember(identity: Identity) {
  const db = getDb();
  const [byId] = await db.select().from(users).where(eq(users.authUserId, identity.userId)).limit(1);
  if (byId) return byId.isActive ? { member: byId } : { error: "This account has been deactivated.", status: 403 };

  const normalizedEmail = email(identity.email);
  const [byEmail] = normalizedEmail
    ? await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1)
    : [];
  if (byEmail) {
    if (!byEmail.isActive) return { error: "This account has been deactivated.", status: 403 };
    if (byEmail.authUserId && byEmail.authUserId !== identity.userId) {
      return { error: "This email is already linked to another sign-in account.", status: 403 };
    }
    await db.update(users).set({ authUserId: identity.userId, updatedAt: new Date().toISOString() }).where(eq(users.id, byEmail.id));
    const [linked] = await db.select().from(users).where(eq(users.id, byEmail.id)).limit(1);
    return { member: linked };
  }

  const [existing] = await db.select({ value: count() }).from(users);
  // The very first person to sign in becomes the HR administrator; everyone
  // else must be added (by email) on the Access page first.
  if (Number(existing.value) === 0 && normalizedEmail) {
    const first: typeof users.$inferInsert = {
      id: crypto.randomUUID(),
      authUserId: identity.userId,
      email: normalizedEmail,
      displayName: identity.fullName || identity.displayName || normalizedEmail,
      role: "hr_admin",
    };
    try {
      await db.insert(users).values(first);
      const [created] = await db.select().from(users).where(eq(users.authUserId, identity.userId)).limit(1);
      await audit(created, "workspace_initialized", "user", created.id);
      return { member: created };
    } catch {
      const [created] = await db.select().from(users).where(eq(users.authUserId, identity.userId)).limit(1);
      if (created) return { member: created };
    }
  }
  return { error: "This account has not been invited to the ForenSys Review Hub. Ask an HR administrator to add your work email.", status: 403 };
}

async function requireMember() {
  const identity = await getSignedInUser();
  if (!identity) return { error: "Sign in to continue.", status: 401 as const };
  const result = await resolveMember(identity);
  if (!result.member) return { error: result.error, status: result.status };
  return { member: result.member };
}

async function ensureActiveCycle(member: Member) {
  const db = getDb();
  const [active] = await db.select().from(cycles).where(eq(cycles.status, "active")).orderBy(desc(cycles.year)).limit(1);
  if (active) return active;
  const year = new Date().getUTCFullYear();
  const [existing] = await db.select().from(cycles).where(eq(cycles.year, year)).limit(1);
  if (existing) {
    await db.update(cycles).set({ status: "active" }).where(eq(cycles.id, existing.id));
    return { ...existing, status: "active" as const };
  }
  const cycle = { id: crypto.randomUUID(), year, name: `Annual review · ${year}`, status: "active" as const, createdBy: member.authUserId ?? member.id };
  await db.insert(cycles).values(cycle);
  return cycle;
}

async function visibleEmployeeIds(member: Member) {
  const db = getDb();
  if (member.role === "hr_admin") return (await db.select({ id: employees.id }).from(employees)).map((x) => x.id);
  if (!member.employeeId) return [];
  const directReports = member.role === "manager"
    ? await db.select({ id: employees.id }).from(employees).where(eq(employees.managerId, member.employeeId))
    : [];
  return [...new Set([member.employeeId, ...directReports.map((x) => x.id)])];
}

async function readWorkspace(member: Member) {
  const db = getDb();
  const cycle = await ensureActiveCycle(member);
  const ids = await visibleEmployeeIds(member);
  const visiblePeople = ids.length
    ? await db.select().from(employees).where(inArray(employees.id, ids)).orderBy(employees.fullName)
    : [];
  const visibleReviews = ids.length
    ? await db.select().from(reviews).where(inArray(reviews.employeeId, ids)).orderBy(desc(reviews.scheduledDate), desc(reviews.updatedAt))
    : [];
  const visibleGoals = ids.length
    ? await db.select().from(goals).where(and(eq(goals.cycleId, cycle.id), inArray(goals.employeeId, ids))).orderBy(desc(goals.updatedAt))
    : [];
  const people = member.role === "hr_admin"
    ? await db.select().from(users).orderBy(users.email)
    : [];
  const audit = member.role === "hr_admin"
    ? await db.select({ id: auditLogs.id, actorEmail: auditLogs.actorEmail, action: auditLogs.action, entity: auditLogs.entity, createdAt: auditLogs.createdAt }).from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(30)
    : [];
  const templateRows = await ensureTemplates();
  const isSelf = (id: string) => member.employeeId === id && member.role !== "hr_admin";
  return {
    member: { id: member.id, email: member.email, displayName: member.displayName, role: member.role, employeeId: member.employeeId },
    cycle,
    cycles: await db.select({ id: cycles.id, year: cycles.year, name: cycles.name, status: cycles.status }).from(cycles).orderBy(desc(cycles.year)),
    employees: visiblePeople,
    reviews: visibleReviews.map((r) => {
      const selfHidden = isSelf(r.employeeId) && r.status !== "completed";
      return {
        ...(selfHidden ? { ...r, managerFeedback: "", sharedSummary: "", rating: null, formData: "", templateId: null } : r),
        formData: r.formData && !selfHidden ? safeJson(r.formData) : null,
      };
    }),
    templates: templateRows.map((row) => ({
      id: row.id,
      name: row.name,
      department: row.department,
      isActive: row.isActive,
      scoreBands: safeJson(row.scoreBands) ?? [],
      sections: safeJson(row.sections) ?? [],
    })),
    goals: visibleGoals,
    monthlyStats: ids.length ? await db.select({ id: monthlyStats.id, employeeId: monthlyStats.employeeId, month: monthlyStats.month, pulseScore: monthlyStats.pulseScore, incidents: monthlyStats.incidents, dispatchSeconds: monthlyStats.dispatchSeconds, waitingSeconds: monthlyStats.waitingSeconds }).from(monthlyStats).where(inArray(monthlyStats.employeeId, ids)).orderBy(monthlyStats.month) : [],
    users: people.map(({ id, email: address, displayName, role, employeeId, isActive, authUserId }) => ({ id, email: address, displayName, role, employeeId, isActive, linked: Boolean(authUserId) })),
    audit,
  };
}

function isRole(member: Member, roles: Role[]) {
  return roles.includes(member.role as Role);
}

async function canManageEmployee(member: Member, employeeId: string) {
  if (member.role === "hr_admin") return true;
  if (member.role !== "manager" || !member.employeeId) return false;
  const [person] = await getDb().select({ id: employees.id }).from(employees).where(and(eq(employees.id, employeeId), eq(employees.managerId, member.employeeId))).limit(1);
  return Boolean(person);
}

async function wouldCreateManagerCycle(employeeId: string, managerId: string | null) {
  const db = getDb();
  let cursor = managerId;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor)) {
    if (cursor === employeeId) return true;
    visited.add(cursor);
    const [person] = await db.select({ managerId: employees.managerId }).from(employees).where(eq(employees.id, cursor)).limit(1);
    cursor = person?.managerId ?? null;
  }
  return false;
}

export async function GET() {
  try {
    const access = await requireMember();
    if (!access.member) return json({ error: access.error }, access.status);
    return json(await readWorkspace(access.member));
  } catch (error) {
    console.error("workspace_read_failed");
    return json({ error: "The workspace could not be loaded. Please refresh and try again." }, 500);
  }
}

export async function POST(request: Request) {
  const access = await requireMember();
  if (!access.member) return json({ error: access.error }, access.status);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-site requests are not allowed." }, 403);
  const member = access.member;
  const db = getDb();
  let body: { action?: string; payload?: Record<string, unknown> };
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 100_000) return json({ error: "Request is too large." }, 413);
    body = await request.json();
  } catch {
    return json({ error: "The request could not be read." }, 400);
  }
  const p = body.payload ?? {};
  const now = new Date().toISOString();

  try {
    switch (body.action) {
      case "create_employee": {
        if (!isRole(member, ["hr_admin"])) return json({ error: "Only HR administrators can add employees." }, 403);
        const fullName = text(p.fullName, 160), address = p.email ? email(p.email) : "";
        const jobTitle = text(p.jobTitle, 120), department = text(p.department, 120);
        const managerId = text(p.managerId, 64) || null;
        if (!fullName || !jobTitle || !department) return json({ error: "Name, job title, and department are required." }, 400);
        if (p.email && !address) return json({ error: "Enter a valid work email." }, 400);
        if (managerId === text(p.id, 64)) return json({ error: "An employee cannot report to themselves." }, 400);
        if (managerId) {
          const [manager] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, managerId), eq(employees.isActive, true))).limit(1);
          if (!manager) return json({ error: "Choose an active manager." }, 400);
        }
        const inviteRole = p.inviteRole === "manager" ? "manager" : p.inviteRole === "employee" ? "employee" : null;
        if (address && inviteRole) {
          const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, address)).limit(1);
          if (existingUser) return json({ error: "That email already has an account. Manage it from the Access page or use a different email." }, 409);
        }
        const id = crypto.randomUUID();
        await db.insert(employees).values({ id, fullName, email: address, jobTitle, department, managerId, createdAt: now, updatedAt: now });
        if (address && inviteRole) {
          await db.insert(users).values({ id: crypto.randomUUID(), email: address, displayName: fullName, role: inviteRole, employeeId: id, invitedBy: member.authUserId ?? member.id, createdAt: now, updatedAt: now });
        }
        await audit(member, "employee_created", "employee", id);
        return json({ ok: true, id }, 201);
      }
      case "update_employee": {
        if (!isRole(member, ["hr_admin"])) return json({ error: "Only HR administrators can edit employee records." }, 403);
        const id = text(p.id, 64), fullName = text(p.fullName, 160), address = p.email ? email(p.email) : "";
        if (!id || !fullName) return json({ error: "Employee and name are required." }, 400);
        if (p.email && !address) return json({ error: "Enter a valid work email." }, 400);
        const [person] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
        if (!person) return json({ error: "Employee not found." }, 404);
        const managerId = text(p.managerId, 64) || null;
        if (managerId === id) return json({ error: "An employee cannot report to themselves." }, 400);
        if (managerId) {
          const [manager] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, managerId), eq(employees.isActive, true))).limit(1);
          if (!manager) return json({ error: "Choose an active manager." }, 400);
        }
        if (await wouldCreateManagerCycle(id, managerId)) return json({ error: "This reporting change would create a manager loop." }, 400);
        const isActive = p.isActive !== false;
        await db.update(employees).set({ fullName, email: address, jobTitle: text(p.jobTitle, 120), department: text(p.department, 120), managerId, isActive, updatedAt: now }).where(eq(employees.id, id));
        if (!isActive) await db.update(users).set({ isActive: false, updatedAt: now }).where(eq(users.employeeId, id));
        await audit(member, "employee_updated", "employee", id);
        return json({ ok: true });
      }
      case "set_access": {
        if (!isRole(member, ["hr_admin"])) return json({ error: "Only HR administrators can manage access." }, 403);
        const address = email(p.email), role = text(p.role, 20) as Role, employeeId = text(p.employeeId, 64) || null;
        if (!address || !["hr_admin", "manager", "employee"].includes(role)) return json({ error: "Enter a valid email and role." }, 400);
        if (role !== "hr_admin" && !employeeId) return json({ error: "Link this account to an employee profile." }, 400);
        const [targetEmployee] = employeeId ? await db.select({ id: employees.id, fullName: employees.fullName }).from(employees).where(eq(employees.id, employeeId)).limit(1) : [];
        if (employeeId && !targetEmployee) return json({ error: "Employee profile not found." }, 404);
        const [existing] = await db.select().from(users).where(eq(users.email, address)).limit(1);
        if (existing) {
          await db.update(users).set({ role, employeeId, displayName: targetEmployee?.fullName || text(p.displayName, 160) || address, isActive: true, invitedBy: member.authUserId ?? member.id, updatedAt: now }).where(eq(users.id, existing.id));
          await audit(member, "access_updated", "user", existing.id);
          return json({ ok: true, invitation: !existing.authUserId });
        }
        const id = crypto.randomUUID();
        await db.insert(users).values({ id, email: address, displayName: targetEmployee?.fullName || text(p.displayName, 160) || address, role, employeeId, invitedBy: member.authUserId ?? member.id, createdAt: now, updatedAt: now });
        await audit(member, "access_invited", "user", id);
        return json({ ok: true, invitation: true }, 201);
      }
      case "deactivate_access": {
        if (!isRole(member, ["hr_admin"])) return json({ error: "Only HR administrators can manage access." }, 403);
        const id = text(p.id, 64);
        const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
        if (!target) return json({ error: "Account not found." }, 404);
        if (target.authUserId === member.authUserId) return json({ error: "You cannot deactivate your own account." }, 400);
        await db.update(users).set({ isActive: false, updatedAt: now }).where(eq(users.id, id));
        await audit(member, "access_deactivated", "user", id);
        return json({ ok: true });
      }
      case "save_review": {
        const id = text(p.id, 64), employeeId = text(p.employeeId, 64), cycleId = text(p.cycleId, 64);
        const stage = text(p.stage, 20) as Stage, status = text(p.status, 20);
        if (!employeeId || !cycleId || !Object.hasOwn(stageOrder, stage) || !["draft", "scheduled", "in_progress", "completed"].includes(status)) return json({ error: "Review details are incomplete." }, 400);
        const [person] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
        if (!person) return json({ error: "Employee not found." }, 404);
        const [cycle] = await db.select({ id: cycles.id, status: cycles.status }).from(cycles).where(eq(cycles.id, cycleId)).limit(1);
        if (!cycle || (cycle.status !== "active" && member.role !== "hr_admin")) return json({ error: "Choose the active review cycle." }, 409);
        const isSelf = member.role !== "hr_admin" && member.employeeId === employeeId;
        const mayManage = await canManageEmployee(member, employeeId);
        if (!isSelf && !mayManage) return json({ error: "You do not have access to this employee’s review." }, 403);
        const [existing] = await db.select().from(reviews).where(and(eq(reviews.employeeId, employeeId), eq(reviews.cycleId, cycleId), eq(reviews.stage, stage))).limit(1);
        if (isSelf) {
          if (!existing || existing.status === "completed") return json({ error: "Self-reflection is closed for this conversation." }, 403);
          await db.update(reviews).set({ employeeReflection: text(p.employeeReflection, 6000), updatedBy: member.authUserId ?? member.id, updatedAt: now }).where(eq(reviews.id, existing.id));
          await audit(member, "self_reflection_saved", "review", existing.id);
          return json({ ok: true, id: existing.id });
        }
        if (!mayManage) return json({ error: "You cannot manage this review." }, 403);
        // April and October evaluations are independent: a new hire may only
        // qualify for October (minimum 3 months for April, 9 months for October).
        const rating = p.rating === "" || p.rating == null ? null : Number(p.rating);
        if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return json({ error: "Rating must be from 1 to 5." }, 400);
        let templateId: string | null = null;
        let formDataJson = "";
        if (stage !== "planning") {
          templateId = text(p.templateId, 64) || null;
          if (templateId) {
            const [tpl] = await db.select({ id: evaluationTemplates.id }).from(evaluationTemplates).where(eq(evaluationTemplates.id, templateId)).limit(1);
            if (!tpl) return json({ error: "Evaluation form template not found." }, 404);
          }
          if (p.formData != null) formDataJson = JSON.stringify(cleanFormData(p.formData)).slice(0, 60000);
        }
        const values = {
          status: status as "draft" | "scheduled" | "in_progress" | "completed",
          scheduledDate: text(p.scheduledDate, 10) || null,
          managerFeedback: text(p.managerFeedback, 6000),
          sharedSummary: text(p.sharedSummary, 4000),
          rating,
          updatedBy: member.authUserId ?? member.id,
          updatedAt: now,
          completedAt: status === "completed" ? existing?.completedAt ?? now : null,
          ...(stage !== "planning" ? { templateId } : {}),
          ...(stage !== "planning" && p.formData != null ? { formData: formDataJson } : {}),
        };
        if (existing) {
          await db.update(reviews).set(values).where(eq(reviews.id, existing.id));
          await audit(member, status === "completed" ? "review_completed" : "review_updated", "review", existing.id);
          return json({ ok: true, id: existing.id });
        }
        const reviewId = crypto.randomUUID();
        await db.insert(reviews).values({ id: reviewId, employeeId, cycleId, stage, ...values, createdBy: member.authUserId ?? member.id });
        await audit(member, "review_created", "review", reviewId);
        return json({ ok: true, id: reviewId }, 201);
      }
      case "delete_review": {
        if (member.role !== "hr_admin") return json({ error: "Only HR administrators can delete evaluations." }, 403);
        const id = text(p.id, 64);
        const [review] = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.id, id)).limit(1);
        if (!review) return json({ error: "Evaluation not found." }, 404);
        await db.delete(reviews).where(eq(reviews.id, id));
        await audit(member, "review_deleted", "review", id);
        return json({ ok: true });
      }
      case "acknowledge_review": {
        if (member.role !== "employee" || !member.employeeId) return json({ error: "Only the employee can acknowledge their review." }, 403);
        const id = text(p.id, 64);
        const [review] = await db.select().from(reviews).where(eq(reviews.id, id)).limit(1);
        if (!review || review.employeeId !== member.employeeId || review.stage === "planning" || review.status !== "completed") return json({ error: "This evaluation is not available for acknowledgment." }, 403);
        await db.update(reviews).set({ employeeAcknowledged: true, updatedAt: now }).where(eq(reviews.id, id));
        await audit(member, "evaluation_acknowledged", "review", id);
        return json({ ok: true });
      }
      case "save_template": {
        if (!isRole(member, ["hr_admin"])) return json({ error: "Only HR administrators can edit evaluation forms." }, 403);
        const id = text(p.id, 64), name = text(p.name, 120), department = text(p.department, 120);
        if (!name) return json({ error: "Form name is required." }, 400);
        const bands = cleanBands(p.scoreBands), sections = cleanSections(p.sections);
        if (!bands.length) return json({ error: "Add at least one pulse score band." }, 400);
        if (!sections.length) return json({ error: "Add at least one section with criteria." }, 400);
        const isActive = p.isActive !== false;
        if (id) {
          const [existing] = await db.select({ id: evaluationTemplates.id }).from(evaluationTemplates).where(eq(evaluationTemplates.id, id)).limit(1);
          if (!existing) return json({ error: "Evaluation form not found." }, 404);
          await db.update(evaluationTemplates).set({ name, department, scoreBands: JSON.stringify(bands), sections: JSON.stringify(sections), isActive, updatedAt: now }).where(eq(evaluationTemplates.id, id));
          await audit(member, "evaluation_template_updated", "evaluation_template", id);
          return json({ ok: true, id });
        }
        const newId = crypto.randomUUID();
        await db.insert(evaluationTemplates).values({ id: newId, name, department, scoreBands: JSON.stringify(bands), sections: JSON.stringify(sections), isActive, createdBy: member.authUserId ?? member.id, updatedAt: now });
        await audit(member, "evaluation_template_created", "evaluation_template", newId);
        return json({ ok: true, id: newId }, 201);
      }
      case "save_goal": {
        const id = text(p.id, 64), employeeId = text(p.employeeId, 64), cycleId = text(p.cycleId, 64);
        if (!employeeId) return json({ error: "Choose an employee." }, 400);
        const mayManage = await canManageEmployee(member, employeeId);
        if (!mayManage && !(member.role !== "hr_admin" && member.employeeId === employeeId && id)) return json({ error: "You do not have access to this goal." }, 403);
        const [cycle] = cycleId ? await db.select({ id: cycles.id, status: cycles.status }).from(cycles).where(eq(cycles.id, cycleId)).limit(1) : [];
        if (!cycle || cycle.status !== "active") return json({ error: "Choose the active review cycle." }, 409);
        const [existing] = id ? await db.select().from(goals).where(eq(goals.id, id)).limit(1) : [];
        if (existing && existing.employeeId !== employeeId) return json({ error: "Goal not found." }, 404);
        if (member.role !== "hr_admin" && !mayManage && existing) {
          const nextStatus = text(p.status, 20);
          if (!["not_started", "in_progress", "blocked", "completed"].includes(nextStatus)) return json({ error: "Choose a valid goal status." }, 400);
          await db.update(goals).set({ status: nextStatus as "not_started" | "in_progress" | "blocked" | "completed", updatedAt: now }).where(eq(goals.id, existing.id));
          await audit(member, "goal_progress_updated", "goal", existing.id);
          return json({ ok: true, id: existing.id });
        }
        if (!mayManage) return json({ error: "Only a manager or HR can edit goal details." }, 403);
        const title = text(p.title, 160);
        if (!title || !cycleId) return json({ error: "Goal title and review cycle are required." }, 400);
        const values = { title, description: text(p.description, 2000), successMeasure: text(p.successMeasure, 1000), dueDate: text(p.dueDate, 10) || null, updatedAt: now };
        if (existing) {
          await db.update(goals).set(values).where(eq(goals.id, existing.id));
          await audit(member, "goal_updated", "goal", existing.id);
          return json({ ok: true, id: existing.id });
        }
        const goalId = crypto.randomUUID();
        await db.insert(goals).values({ id: goalId, employeeId, cycleId, ...values, createdBy: member.authUserId ?? member.id });
        await audit(member, "goal_created", "goal", goalId);
        return json({ ok: true, id: goalId }, 201);
      }
      case "set_cycle": {
        if (member.role !== "hr_admin") return json({ error: "Only HR administrators can manage review cycles." }, 403);
        const year = Number(p.year), name = text(p.name, 120) || `Annual review · ${year}`;
        if (!Number.isInteger(year) || year < 2000 || year > 2100) return json({ error: "Enter a valid review year." }, 400);
        const [existing] = await db.select().from(cycles).where(eq(cycles.year, year)).limit(1);
        if (existing) {
          await db.update(cycles).set({ name, status: "active" }).where(eq(cycles.id, existing.id));
          await db.update(cycles).set({ status: "closed" }).where(and(eq(cycles.status, "active"), ne(cycles.year, year)));
          await audit(member, "review_cycle_activated", "cycle", existing.id);
          return json({ ok: true, id: existing.id });
        }
        const id = crypto.randomUUID();
        await db.update(cycles).set({ status: "closed" }).where(eq(cycles.status, "active"));
        await db.insert(cycles).values({ id, year, name, status: "active", createdBy: member.authUserId ?? member.id });
        await audit(member, "review_cycle_created", "cycle", id);
        return json({ ok: true, id }, 201);
      }
      case "load_demo_data": {
        if (member.role !== "hr_admin") return json({ error: "Only HR administrators can load demo records." }, 403);
        const [countRow] = await db.select({ value: count() }).from(employees);
        if (countRow.value > 0) return json({ error: "Demo data can be loaded only into an empty team. Remove demo records first." }, 409);
        const cycle = await ensureActiveCycle(member);
        const templateRows = await ensureTemplates();
        const sample = [
          { fullName: "Aylene Isberta", email: "aylene.isberta@example.test", jobTitle: "Dispatcher", department: "Dispatcher", hired: "2022-03-01", base: 84, trend: [2, 1, 3, -1, 2, 1] },
          { fullName: "Joyceline Zimmerman", email: "joyceline.zimmerman@example.test", jobTitle: "Dispatcher", department: "Dispatcher", hired: "2024-04-01", base: 74, trend: [3, 2, 1, 2, 1, 2] },
          { fullName: "Luodette Leito", email: "luodette.leito@example.test", jobTitle: "Field Agent", department: "Agent", hired: "2021-09-15", base: 90, trend: [1, 2, 1, 2, -1, 2] },
          { fullName: "Stephany Gonzalez", email: "stephany.gonzalez@example.test", jobTitle: "Field Agent", department: "Agent", hired: "2023-01-09", base: 68, trend: [-2, 4, 3, -3, 5, 2] },
          { fullName: "Carlos Soriano", email: "carlos.soriano@example.test", jobTitle: "Senior Field Agent", department: "Agent", hired: "2020-06-01", base: 82, trend: [2, -1, 3, 2, 1, -2] },
        ];
        const ids = sample.map(() => crypto.randomUUID());
        for (let i = 0; i < sample.length; i++) {
          const { fullName, email: address, jobTitle, department } = sample[i];
          await db.insert(employees).values({ id: ids[i], fullName, email: address, jobTitle, department, isDemo: true });
        }
        // Earlier years so the employee dashboards show history.
        const yearCycles: Array<{ id: string; year: number }> = [];
        for (const year of [cycle.year - 2, cycle.year - 1]) {
          const [found] = await db.select({ id: cycles.id }).from(cycles).where(eq(cycles.year, year)).limit(1);
          const id = found?.id ?? crypto.randomUUID();
          if (!found) await db.insert(cycles).values({ id, year, name: `Annual review · ${year}`, status: "closed", createdBy: member.authUserId ?? member.id });
          yearCycles.push({ id, year });
        }
        yearCycles.push({ id: cycle.id, year: cycle.year });
        const rounds: Array<{ cycleId: string; year: number; stage: Stage; month: string }> = [];
        for (const yc of yearCycles) { rounds.push({ cycleId: yc.id, year: yc.year, stage: "check_in", month: "04" }); rounds.push({ cycleId: yc.id, year: yc.year, stage: "evaluation", month: "10" }); }
        const supportNotes = ["Refresher training on procedures.", "Coaching on communication with the team.", "Continue current approach; no extra support needed.", "Extra observation shifts with the supervisor."];
        const feedbackNotes = ["Satisfied with the support from the supervisor.", "Would like more refresher trainings.", "Happy with the team and the schedule.", "Asks for clearer procedures for busy shifts."];
        let seed = 11;
        const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        for (let i = 0; i < sample.length; i++) {
          const person = sample[i];
          const tplRow = templateRows.find((row) => row.department.toLowerCase() === person.department.toLowerCase()) ?? templateRows[0];
          const sections = (safeJson(tplRow.sections) ?? []) as Array<{ key: string; items: Array<{ key: string }> }>;
          const bands = ((safeJson(tplRow.scoreBands) ?? []) as Array<{ min: number; rating: number }>).sort((a, b) => a.min - b.min);
          let score = person.base;
          // Current year's October round is left open for 2 people so "Not yet evaluated" has entries.
          const personRounds = rounds.filter((round) => new Date(`${round.year}-${round.month}-15`) >= new Date(`${person.hired}T00:00:00`)).filter((round) => !(round.year === cycle.year && round.stage === "evaluation" && i >= 3));
          for (let r = 0; r < personRounds.length; r++) {
            const round = personRounds[r];
            score = Math.max(45, Math.min(99, score + (person.trend[r % person.trend.length] ?? 0)));
            const rating = bands.filter((band) => score >= band.min).pop()?.rating ?? null;
            const items: Record<string, { rating: string; note: string }> = {};
            for (const section of sections) for (const item of section.items) {
              const roll = rand();
              const value = score >= 90 ? (roll < 0.55 ? "exceptional" : "good") : score >= 80 ? (roll < 0.25 ? "exceptional" : roll < 0.93 ? "good" : "needs_improvement") : (roll < 0.1 ? "exceptional" : roll < 0.75 ? "good" : "needs_improvement");
              items[`${section.key}/${item.key}`] = { rating: value, note: "" };
            }
            const date = `${round.year}-${round.month}-${String(10 + i).padStart(2, "0")}`;
            const formData = { templateId: tplRow.id, templateName: tplRow.name, employmentDate: person.hired, period: `${round.stage === "check_in" ? "April" : "October"} ${round.year}`, evaluationDate: date, supervisor: "Carmela Vlaun — Supervisor", pulseScore: score, items, supervisorSupport: supportNotes[(i + r) % supportNotes.length], employeeFeedback: feedbackNotes[(i + r * 2) % feedbackNotes.length] };
            await db.insert(reviews).values({ id: crypto.randomUUID(), employeeId: ids[i], cycleId: round.cycleId, stage: round.stage, status: "completed", scheduledDate: date, templateId: tplRow.id, formData: JSON.stringify(formData), rating, employeeAcknowledged: r < personRounds.length - 1, isDemo: true, createdBy: member.authUserId ?? member.id, updatedBy: member.authUserId ?? member.id, completedAt: date });
          }
        }
        await audit(member, "demo_workspace_loaded", "workspace");
        return json({ ok: true });
      }
      case "clear_demo_data": {
        if (member.role !== "hr_admin") return json({ error: "Only HR administrators can remove demo records." }, 403);
        const demoEmployees = await db.select({ id: employees.id }).from(employees).where(eq(employees.isDemo, true));
        const demoIds = demoEmployees.map((x) => x.id);
        if (demoIds.length) {
          await db.delete(reviews).where(inArray(reviews.employeeId, demoIds));
          await db.delete(goals).where(inArray(goals.employeeId, demoIds));
          await db.delete(employees).where(inArray(employees.id, demoIds));
        }
        await audit(member, "demo_workspace_cleared", "workspace");
        return json({ ok: true });
      }
      default:
        return json({ error: "Unknown workspace action." }, 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("workspace_action_failed", body.action ?? "unknown");
    if (message.includes("UNIQUE constraint failed")) return json({ error: "A record with those details already exists." }, 409);
    if (message.includes("no such table")) return json({ error: "The workspace database is not ready. Deploy the latest database setup and try again." }, 503);
    return json({ error: "The change could not be saved. Please review the information and try again." }, 500);
  }
}
