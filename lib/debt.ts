// The team's code debt the agents see and leave alone: code that breaks a rule
// but that the ticket does not touch (build.json and review.json, "debt"). The
// board keeps one register of it for every ticket, one point per repo, file and
// rule, with the tickets that saw it; a person turns points into a Jira ticket,
// or dismisses them. A blocker (security, data loss) is also a warning in the
// ticket that saw it.

export type Severity = "blocker" | "major" | "minor"
// "debt": code that breaks a rule; "improvement": a better way the team's tools could offer
// (a helper core-lib lacks, written by hand in a service for now).
export type DebtKind = "debt" | "improvement"
export type DebtItem = { kind: DebtKind; rule: string | null; repo: string; file: string; line: number | null; note: string; severity: Severity }
export type DebtEntry = DebtItem & {
  key: string
  tickets: string[]
  firstSeen: number
  lastSeen: number
  status: "open" | "ticketed" | "dismissed"
  jira?: string | null
}

const SEVERITIES: Severity[] = ["blocker", "major", "minor"]
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")

export const debtIn = (v: unknown): DebtItem[] =>
  (Array.isArray(v) ? v : []).flatMap((d: any) => {
    const repo = text(d?.repo), file = text(d?.file), note = text(d?.note)
    if (!repo || !file || !note) return []
    return [{
      kind: d.kind === "improvement" ? ("improvement" as const) : ("debt" as const), rule: text(d.rule) || null, repo, file, line: Number.isInteger(d.line) ? d.line : null, note,
      severity: SEVERITIES.includes(d.severity) ? d.severity : "minor",
    }]
  })

// One point per repo, file and rule; a point with no rule is told apart by what it says.
export const keyOf = (d: Pick<DebtItem, "kind" | "repo" | "file" | "rule" | "note">) =>
  [d.kind === "improvement" ? "improvement" : "debt", d.repo, d.file, d.rule ?? d.note.toLowerCase().replace(/\s+/g, " ")].join("|")

const worst = (a: Severity, b: Severity) => (SEVERITIES.indexOf(a) <= SEVERITIES.indexOf(b) ? a : b)

// The register with what a ticket saw: new points added, old ones seen again by it.
export function merged(register: DebtEntry[], items: DebtItem[], ticket: string, now: number): DebtEntry[] {
  const byKey = new Map(register.map(e => [e.key, { ...e, tickets: [...e.tickets] }]))
  for (const item of items) {
    const key = keyOf(item)
    const was = byKey.get(key)
    if (!was) {
      byKey.set(key, { ...item, key, tickets: [ticket], firstSeen: now, lastSeen: now, status: "open" })
      continue
    }
    byKey.set(key, { ...was, severity: worst(was.severity, item.severity), lastSeen: now, tickets: was.tickets.includes(ticket) ? was.tickets : [...was.tickets, ticket] })
  }
  return [...byKey.values()]
}

// One Jira ticket for the points chosen: what to fix, where, and which tickets saw it.
export function ticketOf(points: DebtEntry[]) {
  const repos = [...new Set(points.map(p => p.repo))]
  const rules = [...new Set(points.map(p => p.rule).filter(Boolean))]
  const what = points.every(p => p.kind === "improvement") ? "Mejora" : "Deuda"
  const summary = `${what}: ${repos.join(", ")}${rules.length ? `, ${rules.join(", ")}` : ""} (${points.length} punto${points.length === 1 ? "" : "s"})`
  const lines = points.map(p => `- \`${p.file}${p.line ? `:${p.line}` : ""}\` (${p.severity}${p.rule ? `, ${p.rule}` : ""}): ${p.note.replace(/\.$/, "")}. Visto en ${p.tickets.join(", ")}`)
  const description = [
    what === "Mejora"
      ? "Mejoras que propusieron los agentes del pipeline: algo que las herramientas del equipo (core-lib, componentes) podrían ofrecer y hoy se hace a mano."
      : "Deuda técnica que los agentes del pipeline vieron y no tocaron, porque su ticket no la pedía.",
    "",
    ...repos.flatMap(r => [`${r}:`, ...lines.filter((_, i) => points[i]!.repo === r), ""]),
    "Las reglas están en deale-context (context/03-engineering/rules/) y en .claude/rules del repo.",
  ].join("\n")
  return { summary: summary.slice(0, 250), description }
}
