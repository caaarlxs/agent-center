// What each turn of a conversation cost (lib/spend.ts), by when you wrote
// the message that started it: asked again a moment after each turn ends.
import { createContext, useContext, useEffect, useState } from "react"
import { get } from "@/lib/api"

export const TurnCosts = createContext<Map<number, number>>(new Map())
export const useTurnCost = (at: string | null | undefined) => {
  const costs = useContext(TurnCosts)
  return at ? costs.get(Date.parse(at)) : undefined
}

export function useTurnCosts(sessionId: string, turn: string | undefined) {
  const [costs, setCosts] = useState<Map<number, number>>(new Map())
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      void get<{ turns: { at: number; cost: number }[] }>(`/api/sessions/${encodeURIComponent(sessionId)}/turncosts`)
        .then(r => alive && setCosts(new Map(r.turns.map(t => [t.at, t.cost]))), () => {})
    }, 1500)
    return () => ((alive = false), clearTimeout(timer))
  }, [sessionId, turn])
  return costs
}
