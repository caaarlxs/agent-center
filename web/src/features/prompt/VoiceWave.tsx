// Adapted from Watermelon UI's voice-transcribe and waveform-scrub
// (ui.watermelon.sh, MIT): the dictation pill's wave. While it records, the
// bars follow the microphone with a spring and the time rolls; while Whisper
// writes it out, the last wave stays and a sweep runs over it, as a player's
// progress does. Ours keeps the pill's size and the board's colours.
import { motion } from "motion/react"
import { Num } from "@/components/common/Num"

const SPRING = { type: "spring", stiffness: 520, damping: 32, mass: 0.6 } as const
const barHeight = (level: number) => `${Math.max(10, level * 100)}%`

function Bars({ levels, className }: { levels: number[]; className?: string }) {
  return (
    <span className={className}>
      {levels.map((l, i) => (
        <motion.i key={i} className="w-0.5 shrink-0 rounded-full bg-current" initial={false} animate={{ height: barHeight(l) }} transition={SPRING}
          style={{ opacity: 0.3 + 0.7 * (i / levels.length) }} />
      ))}
    </span>
  )
}

const row = "flex h-5 w-[102px] items-center gap-px"

// Recording: the live wave.
export const LiveWave = ({ levels }: { levels: number[] }) => <Bars levels={levels} className={row} />

// Writing it out: the last wave, swept over and over.
export function ScrubWave({ levels }: { levels: number[] }) {
  return (
    <span className="relative">
      <Bars levels={levels} className={`${row} opacity-35`} />
      <Bars levels={levels} className={`${row} wave-scrub absolute inset-0`} />
    </span>
  )
}

// The time it has recorded, "0:07", its digits rolling.
export const Elapsed = ({ seconds }: { seconds: number }) => <Num value={seconds % 60} prefix={`${Math.floor(seconds / 60)}:`} minDigits={2} />
