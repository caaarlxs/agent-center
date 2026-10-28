// From Icona (icona.works, MIT), unchanged (stroke 2, as Lucide): played
// once by components/icona/moment.tsx.
import { type CSSProperties, type SVGProps } from "react";

const CSS = `
  .icona-sun-slow-spin .fx{transform-origin:50% 50%;transform-box:view-box}
  @keyframes icona-sun-slow-spin-fx-1{
    0%{transform:rotate(0deg);animation-timing-function:linear;}
    100%{transform:rotate(360deg);}
  }
  .icona-sun-slow-spin[data-animate="loop"] .fx,.icona-sun-slow-spin[data-animate="hover"]:is(:hover,:focus-visible) .fx{animation:icona-sun-slow-spin-fx-1 calc(6s / var(--icona-speed, 1)) linear infinite}
  @media (prefers-reduced-motion:reduce){.icona-sun-slow-spin *{animation:none!important}}
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

/** Slow Spin - Sun (outline). */
export function SunSlowSpinIcon({ size = 24, color = "currentColor", strokeWidth = 2, speed = 1, animate = "hover", className, style, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className ? `icona-sun-slow-spin ${className}` : "icona-sun-slow-spin"}
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
        <circle cx={12} cy={12} r={4}/>
        <path d="M12 5.5V3.5"/>
        <path d="M16.6 7.4L18 6"/>
        <path d="M18.5 12H20.5"/>
        <path d="M16.6 16.6L18 18"/>
        <path d="M12 18.5V20.5"/>
        <path d="M7.4 16.6L6 18"/>
        <path d="M5.5 12H3.5"/>
        <path d="M7.4 7.4L6 6"/>
      </g>
    </svg>
  );
}
