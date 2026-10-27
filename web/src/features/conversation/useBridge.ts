// The session's bridge while its conversation is open: whether it is open or
// asleep, the messages it still holds, and the question or approval it waits
// for. Read when the session's mod writes (session-events.ts), and every ten
// seconds besides: a mod that stops beating writes nothing.
import { useEffect, useRef, useState } from "react"
import { get } from "@/lib/api"
import type { Bridge } from "@/lib/api-types"
import { useSessionEvents } from "./session-events"

const EVERY = { connected: 10_000, lost: 2500 }

export function useBridge(id: string) {
  const [bridge, setBridge] = useState<Bridge | null>(null)
  const shown = useRef(id)
  const check = () => {
    const asked = id
    get<Bridge>(`/api/sessions/${encodeURIComponent(asked)}/bridge`).then(b => shown.current === asked && setBridge(b), () => {})
  }
  useEffect(() => {
    shown.current = id
    setBridge(null)
    check()
  }, [id])
  useSessionEvents(id, "bridge", check, EVERY)
  return bridge
}
