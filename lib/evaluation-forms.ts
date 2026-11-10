// Shared types and starter content for the structured evaluation forms
// (digitized from the ForenSys "Agent Dept Performance Evaluation Form
// Twice Yearly" and the Dispatcher layout used in Nov 2025).

export type ScoreBand = { min: number; max: number; rating: number; label: string };
export type FormItem = { key: string; label: string };
export type FormSection = { key: string; title: string; items: FormItem[] };
export type ItemRating = "" | "needs_improvement" | "good" | "exceptional";
export type ItemAnswer = { rating: ItemRating; note: string };
export type EvalFormData = {
  templateId: string | null;
  templateName: string;
  employmentDate: string;
  period: string;
  evaluationDate: string;
  supervisor: string;
  pulseScore: number | null;
  items: Record<string, ItemAnswer>;
  supervisorSupport: string;
  employeeFeedback: string;
  meetingNotes?: string;
  metrics?: DispatchMetrics;
  overallScore?: number | null;
};
export type EvalTemplate = {
  id: string;
  name: string;
  department: string;
  isActive: boolean;
  scoreBands: ScoreBand[];
  sections: FormSection[];
};

export const EMPTY_FORM_DATA: EvalFormData = {
  templateId: null,
  templateName: "",
  employmentDate: "",
  period: "",
  evaluationDate: "",
  supervisor: "",
  pulseScore: null,
  items: {},
  supervisorSupport: "",
  employeeFeedback: "",
  meetingNotes: "",
};

const VALUES_SECTION: FormSection = {
  key: "values",
  title: "ForenSys' Values (Pocket Card)",
  items: [
    { key: "priority-first", label: "1. Priority First" },
    { key: "integrity", label: "2. Integrity" },
    { key: "courtesy", label: "3. Courtesy" },
    { key: "respect", label: "4. Respect" },
    { key: "accountability", label: "5. Accountability" },
    { key: "safety", label: "6. Safety" },
  ],
};

export const DEFAULT_EVALUATION_TEMPLATES: Array<{
  id: string;
  name: string;
  department: string;
  scoreBands: ScoreBand[];
  sections: FormSection[];
}> = [
  {
    id: "tpl_agent_performance_2025",
    name: "Agent performance evaluation",
    department: "Agent",
    scoreBands: [
      { min: 0, max: 59, rating: 1, label: "Unacceptable" },
      { min: 60, max: 74, rating: 2, label: "Needs Improvement" },
      { min: 75, max: 86, rating: 3, label: "Good" },
      { min: 87, max: 96, rating: 4, label: "Very Good / Above Average" },
      { min: 97, max: 100, rating: 5, label: "Exceptional / Outstanding" },
    ],
    sections: [
      {
        key: "performance",
        title: "Performance Items",
        items: [
          { key: "start-time", label: "Start Time" },
          { key: "transit-time", label: "Transit Time" },
          { key: "registration-time", label: "Registration Time" },
          { key: "submission-time", label: "Submission Time" },
          { key: "data-collection-time", label: "Data Collection Time" },
          { key: "quality-documentation", label: "Quality Documentation" },
          { key: "agent-fail", label: "Agent Fail" },
          { key: "off-procedure", label: "Off Procedure" },
          { key: "communication-dispatch", label: "Communication w/ Dispatch" },
          { key: "clients-feedback", label: "Clients Feedback" },
        ],
      },
      {
        key: "attitude",
        title: "Attitude – HR Info",
        items: [
          { key: "lateness", label: "Lateness" },
          { key: "rudeness", label: "Rudeness" },
          { key: "service-to-clients", label: "Service to Clients" },
          { key: "uniform-appearance", label: "Uniform & Appearance" },
          { key: "off-procedure", label: "Off Procedure" },
          { key: "van-options", label: "Van Options" },
          { key: "monthly-meetings", label: "Monthly Meetings" },
          { key: "refreshment-trainings", label: "Refreshment Trainings" },
          { key: "equipment-mistreatment", label: "Equipment Mistreatment" },
        ],
      },
      VALUES_SECTION,
    ],
  },
  {
    id: "tpl_dispatcher_performance_2025",
    name: "Dispatcher performance evaluation",
    department: "Dispatcher",
    scoreBands: [
      { min: 0, max: 59, rating: 1, label: "Unacceptable" },
      { min: 60, max: 71, rating: 2, label: "Needs Improvement" },
      { min: 72, max: 83, rating: 3, label: "Good" },
      { min: 84, max: 92, rating: 4, label: "Very Good / Above Average" },
      { min: 93, max: 100, rating: 5, label: "Exceptional / Outstanding" },
    ],
    sections: [
      {
        key: "performance",
        title: "Performance Items",
        items: [
          { key: "dispatch-time", label: "Dispatch Time" },
          { key: "shift-change-form", label: "Shift Change Form" },
          { key: "situation-evaluation", label: "Situation Evaluation" },
          { key: "in-office-evaluation", label: "In-Office Evaluation" },
          { key: "handle-calls-volume", label: "Handle Calls Volume" },
          { key: "communication-agents", label: "Communication w/ Agents" },
          { key: "clients-feedback", label: "Clients Feedback" },
          { key: "equipment-use", label: "Equipment Use" },
        ],
      },
      {
        key: "attitude",
        title: "Attitude – HR Info",
        items: [
          { key: "lateness", label: "Lateness" },
          { key: "rudeness", label: "Rudeness" },
          { key: "service-to-clients", label: "Service to Clients" },
          { key: "off-procedure", label: "Off Procedure" },
          { key: "monthly-meetings", label: "Monthly Meetings" },
          { key: "refreshment-trainings", label: "Refreshment Trainings" },
          { key: "equipment-mistreatment", label: "Equipment Mistreatment" },
        ],
      },
      VALUES_SECTION,
    ],
  },
];

// Pulse averages can be decimals (e.g. 71.5). Pick the highest band whose
// minimum the score reaches, so no score falls between two bands.
export function bandForScore(bands: ScoreBand[], score: number | null | undefined): ScoreBand | null {
  if (score == null || Number.isNaN(score)) return null;
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  let match: ScoreBand | null = null;
  for (const band of sorted) if (score >= band.min) match = band;
  return match;
}

export const RATING_TONE: Record<number, string> = { 1: "rose", 2: "amber", 3: "neutral", 4: "green", 5: "green" };

// ---------------------------------------------------------------------------
// Dispatcher performance metrics — scored automatically from the numbers.
// Levels: 5 Exceptional · 4 Good · 3 Normal · 2 Bad · 1 Needs attention
// Every metric uses the same points per level: 10 · 8 · 6 · 4 · 2.
// ---------------------------------------------------------------------------
export type DispatchMetrics = {
  incidents: number | null;        // total incidents handled
  calls: number | null;            // total calls handled
  dispatchTime: string;            // average dispatch time "m:ss"
  waitingTime: string;             // average waiting time "m:ss"
  longWaitCount?: number | null;   // legacy (older evaluations)
  startTime?: string;              // agent: average start time "m:ss"
  regTime1?: string;               // agent: average registration time part 1 "mm:ss"
  regTime2?: string;               // agent: average registration time final "h:mm"
  vanOption?: number | null;       // agent: van option shifts taken
  qcNotes?: number | null;         // agent: quality control notes received
};
export const EMPTY_METRICS: DispatchMetrics = { incidents: null, calls: null, dispatchTime: "", waitingTime: "" };

export const METRIC_LEVELS = [
  { level: 5, label: "Exceptional", tone: "green" },
  { level: 4, label: "Good", tone: "green" },
  { level: 3, label: "Normal", tone: "neutral" },
  { level: 2, label: "Bad", tone: "amber" },
  { level: 1, label: "Needs attention", tone: "rose" },
] as const;

type Bracket = { level: number; text: string; test: (v: number) => boolean; points?: number; label?: string };
export type MetricDef = { key: "incidents" | "calls" | "dispatchTime" | "waitingTime" | "startTime" | "regTime1" | "regTime2" | "vanOption" | "qcNotes"; label: string; unit: string; maxPoints: number; brackets: Bracket[] };

export const DISPATCH_METRICS: MetricDef[] = [
  { key: "incidents", label: "Incidents handled", unit: "incidents", maxPoints: 10, brackets: [
    { level: 5, text: "201 or more", test: (v) => v >= 201 }, { level: 4, text: "151 – 200", test: (v) => v >= 151 },
    { level: 3, text: "101 – 150", test: (v) => v >= 101 }, { level: 2, text: "51 – 100", test: (v) => v >= 51 }, { level: 1, text: "0 – 50", test: () => true }] },
  { key: "calls", label: "Calls handled", unit: "calls", maxPoints: 10, brackets: [
    { level: 5, text: "501 or more", test: (v) => v >= 501 }, { level: 4, text: "451 – 500", test: (v) => v >= 451 },
    { level: 3, text: "400 – 450", test: (v) => v >= 400 }, { level: 2, text: "350 – 399", test: (v) => v >= 350 }, { level: 1, text: "0 – 349", test: () => true }] },
  { key: "dispatchTime", label: "Dispatch time", unit: "min", maxPoints: 10, brackets: [
    { level: 5, text: "0:00 – 3:00", test: (s) => s <= 180 }, { level: 4, text: "3:01 – 4:00", test: (s) => s <= 240 },
    { level: 3, text: "4:01 – 4:30", test: (s) => s <= 270 }, { level: 2, text: "4:31 – 5:00", test: (s) => s <= 300 }, { level: 1, text: "5:01 or more", test: () => true }] },
  { key: "waitingTime", label: "Waiting time", unit: "min", maxPoints: 10, brackets: [
    { level: 5, text: "0:00 – 18:00", test: (s) => s <= 1080 }, { level: 4, text: "18:01 – 20:00", test: (s) => s <= 1200 },
    { level: 3, text: "20:01 – 22:00", test: (s) => s <= 1320 }, { level: 2, text: "22:01 – 25:00", test: (s) => s <= 1500 }, { level: 1, text: "25:01 or more", test: () => true }] },
];

/** Agent metrics (Pulse "Incidents Registered", monthly total). More items can be added here. */
export const AGENT_METRICS: MetricDef[] = [
  { key: "incidents", label: "Incidents registered", unit: "incidents", maxPoints: 10, brackets: [
    { level: 5, text: "61 or more", test: (v) => v >= 61 }, { level: 4, text: "51 – 60", test: (v) => v >= 51 },
    { level: 3, text: "41 – 50", test: (v) => v >= 41 }, { level: 2, text: "21 – 40", test: (v) => v >= 21 }, { level: 1, text: "0 – 20", test: () => true }] },
  { key: "startTime", label: "Agent start time", unit: "min", maxPoints: 10, brackets: [
    { level: 5, label: "Good", points: 10, text: "0:00 – 2:30", test: (s) => s <= 150 },
    { level: 3, label: "Average", points: 5, text: "2:31 – 3:30", test: (s) => s <= 210 },
    { level: 1, label: "Bad", points: 0, text: "3:31 or more", test: () => true }] },
  { key: "regTime1", label: "Registration time (part 1)", unit: "min", maxPoints: 10, brackets: [
    { level: 5, label: "Great", points: 10, text: "0 – 35:00", test: (s) => s <= 2100 },
    { level: 3, label: "Average", points: 5, text: "35:01 – 40:00", test: (s) => s <= 2400 },
    { level: 1, label: "Bad", points: 0, text: "40:01 or more", test: () => true }] },
  { key: "regTime2", label: "Registration time final (part 2)", unit: "hrs", maxPoints: 10, brackets: [
    { level: 5, label: "Good", points: 10, text: "0:00 – 2:59", test: (m) => m <= 179 },
    { level: 3, label: "Average", points: 5, text: "3:00 – 3:59", test: (m) => m <= 239 },
    { level: 1, label: "Bad", points: 0, text: "4:00 or more", test: () => true }] },
  { key: "vanOption", label: "Van option shifts", unit: "shifts", maxPoints: 5, brackets: [
    { level: 5, label: "Good", points: 5, text: "11 or more", test: (v) => v >= 11 },
    { level: 3, label: "Average", points: 3, text: "6 – 10", test: (v) => v >= 6 },
    { level: 1, label: "Bad", points: 0, text: "0 – 5", test: () => true }] },
  // Bracket not yet confirmed from Pulse — fewer QC notes is better.
  { key: "qcNotes", label: "Quality control notes", unit: "notes", maxPoints: 10, brackets: [
    { level: 5, label: "Good", points: 10, text: "0 – 5", test: (v) => v <= 5 },
    { level: 3, label: "Average", points: 5, text: "6 – 10", test: (v) => v <= 10 },
    { level: 1, label: "Bad", points: 0, text: "11 or more", test: () => true }] },
];
export const metricDefsFor = (template: { department?: string | null; name?: string } | null | undefined) => isDispatcherTemplate(template) ? DISPATCH_METRICS : AGENT_METRICS;

/** "4:07", "4.07" or "4" → seconds. */
export function parseMinutes(value: string): number | null {
  const v = (value || "").trim().replace(",", ".");
  if (!v) return null;
  const m = v.match(/^(\d{1,3})(?:[:.](\d{1,2}))?$/);
  if (!m) return null;
  const sec = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  if (sec > 59) return null;
  return Number(m[1]) * 60 + sec;
}

export type MetricResult = { def: MetricDef; value: number | null; display: string; level: number | null; points: number | null; bracket: string; label?: string };
export function scoreDispatchMetrics(metrics: DispatchMetrics | undefined | null, defs: MetricDef[] = DISPATCH_METRICS) {
  const m = { ...EMPTY_METRICS, ...(metrics ?? {}) };
  const waitSecs = parseMinutes(m.waitingTime ?? "");
  const secs = parseMinutes(m.dispatchTime);
  const values: Record<string, { value: number | null; display: string }> = {
    incidents: { value: m.incidents, display: m.incidents == null ? "—" : String(m.incidents) },
    calls: { value: m.calls, display: m.calls == null ? "—" : String(m.calls) },
    dispatchTime: { value: secs, display: secs == null ? "—" : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")} min` },
    startTime: (() => { const v = parseMinutes(m.startTime ?? ""); return { value: v, display: v == null ? "—" : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")} min` }; })(),
    regTime1: (() => { const v = parseMinutes(m.regTime1 ?? ""); return { value: v, display: v == null ? "—" : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")} min` }; })(),
    regTime2: (() => { const v = parseMinutes(m.regTime2 ?? ""); return { value: v, display: v == null ? "—" : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")} hrs` }; })(),
    qcNotes: { value: m.qcNotes ?? null, display: m.qcNotes == null ? "—" : String(m.qcNotes) },
    vanOption: { value: m.vanOption ?? null, display: m.vanOption == null ? "—" : String(m.vanOption) },
    waitingTime: { value: waitSecs, display: waitSecs == null ? "—" : `${Math.floor(waitSecs / 60)}:${String(waitSecs % 60).padStart(2, "0")} min` },
  };
  const results: MetricResult[] = defs.map((def) => {
    const { value, display } = values[def.key];
    if (value == null) return { def, value, display, level: null, points: null, bracket: "" };
    const hit = def.brackets.find((b) => b.test(value))!;
    return { def, value, display, level: hit.level, points: hit.points ?? Math.round(hit.level / 5 * def.maxPoints), bracket: hit.text, label: hit.label };
  });
  const scored = results.filter((r) => r.points != null);
  const total = scored.reduce((sum, r) => sum + (r.points ?? 0), 0);
  const max = defs.reduce((sum, d) => sum + d.maxPoints, 0);
  return { results, total, max, complete: scored.length === results.length };
}
export function isDispatcherTemplate(template: { department?: string | null; name?: string } | null | undefined) {
  return Boolean(template && `${template.department ?? ""} ${template.name ?? ""}`.toLowerCase().includes("dispatch"));
}

// ---------------------------------------------------------------------------
// Overall evaluation score (0–100) — combines the whole evaluation.
// Weights per form type; a part with no input is left out and the rest re-weighted.
// ---------------------------------------------------------------------------
export const ITEM_VALUE: Record<string, number> = { exceptional: 100, good: 80, needs_improvement: 40 };
// Matches 2026_OP_Stats_per_Employee.xlsx: the rating is the average monthly Pulse score; metrics and items are shown for context only.
export const SCORE_WEIGHTS = { dispatcher: { pulse: 100, metrics: 0, items: 0 }, other: { pulse: 100, metrics: 0, items: 0 } };

/** Bonus rate as in the Overview sheet: >=80 -> 85%, >=70 -> 75%, >=65 -> 50%, else 0. Hired in the evaluation year -> x 0.75. */
export function bonusRateFor(score: number | null | undefined, employmentDate?: string, evaluationDate?: string): { rate: number; base: number; newHire: boolean } | null {
  if (score == null || !Number.isFinite(score)) return null;
  const base = score >= 80 ? 0.85 : score >= 70 ? 0.75 : score >= 65 ? 0.5 : 0;
  const evalYear = (evaluationDate || new Date().toISOString()).slice(0, 4);
  const newHire = Boolean(employmentDate && employmentDate.slice(0, 4) === evalYear);
  return { rate: Math.round(base * (newHire ? 0.75 : 1) * 10000) / 10000, base, newHire };
}
export const pct = (n: number) => `${Math.round(n * 10000) / 100}%`;

export type ScorePart = { key: "pulse" | "metrics" | "items"; label: string; weight: number; value: number | null; detail: string };
export function computeOverallScore(template: { sections: FormSection[]; department?: string | null; name?: string } | null | undefined, form: Pick<EvalFormData, "pulseScore" | "items" | "metrics">) {
  const dispatcher = isDispatcherTemplate(template as { department?: string | null; name?: string });
  const w = dispatcher ? SCORE_WEIGHTS.dispatcher : SCORE_WEIGHTS.other;
  const keys = (template?.sections ?? []).flatMap((section) => section.items.map((item) => `${section.key}/${item.key}`));
  const rated = keys.map((key) => form.items?.[key]?.rating).filter((rating): rating is Exclude<ItemRating, ""> => Boolean(rating));
  const itemValue = rated.length ? rated.reduce((sum, rating) => sum + (ITEM_VALUE[rating] ?? 0), 0) / rated.length : null;
  const m = scoreDispatchMetrics(form.metrics);
  const scoredMetrics = m.results.filter((r) => r.points != null);
  const metricValue = scoredMetrics.length ? scoredMetrics.reduce((sum, r) => sum + (r.points ?? 0), 0) / scoredMetrics.reduce((sum, r) => sum + r.def.maxPoints, 0) * 100 : null;
  const parts: ScorePart[] = [
    { key: "pulse", label: "Pulse score", weight: w.pulse, value: form.pulseScore ?? null, detail: form.pulseScore == null ? "Not entered" : `${form.pulseScore} / 100` },
    ...(dispatcher ? [{ key: "metrics" as const, label: "Dispatch metrics", weight: w.metrics, value: metricValue, detail: scoredMetrics.length ? `${m.total} / ${m.max} points` : "Not entered" }] : []),
    { key: "items", label: "Item ratings", weight: w.items, value: itemValue, detail: rated.length ? `${rated.length} of ${keys.length} items rated` : "No items rated" },
  ];
  const used = parts.filter((part) => part.value != null && part.weight > 0);
  const totalWeight = used.reduce((sum, part) => sum + part.weight, 0);
  const score = totalWeight ? Math.round(used.reduce((sum, part) => sum + (part.value as number) * part.weight, 0) / totalWeight * 10) / 10 : null;
  return { score, parts };
}
