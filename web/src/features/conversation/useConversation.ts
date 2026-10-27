// A session's conversation, read from its transcript (GET .../messages):
// the last part first, then what it adds every two seconds while it is open,
// and earlier parts on demand. Every read also says what became of the tasks
// the session suggested (started or dismissed, here or in Claude desktop).
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { get } from "@/lib/api"
import type { Item, SuggestionState } from "@/lib/api-types"
import { append, normalize } from "./items"

const FOLLOW_MS = 2000

type Page = { items: Item[]; start: number; end: number; hasMore: boolean; suggestions?: Record<string, SuggestionState> }
type State = { page: Page | null; error: string | null }
export type Suggestions = Record<string, SuggestionState>

const url = (id: string, q = "") => `/api/sessions/${encodeURIComponent(id)}/messages${q}`

export function useConversation(id: string) {
  const [state, setState] = useState<State>({ page: null, error: null })
  const end = useRef(0)
  const [suggestions, setSuggestions] = useState<Suggestions>({})
  const takeSuggestions = (next: Suggestions | undefined) =>
    next && setSuggestions(s => (JSON.stringify(s) === JSON.stringify(next) ? s : next))

  useEffect(() => {
    let alive = true
    setState({ page: null, error: null })
    setSuggestions({})
    end.current = 0
    get<Page>(url(id)).then(
      page => {
        if (!alive) return
        end.current = page.end
        takeSuggestions(page.suggestions)
        setState({ page, error: null })
      },
      (err: Error) => alive && setState({ page: null, error: err.message }),
    )
    const timer = setInterval(async () => {
      if (!end.current) return
      const more = await get<Page>(url(id, `?after=${end.current}`)).catch(() => null)
      if (alive) takeSuggestions(more?.suggestions)
      if (!alive || !more || more.end === end.current) return
      end.current = more.end
      if (more.items.length) setState(s => (s.page ? { ...s, page: { ...s.page, items: append(s.page.items, more.items), end: more.end } } : s))
    }, FOLLOW_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [id])

  const loadEarlier = useCallback(async () => {
    const start = state.page?.start
    if (start === undefined) return
    const earlier = await get<Page>(url(id, `?before=${start}`))
    setState(s => (s.page ? { ...s, page: { ...s.page, items: append(earlier.items, s.page.items), start: earlier.start, hasMore: earlier.hasMore } } : s))
  }, [id, state.page?.start])

  // Read the last part again: an answer lands on items already shown, which
  // the follow-up reads never touch.
  const refresh = useCallback(async () => {
    const latest = await get<Page>(url(id)).catch(() => null)
    if (!latest) return
    const fresh = new Map(latest.items.map(i => [i.key, i]))
    setState(s => (s.page ? { ...s, page: { ...s.page, items: s.page.items.map(i => fresh.get(i.key) ?? i) } } : s))
  }, [id])

  const shown = useMemo(() => (state.page ? normalize(state.page.items) : []), [state.page])
  // Dismissed here: shown at once, before the next read says so.
  const markDismissed = useCallback((taskId: string) => setSuggestions(s => ({ ...s, [taskId]: { state: "dismissed", session: null } })), [])
  return { shown, suggestions, markDismissed, isLoaded: !!state.page, error: state.error, hasMore: !!state.page?.hasMore, loadEarlier, refresh }
}
