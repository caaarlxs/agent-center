// While Whisper writes out what you said: border-beam's colourful glow (its
// palette, a crisp edge, a blurred bloom and a slow hue drift) as a comet
// that travels round the reply box at an even pace. Along the border, not
// by angle as border-beam turns, so on a wide box it never races across the
// short sides. Still and lit with less motion.
const COLORS = ["rgb(255, 50, 100)", "rgb(240, 50, 180)", "rgb(180, 40, 240)", "rgb(100, 70, 255)", "rgb(40, 140, 255)", "rgb(30, 185, 170)", "rgb(50, 200, 80)", "rgb(255, 120, 40)"]
const SEG = 4.5 // each colour's share of the border, in hundredths: the comet is 8 × 4.5 = 36

function Comet({ className }: { className: string }) {
  return (
    <>
      {COLORS.map((color, i) => (
        <rect key={color} pathLength={100} className={className}
          style={{ "--from": i * SEG, stroke: color, opacity: 0.25 + 0.75 * ((i + 1) / COLORS.length) } as React.CSSProperties} />
      ))}
    </>
  )
}

export function TravelBeam({ radius }: { radius: number }) {
  return (
    <svg aria-hidden className="travel-beam pointer-events-none absolute inset-0 size-full overflow-visible" style={{ "--r": `${radius}px` } as React.CSSProperties}>
      <g className="travel-beam-bloom"><Comet className="travel-beam-seg travel-beam-wide" /></g>
      <Comet className="travel-beam-seg" />
    </svg>
  )
}
