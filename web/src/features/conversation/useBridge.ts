// The session's bridge, read every few seconds while its conversation is
// open: whether it is open or asleep, the messages it still holds, and the
// question or approval it waits for.
import { useEffect, useState } from "react"
import { get } from "@/lib/api"
import type { Bridge } from "@/lib/api-types"

const BRIDGE_MS = 2500

export function useBridge(id: string) {
  const [bridge, setBridge] = useState<Bridge | null>(null)
  useEffect(() => {
    let alive = true
    setBridge(null)
    const check = () => get<Bridge>(`/api/sessions/${encodeURIComponent(id)}/bridge`).then(b => alive && setBridge(b), () => {})
    void check()
    const timer = setInterval(check, BRIDGE_MS)
    return () => ((alive = false), clearInterval(timer))
  }, [id])
  return bridge
}
