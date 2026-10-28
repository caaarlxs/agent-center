// From Icona (icona.works, MIT), unchanged (stroke 2, as Lucide): played
// once by components/icona/moment.tsx.
import { type CSSProperties, type SVGProps } from "react";

const CSS = `
  .icona-refresh-spin .fx{transform-origin:50% 50%;transform-box:view-box}
  @keyframes icona-refresh-spin-fx-1{
    0%{transform:rotate(0deg);animation-timing-function:linear;}
    100%{transform:rotate(360deg);}
  }
  .icona-refresh-spin[data-animate="loop"] .fx,.icona-refresh-spin[data-animate="hover"]:is(:hover,:focus-visible) .fx{animation:icona-refresh-spin-fx-1 calc(1.4s / var(--icona-speed, 1)) linear infinite}
  @media (prefers-reduced-motion:reduce){.icona-refresh-spin *{animation:none!important}}
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

/** Spin - Refresh (outline). */
export function RefreshSpinIcon({ size = 24, color = "currentColor", strokeWidth = 2, speed = 1, animate = "hover", className, style, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className ? `icona-refresh-spin ${className}` : "icona-refresh-spin"}
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
        <path d="M20 12A8 8 0 1 1 17.66 6.34"/>
        <path d="M18 3V7H14"/>
      </g>
    </svg>
  );
}
