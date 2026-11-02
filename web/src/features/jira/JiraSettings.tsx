// Settings › Jira: connect the board to your Jira Cloud site (lib/jira.ts).
// The details are checked with Jira before they are kept; the token goes to
// the macOS keychain and is never shown again.
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { post } from "@/lib/api"
import type { JiraSetup } from "@/lib/api-types"
import { jiraSetup, loadJira } from "./jira"

const field = "flex flex-col gap-1 text-[12.5px] text-text-muted"

export function JiraSettings() {
  const setup = jiraSetup.use()
  const [site, setSite] = useState("")
  const [email, setEmail] = useState("")
  const [token, setToken] = useState("")
  const [projects, setProjects] = useState("")
  const [isBusy, setBusy] = useState(false)
  useEffect(() => void loadJira(), [])
  useEffect(() => {
    if (!setup) return
    setSite(setup.site.replace(/^https:\/\//, ""))
    setEmail(setup.email)
    setProjects(setup.projects.join(", "))
  }, [setup])
  const save = async () => {
    setBusy(true)
    try {
      const res = await post<JiraSetup & { name: string }>("/api/jira/connect", { site, email, token, projects })
      setToken("")
      toast(`Connected to Jira as ${res.name}`)
      await loadJira()
    } catch (err) {
      toast((err as Error).message || "Could not connect to Jira")
    }
    setBusy(false)
  }
  const forget = async () => {
    await post("/api/jira/disconnect").catch(() => {})
    setToken("")
    await loadJira()
  }
  return (
    <li className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface px-[13px] py-[11px]">
      <div className="flex items-center gap-2">
        <b className="text-[13.5px] font-semibold">Jira</b>
        <span className="ml-auto text-xs font-semibold">{setup ? <span className="text-work">Connected · {setup.projects.join(", ")}</span> : <span className="text-faint">Not connected</span>}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 max-[620px]:grid-cols-1">
        <label className={field}>Site<Input value={site} onChange={e => setSite(e.target.value)} placeholder="yourcompany.atlassian.net" spellCheck={false} /></label>
        <label className={field}>Email<Input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" spellCheck={false} /></label>
        <label className={field}>API token<Input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder={setup ? "Kept in the keychain" : "From id.atlassian.com › Security"} autoComplete="off" /></label>
        <label className={field}>Projects<Input value={projects} onChange={e => setProjects(e.target.value)} placeholder="PP, OPS" spellCheck={false} /></label>
      </div>
      <div className="flex items-center gap-2">
        <a className="text-xs text-text-muted hover:text-text" href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">Create an API token</a>
        <span className="flex-1" />
        {setup && <Button variant="ghost" onClick={forget} disabled={isBusy}>Disconnect</Button>}
        <Button onClick={save} disabled={isBusy}>{isBusy ? "Checking…" : setup ? "Save" : "Connect"}</Button>
      </div>
    </li>
  )
}
