// Claude's Markdown as the classic board draws it (util.js md, styles.css:534-576):
// plain code blocks that wrap, each with Copy (and Run for a shell block when
// Setup allows it), inline code and relative links that name a file opening it
// in the Files tab, other links in a new window. Streamdown parses; the look is
// the .md block in index.css.
import { Check, Play } from "lucide-react"
import { createContext, Fragment, memo, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { Streamdown, type Components } from "streamdown"
import { cjk } from "@streamdown/cjk"
import { post } from "@/lib/api"
import { useShikiTheme, useTokens } from "@/lib/code-theme"
import { cn } from "@/lib/utils"
import { showFile } from "@/app/open-session"
import { endOf, pathInCode, pathInLink, SHELL_LANG, nameOf } from "./text"
import { Anim } from "@/components/icons/animated"
import { CopyMark, useCopyMoment } from "@/components/icona/marks"
import { SwapText } from "@/components/watermelon/SwapText"

// The session the text belongs to: a shell block runs in its folder.
export const SessionOf = createContext<string | null>(null)

type Hast = { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: Hast[] }
const textOf = (n: Hast | undefined): string => (!n ? "" : n.type === "text" ? (n.value ?? "") : (n.children ?? []).map(textOf).join(""))

// Copies with the clipboard API, else the older copy command (some windows refuse the API).
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = Object.assign(document.createElement("textarea"), { value: text })
    area.style.cssText = "position:fixed;opacity:0;pointer-events:none"
    document.body.append(area)
    area.select()
    const ok = document.execCommand("copy")
    area.remove()
    if (!ok) throw new Error("copy refused")
  }
}

const toolBtn = "inline-flex h-6 items-center gap-[5px] rounded-md border border-line bg-surface px-2 text-[11.5px] font-medium text-text-muted opacity-75 transition-[opacity,color,transform] duration-[120ms] group-hover/code:opacity-100 hover:text-text focus-visible:opacity-100 active:scale-[0.97] disabled:cursor-default disabled:opacity-40"

type Command = { id: string; isRunning: boolean; startedAt: number; endedAt: number | null; exitCode: number | null; wasStopped: boolean; output: string }

// What a command run from the block printed, with Stop while it runs.
function RunOutput({ sessionId, command, onEnd }: { sessionId: string; command: string; onEnd: () => void }) {
  const [state, setState] = useState<{ ran: Command | null; error: string | null }>({ ran: null, error: null })
  const log = useRef<HTMLPreElement>(null)
  useEffect(() => {
    let alive = true
    const at = (action: string) => `/api/sessions/${encodeURIComponent(sessionId)}/${action}`
    ;(async () => {
      try {
        const started = await post<{ command: Command }>(at("exec"), { command })
        let ran = started.command
        while (alive) {
          setState({ ran, error: null })
          if (!ran.isRunning) break
          await new Promise(r => setTimeout(r, 800))
          ran = (await post<{ command: Command }>(at("execstatus"), { commandId: ran.id })).command
        }
      } catch (err) {
        if (alive) setState(s => ({ ...s, error: (err as Error).message || "Could not run it" }))
      }
      if (alive) onEnd()
    })()
    return () => void (alive = false)
  }, [sessionId, command])
  // Follows the end of the log while you are there.
  useEffect(() => {
    const el = log.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 40) el.scrollTop = el.scrollHeight
  }, [state.ran?.output])
  const stop = () => state.ran && post(`/api/sessions/${encodeURIComponent(sessionId)}/execstop`, { commandId: state.ran.id }).catch(() => {})
  const end = state.ran && endOf(state.ran)
  return (
    <div className="-mt-1 mb-2 rounded-b-[9px] border border-t-0 border-line bg-bg">
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11.5px] text-text-muted">
        {state.error ? <><span className="text-bad">●</span><span className="flex-1">{state.error}</span></>
          : end ? <><span className={end.isOk ? "text-work" : "text-bad"}>●</span><span className="flex-1">{end.text}</span></>
          : <><i className="run-dot size-2 rounded-full bg-run" /><span className="flex-1">Running in the session's folder…</span>
              <button type="button" className="text-brand underline underline-offset-2" onClick={stop}>Stop</button></>}
      </div>
      {!!state.ran?.output && <pre ref={log} className="m-0 max-h-[260px] overflow-auto border-t border-line px-2.5 py-2 font-mono text-[11.5px]/[1.5] [overflow-wrap:anywhere] whitespace-pre-wrap">{state.ran.output}</pre>}
    </div>
  )
}

// A code block: Copy, and Run for a shell block (only with the can-run class).
function CodeBox({ text, lang }: { text: string; lang: string }) {
  const sessionId = useContext(SessionOf)
  const [copied, setCopied] = useState<"Copy" | "Copied" | "Could not copy">("Copy")
  const [runs, setRuns] = useState(0) // each Run starts a new output
  const [isRunning, setRunning] = useState(false)
  const isShell = SHELL_LANG.test(lang)
  const mark = useCopyMoment()
  const fence = lang.split(/\s+/).find(c => c.startsWith("language-")) ?? null
  const tokens = useTokens(text.replace(/\n$/, ""), fence, useShikiTheme())
  const copy = () =>
    copyText(text.replace(/\n$/, "")).then(
      () => (setCopied("Copied"), mark.play(), setTimeout(() => setCopied("Copy"), 1600)),
      () => setCopied("Could not copy"),
    )
  return (
    <div className="group/code">
      <div className="sticky top-2 z-[1] float-right mt-1.5 mr-1.5 -mb-[30px] flex gap-1">
        {isShell && sessionId && (
          <button type="button" className={cn(toolBtn, "code-run hidden text-work hover:text-work")} title="Run in the session's folder" disabled={isRunning}
            onClick={() => (setRuns(n => n + 1), setRunning(true))}><Play className="size-3 fill-current" />Run</button>
        )}
        <button type="button" className={cn(toolBtn, copied === "Copied" && "text-work hover:text-work")} title="Copy" onClick={copy}>
          <CopyMark moment={mark} size={13} idle={copied === "Copied" ? <Check className="size-[13px]" /> : <Anim.Copy size={13} />} /><SwapText text={copied} />
        </button>
      </div>
      <pre className={cn(isShell ? "pr-[82px] [.can-run_&]:pr-[150px]" : "pr-[82px]")} style={tokens ? { background: tokens.bg, color: tokens.fg, borderColor: "transparent" } : undefined}>
        <code className={lang}>
          {tokens
            ? tokens.lines.map((line, i) => (
                <Fragment key={i}>{i > 0 && "\n"}{line.map((t, k) => <span key={k} style={{ color: t.color, fontStyle: t.fontStyle === 1 ? "italic" : undefined }}>{t.content}</span>)}</Fragment>
              ))
            : text}
        </code>
      </pre>
      {runs > 0 && sessionId && <RunOutput key={runs} sessionId={sessionId} command={text.trim()} onEnd={() => setRunning(false)} />}
    </div>
  )
}

// A path that opens in the Files tab.
function FileLink({ path, children, isCode }: { path: string; children: ReactNode; isCode?: boolean }) {
  const Tag = isCode ? "code" : "a"
  return (
    <Tag role="link" tabIndex={0} className="file-link" title={`Open ${nameOf(path)} here`} onClick={() => showFile(path)}
      onKeyDown={e => e.key === "Enter" && showFile(path)}>{children}</Tag>
  )
}

// Inline code: a path opens the file here.
function InlineCode({ children, className }: ComponentProps<"code">) {
  const path = typeof children === "string" ? pathInCode(children) : null
  return path ? <FileLink path={path} isCode>{children}</FileLink> : <code className={className}>{children}</code>
}

const components: Components = {
  pre: ({ node }) => {
    const code = (node as Hast | undefined)?.children?.find(c => c.tagName === "code")
    const lang = ((code?.properties?.className as string[] | undefined) ?? []).join(" ")
    return <CodeBox text={textOf(code)} lang={lang} />
  },
  code: props => <InlineCode {...props} />,
  inlineCode: props => <InlineCode {...props} />,
  a: ({ href, children }) => {
    const path = pathInLink(href)
    return path ? <FileLink path={path}>{children}</FileLink> : <a href={href} target="_blank" rel="noreferrer">{children}</a>
  },
}

// A table shows whole, however tall (Streamdown caps it at 300px otherwise).
// isStreaming: text still being written; markdown left open (a ** not yet
// closed) shows as it will once it is.
export const Markdown = memo(function Markdown({ children, className, isStreaming = false }: { children: string; className?: string; isStreaming?: boolean }) {
  return (
    <Streamdown className={cn("md", className)} components={components} plugins={{ cjk }} controls={false} tableMaxHeight={0} parseIncompleteMarkdown={isStreaming}>
      {children}
    </Streamdown>
  )
})
