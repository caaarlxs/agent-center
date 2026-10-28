// From Icona (icona.works, MIT), unchanged (stroke 2, as Lucide): played
// once by components/icona/moment.tsx.
import { type CSSProperties, type SVGProps } from "react";

const CSS = `
  .icona-check-stamp .fx{transform-origin:50% 50%;transform-box:view-box}
  @keyframes icona-check-stamp-fx-1{
    0%{transform:scale(1);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    11.429%{transform:scale(0.7);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    22.857%{transform:scale(1.25);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    34.286%{transform:scale(0.92);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    45.714%{transform:scale(1.05);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    57.143%{transform:scale(1);}
    100%{transform:scale(1);}
  }
  .icona-check-stamp[data-animate="loop"] .fx,.icona-check-stamp[data-animate="hover"]:is(:hover,:focus-visible) .fx{animation:icona-check-stamp-fx-1 calc(1.4s / var(--icona-speed, 1)) linear var(--icona-iter,1)}
  .icona-check-stamp[data-animate="loop"]{--icona-iter:infinite}
  @media (prefers-reduced-motion:reduce){.icona-check-stamp *{animation:none!important}}
`;

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

/** Stamp - Check (outline). */
export function CheckStampIcon({ size = 24, color = "currentColor", strokeWidth = 2, speed = 1, animate = "hover", className, style, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className ? `icona-check-stamp ${className}` : "icona-check-stamp"}
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
        <path d="M5 12.5L9.5 17L19 7.5"/>
      </g>
    </svg>
  );
}
