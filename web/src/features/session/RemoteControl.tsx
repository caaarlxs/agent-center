// Remote Control from the board: the session also usable from the Claude app
// on a phone or at claude.ai/code, as `/remote-control` does in the terminal.
// Only in terminal mode (Setup → "Without Claude desktop"): the server starts
// the session with it or types the command in (lib/terminal.ts), and keeps
// the link Claude Code gives while the session runs.
import { Smartphone } from "lucide-react"
import { useEffect, useState } from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { post } from "@/lib/api"
import { toast } from "@/lib/notify"
import { useInTerminal } from "@/lib/sessions-client"
import { cn } from "@/lib/utils"

type Answer = { ok: boolean; url: string | null }
const remote = (id: string, body: { on?: boolean; name?: string } = {}) => post<Answer>(`/api/sessions/${encodeURIComponent(id)}/remote`, body)

const copy = (url: string) =>
  navigator.clipboard.writeText(url).then(() => toast("Link copied"), () => toast("Could not copy the link"))

// `name`: the card's title, the name a session started for it gets (it shows in the Claude app).
export function RemoteControl({ id, name, className, menuClass }: { id: string; name?: string; className: (isOn: boolean) => string; menuClass: string }) {
  const isTerminal = useInTerminal()
  // undefined: not known yet; null: off; "": on without a link read; else the link.
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const [isBusy, setBusy] = useState(false)

  useEffect(() => {
    if (!isTerminal) return
    let alive = true
    setUrl(undefined)
    remote(id).then(r => alive && setUrl(r.url), () => alive && setUrl(null))
    return () => void (alive = false)
  }, [id, isTerminal])

  if (!isTerminal) return null

  const turn = (on: boolean) => {
    setBusy(true)
    remote(id, on ? { on, name } : { on }).then(
      r => {
        setUrl(on ? (r.url ?? "") : null)
        if (!on) return toast("Remote Control off")
        toast("Remote Control on", {
          description: r.url ? "Open it in the Claude app on your phone, or at claude.ai/code." : "Claude Code did not show its link yet: find the session in the Claude app or at claude.ai/code.",
          ...(r.url && { action: { label: "Copy link", onClick: () => void copy(r.url!) } }),
        })
      },
      (err: Error) => toast(err.message || "Could not switch Remote Control"),
    ).finally(() => setBusy(false))
  }

  if (isBusy) return <span className={cn(className(true), "pointer-events-none")} title="Switching Remote Control…"><Spinner className="size-3 border-[1.5px]" /></span>

  if (url === null || url === undefined)
    return (
      <button className={className(false)} disabled={url === undefined} onClick={() => turn(true)}
        title="Remote Control: use this session from the Claude app on your phone or at claude.ai/code">
        <Smartphone />
      </button>
    )

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button className={className(true)} title={url ? `Remote Control on: ${url}` : "Remote Control on"}><Smartphone /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={menuClass}>
        <DropdownMenuLabel className="px-2 pt-[5px] pb-1.5 text-[11.5px] font-semibold text-faint">Remote Control on</DropdownMenuLabel>
        {url && (
          <>
            <DropdownMenuItem className="h-[30px] rounded-md px-2" onSelect={() => window.open(url, "_blank", "noopener")}>Open at claude.ai</DropdownMenuItem>
            <DropdownMenuItem className="h-[30px] rounded-md px-2" onSelect={() => void copy(url)}>Copy link</DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="h-[30px] rounded-md px-2 text-bad focus:text-bad" onSelect={() => turn(false)}>Turn off</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
