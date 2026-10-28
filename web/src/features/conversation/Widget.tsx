// What a connector's tool gave back, drawn as the desktop app's widget
// (lib/widgets.ts reads it): Jira issues, Confluence pages, GitHub's user,
// pull request or issue, a Slack draft, a FigJam diagram, and the visuals
// Claude draws (show_widget) in a frame of their own.
import { CircleDot, FileText, GitPullRequest, Hash, PenTool, SquareCheckBig } from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { Item } from "@/lib/api-types"
import { theme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { Anim } from "@/components/icons/animated"
import { Markdown } from "./Markdown"
import { reply } from "./send"
import { frameDoc, paletteNow } from "./visual-frame"

type Widget = Extract<Item, { kind: "widget" }>["widget"]
type JiraIssue = Extract<Widget, { app: "jira" }>["issues"][number]

const box = "max-w-[640px] shrink-0 overflow-hidden rounded-xl border border-line bg-surface"
const row = "flex items-center gap-3 px-3.5 py-2.5"
const dot = <span className="text-faint">·</span>
const ROWS_SHOWN = 6

function OpenLink({ url, label = "Open" }: { url: string | null; label?: string }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noreferrer" title={label} aria-label={label}
      className="grid size-7 shrink-0 place-items-center rounded-md text-text-muted hover:bg-hover hover:text-text"><Anim.ArrowUpRight size={14} /></a>
  )
}

const TONE = { todo: "bg-press text-text-muted", doing: "bg-review-soft text-review", done: "bg-work-soft text-work" }
const Pill = ({ text, tone }: { text: string; tone: keyof typeof TONE | null }) => (
  <span className={cn("max-w-40 truncate rounded-md px-1.5 py-px text-[11.5px] font-medium", TONE[tone ?? "todo"])}>{text}</span>
)

// A list that shows its first rows and the rest on demand.
function Rows<T>({ items, children }: { items: T[]; children: (item: T) => React.ReactNode }) {
  const [isAll, setAll] = useState(items.length <= ROWS_SHOWN + 1)
  return (
    <div className={cn(box, "divide-y divide-line")}>
      {(isAll ? items : items.slice(0, ROWS_SHOWN)).map(children)}
      {!isAll && <button className="w-full px-3.5 py-2 text-left text-xs font-semibold text-brand" onClick={() => setAll(true)}>Show {items.length - ROWS_SHOWN} more</button>}
    </div>
  )
}

function JiraRow({ issue }: { issue: JiraIssue }) {
  return (
    <div key={issue.key} className={row}>
      <SquareCheckBig className="size-4 shrink-0 text-review" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="truncate text-[13px] font-semibold">{issue.summary ?? issue.key}</b>
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-text-muted">
          {issue.project && <><span className="truncate">{issue.project}</span>{dot}</>}
          <span className="shrink-0">{issue.key}</span>
          {issue.assignee && <>{dot}<span className="truncate">{issue.assignee}</span></>}
          {issue.status && <>{dot}<Pill text={issue.status} tone={issue.tone} /></>}
        </span>
      </div>
      <OpenLink url={issue.url} label="Open in Jira" />
    </div>
  )
}

// A visual Claude drew, in a sandboxed frame as tall as what it draws; what it
// asks (sendPrompt) goes to the session as your reply.
function Visual({ html, sessionId }: { html: string; sessionId: string }) {
  const frame = useId()
  const mode = theme.use()
  const doc = useMemo(() => frameDoc(html, { frame, mode, palette: paletteNow() }), [html, frame, mode])
  const [height, setHeight] = useState(120)
  const ref = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || e.data?.frame !== frame) return
      if (typeof e.data.height === "number") setHeight(Math.max(40, e.data.height))
      if (typeof e.data.prompt === "string" && e.data.prompt.trim()) void reply(sessionId, e.data.prompt)
      if (typeof e.data.link === "string" && /^https?:/.test(e.data.link)) window.open(e.data.link, "_blank", "noreferrer")
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [frame, sessionId])
  return <iframe ref={ref} title="Visual" sandbox="allow-scripts" srcDoc={doc} className="block w-full max-w-[680px] shrink-0 border-0" style={{ height }} />
}

export function WidgetView({ widget, sessionId }: { widget: Widget; sessionId: string }) {
  switch (widget.app) {
    case "jira":
      return <Rows items={widget.issues}>{issue => <JiraRow key={issue.key} issue={issue} />}</Rows>
    case "confluence":
      return (
        <Rows items={widget.pages}>
          {page => (
            <div key={`${page.title}${page.url}`} className={row}>
              <FileText className="size-4 shrink-0 text-review" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <b className="truncate text-[13px] font-semibold">{page.title}</b>
                {(page.space || page.excerpt) && <span className="truncate text-[12px] text-text-muted">{[page.space, page.excerpt].filter(Boolean).join(" · ")}</span>}
              </div>
              <OpenLink url={page.url} label="Open in Confluence" />
            </div>
          )}
        </Rows>
      )
    case "github":
      if (widget.kind === "user")
        return (
          <div className={cn(box, row)}>
            {widget.avatar && <img src={widget.avatar} alt="" className="size-9 shrink-0 rounded-full border border-line" />}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <b className="truncate text-[13px] font-semibold">{widget.name ?? widget.login}</b>
              <span className="flex items-center gap-1.5 text-[12px] text-text-muted">
                <span>@{widget.login}</span>
                {widget.repos !== null && <>{dot}<span>{widget.repos} repos</span></>}
                {widget.followers !== null && <>{dot}<span>{widget.followers} followers</span></>}
              </span>
            </div>
            <OpenLink url={widget.url} label="Open on GitHub" />
          </div>
        )
      return (
        <div className={cn(box, row)}>
          {widget.kind === "pr" ? <GitPullRequest className="size-4 shrink-0 text-work" /> : <CircleDot className="size-4 shrink-0 text-work" />}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <b className="truncate text-[13px] font-semibold">{widget.title ?? `#${widget.number}`}</b>
            <span className="flex items-center gap-1.5 text-[12px] text-text-muted">
              <span>{widget.repo}#{widget.number}</span>
              {widget.state && <>{dot}<Pill text={widget.state} tone={widget.state === "open" ? "doing" : "done"} /></>}
            </span>
          </div>
          <OpenLink url={widget.url} label="Open on GitHub" />
        </div>
      )
    case "slack":
      return (
        <div className={box}>
          <div className={cn(row, "border-b border-line py-2 text-[12px] text-text-muted")}>
            <Hash className="size-3.5 shrink-0" /><span className="flex-1 truncate">{widget.channel ? `Draft for ${widget.channel}` : "Draft"}</span>
            <OpenLink url={widget.url} label="Open in Slack" />
          </div>
          <Markdown className="px-3.5 py-2.5 text-[13px]">{widget.text}</Markdown>
        </div>
      )
    case "figjam":
      return (
        <div className={cn(box, row)}>
          <PenTool className="size-4 shrink-0 text-brand" />
          <b className="min-w-0 flex-1 truncate text-[13px] font-semibold">{widget.title ?? "FigJam diagram"}</b>
          <OpenLink url={widget.url} label="Open in FigJam" />
        </div>
      )
    case "visual":
      return <Visual html={widget.html} sessionId={sessionId} />
  }
}
