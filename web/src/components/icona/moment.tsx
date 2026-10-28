// A moment: an Icona icon (CSS-only motion, MIT) that plays once when
// something happens, then gives the place back to the static icon. useMoment
// runs the steps (copy: duplicate, then the check stamp); Once plays one pass.
import { type CSSProperties, type ComponentType, useCallback, useEffect, useRef, useState } from "react"
import { useReducedMotion } from "motion/react"
import { momentPlan } from "./plan"

export function useMoment(...stepsMs: number[]) {
  const [state, setState] = useState<{ step: number; key: number }>({ step: -1, key: 0 })
  const timers = useRef<number[]>([])
  const isReduced = !!useReducedMotion()
  const key = stepsMs.join()
  const play = useCallback(() => {
    timers.current.forEach(clearTimeout)
    const run = Date.now()
    timers.current = momentPlan(key.split(",").map(Number), isReduced).map(({ step, at }) =>
      window.setTimeout(() => setState({ step, key: run }), at))
  }, [key, isReduced])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  return { step: state.step, key: state.key, play }
}

type IconaProps = { size?: number; strokeWidth?: number; speed?: number; animate?: "hover" | "loop" | "none"; className?: string; style?: CSSProperties }

// One pass of the icon: Icona's loop mode, held to a single iteration.
// isLoop keeps it going (Catch me up while it reads, dictation while it records).
export function Once({ icon: Icon, size, speed = 1, className, isLoop }: { icon: ComponentType<IconaProps>; size: number; speed?: number; className?: string; isLoop?: boolean }) {
  return <Icon size={size} strokeWidth={2} speed={speed} animate="loop" className={className} style={isLoop ? undefined : ({ "--icona-iter": 1 } as CSSProperties)} />
}
