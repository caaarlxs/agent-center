// The reply box: what you type goes to the session through the bridge mod;
// the mode, model and effort change in the session (it asks for approval
// when a mode asks less).
import { useState } from "react"
import { toast } from "sonner"
import {
  PromptInput, PromptInputBody, PromptInputFooter, PromptInputSelect, PromptInputSelectContent, PromptInputSelectItem,
  PromptInputSelectTrigger, PromptInputSelectValue, PromptInputSubmit, PromptInputTextarea, PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { post } from "@/lib/api"
import type { Card } from "@/lib/api-types"
import { sendText } from "@/features/session/actions"

export const MODES = [["default", "Ask"], ["acceptEdits", "Accept edits"], ["plan", "Plan"], ["auto", "Auto"], ["bypassPermissions", "Bypass"]] as const
export const MODELS = [["claude-fable-5-1", "Fable 5.1"], ["claude-opus-5-5", "Opus 5.5"], ["claude-sonnet-5-5", "Sonnet 5.5"], ["claude-haiku-5-5", "Haiku 5.5"]] as const
export const EFFORTS = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["xhigh", "Extra high"], ["max", "Max"]] as const

function Pick({ value, options, placeholder, onPick }: { value: string | undefined; options: readonly (readonly [string, string])[]; placeholder: string; onPick: (v: string) => void }) {
  return (
    <PromptInputSelect value={value} onValueChange={onPick}>
      <PromptInputSelectTrigger className="h-8 w-auto gap-1 border-0 px-2 text-xs shadow-none"><PromptInputSelectValue placeholder={placeholder} /></PromptInputSelectTrigger>
      <PromptInputSelectContent>{options.map(([v, label]) => <PromptInputSelectItem key={v} value={v}>{label}</PromptInputSelectItem>)}</PromptInputSelectContent>
    </PromptInputSelect>
  )
}

export function Composer({ card }: { card: Card }) {
  const [model, setModel] = useState<string>()
  const change = (key: "mode" | "model" | "effort", value: string) =>
    post(`/api/sessions/${encodeURIComponent(card.id)}/settings`, { [key]: value }).then(
      () => toast(key === "mode" ? "Mode change sent: the session may ask you to approve it" : "Change sent"),
      (err: Error) => toast.error(err.message),
    )
  return (
    <PromptInput
      className="rounded-xl"
      onSubmit={async message => {
        const text = message.text.trim()
        if (!text) return
        await sendText(card.id, text).then(() => toast("Message sent"), (err: Error) => toast.error(err.message))
      }}
    >
      <PromptInputBody>
        <PromptInputTextarea placeholder={card.column === "asking" ? "Answer…" : "Reply…"} />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <Pick value={card.mode ?? undefined} options={MODES} placeholder="Mode" onPick={v => change("mode", v)} />
          <Pick value={model} options={MODELS} placeholder="Model" onPick={v => (setModel(v), change("model", v))} />
          <Pick value={card.effort ?? undefined} options={EFFORTS} placeholder="Effort" onPick={v => change("effort", v)} />
        </PromptInputTools>
        <PromptInputSubmit />
      </PromptInputFooter>
    </PromptInput>
  )
}
