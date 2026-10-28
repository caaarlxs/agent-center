// From Icona (icona.works, MIT), unchanged (stroke 2, as Lucide): played
// once by components/icona/moment.tsx.

import { useEffect, useRef, type CSSProperties, type SVGProps } from "react";
import { ParticleField, playParticleScript, type ParticleScript } from "./particles";

const CSS = `
  .icona-check-circle-success-burst .fx{transform-origin:50% 50%;transform-box:view-box}
  @keyframes icona-check-circle-success-burst-fx-1{
    0%{transform:scale(1);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    9.692%{transform:scale(0.82);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    21.538%{transform:scale(1.16);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    35%{transform:scale(0.97);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    53.846%{transform:scale(1);}
    100%{transform:scale(1);}
  }
  .icona-check-circle-success-burst[data-animate="loop"] .fx,.icona-check-circle-success-burst[data-animate="hover"]:is(:hover,:focus-visible) .fx{animation:icona-check-circle-success-burst-fx-1 calc(1.3s / var(--icona-speed, 1)) linear var(--icona-iter,1)}
  .icona-check-circle-success-burst[data-animate="loop"]{--icona-iter:infinite}
  @media (prefers-reduced-motion:reduce){.icona-check-circle-success-burst *{animation:none!important}}
`;

/** Particle cues, on the 24-unit icon grid. */
const SCRIPT: ParticleScript = {
  "bursts": [
    {
      "at": 0.12,
      "preset": "confetti",
      "x": 12,
      "y": 8,
      "angle": -90,
      "spread": 140,
      "count": 30
    }
  ],
  "emitters": []
};
const PASS_SECONDS = 1.3;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "color"> {
  /** Width of the 24-unit icon box in px. */
  size?: number;
  /** Any CSS colour. Defaults to the surrounding text colour. */
  color?: string;
  strokeWidth?: number;
  /** Playback speed multiplier. */
  speed?: number;
  /** "hover" plays on hover / focus, "loop" repeats, "none" stays still. */
  animate?: "hover" | "loop" | "none";
}

/** Success Burst - Check Circle (outline), with particles. */
export function CheckCircleSuccessBurstIcon({ size = 24, color = "currentColor", strokeWidth = 2, speed = 1, animate = "hover", className, style, ...props }: IconProps) {
  const host = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || animate === "none" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const field = new ParticleField(el);
    let stop = () => {};
    const play = () => {
      stop();
      stop = playParticleScript(field, el, SCRIPT, { size, ink: getComputedStyle(el).color, speed, follow: el.querySelector(".fx") });
    };
    if (animate === "loop") {
      play();
      const timer = window.setInterval(play, (PASS_SECONDS / speed) * 1000);
      return () => {
        window.clearInterval(timer);
        stop();
        field.destroy();
      };
    }
    const leave = () => stop();
    el.addEventListener("pointerenter", play);
    el.addEventListener("focusin", play);
    el.addEventListener("pointerleave", leave);
    return () => {
      stop();
      field.destroy();
      el.removeEventListener("pointerenter", play);
      el.removeEventListener("focusin", play);
      el.removeEventListener("pointerleave", leave);
    };
  }, [animate, size, speed]);

  return (
    <span ref={host} style={{ position: "relative", display: "inline-flex", color }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className={className ? `icona-check-circle-success-burst ${className}` : "icona-check-circle-success-burst"}
        data-animate={animate}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        color={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ "--icona-speed": speed, ...style } as CSSProperties}
        aria-hidden="true"
        {...props}
      >
        <style>{CSS}</style>
        <g className="fx">
          <path d="M12 3.5A8.5 8.5 0 1 1 12 20.5A8.5 8.5 0 1 1 12 3.5"/>
          <path d="M8.25 12.25L10.75 14.75L15.75 9.5"/>
        </g>
      </svg>
    </span>
  );
}
