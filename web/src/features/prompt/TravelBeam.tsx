// While Whisper writes out what you said: a light that travels round the
// reply box at an even pace, a comet with a fading tail (three dashes of one
// path, their heads together). Along the border, not by angle, so it never
// races across the short sides. Still and lit with less motion.
const TAIL = [26, 14, 6] // each dash's length, in hundredths of the border

export function TravelBeam({ radius }: { radius: number }) {
  return (
    <svg aria-hidden className="travel-beam pointer-events-none absolute inset-0 size-full overflow-visible">
      {TAIL.map((len, i) => (
        <rect key={len} pathLength={100} rx={radius} ry={radius} className="travel-beam-dash" style={{ "--len": len, opacity: 0.35 + i * 0.3 } as React.CSSProperties} />
      ))}
    </svg>
  )
}
