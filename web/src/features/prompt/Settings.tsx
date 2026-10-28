// The session's permission modes, models and efforts, each with its hint,
// and the quiet pill the reply box's pickers share (ModePicker, ModelEffort).
export type Option = readonly [value: string, label: string, hint?: string]

export const MODES: readonly Option[] = [
  ["default", "Ask", "Asks for approval before each risky action"],
  ["acceptEdits", "Accept edits", "Edits files without asking; asks for the rest"],
  ["plan", "Plan", "Only researches and proposes a plan; changes nothing"],
  ["auto", "Auto", "A classifier decides what to allow without asking you"],
  ["bypassPermissions", "Bypass permissions", "Asks nothing: use it with care"],
]
export const MODELS: readonly Option[] = [
  ["claude-fable-5-1", "Fable 5.1", "The most capable"],
  ["claude-opus-5-5", "Opus 5.5", "Very capable, for complex work"],
  ["claude-sonnet-5-5", "Sonnet 5.5", "Fast and capable"],
  ["claude-haiku-5-5", "Haiku 5.5", "The fastest and cheapest"],
]
export const EFFORTS: readonly Option[] = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["xhigh", "Extra high"], ["max", "Max"]]
export const modelKey = (model: string | null | undefined) => MODELS.find(([id]) => model?.startsWith(id))?.[0] ?? model ?? ""

export const pill = "inline-flex h-[30px] items-center gap-[5px] rounded-md pr-1.5 pl-2 text-xs text-text-muted transition-colors [&_svg]:size-[13px] [&_svg]:shrink-0"
