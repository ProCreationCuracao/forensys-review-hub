"use client";

import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Bell, CalendarDays, Check,
  CheckCircle2, ChevronDown, CircleHelp, ClipboardList, FileText, Filter, Goal,
  LayoutDashboard, LogOut, Menu, MoreHorizontal, Plus, Search, Settings, ShieldCheck,
  Users, X, Clock3, Pencil, UserRound, BarChart3, LockKeyhole, Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { metricDefsFor, type MetricDef, computeOverallScore, EMPTY_FORM_DATA, EMPTY_METRICS, METRIC_LEVELS, RATING_TONE, bandForScore, isDispatcherTemplate, parseMinutes, scoreDispatchMetrics, type DispatchMetrics } from "../lib/evaluation-forms";
import type { EvalFormData, EvalTemplate, FormSection, ItemAnswer, ItemRating, ScoreBand } from "../lib/evaluation-forms";

type Role = "hr_admin" | "manager" | "employee";
type Stage = "planning" | "check_in" | "evaluation";
type Employee = { id: string; fullName: string; email: string; jobTitle: string; department: string; managerId: string | null; isActive: boolean; isDemo: boolean };
type Review = { id: string; employeeId: string; cycleId: string; stage: Stage; status: "draft" | "scheduled" | "in_progress" | "completed"; scheduledDate: string | null; templateId: string | null; formData: EvalFormData | null; employeeReflection: string; managerFeedback: string; sharedSummary: string; rating: number | null; employeeAcknowledged: boolean; isDemo: boolean };
type Goal = { id: string; employeeId: string; cycleId: string; title: string; description: string; successMeasure: string; dueDate: string | null; status: "not_started" | "in_progress" | "blocked" | "completed"; isDemo: boolean };
type Member = { id: string; email: string; displayName: string; role: Role; employeeId: string | null; isActive: boolean; linked: boolean };
type Cycle = { id: string; year: number; name: string; status: "active" | "closed" };
type MonthlyStat = { id: string; employeeId: string; month: string; pulseScore: number | null; incidents: number | null; dispatchSeconds: number | null; waitingSeconds: number | null };
type AuditEntry = { id: string; actorEmail: string; action: string; entity: string; createdAt: string };
type Workspace = { member: { id: string; email: string; displayName: string; role: Role; employeeId: string | null }; cycle: Cycle; cycles?: Cycle[]; monthlyStats?: MonthlyStat[]; employees: Employee[]; reviews: Review[]; templates: EvalTemplate[]; goals: Goal[]; users: Member[]; audit: AuditEntry[] };
type ModalKind = "employee" | "review" | "goal" | "access" | "profile" | "cycle" | "template" | null;

const stageLabel: Record<Stage, string> = { planning: "Goal-setting talk (optional)", check_in: "April evaluation", evaluation: "October evaluation" };
const stageShort: Record<Stage, string> = { planning: "Goals", check_in: "April", evaluation: "October" };
// ForenSys evaluates twice a year: April (min. 3 months employed) and October (min. 9 months).
const stageOrder: Stage[] = ["check_in", "evaluation"];
const currentStage: Stage = new Date().getMonth() >= 6 ? "evaluation" : "check_in";
const isFormStage = (stage: Stage) => stage !== "planning";
const stagePrompts: Record<Stage, { reflection: string; manager: string }> = {
  planning: { reflection: "What do you want to accomplish this cycle? What skills or support would help?", manager: "Capture role expectations, strengths to build on, and support agreed for the cycle." },
  check_in: { reflection: "What progress are you proud of? What is getting in the way or needs to change?", manager: "Record specific progress, barriers, feedback, and any adjustments to goals or support." },
  evaluation: { reflection: "Which goals did you achieve? What did you learn, and what should come next?", manager: "Summarize outcomes with examples, recognize contributions, and identify practical development steps." },
};
const statusLabel: Record<string, string> = { draft: "Draft", scheduled: "Scheduled", in_progress: "In progress", completed: "Completed", not_started: "Not started", blocked: "Needs support" };
const statusClass: Record<string, string> = { draft: "neutral", scheduled: "red-soft", in_progress: "amber", completed: "green", not_started: "neutral", blocked: "rose" };

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function dateLabel(value?: string | null) { if (!value) return "Not scheduled"; const d = new Date(`${value.slice(0, 10)}T12:00:00`); return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(d); }
function dateInput(value?: string | null) { return value?.slice(0, 10) || ""; }
function csv(value: unknown) { const s = String(value ?? ""); return `"${s.replaceAll('"', '""')}"`; }

export default function WorkspaceClient({ signedInName, signOutHref }: { signedInName: string; signOutHref: string }) {
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState("");
  const [page, setPage] = useState("overview");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [modal, setModal] = useState<ModalKind>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<EvalTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const body = await response.json() as Workspace | { error?: string };
      if (!response.ok) { setFatal("error" in body ? body.error || "You do not have access to this workspace." : "You do not have access to this workspace."); setData(null); }
      else { setData(body as Workspace); setFatal(""); }
    } catch { setFatal("Could not connect to the workspace. Please refresh the page."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3000); return () => clearTimeout(timer); }, [toast]);

  const role = data?.member.role;
  const isAdmin = role === "hr_admin";
  const isManager = role === "manager";
  const isEmployee = role === "employee";
  const employees = data?.employees ?? [];
  const allReviews = data?.reviews ?? [];
  const reviews = allReviews.filter((review) => review.cycleId === data?.cycle.id);
  const cycles = data?.cycles?.length ? data.cycles : data ? [data.cycle] : [];
  const [viewEmployeeId, setViewEmployeeId] = useState<string | null>(null);
  const goals = data?.goals ?? [];
  const cycle = data?.cycle;
  const activeEmployees = employees.filter((employee) => employee.isActive);
  const visibleEmployees = employees.filter((employee) => (includeInactive || employee.isActive) && `${employee.fullName} ${employee.department} ${employee.jobTitle} ${employee.email}`.toLowerCase().includes(search.toLowerCase()) && (departmentFilter === "all" || employee.department === departmentFilter));
  const selectedEmployeeReviews = selectedEmployee ? reviews.filter((review) => review.employeeId === selectedEmployee.id) : [];
  const upcoming = reviews.filter((review) => review.status === "scheduled" && review.scheduledDate).sort((a, b) => (a.scheduledDate || "").localeCompare(b.scheduledDate || "")).slice(0, 5);
  const incompleteCount = activeEmployees.filter((employee) => stageOrder.some((stage) => !reviews.some((review) => review.employeeId === employee.id && review.stage === stage && review.status === "completed"))).length;
  const completeCount = activeEmployees.filter((employee) => stageOrder.every((stage) => reviews.some((review) => review.employeeId === employee.id && review.stage === stage && review.status === "completed"))).length;
  const departments = useMemo(() => [...new Set(employees.map((employee) => employee.department).filter(Boolean))].sort(), [employees]);

  async function action(name: string, payload: Record<string, unknown> = {}, success?: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, payload }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) { setToast(body.error || "Could not save the change."); return false; }
      await refresh();
      setModal(null); setToast(success || "Saved.");
      return true;
    } catch { setToast("Could not connect. Please try again."); return false; }
    finally { setBusy(false); }
  }

  function openReview(review?: Review | null, employee?: Employee | null, stage?: Stage) {
    setSelectedReview(review ?? null); setSelectedEmployee(employee ?? employees.find((person) => person.id === review?.employeeId) ?? null);
    if (stage) setSelectedReview({ id: "", employeeId: employee?.id || "", cycleId: cycle?.id || "", stage, status: "draft", scheduledDate: null, templateId: null, formData: null, employeeReflection: "", managerFeedback: "", sharedSummary: "", rating: null, employeeAcknowledged: false, isDemo: false });
    setModal("review");
  }

  function openEmployee(person?: Employee) { setSelectedEmployee(person ?? null); setModal("employee"); }
  function openGoal(goal?: Goal) { setSelectedGoal(goal ?? null); setModal("goal"); }
  function openTemplate(template?: EvalTemplate | null) { setSelectedTemplate(template ?? null); setModal("template"); }
  function openProfile(person: Employee) { setPage("team"); setViewEmployeeId(person.id); }

  function exportReviews() {
    if (!data) return;
    const rows = [["Employee", "Department", "Stage", "Status", "Meeting date", "Rating", "Acknowledged"], ...reviews.map((review) => {
      const person = employees.find((employee) => employee.id === review.employeeId);
      return [person?.fullName, person?.department, stageLabel[review.stage], statusLabel[review.status], review.scheduledDate, review.rating ?? "", review.employeeAcknowledged ? "Yes" : "No"];
    })];
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([rows.map((row) => row.map(csv).join(",")).join("\n")], { type: "text/csv;charset=utf-8" })); link.download = `forensys-review-summary-${cycle?.year || "cycle"}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  if (loading && !data && !fatal) return <div className="loading-screen"><div className="spinner" /><span>Opening your workspace…</span></div>;
  if (fatal) return <main className="access-page"><div className="access-card"><img src="/forensys-logo.png" alt="ForenSys" /><div className="eyebrow">Review Hub access</div><h1>{fatal.includes("not been invited") ? "Your account is not set up yet" : "We could not open the workspace"}</h1><p>{fatal}</p><button className="button secondary" onClick={() => void refresh()}>Try again</button><div className="access-help"><LockKeyhole size={16} /> Access is managed by ForenSys HR.</div></div></main>;
  if (!data) return null;

  const navItems = [
    { id: "overview", label: "Dashboard", icon: LayoutDashboard, show: true },
    { id: "team", label: "Employees", icon: Users, show: !isEmployee },
    { id: "reviews", label: "Evaluations", icon: ClipboardList, show: true },
    { id: "forms", label: "Evaluation forms", icon: FileText, show: true },
    { id: "settings", label: "Settings", icon: Settings, show: isAdmin },
    { id: "guide", label: "How it works", icon: CircleHelp, show: true },
  ].filter((item) => item.show);
  const pageTitle = navItems.find((item) => item.id === page)?.label ?? "Overview";
  const activeEmployee = employees.find((employee) => employee.id === data.member.employeeId);
  const viewEmployee = viewEmployeeId ? employees.find((person) => person.id === viewEmployeeId) ?? null : null;
  void activeEmployee;
  const nav = <>
    <div className="brand-panel"><img src="/forensys-logo.png" alt="ForenSys — your eyes on the scene" /><span>REVIEW HUB</span></div>
    <div className="side-caption">WORKSPACE</div>
    <nav className="main-nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? "nav-item active" : "nav-item"} onClick={() => { setPage(id); setViewEmployeeId(null); setMobileNav(false); }}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></button>)}</nav>
    <div className="sidebar-bottom"><div className="cycle-mini"><div className="cycle-mini-top"><span>ACTIVE CYCLE</span><CalendarDays size={15}/></div><strong>{cycle?.name || "Review cycle"}</strong><small>{completeCount} of {activeEmployees.length} employees complete</small><div className="mini-track"><i style={{ width: `${activeEmployees.length ? Math.round(completeCount / activeEmployees.length * 100) : 0}%` }} /></div></div><div className="sidebar-user"><span className="avatar dark-avatar">{initials(data.member.displayName || signedInName)}</span><div className="sidebar-user-copy"><strong>{data.member.displayName || signedInName}</strong><small>{data.member.role === "hr_admin" ? "HR administrator" : data.member.role === "manager" ? "Manager" : "Employee"}</small></div>{data.member.email !== "hr@forensys.local" && <a title="Sign out" href={signOutHref} className="signout"><LogOut size={16}/></a>}</div></div>
  </>;

  return <div className="app-shell">
    <aside className={mobileNav ? "sidebar open" : "sidebar"}>{nav}</aside>
    {mobileNav && <button className="mobile-shade" onClick={() => setMobileNav(false)} aria-label="Close menu"/>}
    <main className="app-main">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Open menu"><Menu size={20}/></button><div className="topbar-title"><span>ForenSys</span><b>/</b><strong>{pageTitle}</strong></div><div className="topbar-actions">{activeEmployees.some((employee) => employee.isDemo) && <span className="demo-chip" title="Sample people are included. Remove them in Settings.">Sample data</span>}<div className="cycle-select-wrap"><CalendarDays size={15}/><span>{cycle?.name}</span></div><button className="round-icon" title={`${upcoming.length} scheduled conversations`} onClick={() => setPage("reviews")}><Bell size={17}/>{upcoming.length > 0 && <i/>}</button><span className="avatar top-avatar">{initials(data.member.displayName || signedInName)}</span></div></header>
      <div className="page-content">
        {page === "overview" && <Overview data={data} employees={activeEmployees} reviews={reviews} goals={goals} upcoming={upcoming} isAdmin={!!isAdmin} isManager={!!isManager} isEmployee={!!isEmployee} onPage={setPage} onReview={openReview} onEmployee={openEmployee} onProfile={openProfile} onToast={setToast} onAction={action} />}
        {page === "team" && !viewEmployee && <EmployeesPage employees={activeEmployees} reviews={allReviews} cycles={cycles} isAdmin={!!isAdmin} onAdd={() => openEmployee()} onOpen={(person) => setViewEmployeeId(person.id)}/>}
        {page === "team" && viewEmployee && <EmployeeDashboard employee={viewEmployee} employees={employees} reviews={allReviews} cycles={cycles} templates={data.templates} monthly={data.monthlyStats ?? []} activeCycleId={data.cycle.id} isAdmin={!!isAdmin} onBack={() => setViewEmployeeId(null)} onEdit={() => openEmployee(viewEmployee)} onNew={() => openReview(null, viewEmployee, currentStage)} onOpenReview={(review) => openReview(review, viewEmployee)}/>}
        {page === "reviews" && <EvaluationsPage employees={employees} reviews={allReviews} cycles={cycles} templates={data.templates} activeCycleId={data.cycle.id} isAdmin={!!isAdmin} onNew={() => openReview(null, null, currentStage)} onOpenReview={(review, person) => openReview(review, person)} onOpenEmployee={(person) => { if (isEmployee) return; setPage("team"); setViewEmployeeId(person.id); }}/>}
        {page === "forms" && <FormsPage templates={data.templates} isAdmin={!!isAdmin} onEdit={openTemplate}/>}
        {page === "guide" && <GuidePage isAdmin={!!isAdmin} onPage={setPage} onEmployee={() => openEmployee()} onReview={openReview}/>}
        {page === "goals" && <GoalsPage data={data} employees={activeEmployees} goals={goals} isEmployee={!!isEmployee} selfEmployeeId={data.member.employeeId} onAdd={() => openGoal()} onEdit={openGoal} onAction={action} />}
        {page === "access" && isAdmin && <AccessPage users={data.users} employees={employees} audit={data.audit} onInvite={() => setModal("access")} onAction={action} />}
        {page === "settings" && isAdmin && <SettingsPage data={data} onCycle={() => setModal("cycle")} onTemplate={openTemplate} onAction={action} onExport={exportReviews} onToast={setToast} />}
      </div>
    </main>
    {modal && <Modal onClose={() => setModal(null)} title={modalTitle(modal, selectedEmployee, selectedReview, selectedGoal, selectedTemplate)} wide={(modal === "review" && (!selectedReview || isFormStage(selectedReview.stage))) || modal === "template"}>
      {modal === "employee" && <EmployeeForm employee={selectedEmployee} employees={employees} busy={busy} onCancel={() => setModal(null)} onSave={(payload) => action(selectedEmployee ? "update_employee" : "create_employee", payload, selectedEmployee ? "Employee updated." : "Employee added.")} />}
      {modal === "review" && selectedReview && <ReviewForm review={selectedReview} employee={selectedEmployee} employees={employees} cycle={cycle!} templates={data.templates} isEmployee={!!isEmployee || (!!selectedReview.id && selectedReview.employeeId === data.member.employeeId && !isAdmin)} busy={busy} onCancel={() => setModal(null)} canDelete={!!isAdmin} onDelete={async () => { if (selectedReview?.id && await action("delete_review", { id: selectedReview.id }, "Evaluation deleted.")) setModal(null); }} onSave={(payload) => action("save_review", payload, payload.id ? "Evaluation saved." : "Evaluation submitted.")} />}
      {modal === "goal" && <GoalForm goal={selectedGoal} employees={employees} cycle={cycle!} isEmployee={!!isEmployee || (!!selectedGoal && selectedGoal.employeeId === data.member.employeeId && !isAdmin)} busy={busy} onCancel={() => setModal(null)} onSave={(payload) => action("save_goal", payload, "Goal saved.")} />}
      {modal === "access" && <AccessForm employees={employees} busy={busy} onCancel={() => setModal(null)} onSave={(payload) => action("set_access", payload, "Access invitation prepared. The person must also be granted access to the private site.")} />}
      {modal === "profile" && selectedEmployee && <ProfilePanel employee={selectedEmployee} employees={employees} reviews={selectedEmployeeReviews} goals={goals.filter((goal) => goal.employeeId === selectedEmployee.id)} isAdmin={!!isAdmin} isSelf={selectedEmployee.id === data.member.employeeId && !isAdmin} onEdit={() => openEmployee(selectedEmployee)} onReview={openReview} onGoal={openGoal} onClose={() => setModal(null)} />}
      {modal === "cycle" && <CycleForm cycle={cycle!} busy={busy} onCancel={() => setModal(null)} onSave={(payload) => action("set_cycle", payload, "Review cycle updated.")} />}
      {modal === "template" && <TemplateForm template={selectedTemplate} busy={busy} onCancel={() => setModal(null)} onSave={(payload) => action("save_template", payload, selectedTemplate ? "Evaluation form updated." : "Evaluation form added.")} />}
    </Modal>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}

function modalTitle(kind: ModalKind, employee: Employee | null, review: Review | null, goal: Goal | null, template?: EvalTemplate | null) {
  if (kind === "employee") return employee ? "Edit employee" : "Add employee";
  if (kind === "review") return review?.id ? `${stageLabel[review.stage]}${employee ? ` — ${employee.fullName}` : ""}` : "New evaluation";
  if (kind === "goal") return goal ? "Update goal" : "Add a goal";
  if (kind === "access") return "Invite workspace user";
  if (kind === "profile") return "Employee profile";
  if (kind === "template") return template ? `Edit ${template.name}` : "New evaluation form";
  return "Review cycle settings";
}

function Overview({ data, employees, reviews, goals, upcoming, isAdmin, isManager, isEmployee, onPage, onReview, onEmployee, onProfile, onToast, onAction }: {
  data: Workspace; employees: Employee[]; reviews: Review[]; goals: Goal[]; upcoming: Review[]; isAdmin: boolean; isManager: boolean; isEmployee: boolean;
  onPage: (page: string) => void; onReview: (review?: Review | null, employee?: Employee | null, stage?: Stage) => void; onEmployee: () => void; onProfile: (employee: Employee) => void; onToast: (message: string) => void; onAction: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<boolean>;
}) {
  void onToast; void goals; void onEmployee;
  const [period, setPeriod] = useState<Stage>(currentStage);
  const total = employees.length;
  const forPeriod = (person: Employee) => reviews.find((review) => review.employeeId === person.id && review.stage === period);
  const rows = employees.map((person) => ({ person, review: forPeriod(person) }));
  const done = rows.filter((row) => row.review?.status === "completed");
  const scores = done.map((row) => scoreOf(row.review)).filter((value): value is number => typeof value === "number");
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null;
  const below = done.filter((row) => (row.review?.rating ?? 5) <= 2).length;
  const todo = rows.filter((row) => row.review?.status !== "completed").sort((a, b) => (a.review ? 1 : 0) - (b.review ? 1 : 0));
  const pct = total ? Math.round(done.length / total * 100) : 0;
  const today = new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const canManage = isAdmin || isManager;
  return <>
    <div className="dash-hero">
      <div><div className="eyebrow">{today}</div><h1>{isEmployee ? "My evaluations" : `${greeting}, ${isAdmin ? "HR team" : "team lead"}`}</h1><p>{isEmployee ? "Your April and October evaluations in one place." : `${data.cycle.name} · ${done.length} of ${total} ${stageShort[period]} evaluations completed`}</p></div>
      <div className="dash-hero-actions">
        <div className="segmented" role="tablist" aria-label="Evaluation period">{stageOrder.map((stage) => <button key={stage} role="tab" aria-selected={period === stage} className={period === stage ? "active" : ""} onClick={() => setPeriod(stage)}>{stageLabel[stage]}</button>)}</div>
        {isAdmin && employees.length === 0 && <button className="button secondary" onClick={() => void onAction("load_demo_data", {}, "Sample team loaded.")}>Load sample team</button>}
        {canManage && <button className="button primary" onClick={() => onReview(null, null, period)}><Plus size={16}/> New evaluation</button>}
      </div>
    </div>

    <div className="kpi-grid">
      <article className="kpi-card"><div className="kpi-top"><span>Evaluations completed</span><span className="kpi-icon red"><ClipboardList size={18}/></span></div><strong>{done.length}<em>/ {total}</em></strong><div className="kpi-progress"><i style={{ width: `${pct}%` }}/></div><small>{pct}% of the {stageShort[period]} round</small></article>
      <article className="kpi-card"><div className="kpi-top"><span>Average evaluation score</span><span className="kpi-icon"><BarChart3 size={18}/></span></div><strong>{avg ?? "—"}</strong><small>{scores.length ? `Across ${scores.length} completed evaluation${scores.length === 1 ? "" : "s"}` : "No scores recorded yet"}</small></article>
      <article className="kpi-card"><div className="kpi-top"><span>Rated below “Good”</span><span className={`kpi-icon ${below ? "amber" : "green"}`}><Activity size={18}/></span></div><strong>{below}</strong><small>{below ? "Plan coaching or training support" : "Everyone is at Good or above"}</small></article>
      <article className="kpi-card"><div className="kpi-top"><span>Employees</span><span className="kpi-icon"><Users size={18}/></span></div><strong>{total}</strong><small>{employees.filter((person) => teamOf(person) === "Agent").length} agents · {employees.filter((person) => teamOf(person) === "Dispatcher").length} dispatchers</small></article>
    </div>

    <div className="dash-fill fill">
      <section className="panel chart-panel"><div className="panel-header"><div><h2>Evaluation score by employee</h2><p>{stageLabel[period]} · completed evaluations, highest first</p></div><div className="chart-legend">{[5, 4, 3, 2, 1].map((rating) => <span key={rating}><i className={`tone-${RATING_TONE[rating]}`}/>{rating}</span>)}</div></div>
        <PulseChart rows={done.map((row) => ({ person: row.person, review: row.review! }))} onOpen={(review, person) => onReview(review, person)}/>
      </section>
      <ResultsPanel employees={employees} reviews={reviews.filter((review) => review.stage === period)} templates={data.templates} compact/>
      <section className="panel"><div className="panel-header"><div><h2>Not yet evaluated · {stageShort[period]}</h2><p>Employees without a submitted {stageShort[period]} evaluation</p></div><span className="badge neutral">{todo.length}</span></div>
        {todo.length ? <div className="todo-list">{todo.map(({ person }) => <div className="todo-item" key={person.id}><Person employee={person}/><span className="todo-meta"><span className="dept-pill">{teamOf(person)}</span>{canManage && <button className="button secondary small" onClick={() => onReview(null, person, period)}>Evaluate</button>}</span></div>)}</div> : <Empty icon={CheckCircle2} title="Everyone is evaluated" text={`All ${stageShort[period]} evaluations are submitted.`}/>}
      </section>
      <AttentionPanel employees={employees} reviews={reviews.filter((review) => review.stage === period)} onOpen={(_review, person) => onProfile(person)}/>
    </div>

  </>;
}

function PulseChart({ rows, onOpen }: { rows: Array<{ person: Employee; review: Review }>; onOpen: (review: Review, person: Employee) => void }) {
  const sorted = rows.filter((row) => typeof scoreOf(row.review) === "number").sort((a, b) => (scoreOf(b.review)! - scoreOf(a.review)!));
  if (!sorted.length) return <Empty icon={BarChart3} title="No scores yet" text="Scores appear here once evaluations are completed."/>;
  return <div className="pulse-chart" role="list">
    <div className="pulse-axis" aria-hidden="true">{[0, 25, 50, 75, 100].map((tick) => <span key={tick} style={{ left: `${tick}%` }}>{tick}</span>)}</div>
    {sorted.map(({ person, review }) => { const score = scoreOf(review)!; const rating = review.rating ?? 0; return <button className="pulse-row" role="listitem" key={review.id} onClick={() => onOpen(review, person)} title={`${person.fullName}: Score ${score}${rating ? ` · ${rating} = ${RATING_NAMES[rating]}` : ""}`}>
      <span className="pulse-name"><b>{person.fullName}</b><small>{person.department}</small></span>
      <span className="pulse-track"><i className={`tone-${RATING_TONE[rating] ?? "neutral"}`} style={{ width: `${Math.max(2, Math.min(100, score))}%` }}/></span>
      <span className="pulse-value">{score}</span>
    </button>; })}
  </div>;
}

function AttentionPanel({ employees, reviews, onOpen }: { employees: Employee[]; reviews: Review[]; onOpen: (review: Review, person: Employee) => void }) {
  const flagged = reviews.filter((review) => review.status === "completed").map((review) => ({ review, person: employees.find((item) => item.id === review.employeeId), weak: Object.values(review.formData?.items ?? {}).filter((answer) => answer.rating === "needs_improvement").length })).filter((row) => row.person && ((row.review.rating ?? 5) <= 2 || row.weak > 0)).sort((a, b) => (a.review.rating ?? 5) - (b.review.rating ?? 5) || b.weak - a.weak).slice(0, 5);
  return <section className="panel"><div className="panel-header"><div><h2>Needs attention</h2><p>Low ratings or “Needs improvement” items</p></div></div>
    {flagged.length ? <div className="todo-list">{flagged.map(({ review, person, weak }) => <button className="todo-item clickable" key={review.id} onClick={() => onOpen(review, person!)}><Person employee={person!}/><span className="todo-meta col"><RatingChip rating={review.rating}/><small>{weak} item{weak === 1 ? "" : "s"} to improve</small></span></button>)}</div> : <Empty icon={CheckCircle2} title="Nothing flagged" text="No completed evaluation needs follow-up."/>}
  </section>;
}

/** Overall evaluation score (falls back to the Pulse score for older evaluations). */
function scoreOf(review?: Review | null): number | null { const f = review?.formData; if (!f) return null; return typeof f.overallScore === "number" ? f.overallScore : typeof f.pulseScore === "number" ? f.pulseScore : null; }
const RATING_NAMES: Record<number, string> = { 1: "Needs attention", 2: "Bad", 3: "Good", 4: "Very good", 5: "Exceptional" };
function RatingChip({ rating }: { rating: number | null }) { return rating == null ? <span className="muted-dash">—</span> : <span className={`badge ${RATING_TONE[rating] ?? "neutral"}`}>{rating} · {RATING_NAMES[rating]}</span>; }
function StageCell({ review }: { review?: Review }) {
  if (!review || review.status !== "completed") return <span className="stage-cell"><i className="dot grey"/>Not evaluated</span>;
  const score = scoreOf(review);
  return <span className="stage-cell"><i className="dot green"/>Submitted{score != null && <small>Score {score}</small>}</span>;
}
function ResultsPanel({ employees, reviews, templates, compact = false }: { employees: Employee[]; reviews: Review[]; templates: EvalTemplate[]; compact?: boolean }) {
  const ids = new Set(employees.map((person) => person.id));
  const done = reviews.filter((review) => ids.has(review.employeeId) && isFormStage(review.stage) && review.status === "completed");
  const scores = done.map((review) => scoreOf(review)).filter((value): value is number => typeof value === "number");
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null;
  const dist = [5, 4, 3, 2, 1].map((rating) => ({ rating, count: done.filter((review) => review.rating === rating).length }));
  const maxCount = Math.max(1, ...dist.map((row) => row.count));
  const depts = [...new Set(employees.map((person) => person.department).filter(Boolean))].map((department) => {
    const values = done.filter((review) => employees.find((person) => person.id === review.employeeId)?.department === department).map((review) => scoreOf(review)).filter((value): value is number => typeof value === "number");
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const tpl = templates.find((item) => item.department && department.toLowerCase().includes(item.department.toLowerCase()));
    return { department, mean, n: values.length, band: tpl && mean != null ? bandForScore(tpl.scoreBands, mean) : null };
  });
  return <div className={compact ? "results-compact" : "results-grid"}>
    <section className="panel results-panel"><div className="panel-header"><div><h2>Evaluation results</h2><p>{compact ? "Rating mix for this round" : "Completed April & October evaluations this cycle"}</p></div><div className="results-avg"><small>Avg. score</small><strong>{avg ?? "—"}</strong></div></div>
      {done.length ? <div className="dist-list">{dist.map(({ rating, count }) => <div className="dist-row" key={rating}><span className="dist-label"><b>{rating}</b>{RATING_NAMES[rating]}</span><span className="dist-track"><i className={`tone-${RATING_TONE[rating]}`} style={{ width: `${count / maxCount * 100}%` }}/></span><span className="dist-count">{count}</span></div>)}</div> : <Empty icon={ClipboardList} title="No completed evaluations yet" text="Ratings appear here as soon as an evaluation is marked completed."/>}
      {depts.length > 0 && done.length > 0 && <div className="dept-strip">{depts.map((row) => <div className="dept-tile" key={row.department}><small>{row.department}</small><strong>{row.mean != null ? Math.round(row.mean * 10) / 10 : "—"}</strong><span>{row.band ? `${row.band.rating} · ${row.band.label}` : `${row.n} evaluated`}</span></div>)}</div>}
    </section>
    {!compact && <AttentionPanel employees={employees} reviews={reviews} onOpen={() => undefined}/>}
  </div>;
}

function Metric({ icon: Icon, label, value, detail, tone = "charcoal" }: { icon: typeof Users; label: string; value: string | number; detail: string; tone?: string }) { return <div className="metric-card"><div className="metric-heading"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={17}/></span></div><strong>{value}</strong><small>{detail}</small></div>; }
function Person({ employee }: { employee: Employee }) { return <span className="person-cell"><span className="avatar">{initials(employee.fullName)}</span><span><b>{employee.fullName}</b><small>{employee.jobTitle}</small></span>{employee.isDemo && <em className="demo-tag">DEMO</em>}</span>; }
function Empty({ icon: Icon, title, text, action }: { icon: typeof Users; title: string; text: string; action?: React.ReactNode }) { return <div className="empty-state"><span className="empty-icon"><Icon size={20}/></span><strong>{title}</strong><p>{text}</p>{action}</div>; }

function TeamPage({ employees, allEmployees, reviews, isAdmin, isEmployee, search, setSearch, departmentFilter, setDepartmentFilter, departments, includeInactive, setIncludeInactive, onAdd, onEdit, onProfile }: { employees: Employee[]; allEmployees: Employee[]; reviews: Review[]; isAdmin: boolean; isEmployee: boolean; search: string; setSearch: (v: string) => void; departmentFilter: string; setDepartmentFilter: (v: string) => void; departments: string[]; includeInactive: boolean; setIncludeInactive: (v: boolean) => void; onAdd: () => void; onEdit: (employee: Employee) => void; onProfile: (employee: Employee) => void }) {
  return <><PageHeading eyebrow={isEmployee ? "My account" : "People directory"} title={isEmployee ? "My profile" : "Employees"} description={isEmployee ? "Your role, manager, and review history." : "Manage employee profiles and follow review progress."} action={isAdmin ? <button className="button primary" onClick={onAdd}><Plus size={16}/> Add employee</button> : undefined}/>
    <div className="toolbar"><label className="search-field wide"><Search size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, team, or title…"/></label><div className="toolbar-actions"><label className="select-wrap"><Filter size={15}/><select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="all">All departments</option>{departments.map((department) => <option key={department}>{department}</option>)}</select><ChevronDown size={14}/></label>{isAdmin && <button className={includeInactive ? "button secondary small selected" : "button secondary small"} onClick={() => setIncludeInactive(!includeInactive)}>{includeInactive ? "Showing inactive" : "Include inactive"}</button>}</div></div>
    <section className="panel table-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Employee</th><th>Department</th><th>Reports to</th><th>Cycle progress</th><th>Next meeting</th><th>Profile</th></tr></thead><tbody>{employees.map((employee) => { const mgr = allEmployees.find((item) => item.id === employee.managerId); const mine = reviews.filter((review) => review.employeeId === employee.id); const complete = mine.filter((review) => review.status === "completed" && stageOrder.includes(review.stage)).length; const next = mine.filter((review) => review.status === "scheduled").sort((a,b) => (a.scheduledDate || "").localeCompare(b.scheduledDate || ""))[0]; return <tr key={employee.id} className={!employee.isActive ? "inactive-row" : ""} onClick={() => onProfile(employee)}><td><Person employee={employee}/></td><td>{employee.department || "—"}</td><td>{mgr?.fullName || "—"}</td><td><span className="progress-inline"><span className="progress-track"><i style={{ width: `${Math.round(complete / stageOrder.length * 100)}%` }}/></span><small>{complete}/{stageOrder.length}</small></span></td><td>{next ? dateLabel(next.scheduledDate) : "—"}</td><td><button className="button ghost small" onClick={(event) => { event.stopPropagation(); onProfile(employee); }}>{isAdmin ? "View / edit" : "View"}</button></td></tr>; })}{!employees.length && <tr><td colSpan={6}><Empty icon={Users} title="No employees yet" text="Add the people who will take part in the review cycle." action={isAdmin ? <button className="button primary small" onClick={onAdd}><Plus size={14}/> Add first employee</button> : undefined}/></td></tr>}</tbody></table></div><div className="table-footer"><span>{employees.length} employee{employees.length === 1 ? "" : "s"}</span><span>ForenSys Review Hub</span></div></section>
  </>;
}

function ReviewsPage({ data, employees, reviews, isEmployee, activeEmployee, onReview, onToast }: { data: Workspace; employees: Employee[]; reviews: Review[]; isEmployee: boolean; activeEmployee?: Employee; onReview: (review?: Review | null, employee?: Employee | null, stage?: Stage) => void; onToast: (message: string) => void }) {
  const people = isEmployee && activeEmployee ? [activeEmployee] : employees;
  const [period, setPeriod] = useState<Stage>(currentStage);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dept, setDept] = useState("all");
  const [query, setQuery] = useState("");
  const departments = [...new Set(people.map((person) => person.department).filter(Boolean))].sort();
  const rows = people.map((person) => ({ person, review: reviews.find((review) => review.employeeId === person.id && review.stage === period) }))
    .filter(({ person, review }) => (dept === "all" || person.department === dept) && (statusFilter === "all" || (statusFilter === "not_started" ? !review : review?.status === statusFilter)) && `${person.fullName} ${person.jobTitle}`.toLowerCase().includes(query.toLowerCase()));
  const counts = stageOrder.map((stage) => ({ stage, done: people.filter((person) => reviews.some((review) => review.employeeId === person.id && review.stage === stage && review.status === "completed")).length }));
  const acknowledge = async (review: Review) => { const r = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "acknowledge_review", payload: { id: review.id } }) }); const body = await r.json() as { error?: string }; onToast(r.ok ? "Evaluation acknowledged." : body.error || "Could not save acknowledgment."); if (r.ok) window.location.reload(); };
  return <>
    <PageHeading eyebrow={data.cycle.name} title={isEmployee ? "My evaluations" : "Evaluations"} description={isEmployee ? "View your completed evaluations and sign off on them." : "Twice-yearly performance evaluations using the ForenSys Agent and Dispatcher forms."} action={!isEmployee ? <button className="button primary" onClick={() => onReview(null, null, period)}><Plus size={16}/> New evaluation</button> : undefined}/>
    <div className="period-cards">{counts.map(({ stage, done }) => { const pct = people.length ? Math.round(done / people.length * 100) : 0; return <button key={stage} className={period === stage ? "period-card active" : "period-card"} onClick={() => setPeriod(stage)}>
      <span className="period-icon"><CalendarDays size={18}/></span><span className="period-copy"><strong>{stageLabel[stage]}</strong><small>{stage === "check_in" ? "Mid-year · min. 3 months employed" : "Year-end · min. 9 months employed"}</small></span>
      <span className="period-stat"><b>{done}/{people.length}</b><span className="kpi-progress"><i style={{ width: `${pct}%` }}/></span></span>
    </button>; })}</div>
    <div className="toolbar"><label className="search-field wide"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee…"/></label><div className="toolbar-actions">
      {departments.length > 1 && <label className="select-wrap"><Filter size={15}/><select value={dept} onChange={(event) => setDept(event.target.value)}><option value="all">All departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14}/></label>}
      <label className="select-wrap"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="not_started">Not started</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select><ChevronDown size={14}/></label>
    </div></div>
    <section className="panel table-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Employee</th><th>Department</th><th>Status</th><th>Meeting date</th><th>Score</th><th>Rating</th><th>Signed off</th><th className="right">Actions</th></tr></thead><tbody>
      {rows.length ? rows.map(({ person, review }) => { const tpl = review ? pickTemplate(data.templates, review.templateId, person.department) : null; return <tr key={person.id} onClick={() => review ? onReview(review, person) : !isEmployee && onReview(null, person, period)}>
        <td><Person employee={person}/></td><td><span className="dept-pill">{person.department || "—"}</span></td>
        <td>{review ? <span className={`badge ${statusClass[review.status]}`}>{statusLabel[review.status]}</span> : <span className="badge neutral">Not started</span>}</td>
        <td>{review?.scheduledDate ? dateLabel(review.scheduledDate) : <span className="muted-dash">—</span>}</td>
        <td className="num">{scoreOf(review) ?? <span className="muted-dash">—</span>}</td>
        <td><RatingChip rating={review?.rating ?? null}/></td>
        <td>{review?.status === "completed" ? (review.employeeAcknowledged ? <span className="ack yes"><Check size={14}/> Yes</span> : <span className="ack">Pending</span>) : <span className="muted-dash">—</span>}</td>
        <td className="right" onClick={(event) => event.stopPropagation()}><div className="row-actions">
          {review && review.formData && tpl && <button className="icon-btn" title="Print / PDF" onClick={() => printEvaluation({ employee: person, stage: period, form: review.formData!, template: tpl, acknowledged: review.employeeAcknowledged })}><FileText size={16}/></button>}
          {isEmployee ? <>{review && <button className="button secondary small" onClick={() => onReview(review, person)}>View</button>}{review?.status === "completed" && !review.employeeAcknowledged && <button className="button primary small" onClick={() => void acknowledge(review)}>Sign off</button>}</>
            : <button className={review ? "button secondary small" : "button primary small"} onClick={() => review ? onReview(review, person) : onReview(null, person, period)}>{!review ? "Start" : review.status === "completed" ? "Open" : "Continue"}</button>}
        </div></td>
      </tr>; }) : <tr><td colSpan={8}><Empty icon={ClipboardList} title="No evaluations match" text="Change the filters or start a new evaluation."/></td></tr>}
    </tbody></table></div><div className="table-footer"><span>{rows.length} employee{rows.length === 1 ? "" : "s"} · {stageLabel[period]}</span></div></section>
  </>;
}

function GuidePage({ isAdmin, onPage, onEmployee, onReview }: { isAdmin: boolean; onPage: (page: string) => void; onEmployee: () => void; onReview: (review?: Review | null, employee?: Employee | null, stage?: Stage) => void }) {
  const steps: Array<{ n: number; title: string; text: React.ReactNode; action?: React.ReactNode }> = [
    { n: 1, title: "Check the evaluation forms", text: <>Open <b>Evaluation forms</b>. There is one form for <b>Agents</b> and one for <b>Dispatchers</b>, copied from your Word forms, including the score bands. Click <b>Edit form</b> to change items, sections or score bands, or choose which team a form is used for.</>, action: <button className="button secondary small" onClick={() => onPage("forms")}>Open forms</button> },
    { n: 2, title: "Add your employees", text: <>Open <b>Employees → Add employee</b>. Fill in the name and job title and choose the <b>team: Agent or Dispatcher</b>. Employees are listed per team, and the right form is picked automatically.</>, action: isAdmin ? <button className="button primary small" onClick={onEmployee}><Plus size={14}/> Add employee</button> : undefined },
    { n: 3, title: "Start an evaluation", text: <>Click <b>New evaluation</b> (on the Dashboard, the Evaluations page or an employee’s page). Choose the employee and the round — <b>April</b> or <b>October</b>.</>, action: <button className="button secondary small" onClick={() => onReview(null, null, currentStage)}>New evaluation</button> },
    { n: 4, title: "Fill in the form", text: <>Enter the period, employment date and supervisor. Type the <b>Pulse score</b>; for dispatchers also fill in the <b>dispatch metrics</b>. Enter the <b>average monthly Pulse score</b> for the period (same as the Score sheet). That average is the <b>overall score</b>; the app gives the rating (1–5) automatically. Metrics and items are shown for context. Click a circle for each item: <b>Needs improvement</b>, <b>Good</b> or <b>Exceptional</b>, and add notes where useful. “Mark remaining as Good” fills all unrated items in one click. Finish with supervisor and employee feedback.</> },
    { n: 5, title: "Submit and print", text: <>Press <b>Submit evaluation</b>. It appears under <b>Evaluations</b> and on the employee’s dashboard. Use <b>Print / PDF</b> for the paper version to sign — same layout as the ForenSys Word form.</> },
    { n: 6, title: "Follow each employee over the years", text: <>Click any employee to open their <b>personal dashboard</b>: latest rating, overall score over the years, strengths and points to improve, and the full evaluation history. The main <b>Dashboard</b> shows the whole team.</>, action: <button className="button secondary small" onClick={() => onPage("overview")}>Open dashboard</button> },
  ];
  return <>
    <PageHeading eyebrow="Help" title="How the Review Hub works" description="A short walkthrough — from adding an employee to a completed, printed evaluation."/>
    <div className="guide-grid fill scroll-area">
      <section className="panel guide-steps">{steps.map((step) => <article className="guide-step" key={step.n}><span className="guide-num">{step.n}</span><div><h3>{step.title}</h3><p>{step.text}</p>{step.action && <div className="guide-action">{step.action}</div>}</div></article>)}</section>
      <aside className="guide-side">
        <section className="panel guide-card"><h3><CalendarDays size={17}/> Twice a year or yearly?</h3>
          <p><b>Twice a year (standard):</b> evaluate everyone in <b>April</b> (mid-year) and <b>October</b> (year-end).</p>
          <p><b>Yearly:</b> only use the <b>October</b> round. Leave April empty — it doesn’t affect the October results.</p>
          <p className="guide-note">Eligibility: minimum <b>3 months</b> employed for April, <b>9 months</b> for October. A new hire can skip April and start in October.</p>
        </section>
        
        <section className="panel guide-card"><h3><BarChart3 size={17}/> Ratings</h3>
          <ul className="guide-list"><li><RatingChip rating={5}/></li><li><RatingChip rating={4}/></li><li><RatingChip rating={3}/></li><li><RatingChip rating={2}/></li><li><RatingChip rating={1}/></li></ul>
          <p className="guide-note">Calculated from the overall evaluation score (Pulse + metrics + item ratings) using the bands on each form.</p>
        </section>
        <section className="panel guide-card"><h3><CalendarDays size={17}/> New year</h3><p>In <b>Settings → Review cycle</b>, start a new cycle (e.g. 2027). Previous years stay saved.</p></section>
      </aside>
    </div>
  </>;
}

const TEAMS = ["Agent", "Dispatcher"] as const;
function teamOf(person: Employee) { const d = (person.department || "").toLowerCase(); return d.includes("dispatch") ? "Dispatcher" : d.includes("agent") ? "Agent" : "Other"; }
function teamPlural(team: string) { return team === "Agent" ? "Agents" : team === "Dispatcher" ? "Dispatchers" : "Other staff"; }
function submittedOf(reviews: Review[]) { return reviews.filter((review) => review.status === "completed" && isFormStage(review.stage)); }
function yearOf(review: Review, cycles: Cycle[]) { return cycles.find((cycle) => cycle.id === review.cycleId)?.year ?? 0; }
function sortChrono(list: Review[], cycles: Cycle[]) { return [...list].sort((a, b) => yearOf(a, cycles) - yearOf(b, cycles) || stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage)); }
function roundName(review: Review, cycles: Cycle[]) { return `${stageShort[review.stage]} ${yearOf(review, cycles) || ""}`.trim(); }

function EmployeesPage({ employees, reviews, cycles, isAdmin, onAdd, onOpen }: { employees: Employee[]; reviews: Review[]; cycles: Cycle[]; isAdmin: boolean; onAdd: () => void; onOpen: (employee: Employee) => void }) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const done = submittedOf(reviews);
  const list = employees.filter((person) => `${person.fullName} ${person.jobTitle}`.toLowerCase().includes(query.toLowerCase()));
  const groups = [...TEAMS, "Other"].map((name) => ({ name, people: list.filter((person) => teamOf(person) === name) })).filter((group) => (team === "all" || group.name === team) && (group.people.length || group.name !== "Other"));
  return <>
    <PageHeading eyebrow="People" title="Employees" description="Your team, grouped by Agents and Dispatchers. Click a person to see their evaluation dashboard." action={isAdmin ? <button className="button primary" onClick={onAdd}><Plus size={16}/> Add employee</button> : undefined}/>
    <div className="toolbar"><label className="search-field wide"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name…"/></label>
      <div className="segmented">{["all", ...TEAMS].map((name) => <button key={name} className={team === name ? "active" : ""} onClick={() => setTeam(name)}>{name === "all" ? "All teams" : teamPlural(name)}</button>)}</div></div>
    <div className="fill scroll-area">{groups.map((group) => <section className="team-group" key={group.name}>
      <div className="team-head"><h2>{teamPlural(group.name)}</h2><span className="badge neutral">{group.people.length}</span></div>
      {group.people.length ? <div className="emp-grid">{group.people.map((person) => { const mine = sortChrono(done.filter((review) => review.employeeId === person.id), cycles); const last = mine[mine.length - 1]; return <button className="emp-card" key={person.id} onClick={() => onOpen(person)}>
        <span className="emp-top"><span className="avatar">{initials(person.fullName)}</span><span className="emp-name"><b>{person.fullName}</b><small>{person.jobTitle || group.name}</small></span>{person.isDemo && <em className="demo-tag">DEMO</em>}</span>
        <span className="emp-stats"><span><small>Latest rating</small><RatingChip rating={last?.rating ?? null}/></span><span><small>Latest score</small><b>{scoreOf(last) ?? "—"}</b></span><span><small>Avg score</small><b>{(() => { const v = mine.map((review) => scoreOf(review)).filter((x): x is number => typeof x === "number"); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : "—"; })()}</b></span><span><small>Evals</small><b>{mine.length}</b></span></span>
        <Sparkline values={mine.map((review) => scoreOf(review)).filter((value): value is number => typeof value === "number")}/>
      </button>; })}</div> : <div className="panel"><Empty icon={Users} title={`No ${teamPlural(group.name).toLowerCase()} yet`} text={`Add an employee with team “${group.name}”.`} action={isAdmin ? <button className="button secondary small" onClick={onAdd}><Plus size={14}/> Add employee</button> : undefined}/></div>}
    </section>)}</div>
  </>;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="spark-empty">{values.length ? "1 evaluation so far" : "No evaluations yet"}</span>;
  const w = 220, h = 36, min = Math.min(...values) - 6, max = Math.max(...values) + 6;
  const pts = values.map((value, i) => [i / (values.length - 1) * (w - 8) + 4, h - 4 - (value - min) / (max - min || 1) * (h - 8)]);
  return <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-label={`Score trend: ${values.join(", ")}`}><polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--red)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>{pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#fff" stroke="var(--red)" strokeWidth="2"/>)}</svg>;
}

function EmployeeDashboard({ employee, employees, reviews, cycles, templates, monthly = [], activeCycleId, isAdmin, onBack, onEdit, onNew, onOpenReview }: { employee: Employee; employees: Employee[]; reviews: Review[]; cycles: Cycle[]; templates: EvalTemplate[]; monthly?: MonthlyStat[]; activeCycleId: string; isAdmin: boolean; onBack: () => void; onEdit: () => void; onNew: () => void; onOpenReview: (review: Review) => void }) {
  const mine = sortChrono(submittedOf(reviews).filter((review) => review.employeeId === employee.id), cycles);
  const scores = mine.map((review) => scoreOf(review)).filter((value): value is number => typeof value === "number");
  const last = mine[mine.length - 1];
  const prev = mine[mine.length - 2];
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null;
  const best = scores.length ? Math.max(...scores) : null;
  const delta = scoreOf(last) != null && scoreOf(prev) != null ? Math.round((scoreOf(last)! - scoreOf(prev)!) * 10) / 10 : null;
  const manager = employees.find((person) => person.id === employee.managerId);
  const [tab, setTab] = useState<"evals" | "monthly">("evals");
  const months = monthly.filter((row) => row.employeeId === employee.id);
  const tally: Record<string, { label: string; needs: number; exceptional: number }> = {};
  for (const review of mine) { const tpl = pickTemplate(templates, review.templateId, employee.department); if (!tpl) continue; for (const section of tpl.sections) for (const item of section.items) { const answer = review.formData?.items?.[`${section.key}/${item.key}`]; if (!answer?.rating) continue; const label = item.label.replace(/^\d+\.\s*/, ""); const key = label.toLowerCase(); tally[key] ??= { label, needs: 0, exceptional: 0 }; if (answer.rating === "needs_improvement") tally[key].needs++; if (answer.rating === "exceptional") tally[key].exceptional++; } }
  const strengths = Object.values(tally).filter((row) => row.exceptional).sort((a, b) => b.exceptional - a.exceptional).slice(0, 5);
  const improve = Object.values(tally).filter((row) => row.needs).sort((a, b) => b.needs - a.needs).slice(0, 5);
  return <>
    <div className="emp-hero panel"><button className="icon-btn" onClick={onBack} title="All employees" aria-label="Back to all employees"><ArrowLeft size={17}/></button>
      <span className="avatar xl">{initials(employee.fullName)}</span>
      <div className="emp-hero-copy"><h1>{employee.fullName}</h1><p>{employee.jobTitle || teamOf(employee)} · <span className="dept-pill">{teamOf(employee) === "Other" ? employee.department || "No team" : teamPlural(teamOf(employee))}</span>{manager && <> · reports to {manager.fullName}</>}</p></div>
      <div className="emp-hero-actions">{isAdmin && <button className="button secondary" onClick={onEdit}><Pencil size={15}/> Edit</button>}{isAdmin && <button className="button primary" onClick={onNew}><Plus size={16}/> New evaluation</button>}</div>
    </div>
    <div className="kpi-grid">
      <article className="kpi-card"><div className="kpi-top"><span>Latest rating</span><span className="kpi-icon red"><CheckCircle2 size={18}/></span></div><strong className="kpi-chip"><RatingChip rating={last?.rating ?? null}/></strong><small>{last ? roundName(last, cycles) : "No evaluations yet"}</small></article>
      <article className="kpi-card"><div className="kpi-top"><span>Latest score</span><span className="kpi-icon"><BarChart3 size={18}/></span></div><strong>{scoreOf(last) ?? "—"}</strong><small>{delta == null ? "No earlier score to compare" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)} vs previous evaluation`}</small></article>
      <article className="kpi-card"><div className="kpi-top"><span>Average score (all years)</span><span className="kpi-icon"><Activity size={18}/></span></div><strong>{avg ?? "—"}</strong><small>{best != null ? `Best score: ${best}` : "—"}</small></article>
      <article className="kpi-card"><div className="kpi-top"><span>Evaluations</span><span className="kpi-icon"><ClipboardList size={18}/></span></div><strong>{mine.length}</strong><small>Submitted in total</small></article>
    </div>
    <div className="emp-fill fill">
      <section className="panel trend-panel"><div className="panel-header"><div><h2>Evaluation score over time</h2><p>Every submitted evaluation, oldest to newest</p></div></div><TrendChart reviews={mine} cycles={cycles}/></section>
      <section className="panel si-panel"><div className="panel-header"><div><h2>Strengths &amp; points to improve</h2><p>Counted over all evaluations</p></div></div>
        <div className="si-grid"><div><h3 className="si-title good">Strengths</h3>{strengths.length ? strengths.map((row) => <div className="si-row" key={row.label}><span>{row.label}</span><b>{row.exceptional}× Exceptional</b></div>) : <p className="si-empty">None yet</p>}</div>
        <div><h3 className="si-title bad">To improve</h3>{improve.length ? improve.map((row) => <div className="si-row" key={row.label}><span>{row.label}</span><b>{row.needs}× Needs impr.</b></div>) : <p className="si-empty">Nothing flagged</p>}</div></div>
      </section>
    <section className="panel table-panel history-panel"><div className="panel-header"><div><h2>{tab === "monthly" ? "Monthly Pulse data" : "Evaluation history"}</h2><p>{tab === "monthly" ? "Imported from the monthly Pulse report" : `All submitted evaluations for ${employee.fullName.split(" ")[0]}`}</p></div><div className="segmented small"><button className={tab === "evals" ? "active" : ""} onClick={() => setTab("evals")}>Evaluations</button><button className={tab === "monthly" ? "active" : ""} onClick={() => setTab("monthly")}>Monthly Pulse ({months.length})</button></div></div><div className="table-scroll">{tab === "monthly" ? <MonthlyTable rows={months}/> : <><table className="data-table"><thead><tr><th>Round</th><th>Date</th><th>Form</th><th>Score</th><th>Rating</th><th>Supervisor</th><th className="right">Actions</th></tr></thead><tbody>
      {mine.length ? [...mine].reverse().map((review) => { const tpl = pickTemplate(templates, review.templateId, employee.department); const editable = isAdmin || review.cycleId === activeCycleId; return <tr key={review.id} onClick={() => editable && onOpenReview(review)}>
        <td><b>{roundName(review, cycles)}</b></td><td>{review.formData?.evaluationDate ? dateLabel(review.formData.evaluationDate) : dateLabel(review.scheduledDate)}</td><td>{tpl?.name ?? "—"}</td><td className="num">{scoreOf(review) ?? "—"}</td><td><RatingChip rating={review.rating}/></td><td>{review.formData?.supervisor || "—"}</td>
        <td className="right" onClick={(event) => event.stopPropagation()}><div className="row-actions">{tpl && review.formData && <button className="icon-btn" title="Print / PDF" onClick={() => printEvaluation({ employee, stage: review.stage, form: review.formData!, template: tpl, acknowledged: review.employeeAcknowledged })}><FileText size={16}/></button>}{editable && <button className="button secondary small" onClick={() => onOpenReview(review)}>Open</button>}</div></td>
      </tr>; }) : <tr><td colSpan={7}><Empty icon={ClipboardList} title="No evaluations yet" text="Submitted evaluations will appear here and build up this dashboard over the years." action={isAdmin ? <button className="button primary small" onClick={onNew}><Plus size={14}/> New evaluation</button> : undefined}/></td></tr>}
    </tbody></table></>}</div></section>
    </div>
  </>;
}

const fmtTime = (sec: number | null | undefined) => sec == null ? "—" : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
const fmtMonth = (month: string) => { const [y, m] = month.split("-").map(Number); return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 15)); };
function MonthlyTable({ rows }: { rows: MonthlyStat[] }) {
  if (!rows.length) return <Empty icon={BarChart3} title="No monthly data" text="No monthly Pulse figures have been added for this employee yet."/>;
  const avg = (pick: (r: MonthlyStat) => number | null) => { const v = rows.map(pick).filter((x): x is number => typeof x === "number"); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const a = { score: avg((r) => r.pulseScore), inc: avg((r) => r.incidents), dt: avg((r) => r.dispatchSeconds), wt: avg((r) => r.waitingSeconds) };
  return <table className="data-table"><thead><tr><th>Month</th><th className="num">Score</th><th className="num">Number of incidents</th><th className="num">Dispatch time</th><th className="num">Waiting time</th></tr></thead><tbody>
    {rows.map((r) => <tr key={r.id}><td><b>{fmtMonth(r.month)}</b></td><td className="num">{r.pulseScore ?? "—"}</td><td className="num">{r.incidents ?? "—"}</td><td className="num">{fmtTime(r.dispatchSeconds)}</td><td className="num">{fmtTime(r.waitingSeconds)}</td></tr>)}
    <tr className="avg-row"><td><b>Average</b></td><td className="num"><b>{a.score == null ? "—" : Math.round(a.score * 100) / 100}</b></td><td className="num"><b>{a.inc == null ? "—" : Math.round(a.inc * 100) / 100}</b></td><td className="num"><b>{fmtTime(a.dt)}</b></td><td className="num"><b>{fmtTime(a.wt)}</b></td></tr>
  </tbody></table>;
}

function TrendChart({ reviews, cycles }: { reviews: Review[]; cycles: Cycle[] }) {
  const pts = reviews.filter((review) => typeof scoreOf(review) === "number");
  if (!pts.length) return <Empty icon={BarChart3} title="No scores yet" text="The chart fills in as evaluations are submitted."/>;
  const W = 640, H = 230, L = 40, R = 44, T = 18, B = 34;
  const x = (i: number) => pts.length === 1 ? (L + W - R) / 2 : L + i / (pts.length - 1) * (W - L - R);
  const y = (v: number) => T + (100 - v) / 100 * (H - T - B);
  return <div className="trend-wrap"><svg viewBox={`0 0 ${W} ${H}`} className="trend-chart" role="img" aria-label="Evaluation score over time">
    {[0, 25, 50, 75, 100].map((tick) => <g key={tick}><line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} stroke="#ececef"/><text x={L - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#a1a1aa">{tick}</text></g>)}
    <polyline points={pts.map((review, i) => `${x(i)},${y(scoreOf(review)!)}`).join(" ")} fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinejoin="round"/>
    {pts.map((review, i) => { const v = scoreOf(review)!; return <g key={review.id}><circle cx={x(i)} cy={y(v)} r="5" fill="#fff" stroke="var(--red)" strokeWidth="2.5"><title>{`${roundName(review, cycles)}: Score ${v}${review.rating ? ` · ${review.rating} = ${RATING_NAMES[review.rating]}` : ""}`}</title></circle><text x={x(i)} y={y(v) - 11} textAnchor="middle" fontSize="12" fontWeight="700" fill="#18181b">{v}</text><text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11.5" fill="#71717a">{roundName(review, cycles)}</text></g>; })}
  </svg></div>;
}

function EvaluationsPage({ employees, reviews, cycles, templates, activeCycleId, isAdmin, onNew, onOpenReview, onOpenEmployee }: { employees: Employee[]; reviews: Review[]; cycles: Cycle[]; templates: EvalTemplate[]; activeCycleId: string; isAdmin: boolean; onNew: () => void; onOpenReview: (review: Review, employee: Employee) => void; onOpenEmployee: (employee: Employee) => void }) {
  const [team, setTeam] = useState("all");
  const [year, setYear] = useState("all");
  const [round, setRound] = useState("all");
  const [query, setQuery] = useState("");
  const years = [...new Set(cycles.map((cycle) => cycle.year))].sort((a, b) => b - a);
  const rows = sortChrono(submittedOf(reviews), cycles).reverse().map((review) => ({ review, person: employees.find((person) => person.id === review.employeeId) }))
    .filter((row): row is { review: Review; person: Employee } => Boolean(row.person))
    .filter(({ review, person }) => (team === "all" || teamOf(person) === team) && (year === "all" || String(yearOf(review, cycles)) === year) && (round === "all" || review.stage === round) && person.fullName.toLowerCase().includes(query.toLowerCase()));
  return <>
    <PageHeading eyebrow="Submitted" title="Evaluations" description="Every submitted evaluation, newest first." action={isAdmin ? <button className="button primary" onClick={onNew}><Plus size={16}/> New evaluation</button> : undefined}/>
    <div className="toolbar"><label className="search-field wide"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee…"/></label><div className="toolbar-actions">
      <label className="select-wrap"><select value={team} onChange={(event) => setTeam(event.target.value)}><option value="all">All teams</option>{TEAMS.map((name) => <option key={name} value={name}>{teamPlural(name)}</option>)}</select><ChevronDown size={14}/></label>
      <label className="select-wrap"><select value={year} onChange={(event) => setYear(event.target.value)}><option value="all">All years</option>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={14}/></label>
      <label className="select-wrap"><select value={round} onChange={(event) => setRound(event.target.value)}><option value="all">April &amp; October</option>{stageOrder.map((stage) => <option key={stage} value={stage}>{stageShort[stage]}</option>)}</select><ChevronDown size={14}/></label>
    </div></div>
    <section className="panel table-panel fill"><div className="table-scroll"><table className="data-table"><thead><tr><th>Employee</th><th>Team</th><th>Round</th><th>Date</th><th>Score</th><th>Rating</th><th className="right">Actions</th></tr></thead><tbody>
      {rows.length ? rows.map(({ review, person }) => { const tpl = pickTemplate(templates, review.templateId, person.department); const editable = isAdmin || review.cycleId === activeCycleId; return <tr key={review.id} onClick={() => onOpenEmployee(person)}>
        <td><Person employee={person}/></td><td><span className="dept-pill">{teamOf(person) === "Other" ? person.department || "—" : teamOf(person)}</span></td><td><b>{roundName(review, cycles)}</b></td><td>{dateLabel(review.formData?.evaluationDate || review.scheduledDate)}</td><td className="num">{scoreOf(review) ?? "—"}</td><td><RatingChip rating={review.rating}/></td>
        <td className="right" onClick={(event) => event.stopPropagation()}><div className="row-actions">{tpl && review.formData && <button className="icon-btn" title="Print / PDF" onClick={() => printEvaluation({ employee: person, stage: review.stage, form: review.formData!, template: tpl, acknowledged: review.employeeAcknowledged })}><FileText size={16}/></button>}{editable && isAdmin && <button className="button secondary small" onClick={() => onOpenReview(review, person)}>Open</button>}</div></td>
      </tr>; }) : <tr><td colSpan={7}><Empty icon={ClipboardList} title="No submitted evaluations" text="Click “New evaluation”, fill in the form and press Submit." action={isAdmin ? <button className="button primary small" onClick={onNew}><Plus size={14}/> New evaluation</button> : undefined}/></td></tr>}
    </tbody></table></div><div className="table-footer"><span>{rows.length} submitted evaluation{rows.length === 1 ? "" : "s"}</span></div></section>
  </>;
}

function FormsPage({ templates, isAdmin, onEdit }: { templates: EvalTemplate[]; isAdmin: boolean; onEdit: (template?: EvalTemplate | null) => void }) {
  return <>
    <PageHeading eyebrow="Templates" title="Evaluation forms" description="One form per team. The form is picked automatically from the employee’s team. Click Edit to change items, sections or score bands." action={isAdmin ? <button className="button primary" onClick={() => onEdit(null)}><Plus size={16}/> New form</button> : undefined}/>
    <div className="form-cards fill scroll-area">{templates.map((template) => { const items = template.sections.reduce((sum, section) => sum + section.items.length, 0); return <article className="panel form-card" key={template.id}>
      <div className="form-card-head"><span className="period-icon"><FileText size={18}/></span><div><h2>{template.name}</h2><p>Used for: <span className="dept-pill">{template.department ? teamPlural(template.department) : "All teams"}</span> {!template.isActive && <span className="badge neutral">Inactive</span>}</p></div>{isAdmin && <button className="button secondary small" onClick={() => onEdit(template)}><Pencil size={14}/> Edit form</button>}</div>
      <div className="form-card-body"><div><h3>Sections</h3><ul>{template.sections.map((section) => <li key={section.key}><span>{section.title}</span><b>{section.items.length}</b></li>)}</ul><p className="form-card-total">{items} items in total</p></div>
        <div><h3>Pulse score → rating</h3><ul>{[...template.scoreBands].sort((a, b) => b.min - a.min).map((band) => <li key={band.rating}><span>{band.min === 0 ? `≤ ${band.max}` : `${band.min} – ${band.max}`}</span><RatingChip rating={band.rating}/></li>)}</ul></div></div>
    </article>; })}</div>
  </>;
}

function GoalsPage({ data, employees, goals, isEmployee, selfEmployeeId, onAdd, onEdit, onAction }: { data: Workspace; employees: Employee[]; goals: Goal[]; isEmployee: boolean; selfEmployeeId: string | null; onAdd: () => void; onEdit: (goal?: Goal) => void; onAction: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  return <><PageHeading eyebrow="Development & outcomes" title={isEmployee ? "My goals" : "Goals"} description="Keep goals specific, measurable, and connected to regular conversations." action={!isEmployee ? <button className="button primary" onClick={onAdd}><Plus size={16}/> Add goal</button> : undefined}/>
    <div className="goal-summary"><div><span className="goal-summary-icon"><Goal size={18}/></span><div><strong>{goals.filter((goal) => goal.status !== "completed").length} open goals</strong><small>Across {new Set(goals.map((goal) => goal.employeeId)).size} team members</small></div></div><div className="goal-summary-count"><b>{goals.filter((goal) => goal.status === "completed").length}</b><span>completed</span></div></div>
    <div className="goal-grid">{goals.map((goal) => { const person = employees.find((employee) => employee.id === goal.employeeId); const canUpdateOwn = isEmployee || goal.employeeId === selfEmployeeId; return <article className="panel goal-card" key={goal.id}><div className="goal-card-top"><span className={`badge ${statusClass[goal.status]}`}>{statusLabel[goal.status]}</span>{goal.isDemo && <em className="demo-tag">DEMO</em>}<button className="icon-action" aria-label="Edit goal" onClick={() => onEdit(goal)}><MoreHorizontal size={18}/></button></div><h3>{goal.title}</h3><p>{goal.description || "No description added."}</p><div className="goal-measure"><small>SUCCESS MEASURE</small><span>{goal.successMeasure || "Not defined"}</span></div><div className="goal-card-bottom"><Person employee={person || { id:"", fullName:"Employee", email:"", jobTitle:"", department:"", managerId:null, isActive:true, isDemo:false }}/><span>Due {dateLabel(goal.dueDate)}</span></div>{canUpdateOwn && <label className="goal-status-select">Update progress<select value={goal.status} onChange={(event) => void onAction("save_goal", { id:goal.id, employeeId:goal.employeeId, cycleId:data.cycle.id, status:event.target.value }, "Goal progress updated.")}><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Needs support</option><option value="completed">Completed</option></select></label>}</article>; })}{!goals.length && <div className="panel span-all"><Empty icon={Goal} title="No goals yet" text={isEmployee ? "Your goals will appear here after your planning conversation." : "Add a goal to make development steps visible throughout the cycle."} action={!isEmployee ? <button className="button primary small" onClick={onAdd}><Plus size={14}/> Add first goal</button> : undefined}/></div>}</div>
  </>;
}

function AccessPage({ users, employees, audit, onInvite, onAction }: { users: Member[]; employees: Employee[]; audit: AuditEntry[]; onInvite: () => void; onAction: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  const [showAudit, setShowAudit] = useState(false);
  return <><PageHeading eyebrow="Workspace security" title="Access & roles" description="Manage who can use the Review Hub and what they can see." action={<button className="button primary" onClick={onInvite}><Plus size={16}/> Invite user</button>}/>
    <div className="access-callout"><ShieldCheck size={19}/><span><b>Role permissions are enforced by the server.</b> Site access is a separate gate: invited people also need to be allowed into this private site before they can sign in.</span></div>
    <div className="role-grid"><RoleCard title="HR administrator" text="Manage the workspace, employees, review cycles, goals, access, and reports."/><RoleCard title="Manager" text="See their own profile and direct reports. Schedule conversations and manage team goals."/><RoleCard title="Employee" text="See their own reviews and goals, add reflections, update goal progress, and acknowledge evaluations."/></div>
    <div className="section-heading"><div><h2>Workspace users</h2><p>People invited by HR. A user links their account the first time they sign in with the invited work email.</p></div></div>
    <section className="panel table-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>User</th><th>Role</th><th>Employee profile</th><th>Account link</th><th>Status</th><th></th></tr></thead><tbody>{users.map((user) => { const person = employees.find((employee) => employee.id === user.employeeId); return <tr key={user.id}><td><Person employee={{id:user.id,fullName:user.displayName,email:user.email,jobTitle:user.email,department:"",managerId:null,isActive:user.isActive,isDemo:false}}/></td><td><span className="role-pill">{user.role === "hr_admin" ? "HR administrator" : user.role === "manager" ? "Manager" : "Employee"}</span></td><td>{person?.fullName || "—"}</td><td><span className={`badge ${user.linked ? "green" : "amber"}`}>{user.linked ? "Linked" : "Invite pending"}</span></td><td><span className={`badge ${user.isActive ? "green" : "neutral"}`}>{user.isActive ? "Active" : "Deactivated"}</span></td><td>{user.isActive && user.role !== "hr_admin" && <button className="button ghost small danger-text" onClick={() => void onAction("deactivate_access", {id:user.id}, "Access deactivated.")}>Deactivate</button>}</td></tr>; })}</tbody></table></div></section>
    <div className="section-heading audit-heading"><div><h2>Recent activity</h2><p>Access and review changes are recorded without copying review notes into the log.</p></div><button className="button secondary small" onClick={() => setShowAudit(!showAudit)}>{showAudit ? "Hide" : "Show activity"}</button></div>{showAudit && <section className="panel audit-list">{audit.length ? audit.map((entry) => <div className="audit-row" key={entry.id}><span className="audit-dot"/><div><strong>{entry.action.replaceAll("_", " ")}</strong><small>{entry.actorEmail} · {entry.entity}</small></div><time>{dateLabel(entry.createdAt)}</time></div>) : <p className="muted-pad">No activity recorded yet.</p>}</section>}
  </>;
}
function RoleCard({ title, text }: { title: string; text: string }) { return <article className="panel role-card"><span className="role-icon"><ShieldCheck size={17}/></span><h3>{title}</h3><p>{text}</p></article>; }

function SettingsPage({ data, onCycle, onTemplate, onAction, onExport }: { data: Workspace; onCycle: () => void; onTemplate: (template?: EvalTemplate | null) => void; onAction: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<boolean>; onExport: () => void; onToast: (s: string) => void }) {
  const demoCount = data.employees.filter((employee) => employee.isDemo).length;
  const criteriaCount = (template: EvalTemplate) => template.sections.reduce((sum, section) => sum + section.items.length, 0);
  return <><PageHeading eyebrow="Workspace configuration" title="Settings" description="Configure your annual cycle, review templates, and sample records."/>
    <div className="settings-grid fill scroll-area"><section className="panel settings-section"><div className="settings-section-title"><span className="settings-icon"><CalendarDays size={17}/></span><div><h2>Review cycle</h2><p>One active cycle can be used at a time.</p></div></div><div className="setting-line"><div><strong>{data.cycle.name}</strong><small>Currently active</small></div><span className="badge green">Active</span></div><div className="setting-line"><div><strong>Conversation order</strong><small>April and October evaluations</small></div><span className="badge neutral">Twice a year</span></div><button className="button secondary" onClick={onCycle}><Pencil size={15}/> Change active cycle</button></section>
      <section className="panel settings-section"><div className="settings-section-title"><span className="settings-icon"><FileText size={17}/></span><div><h2>Evaluation forms</h2><p>The structured forms used for the evaluation stage.</p></div></div>{(data.templates ?? []).map((template) => <div className="setting-line" key={template.id}><div><strong>{template.name}</strong><small>{template.department || "All departments"} · {template.sections.length} sections · {criteriaCount(template)} criteria</small></div><span className={`badge ${template.isActive ? "green" : "neutral"}`}>{template.isActive ? "Active" : "Inactive"}</span><button className="button ghost small" onClick={() => onTemplate(template)}><Pencil size={13}/> Edit</button></div>)}<div className="setting-actions"><button className="button secondary" onClick={() => onTemplate(null)}><Plus size={15}/> Add evaluation form</button></div></section>
      <section className="panel settings-section"><div className="settings-section-title"><span className="settings-icon"><ArrowDownToLine size={17}/></span><div><h2>Reports & export</h2><p>Download a summary of the active cycle.</p></div></div><div className="setting-line"><div><strong>Review status summary</strong><small>Employee, stage, status, meeting date, rating, acknowledgment</small></div><span className="badge neutral">CSV</span></div><button className="button secondary" onClick={onExport}><ArrowDownToLine size={15}/> Export review summary</button></section>
      <section className="panel settings-section"><div className="settings-section-title"><span className="settings-icon red"><CircleHelp size={17}/></span><div><h2>Demo records</h2><p>Keep sample people separate from real team records.</p></div></div><div className="setting-line"><div><strong>{demoCount} sample employees</strong><small>Fictional names and example.test emails</small></div><span className={`badge ${demoCount ? "amber" : "neutral"}`}>{demoCount ? "Demo" : "None"}</span></div>{demoCount ? <button className="button secondary danger-text" onClick={() => void onAction("clear_demo_data", {}, "Sample records removed.")}>Remove demo records</button> : data.employees.length === 0 ? <button className="button secondary" onClick={() => void onAction("load_demo_data", {}, "Sample team loaded.")}>Load sample records</button> : <button className="button secondary" disabled title="Demo records can only be loaded into an empty workspace">Remove real team records before loading samples</button>}</section>
    </div>
    <div className="privacy-note"><LockKeyhole size={17}/><div><strong>Personal review information</strong><p>Use the minimum detail needed for a useful conversation. Access is role-limited and important record changes are logged. ForenSys should set its retention period and review process before adding real employee data.</p></div></div>
  </>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="page-heading-action">{action}</div>}</div>; }

function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={wide ? "modal-panel wide" : "modal-panel"} role="dialog" aria-modal="true" aria-label={title}><header className="modal-header"><div><span className="eyebrow">ForenSys Review Hub</span><h2>{title}</h2></div><button className="round-icon" onClick={onClose} aria-label="Close"><X size={18}/></button></header>{children}</section></div>; }

function EmployeeForm({ employee, employees, busy, onCancel, onSave }: { employee: Employee | null; employees: Employee[]; busy: boolean; onCancel: () => void; onSave: (p: Record<string, unknown>) => void }) {
  return <form className="form-body" onSubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); onSave({ id: employee?.id, fullName: f.get("fullName"), email: f.get("email"), jobTitle: f.get("jobTitle"), department: f.get("department"), managerId: f.get("managerId"), isActive: f.has("isActive"), inviteRole: f.get("inviteRole") }); }}>
    <div className="form-grid"><Field label="Full name *"><input name="fullName" required defaultValue={employee?.fullName} placeholder="Employee name"/></Field><Field label="Work email"><input name="email" type="email" defaultValue={employee?.email} placeholder="name@forensys.com"/></Field><Field label="Job title *"><input name="jobTitle" required defaultValue={employee?.jobTitle} placeholder="e.g. Claims Specialist"/></Field><Field label="Team *"><select name="department" required defaultValue={employee?.department || "Agent"}><option value="Agent">Agent</option><option value="Dispatcher">Dispatcher</option>{employee?.department && !["Agent", "Dispatcher"].includes(employee.department) && <option value={employee.department}>{employee.department}</option>}</select></Field><Field label="Reports to"><select name="managerId" defaultValue={employee?.managerId || ""}><option value="">No manager selected</option>{employees.filter((person) => person.id !== employee?.id && person.isActive).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></Field>{!employee && <Field label="Invite sign-in role"><select name="inviteRole"><option value="">No account yet</option><option value="employee">Employee</option><option value="manager">Manager</option></select><small className="field-help">The employee can link their account after HR grants access to the private site.</small></Field>}{employee && <label className="toggle-field"><input type="checkbox" name="isActive" defaultChecked={employee.isActive}/><span>Employee is active</span></label>}</div>
    <div className="form-footer"><span className="form-hint">Employee details are stored in the shared workspace database.</span><div><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : employee ? "Save changes" : "Add employee"}</button></div></div>
  </form>;
}

function pickTemplate(templates: EvalTemplate[], templateId: string | null | undefined, department?: string) {
  const byId = templates.find((template) => template.id === templateId);
  if (byId) return byId;
  const dept = (department || "").toLowerCase();
  const byDept = templates.find((template) => template.isActive && dept && (dept.includes(template.department.toLowerCase()) || template.department.toLowerCase().includes(dept)));
  return byDept ?? templates.find((template) => template.isActive) ?? templates[0] ?? null;
}

function ReviewForm({ review, employee, employees, cycle, templates, isEmployee, canDelete, busy, onCancel, onSave, onDelete }: { review: Review; employee: Employee | null; employees: Employee[]; cycle: Cycle; templates: EvalTemplate[]; isEmployee: boolean; canDelete?: boolean; busy: boolean; onCancel: () => void; onSave: (p: Record<string, unknown>) => void; onDelete?: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [employeeId, setEmployeeId] = useState(employee?.id || review.employeeId || "");
  const [stage, setStage] = useState<Stage>(isFormStage(review.stage) ? review.stage : currentStage);
  const person = employees.find((item) => item.id === employeeId) ?? employee;
  const [form, setForm] = useState<EvalFormData>(() => ({ ...EMPTY_FORM_DATA, items: {}, ...(review.formData ?? {}), period: review.formData?.period || `${stageShort[isFormStage(review.stage) ? review.stage : currentStage]} ${cycle.year}`, evaluationDate: review.formData?.evaluationDate || dateInput(review.scheduledDate) || new Date().toISOString().slice(0, 10) }));
  const template = pickTemplate(templates, form.templateId || review.templateId, person?.department);
  const overall = computeOverallScore(template, form);
  const band = template ? bandForScore(template.scoreBands, overall.score) : null;
  const readOnly = isEmployee;
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!employeeId) return;
    onSave({ id: review.id || undefined, employeeId, cycleId: review.cycleId || cycle.id, stage, status: "completed", scheduledDate: form.evaluationDate, managerFeedback: "", sharedSummary: "", templateId: template?.id ?? null, rating: band ? String(band.rating) : "", formData: { ...form, overallScore: overall.score, templateId: template?.id ?? null, templateName: template?.name ?? "" } });
  };
  return <form className="form-body" onSubmit={submit}>
    <div className="form-grid">
      <Field label="Employee *"><select required value={employeeId} disabled={readOnly || Boolean(review.id)} onChange={(event) => { setEmployeeId(event.target.value); setForm({ ...form, templateId: null }); }}><option value="" disabled>Choose an employee…</option>{TEAMS.map((team) => <optgroup key={team} label={teamPlural(team)}>{employees.filter((item) => item.isActive && teamOf(item) === team).map((item) => <option value={item.id} key={item.id}>{item.fullName}</option>)}</optgroup>)}{employees.some((item) => item.isActive && teamOf(item) === "Other") && <optgroup label="Other">{employees.filter((item) => item.isActive && teamOf(item) === "Other").map((item) => <option value={item.id} key={item.id}>{item.fullName}</option>)}</optgroup>}</select></Field>
      <Field label="Evaluation round *"><select value={stage} disabled={readOnly || Boolean(review.id)} onChange={(event) => { const next = event.target.value as Stage; setStage(next); setForm({ ...form, period: `${stageShort[next]} ${cycle.year}` }); }}>{stageOrder.map((item) => <option key={item} value={item}>{stageLabel[item]} {cycle.year}</option>)}</select></Field>
      {person ? <EvaluationFormFields form={form} setForm={setForm} template={template} templates={templates} readOnly={readOnly} acknowledged={review.employeeAcknowledged}/> : <div className="form-note span-all"><CircleHelp size={16}/> Choose an employee — the form for their team (Agent or Dispatcher) loads automatically.</div>}
    </div>
    <div className="form-footer"><span className="form-hint">{review.id ? "Changes replace the submitted evaluation." : "Submitting saves the evaluation to the employee’s dashboard."}</span><div>{canDelete && review.id && onDelete && (confirmDelete ? <><button type="button" className="button danger" disabled={busy} onClick={onDelete}>Yes, delete permanently</button><button type="button" className="button secondary" onClick={() => setConfirmDelete(false)}>Keep</button></> : <button type="button" className="button danger-ghost" onClick={() => setConfirmDelete(true)}><Trash2 size={15}/> Delete</button>)}{template && person && <button type="button" className="button secondary" onClick={() => printEvaluation({ employee: person, stage, form, template, acknowledged: review.employeeAcknowledged })}><FileText size={15}/> Print / PDF</button>}<button type="button" className="button secondary" onClick={onCancel}>Cancel</button>{!readOnly && <button className="button primary" disabled={busy || !person}>{busy ? "Submitting…" : review.id ? "Save changes" : "Submit evaluation"}</button>}</div></div>
  </form>;
}

function esc(value: unknown) { return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string)); }
function longDate(value?: string) { if (!value) return "____________________"; const d = new Date(`${value.slice(0, 10)}T12:00:00`); return Number.isNaN(d.getTime()) ? esc(value) : new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" }).format(d); }
function metricsHtml(form: EvalFormData, template: EvalTemplate) {
  const scored = scoreDispatchMetrics(form.metrics, metricDefsFor(template));
  const title = isDispatcherTemplate(template) ? "Dispatch performance metrics" : "Agent performance metrics";
  const rows = scored.results.map((r) => `<tr><td class="item">${esc(r.def.label)}</td><td>${esc(r.display)}</td><td>${esc(r.bracket || "—")}</td><td>${r.level ? esc(r.label ?? METRIC_LEVELS.find((l) => l.level === r.level)?.label) : "—"}</td><td class="x">${r.points ?? "—"} / ${r.def.maxPoints}</td></tr>`).join("");
  return `<table class="grid"><thead><tr><th class="item">${title}</th><th>Result</th><th>Bracket</th><th>Level</th><th>Points</th></tr></thead><tbody>${rows}<tr><td class="item"><b>Total metric points</b></td><td colspan="3"></td><td class="x">${scored.total} / ${scored.max}</td></tr></tbody></table>`;
}
function printEvaluation({ employee, stage, form, template, acknowledged }: { employee: Employee | null; stage: Stage; form: EvalFormData; template: EvalTemplate; acknowledged: boolean }) {
  const overall = computeOverallScore(template, form);
  const band = bandForScore(template.scoreBands, overall.score);
  const bands = [...template.scoreBands].sort((a, b) => a.min - b.min).map((item) => `<tr class="${band && band.rating === item.rating ? "hit" : ""}"><td>${item.min === 0 ? `&le;${item.max}` : `${item.min} - ${item.max}`}</td><td>${item.rating} = ${esc(item.label)}</td></tr>`).join("");
  const sections = template.sections.map((section) => `<table class="grid"><thead><tr><th class="item">${esc(section.title)}</th><th>Needs Improvement</th><th>Good</th><th>Exceptional</th><th class="note">Notes</th></tr></thead><tbody>${section.items.map((item) => { const answer = form.items[`${section.key}/${item.key}`]; const mark = (value: string) => answer?.rating === value ? "X" : ""; return `<tr><td class="item">${esc(item.label)}</td><td class="x">${mark("needs_improvement")}</td><td class="x">${mark("good")}</td><td class="x">${mark("exceptional")}</td><td class="note">${esc(answer?.note)}</td></tr>`; }).join("")}</tbody></table>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Evaluation - ${esc(employee?.fullName)}</title><style>
  *{box-sizing:border-box}body{font:11px/1.4 Arial,Helvetica,sans-serif;color:#1d1d1f;margin:28px 34px}
  header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #c8102e;padding-bottom:10px;margin-bottom:14px}
  header img{height:46px}header h1{font-size:16px;margin:0;text-align:right}header p{margin:2px 0 0;color:#666;text-align:right}
  table{width:100%;border-collapse:collapse;margin-bottom:12px}td,th{border:1px solid #9a9a9a;padding:5px 7px;vertical-align:top}
  th{background:#2b2b2b;color:#fff;font-weight:600;text-align:center;font-size:10px}.info td{width:50%}.info b{display:inline-block;min-width:130px}
  .grid .item{text-align:left;width:34%}.grid .x{text-align:center;font-weight:700;width:11%}.grid .note{text-align:left}
  .bands{width:55%}.bands .hit td{background:#fde8eb;font-weight:700}.score{display:flex;gap:18px;align-items:flex-start}
  .result{flex:1;border:1px solid #9a9a9a;padding:10px}.result strong{font-size:22px;color:#c8102e;display:block}
  .box{border:1px solid #9a9a9a;padding:8px;margin-bottom:12px;min-height:56px;white-space:pre-wrap}.box h3{margin:0 0 4px;font-size:11px}
  .sign{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:26px}.sign div{border-top:1px solid #333;padding-top:4px}
  @media print{body{margin:12mm}}</style></head><body>
  <header><img src="${location.origin}/forensys-logo.png" alt="ForenSys"><div><h1>${esc(template.name)}</h1><p>${esc(stageLabel[stage])} &middot; twice yearly</p></div></header>
  <table class="info"><tr><td><b>Employee Name:</b> ${esc(employee?.fullName)}</td><td><b>Employment Date:</b> ${longDate(form.employmentDate)}</td></tr>
  <tr><td><b>Period of Evaluation:</b> ${esc(form.period)}<br><small>Note: minimum 3 months for April and 9 months for October</small></td><td><b>Today's Date:</b> ${longDate(form.evaluationDate)}</td></tr>
  <tr><td colspan="2"><b>Supervisor / Name and Title:</b> ${esc(form.supervisor)}</td></tr></table>
  <div class="score"><table class="bands"><thead><tr><th>Overall evaluation score</th><th>Achievement Results Rating</th></tr></thead><tbody>${bands}</tbody></table>
  <div class="result">Overall evaluation score<strong>${overall.score ?? "&mdash;"}</strong><small>${overall.parts.map((part) => `${esc(part.label)} (${part.weight}%): ${esc(part.detail)}`).join(" &middot; ")}</small><br>${band ? `${band.rating} = ${esc(band.label)}` : "No rating"}</div></div>
  ${metricsHtml(form, template)}
  ${sections}
  <div class="box"><h3>Supervisor Feedback &mdash; support to be provided (training, equipment, observation, procedures, coaching)</h3>${esc(form.supervisorSupport)}</div>
  <div class="box"><h3>Employee Feedback</h3>${esc(form.employeeFeedback)}</div>
  ${form.meetingNotes ? `<div class="box"><h3>Meeting Notes &mdash; summary of what was discussed</h3>${esc(form.meetingNotes)}</div>` : ""}
  <p><b>Acknowledgement of Performance Evaluation</b>${acknowledged ? " &mdash; acknowledged digitally by the employee." : ""}</p>
  <div class="sign"><div>Supervisor Signature &nbsp;&nbsp;&nbsp; Date: ${longDate(form.evaluationDate)}</div><div>Employee Signature &nbsp;&nbsp;&nbsp; Date: ${longDate(form.evaluationDate)}</div></div>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
  const win = window.open("", "_blank");
  if (!win) { alert("Allow pop-ups to print the evaluation."); return; }
  win.document.open(); win.document.write(html); win.document.close();
}

const RATING_CHOICES: Array<{ value: ItemRating; label: string }> = [
  { value: "needs_improvement", label: "Needs improvement" },
  { value: "good", label: "Good" },
  { value: "exceptional", label: "Exceptional" },
];

function DispatchMetricsBlock({ metrics, readOnly, onChange, defs, title }: { metrics: DispatchMetrics; readOnly: boolean; onChange: (next: DispatchMetrics) => void; defs: MetricDef[]; title: string }) {
  const scored = scoreDispatchMetrics(metrics, defs);
  const set = (patch: Partial<DispatchMetrics>) => onChange({ ...metrics, ...patch });
  const num = (value: string) => value === "" ? null : Math.max(0, Math.round(Number(value)));
  const inputs: Record<string, React.ReactNode> = {
    incidents: <input type="number" min="0" inputMode="numeric" value={metrics.incidents ?? ""} readOnly={readOnly} placeholder="e.g. 196" onChange={(event) => set({ incidents: num(event.target.value) })}/>,
    calls: <input type="number" min="0" inputMode="numeric" value={metrics.calls ?? ""} readOnly={readOnly} placeholder="e.g. 559" onChange={(event) => set({ calls: num(event.target.value) })}/>,
    dispatchTime: <input value={metrics.dispatchTime} readOnly={readOnly} placeholder="m:ss — e.g. 4:07" onChange={(event) => set({ dispatchTime: event.target.value })}/>,
    startTime: <input value={metrics.startTime ?? ""} readOnly={readOnly} placeholder="m:ss — e.g. 2:01" onChange={(event) => set({ startTime: event.target.value })}/>,
    regTime1: <input value={metrics.regTime1 ?? ""} readOnly={readOnly} placeholder="mm:ss — e.g. 30:37" onChange={(event) => set({ regTime1: event.target.value })}/>,
    regTime2: <input value={metrics.regTime2 ?? ""} readOnly={readOnly} placeholder="h:mm — e.g. 1:34" onChange={(event) => set({ regTime2: event.target.value })}/>,
    vanOption: <input type="number" min="0" inputMode="numeric" value={metrics.vanOption ?? ""} readOnly={readOnly} placeholder="e.g. 11" onChange={(event) => set({ vanOption: num(event.target.value) })}/>,
    qcNotes: <input type="number" min="0" inputMode="numeric" value={metrics.qcNotes ?? ""} readOnly={readOnly} placeholder="e.g. 3" onChange={(event) => set({ qcNotes: num(event.target.value) })}/>,
    waitingTime: <input value={metrics.waitingTime ?? ""} readOnly={readOnly} placeholder="m:ss — e.g. 19:39" onChange={(event) => set({ waitingTime: event.target.value })}/>,
  };
  const hints: Record<string, string> = { incidents: isDispatcherTemplate({ name: title }) || title.startsWith("Dispatch") ? "Total incidents handled" : "Total incidents registered", calls: "Total calls handled", dispatchTime: "Average, minutes:seconds", waitingTime: "Average, minutes:seconds", startTime: "Average, minutes:seconds", regTime1: "Average, minutes:seconds", regTime2: "Average, hours:minutes", vanOption: "Total van option taken", qcNotes: "Total QC notes received" };
  return <section className="metrics-block">
    <div className="metrics-head"><div><strong>{title}</strong><small>Fill in the numbers from Pulse — the level and points are calculated automatically.</small></div>
      <div className="metrics-total"><small>Metric points</small><b>{scored.total}<em>/ {scored.max}</em></b></div></div>
    <div className="metrics-grid">{scored.results.map((result) => { const level = METRIC_LEVELS.find((item) => item.level === result.level); const rawTime = ["dispatchTime", "waitingTime", "startTime", "regTime1", "regTime2"].includes(result.def.key) ? String((metrics as Record<string, unknown>)[result.def.key] ?? "") : ""; const bad = rawTime.trim() !== "" && parseMinutes(rawTime) == null; return <div className={`metric-card${level ? ` lvl-${level.level}` : ""}`} key={result.def.key}>
      <div className="metric-top"><span className="metric-label">{result.def.label}</span><span className="metric-max">max {result.def.maxPoints} pts</span></div>
      <label className="metric-input">{inputs[result.def.key]}<span>{result.def.unit}</span></label>
      <small className={bad ? "metric-hint err" : "metric-hint"}>{bad ? (result.def.key === "regTime2" ? "Use hours:minutes, e.g. 1:34" : "Use minutes:seconds, e.g. 4:07") : hints[result.def.key]}</small>
      <div className="metric-result">{level ? <><span className={`metric-level tone-bg-${level.tone}`}>{result.label ?? level.label}</span><span className="metric-points"><b>{result.points}</b> pts</span></> : <span className="metric-empty">Waiting for input</span>}</div>
      <div className="metric-scale" aria-label="Grading bracket">{[...result.def.brackets].reverse().map((bracket) => <span key={bracket.level} className={result.level === bracket.level ? "on" : ""} title={`${bracket.text} → ${bracket.label ?? METRIC_LEVELS.find((item) => item.level === bracket.level)?.label}${bracket.points != null ? ` (${bracket.points} pts)` : ""}`}><i>{bracket.text}</i></span>)}</div>
    </div>; })}</div>
  </section>;
}

function EvaluationFormFields({ form, setForm, template, templates, readOnly, acknowledged }: { form: EvalFormData; setForm: (form: EvalFormData) => void; template: EvalTemplate | null; templates: EvalTemplate[]; readOnly: boolean; acknowledged: boolean }) {
  const set = (patch: Partial<EvalFormData>) => setForm({ ...form, ...patch });
  const setItem = (sectionKey: string, itemKey: string, patch: Partial<ItemAnswer>) => {
    const key = `${sectionKey}/${itemKey}`;
    const existing = form.items[key];
    set({ items: { ...form.items, [key]: { rating: patch.rating ?? existing?.rating ?? "", note: patch.note ?? existing?.note ?? "" } } });
  };
  const overall = computeOverallScore(template, form);
  const band = (template ? bandForScore(template.scoreBands, overall.score) : null);
  const allKeys = template ? template.sections.flatMap((section) => section.items.map((item) => `${section.key}/${item.key}`)) : [];
  const ratedCount = allKeys.filter((key) => form.items[key]?.rating).length;
  const fillGood = () => { const items = { ...form.items }; for (const key of allKeys) if (!items[key]?.rating) items[key] = { rating: "good", note: items[key]?.note ?? "" }; set({ items }); };
  if (!template) return <div className="eval-form"><div className="form-note"><CircleHelp size={16}/> No evaluation forms are set up yet. HR can add one in Settings → Evaluation forms.</div></div>;
  return <div className="eval-form">
    <div className="eval-form-title"><FileText size={15}/><strong>{template.name}</strong>{template.department && <span className="badge neutral">{template.department}</span>}<span className="eval-progress"><span className="kpi-progress"><i style={{ width: `${allKeys.length ? ratedCount / allKeys.length * 100 : 0}%` }}/></span><small>{ratedCount}/{allKeys.length} items rated</small>{!readOnly && ratedCount < allKeys.length && <button type="button" className="text-button" onClick={fillGood}>Mark remaining as Good</button>}</span></div>
    <div className="form-grid eval-header-grid">
      <Field label="Form template"><select value={template.id} disabled={readOnly || templates.length < 2} onChange={(event) => set({ templateId: event.target.value })}>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}{item.department ? ` · ${item.department}` : ""}{item.isActive ? "" : " (inactive)"}</option>)}</select></Field>
      <Field label="Period of evaluation"><input value={form.period} readOnly={readOnly} placeholder="e.g. November 2025" onChange={(event) => set({ period: event.target.value })}/><small className="field-help">Minimum 3 months for April and 9 months for October.</small></Field>
      <Field label="Employment date"><input type="date" value={form.employmentDate} readOnly={readOnly} onChange={(event) => set({ employmentDate: event.target.value })}/></Field>
      <Field label="Today's date"><input type="date" value={form.evaluationDate} readOnly={readOnly} onChange={(event) => set({ evaluationDate: event.target.value })}/></Field>
      <Field label="Supervisor / name and title" full><input value={form.supervisor} readOnly={readOnly} placeholder="Supervisor name and title" onChange={(event) => set({ supervisor: event.target.value })}/></Field>
    </div>
    <div className="eval-pulse">
      <Field label="Pulse — employee's average score"><input type="number" min="0" max="100" value={form.pulseScore ?? ""} readOnly={readOnly} placeholder="0 – 100" onChange={(event) => set({ pulseScore: event.target.value === "" ? null : Number(event.target.value) })}/></Field>
      <div className="overall-card"><div className="overall-main"><small>Overall evaluation score</small><b>{overall.score ?? "—"}</b>{band ? <RatingChip rating={band.rating}/> : <span className="badge neutral">No rating yet</span>}</div>
        <div className="overall-parts">{overall.parts.map((part) => <div className="overall-part" key={part.key}><span className="op-top"><span>{part.label}</span><em>{part.weight}%</em></span><span className="op-bar"><i style={{ width: `${part.value ?? 0}%` }}/></span><small>{part.value == null ? part.detail : `${Math.round(part.value)} · ${part.detail}`}</small></div>)}</div>
        <span className="eval-band-scale">Rating: {[...template.scoreBands].sort((a, b) => a.min - b.min).map((item) => `${item.min === 0 ? `≤${item.max}` : `${item.min}–${item.max}`} → ${item.rating}`).join("  ·  ")}</span></div>
    </div>
    {template && <DispatchMetricsBlock defs={metricDefsFor(template)} title={isDispatcherTemplate(template) ? "Dispatch performance metrics" : "Agent performance metrics"} metrics={{ ...EMPTY_METRICS, ...(form.metrics ?? {}) }} readOnly={readOnly} onChange={(metrics) => set({ metrics })}/>}
    {template.sections.map((section) => <section className="eval-block" key={section.key}>
      <div className="eval-block-head"><strong>{section.title}</strong><small>{section.items.length} items</small></div>
      <div className="eval-table-wrap"><table className="eval-table"><thead><tr><th>Item</th>{RATING_CHOICES.map((choice) => <th key={choice.value}>{choice.label}</th>)}<th>Notes</th></tr></thead><tbody>
        {section.items.map((item) => { const key = `${section.key}/${item.key}`; const answer = form.items[key] ?? { rating: "" as ItemRating, note: "" }; return <tr key={item.key}>
          <td className="eval-item">{item.label}</td>
          {RATING_CHOICES.map((choice) => <td className="eval-check" key={choice.value}><button type="button" aria-pressed={answer.rating === choice.value} aria-label={`${item.label}: ${choice.label}`} disabled={readOnly} className={`rate-pill ${choice.value}${answer.rating === choice.value ? " on" : ""}`} onClick={() => setItem(section.key, item.key, { rating: answer.rating === choice.value ? "" : choice.value })}>{answer.rating === choice.value ? <Check size={14}/> : null}</button></td>)}
          <td><input className="eval-note" value={answer.note} readOnly={readOnly} placeholder="—" onChange={(event) => setItem(section.key, item.key, { note: event.target.value })}/></td>
        </tr>; })}
      </tbody></table></div>
    </section>)}
    <Field label="Supervisor feedback — support to be provided" full><textarea value={form.supervisorSupport} readOnly={readOnly} placeholder="Training, equipment, observation, procedures, coaching…" onChange={(event) => set({ supervisorSupport: event.target.value })}/></Field>
    <Field label="Employee feedback" full><textarea value={form.employeeFeedback} readOnly={readOnly} placeholder="Feedback shared by the employee during the evaluation" onChange={(event) => set({ employeeFeedback: event.target.value })}/></Field>
    <Field label="Meeting notes" full><textarea className="notes-area" value={form.meetingNotes ?? ""} readOnly={readOnly} placeholder="Summary of what was discussed: agreements, follow-up actions, deadlines…" onChange={(event) => set({ meetingNotes: event.target.value })}/></Field>
    <div className="eval-ack"><CheckCircle2 size={15}/><span>{acknowledged ? "Acknowledged — the employee has signed off on this evaluation." : "Acknowledgement — the employee signs off from their own account once this evaluation is completed."}</span></div>
  </div>;
}

const uid = () => Math.random().toString(36).slice(2, 9);
const NEW_BANDS: ScoreBand[] = [
  { min: 0, max: 59, rating: 1, label: "Needs attention" },
      { min: 60, max: 69, rating: 2, label: "Bad" },
      { min: 70, max: 80, rating: 3, label: "Good" },
      { min: 81, max: 90, rating: 4, label: "Very good" },
      { min: 91, max: 100, rating: 5, label: "Exceptional" },
];

function TemplateForm({ template, busy, onCancel, onSave }: { template: EvalTemplate | null; busy: boolean; onCancel: () => void; onSave: (p: Record<string, unknown>) => void }) {
  const [name, setName] = useState(template?.name ?? "");
  const [department, setDepartment] = useState(template?.department ?? "");
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [bands, setBands] = useState<ScoreBand[]>(template?.scoreBands?.length ? template.scoreBands.map((band) => ({ ...band })) : NEW_BANDS.map((band) => ({ ...band })));
  const [sections, setSections] = useState<FormSection[]>(template?.sections?.length ? template.sections.map((section) => ({ ...section, items: section.items.map((item) => ({ ...item })) })) : [{ key: `s-${uid()}`, title: "Performance Items", items: [{ key: `i-${uid()}`, label: "" }] }]);
  const updateBand = (index: number, patch: Partial<ScoreBand>) => setBands(bands.map((band, i) => (i === index ? { ...band, ...patch } : band)));
  const updateSection = (index: number, patch: Partial<FormSection>) => setSections(sections.map((section, i) => (i === index ? { ...section, ...patch } : section)));
  const updateItem = (sectionIndex: number, itemIndex: number, label: string) => updateSection(sectionIndex, { items: sections[sectionIndex].items.map((item, i) => (i === itemIndex ? { ...item, label } : item)) });
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({ id: template?.id, name, department, isActive, scoreBands: bands.map((band, index) => ({ ...band, rating: index + 1 })), sections: sections.map((section) => ({ ...section, items: section.items.filter((item) => item.label.trim()) })).filter((section) => section.items.length) });
  };
  return <form className="form-body" onSubmit={submit}>
    <div className="form-grid">
      <Field label="Form name *"><input required value={name} placeholder="e.g. Agent performance evaluation" onChange={(event) => setName(event.target.value)}/></Field>
      <Field label="Used for team"><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">All teams</option><option value="Agent">Agents</option><option value="Dispatcher">Dispatchers</option></select><small className="field-help">Evaluations for this team use this form automatically.</small></Field>
      <label className="toggle-field"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)}/><span>Form is active — can be used for new evaluations</span></label>
    </div>
    <div className="tpl-subtitle">Overall score → achievement rating</div>
    <div className="tpl-bands">{bands.map((band, index) => <div className="tpl-band-row" key={index}>
      <span className="tpl-band-rating">{index + 1}</span>
      <input type="number" min="0" max="100" value={band.min} onChange={(event) => updateBand(index, { min: Number(event.target.value) })}/>
      <span className="tpl-band-sep">to</span>
      <input type="number" min="0" max="100" value={band.max} onChange={(event) => updateBand(index, { max: Number(event.target.value) })}/>
      <input className="tpl-band-label" value={band.label} placeholder="Rating label" onChange={(event) => updateBand(index, { label: event.target.value })}/>
      <button type="button" className="button ghost small tpl-remove" disabled={bands.length <= 1} onClick={() => setBands(bands.filter((_, i) => i !== index))} aria-label="Remove band"><X size={13}/></button>
    </div>)}</div>
    <button type="button" className="button secondary small" disabled={bands.length >= 8} onClick={() => setBands([...bands, { min: 0, max: 0, rating: bands.length + 1, label: "" }])}><Plus size={13}/> Add score band</button>
    <div className="tpl-subtitle">Sections & criteria</div>
    {sections.map((section, sectionIndex) => <section className="tpl-section" key={section.key}>
      <div className="tpl-section-head"><input value={section.title} placeholder="Section title" onChange={(event) => updateSection(sectionIndex, { title: event.target.value })}/><button type="button" className="button ghost small tpl-remove" onClick={() => setSections(sections.filter((_, i) => i !== sectionIndex))} aria-label="Remove section"><X size={14}/></button></div>
      {section.items.map((item, itemIndex) => <div className="tpl-item" key={item.key}><input value={item.label} placeholder="Criterion name" onChange={(event) => updateItem(sectionIndex, itemIndex, event.target.value)}/><button type="button" className="button ghost small tpl-remove" onClick={() => updateSection(sectionIndex, { items: section.items.filter((_, i) => i !== itemIndex) })} aria-label="Remove criterion"><X size={13}/></button></div>)}
      <button type="button" className="button ghost small" onClick={() => updateSection(sectionIndex, { items: [...section.items, { key: `i-${uid()}`, label: "" }] })}><Plus size={13}/> Add criterion</button>
    </section>)}
    <button type="button" className="button secondary small" onClick={() => setSections([...sections, { key: `s-${uid()}`, title: "", items: [{ key: `i-${uid()}`, label: "" }] }])}><Plus size={13}/> Add section</button>
    <div className="form-note"><CircleHelp size={16}/> Evaluations already saved keep their original answers. Renaming a criterion only changes its label for new and existing records.</div>
    <div className="form-footer"><span className="form-hint">Changes apply the next time an evaluation is opened.</span><div><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : template ? "Save form" : "Add form"}</button></div></div>
  </form>;
}

function GoalForm({ goal, employees, cycle, isEmployee, busy, onCancel, onSave }: { goal: Goal | null; employees: Employee[]; cycle: Cycle; isEmployee: boolean; busy: boolean; onCancel: () => void; onSave: (p: Record<string, unknown>) => void }) {
  return <form className="form-body" onSubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); onSave({ id: goal?.id, employeeId: f.get("employeeId"), cycleId: cycle.id, title: f.get("title"), description: f.get("description"), successMeasure: f.get("successMeasure"), dueDate: f.get("dueDate"), status: f.get("status") }); }}><div className="form-grid"><Field label="Employee *"><select name="employeeId" defaultValue={goal?.employeeId || ""} disabled={isEmployee} required><option value="" disabled>Select employee</option>{employees.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select>{isEmployee && goal && <input type="hidden" name="employeeId" value={goal.employeeId}/>}</Field><Field label="Goal title *"><input name="title" required defaultValue={goal?.title} readOnly={isEmployee} placeholder="Specific outcome to achieve"/></Field><Field label="Description" full><textarea name="description" defaultValue={goal?.description} readOnly={isEmployee} placeholder="What actions will move this forward?"/></Field><Field label="How success will be measured" full><input name="successMeasure" defaultValue={goal?.successMeasure} readOnly={isEmployee} placeholder="A clear result or measure"/></Field><Field label="Target date"><input type="date" name="dueDate" defaultValue={dateInput(goal?.dueDate)} readOnly={isEmployee}/></Field><Field label="Progress"><select name="status" defaultValue={goal?.status || "not_started"}><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Needs support</option><option value="completed">Completed</option></select></Field></div><div className="form-footer"><span className="form-hint">Goals can be updated during check-ins.</span><div><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : goal ? "Save goal" : "Add goal"}</button></div></div></form>;
}

function AccessForm({ employees, busy, onCancel, onSave }: { employees: Employee[]; busy: boolean; onCancel: () => void; onSave: (p: Record<string, unknown>) => void }) {
  const [role, setRole] = useState<Role>("employee");
  return <form className="form-body" onSubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); onSave({ email: f.get("email"), role, employeeId: role === "hr_admin" ? "" : f.get("employeeId") }); }}><div className="form-grid"><Field label="Work email *"><input type="email" name="email" required placeholder="colleague@forensys.com"/></Field><Field label="Role *"><select value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="employee">Employee</option><option value="manager">Manager</option><option value="hr_admin">HR administrator</option></select></Field>{role !== "hr_admin" && <Field label="Link to employee profile *" full><select name="employeeId" required defaultValue=""><option value="" disabled>Select an employee</option>{employees.map((person) => <option key={person.id} value={person.id}>{person.fullName} · {person.department}</option>)}</select></Field>}</div><div className="form-note"><LockKeyhole size={16}/> This prepares the app invitation. The person must also be granted access to the private Site.</div><div className="form-footer"><span className="form-hint">They will link their account using this email.</span><div><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Prepare invitation"}</button></div></div></form>;
}

function ProfilePanel({ employee, employees, reviews, goals, isAdmin, isSelf, onEdit, onReview, onGoal, onClose }: { employee: Employee; employees: Employee[]; reviews: Review[]; goals: Goal[]; isAdmin: boolean; isSelf: boolean; onEdit: () => void; onReview: (review?: Review | null, employee?: Employee | null, stage?: Stage) => void; onGoal: (goal?: Goal) => void; onClose: () => void }) {
  const manager = employees.find((person) => person.id === employee.managerId);
  return <div className="profile-panel"><div className="profile-summary"><span className="avatar profile-avatar">{initials(employee.fullName)}</span><div><h3>{employee.fullName}</h3><p>{employee.jobTitle} · {employee.department}</p><small>{employee.email || "No work email added"}</small></div>{!employee.isActive && <span className="badge neutral">Inactive</span>}</div><div className="profile-facts"><div><small>REPORTS TO</small><b>{manager?.fullName || "—"}</b></div><div><small>REVIEW STAGES</small><b>{reviews.filter((review) => review.status === "completed").length} of 3 complete</b></div><div><small>GOALS</small><b>{goals.length} active cycle</b></div></div>
    <div className="profile-section-title"><h3>Review history</h3>{isAdmin && <button className="button secondary small" onClick={() => onEdit()}><Pencil size={14}/> Edit profile</button>}</div><div className="profile-timeline">{stageOrder.map((stage) => { const review = reviews.find((item) => item.stage === stage); return <div className="timeline-row" key={stage}><span className={`timeline-dot ${review?.status === "completed" ? "complete" : ""}`}/><div><strong>{stageLabel[stage]}</strong><small>{review ? `${statusLabel[review.status]} · ${dateLabel(review.scheduledDate)}` : "Not scheduled"}</small></div>{review ? <button className="button ghost small" onClick={() => onReview(review, employee)}>Open</button> : !isSelf && <button className="button ghost small" onClick={() => onReview(null, employee, stage)}>Schedule</button>}</div>; })}</div>
    <div className="profile-section-title"><h3>Goals</h3>{!isSelf && <button className="button secondary small" onClick={() => onGoal()}><Plus size={14}/> Add goal</button>}</div>{goals.length ? <div className="profile-goals">{goals.map((goal) => <div key={goal.id}><b>{goal.title}</b><span className={`badge ${statusClass[goal.status]}`}>{statusLabel[goal.status]}</span></div>)}</div> : <p className="muted-pad">No goals for this cycle.</p>}
    <div className="profile-footer"><button className="button secondary" onClick={onClose}>Close</button></div></div>;
}

function CycleForm({ cycle, busy, onCancel, onSave }: { cycle: Cycle; busy: boolean; onCancel: () => void; onSave: (p: Record<string, unknown>) => void }) { return <form className="form-body" onSubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); onSave({ year: Number(f.get("year")), name: f.get("name") }); }}><div className="form-grid"><Field label="Review year *"><input name="year" type="number" min="2000" max="2100" required defaultValue={cycle.year}/></Field><Field label="Cycle name *"><input name="name" required defaultValue={cycle.name}/></Field></div><div className="form-note"><CircleHelp size={16}/> Existing review records stay with their original cycle. Only one cycle is active at a time.</div><div className="form-footer"><span className="form-hint">You can export cycle summaries from Settings.</span><div><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save cycle"}</button></div></div></form>; }

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) { return <label className={`field ${full ? "full" : ""}`}><span>{label}</span>{children}</label>; }
