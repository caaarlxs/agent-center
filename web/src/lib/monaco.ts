// Monaco, VS Code's editor, for Changes (side by side) and Code. The board's
// server downloads it once (lib/monaco.ts there) and serves it at
// /vendor/monaco; until it is there, useMonaco says how far the download is.
import { loader } from "@monaco-editor/react"
import { useEffect, useState } from "react"
import { get } from "./api"

loader.config({ paths: { vs: "/vendor/monaco/vs" } })

type State = { ready: boolean; progress?: number; error?: string }

export function useMonaco(): State {
  const [state, setState] = useState<State>({ ready: false })
  useEffect(() => {
    let alive = true
    const step = async () => {
      const res = await get<State>("/api/monaco").catch((err: Error) => ({ ready: false, error: err.message }))
      if (!alive) return
      setState(res)
      if (!res.ready && !res.error) setTimeout(step, 700)
    }
    step()
    return () => void (alive = false)
  }, [])
  return state
}

// The editor's theme follows the system's, live, as the page does.
const darkQuery = matchMedia("(prefers-color-scheme: dark)")
export const monacoTheme = () => (darkQuery.matches ? "vs-dark" : "vs")
export function useMonacoTheme() {
  const [theme, setTheme] = useState(monacoTheme)
  useEffect(() => {
    const on = () => setTheme(monacoTheme())
    darkQuery.addEventListener("change", on)
    return () => darkQuery.removeEventListener("change", on)
  }, [])
  return theme
}
