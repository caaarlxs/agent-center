// From Icona (icona.works, MIT), unchanged (stroke 2, as Lucide): played
// once by components/icona/moment.tsx.

import { useEffect, useRef, type CSSProperties, type SVGProps } from "react";
import { ParticleField, playParticleScript, type ParticleScript } from "./particles";

const CSS = `
  .icona-mic-voice-ripple .fx{transform-origin:50% 50%;transform-box:view-box}
  @keyframes icona-mic-voice-ripple-fx-1{
    0%{transform:scale(1);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    50%{transform:scale(1.06);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    100%{transform:scale(1);}
  }
  .icona-mic-voice-ripple[data-animate="loop"] .fx,.icona-mic-voice-ripple[data-animate="hover"]:is(:hover,:focus-visible) .fx{animation:icona-mic-voice-ripple-fx-1 calc(0.6s / var(--icona-speed, 1)) linear infinite}
  @media (prefers-reduced-motion:reduce){.icona-mic-voice-ripple *{animation:none!important}}
`;

/** Particle cues, on the 24-unit icon grid. */
const SCRIPT: ParticleScript = {
  "bursts": [],
  "emitters": [
    {
      "at": 0,
      "preset": "ripple",
      "rate": 1.7,
      "x": 12,
      "y": 12
    }
  ]
};
const PASS_SECONDS = 1.2;

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

/** Voice Ripple - Mic (outline), with particles. */
export function MicVoiceRippleIcon({ size = 24, color = "currentColor", strokeWidth = 2, speed = 1, animate = "hover", className, style, ...props }: IconProps) {
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
        className={className ? `icona-mic-voice-ripple ${className}` : "icona-mic-voice-ripple"}
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
          <path d="M9 6.5A3 3 0 0 1 15 6.5V11.5A3 3 0 0 1 9 11.5Z"/>
          <path d="M5.5 11A6.5 6.5 0 0 0 18.5 11"/>
          <path d="M12 17.5V21"/>
        </g>
      </svg>
    </span>
  );
}
