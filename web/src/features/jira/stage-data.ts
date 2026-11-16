// What a ticket's tabs read besides its state (Pipeline.tsx provides it; a job's
// dialog has none): what GitHub says of each PR now, the test data a test made,
// the ticket's comments in Jira (your answers from before the board kept them),
// and the code debt its runs saw.
import { createContext, useContext } from "react"
import type { DebtEntry } from "@server/debt"
import type { PrState, Scenario } from "@server/stage-extras"

export type StageData = { prs: Record<string, PrState>; scenario: Scenario | null; comments: { body: string }[]; debt: DebtEntry[] }
export const StageDataContext = createContext<StageData>({ prs: {}, scenario: null, comments: [], debt: [] })
export const useStageData = () => useContext(StageDataContext)
