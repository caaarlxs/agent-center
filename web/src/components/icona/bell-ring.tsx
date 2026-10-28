// From Icona (icona.works, MIT), unchanged (stroke 2, as Lucide): played
// once by components/icona/moment.tsx.
import { type CSSProperties, type SVGProps } from "react";

const CSS = `
  .icona-bell-ring .fx{transform-origin:50% 6%;transform-box:view-box}
  @keyframes icona-bell-ring-fx-1{
    0%{transform:rotate(0deg);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    10.952%{transform:rotate(22deg);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    21.905%{transform:rotate(-17deg);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    32.857%{transform:rotate(11deg);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    43.81%{transform:rotate(-6deg);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    54.762%{transform:rotate(3deg);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    65.714%{transform:rotate(0deg);}
    100%{transform:rotate(0deg);}
  }
  .icona-bell-ring[data-animate="loop"] .fx,.icona-bell-ring[data-animate="hover"]:is(:hover,:focus-visible) .fx{animation:icona-bell-ring-fx-1 calc(1.75s / var(--icona-speed, 1)) linear var(--icona-iter,1)}
  .icona-bell-ring[data-animate="loop"]{--icona-iter:infinite}
  @media (prefers-reduced-motion:reduce){.icona-bell-ring *{animation:none!important}}
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

/** Ring - Bell (outline). */
export function BellRingIcon({ size = 24, color = "currentColor", strokeWidth = 2, speed = 1, animate = "hover", className, style, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className ? `icona-bell-ring ${className}` : "icona-bell-ring"}
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
        <path d="M12 3V4.5"/>
        <path d="M6 10.5A6 6 0 0 1 18 10.5V15L19.5 17.5H4.5L6 15Z"/>
        <path d="M10.2 20A2 2 0 0 0 13.8 20"/>
      </g>
    </svg>
  );
}
