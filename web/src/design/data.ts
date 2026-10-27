// Made-up sessions for the design system page: no real names.

export type State = "asking" | "permission" | "review" | "working" | "pending" | "parked" | "done"

export type Session = {
  id: string
  title: string
  repo: string
  hue: number
  state: State
  age: string
  context: string
  lastPrompt?: string
  prs?: { number: number; checks: "pass" | "fail" | "pending" }[]
  tasks?: { done: number; total: number }
  usage?: number
  unread?: boolean
  choices?: string[]
  step?: { done: number; total: number; current: string }
}

export const SESSIONS: Session[] = [
  {
    id: "s1", title: "Request logging in the API gateway", repo: "infra", hue: 210, state: "asking", age: "waiting 2 min",
    context: "Should I mask personal fields, or keep the whole payload for 7 days?", lastPrompt: "Turn on request logging, but keep personal data out.",
    prs: [{ number: 42, checks: "pass" }], tasks: { done: 2, total: 5 }, usage: 17, unread: true,
    choices: ["Mask the personal fields", "Keep 7 days", "Headers only"],
  },
  {
    id: "s2", title: "Delete old preview environments", repo: "infra", hue: 210, state: "permission", age: "waiting 6 min",
    context: "Bash: terraform destroy -target=module.preview", usage: 33,
  },
  {
    id: "s3", title: "Checkout flow on mobile", repo: "mobile", hue: 145, state: "review", age: "45 min",
    context: "Both screens now share one form; the tests pass.", lastPrompt: "Merge the two checkout screens into one.", tasks: { done: 4, total: 4 }, usage: 29, unread: true,
  },
  {
    id: "s4", title: "Invoice PDF export", repo: "billing-api", hue: 290, state: "working", age: "now",
    context: "Running the test suite", step: { done: 3, total: 6, current: "Running the test suite" }, usage: 48,
  },
  {
    id: "s5", title: "Dark mode for settings", repo: "web-app", hue: 40, state: "working", age: "now",
    context: "Editing settings.tsx", usage: 40,
  },
  {
    id: "s6", title: "Retry failed webhooks", repo: "billing-api", hue: 290, state: "pending", age: "25 min",
    context: "The PR is open; the retry waits 1, 5 and 30 minutes.", prs: [{ number: 118, checks: "pending" }, { number: 119, checks: "fail" }], usage: 74,
  },
  {
    id: "s7", title: "Onboarding copy", repo: "web-app", hue: 40, state: "parked", age: "until Monday",
    context: "Here is the order I would ship them in.", usage: 12,
  },
  { id: "s8", title: "Upgrade the router", repo: "web-app", hue: 40, state: "done", age: "2 h", context: "Merged in #77." },
]

export const ZONES = [
  { id: "z1", name: "Today", hue: 25, x: 0, y: 0, w: 640, h: 420 },
  { id: "z2", name: "Waiting on others", hue: 210, x: 680, y: 0, w: 340, h: 420 },
]
