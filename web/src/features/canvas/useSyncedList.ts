// A list the canvas saves whole (its zones, its notes): edited here at once,
// saved to the server (now, or a moment later while you type), and replaced
// by the server's copy only when nothing of ours is on its way: an older copy
// must not undo what was just done.
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { post } from "@/lib/api"

const LATER_MS = 600

export function useSyncedList<T>(server: T[] | undefined, url: string, key: string) {
  const [list, setList] = useState<T[]>(server ?? [])
  const latest = useRef(list)
  const busy = useRef(0) // saves on their way, or waiting to go
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serverText = JSON.stringify(server ?? [])
  useEffect(() => {
    if (busy.current) return
    latest.current = server ?? []
    setList(latest.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverText])

  const save = useCallback((next: T[], later = false) => {
    latest.current = next
    setList(next)
    if (timer.current) (clearTimeout(timer.current), busy.current--)
    busy.current++
    const send = () => {
      timer.current = null
      post(url, { [key]: latest.current }).catch((err: Error) => toast.error(err.message)).finally(() => busy.current--)
    }
    if (later) timer.current = setTimeout(send, LATER_MS)
    else send()
  }, [url, key])
  return [list, save] as const
}
