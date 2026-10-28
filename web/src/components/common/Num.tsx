// A number whose digits roll when it changes (NumberFlow, MIT): counts,
// percentages, memory. One place for how the board formats them; the first
// render shows the number as is, and reduced motion turns the roll off.
import NumberFlow from "@number-flow/react"
import { memParts } from "@/lib/format"

type NumProps = { value: number; suffix?: string; prefix?: string; digits?: number; minDigits?: number; className?: string; title?: string }

export function Num({ value, suffix, prefix, digits = 0, minDigits = 1, className, title }: NumProps) {
  return (
    <NumberFlow value={value} suffix={suffix} prefix={prefix} locales="en-GB" title={title}
      format={{ maximumFractionDigits: digits, minimumIntegerDigits: minDigits, useGrouping: false }} className={className} willChange={false} />
  )
}

// Memory as Activity Monitor shows it ("340 MB", "1.4 GB"), its digits rolling.
export function Mem({ bytes, className }: { bytes: number; className?: string }) {
  const { value, unit, digits } = memParts(bytes)
  return <Num value={value} digits={digits} suffix={` ${unit}`} className={className} />
}
