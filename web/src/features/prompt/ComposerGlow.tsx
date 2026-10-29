// The reply box's glow while you dictate: voice-glow follows your voice,
// then, while Whisper writes it out, gathers into one beam that sweeps along
// the bottom (sweep.ts). It wraps an empty layer over the box, not the box
// itself: it sets CSS variables every frame, and those are inherited, so
// wrapping the box would restyle its field, buttons and menus 60 times a second. Mounted only while
// the microphone is on, so nothing runs the rest of the time.
import { useMemo } from "react"
import { VoiceBeam } from "voice-glow"
import { theme } from "@/lib/theme"
import { sweepAt } from "./sweep"
import type { MicLive } from "./voice"

const RADIUS = 14 // the box's own (index.css: .composer-box [data-slot=input-group])
const layer = "size-full rounded-[14px]"
// The glow's own root is position: relative (its CSS): a grid over the box
// stretches it to the box's height.
const fill = "pointer-events-none absolute inset-0 grid"

export function ComposerGlow({ mic }: { mic: MicLive }) {
  const mode = theme.use()
  const since = mic.writingSince
  const motion = useMemo(() => (since ? () => sweepAt(Date.now() - since) : null), [since])
  if (!mic.isOn) return null
  return (
    <div aria-hidden className={fill}>
      <VoiceBeam stream={mic.stream ?? undefined} theme={mode} borderRadius={RADIUS} idle={mic.stream ? undefined : 0.35} motion={motion}>
        <div className={layer} />
      </VoiceBeam>
    </div>
  )
}
