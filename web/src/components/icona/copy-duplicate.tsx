// From Icona (icona.works, MIT), unchanged (stroke 2, as Lucide): played
// once by components/icona/moment.tsx.
import { type CSSProperties, type SVGProps } from "react";

const CSS = `
  .icona-copy-duplicate .tr1{opacity:0;transform-origin:50% 50%;transform-box:view-box}
  .icona-copy-duplicate .tr2{opacity:0;transform-origin:50% 50%;transform-box:view-box}
  .icona-copy-duplicate .tr3{opacity:0;transform-origin:50% 50%;transform-box:view-box}
  .icona-copy-duplicate .tr4{opacity:0;transform-origin:50% 50%;transform-box:view-box}
  .icona-copy-duplicate .fx{transform-origin:50% 50%;transform-box:view-box}
  @keyframes icona-copy-duplicate-tr1-1{
    0%{transform:translateX(0px);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    17.647%{transform:translateX(6px);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    35.294%{transform:translateX(-6px);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    52.941%{transform:translateX(0px);}
    100%{transform:translateX(0px);}
  }
  @keyframes icona-copy-duplicate-tr1-2{
    0%{opacity:0;animation-timing-function:linear;}
    4.471%{opacity:0.34;animation-timing-function:linear;}
    44.706%{opacity:0.34;animation-timing-function:linear;}
    55.882%{opacity:0;}
    100%{opacity:0;}
  }
  @keyframes icona-copy-duplicate-tr2-1{
    0%{transform:translateX(0px);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    17.647%{transform:translateX(6px);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    35.294%{transform:translateX(-6px);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    52.941%{transform:translateX(0px);}
    100%{transform:translateX(0px);}
  }
  @keyframes icona-copy-duplicate-tr2-2{
    0%{opacity:0;animation-timing-function:linear;}
    4.706%{opacity:0.2;animation-timing-function:linear;}
    47.059%{opacity:0.2;animation-timing-function:linear;}
    58.824%{opacity:0;}
    100%{opacity:0;}
  }
  @keyframes icona-copy-duplicate-tr3-1{
    0%{transform:translateX(0px);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    17.647%{transform:translateX(6px);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    35.294%{transform:translateX(-6px);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    52.941%{transform:translateX(0px);}
    100%{transform:translateX(0px);}
  }
  @keyframes icona-copy-duplicate-tr3-2{
    0%{opacity:0;animation-timing-function:linear;}
    4.941%{opacity:0.12;animation-timing-function:linear;}
    49.412%{opacity:0.12;animation-timing-function:linear;}
    61.765%{opacity:0;}
    100%{opacity:0;}
  }
  @keyframes icona-copy-duplicate-tr4-1{
    0%{transform:translateX(0px);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    17.647%{transform:translateX(6px);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    35.294%{transform:translateX(-6px);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    52.941%{transform:translateX(0px);}
    100%{transform:translateX(0px);}
  }
  @keyframes icona-copy-duplicate-tr4-2{
    0%{opacity:0;animation-timing-function:linear;}
    5.176%{opacity:0.07;animation-timing-function:linear;}
    51.765%{opacity:0.07;animation-timing-function:linear;}
    64.706%{opacity:0;}
    100%{opacity:0;}
  }
  @keyframes icona-copy-duplicate-fx-1{
    0%{transform:translateX(0px);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    17.647%{transform:translateX(6px);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    35.294%{transform:translateX(-6px);animation-timing-function:cubic-bezier(0.65,0,0.35,1);}
    52.941%{transform:translateX(0px);}
    100%{transform:translateX(0px);}
  }
  .icona-copy-duplicate[data-animate="loop"] .tr1,.icona-copy-duplicate[data-animate="hover"]:is(:hover,:focus-visible) .tr1{animation:icona-copy-duplicate-tr1-1 calc(1.7s / var(--icona-speed, 1)) linear calc(0.05s / var(--icona-speed, 1)) var(--icona-iter,1),icona-copy-duplicate-tr1-2 calc(1.7s / var(--icona-speed, 1)) linear calc(0.05s / var(--icona-speed, 1)) var(--icona-iter,1)}
  .icona-copy-duplicate[data-animate="loop"] .tr2,.icona-copy-duplicate[data-animate="hover"]:is(:hover,:focus-visible) .tr2{animation:icona-copy-duplicate-tr2-1 calc(1.7s / var(--icona-speed, 1)) linear calc(0.1s / var(--icona-speed, 1)) var(--icona-iter,1),icona-copy-duplicate-tr2-2 calc(1.7s / var(--icona-speed, 1)) linear calc(0.1s / var(--icona-speed, 1)) var(--icona-iter,1)}
  .icona-copy-duplicate[data-animate="loop"] .tr3,.icona-copy-duplicate[data-animate="hover"]:is(:hover,:focus-visible) .tr3{animation:icona-copy-duplicate-tr3-1 calc(1.7s / var(--icona-speed, 1)) linear calc(0.15s / var(--icona-speed, 1)) var(--icona-iter,1),icona-copy-duplicate-tr3-2 calc(1.7s / var(--icona-speed, 1)) linear calc(0.15s / var(--icona-speed, 1)) var(--icona-iter,1)}
  .icona-copy-duplicate[data-animate="loop"] .tr4,.icona-copy-duplicate[data-animate="hover"]:is(:hover,:focus-visible) .tr4{animation:icona-copy-duplicate-tr4-1 calc(1.7s / var(--icona-speed, 1)) linear calc(0.2s / var(--icona-speed, 1)) var(--icona-iter,1),icona-copy-duplicate-tr4-2 calc(1.7s / var(--icona-speed, 1)) linear calc(0.2s / var(--icona-speed, 1)) var(--icona-iter,1)}
  .icona-copy-duplicate[data-animate="loop"] .fx,.icona-copy-duplicate[data-animate="hover"]:is(:hover,:focus-visible) .fx{animation:icona-copy-duplicate-fx-1 calc(1.7s / var(--icona-speed, 1)) linear var(--icona-iter,1)}
  .icona-copy-duplicate[data-animate="loop"]{--icona-iter:infinite}
  @media (prefers-reduced-motion:reduce){.icona-copy-duplicate *{animation:none!important}}
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

/** Duplicate - Copy (outline). */
export function CopyDuplicateIcon({ size = 24, color = "currentColor", strokeWidth = 2, speed = 1, animate = "hover", className, style, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className ? `icona-copy-duplicate ${className}` : "icona-copy-duplicate"}
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
      <g className="tr1">
        <path d="M15.5 8V5.5A1.5 1.5 0 0 0 14 4H5.5A1.5 1.5 0 0 0 4 5.5V14A1.5 1.5 0 0 0 5.5 15.5H8"/>
        <path d="M10 8H18.5A1.5 1.5 0 0 1 20 9.5V18A1.5 1.5 0 0 1 18.5 19.5H10A1.5 1.5 0 0 1 8.5 18V9.5A1.5 1.5 0 0 1 10 8Z"/>
      </g>
      <g className="tr2">
        <path d="M15.5 8V5.5A1.5 1.5 0 0 0 14 4H5.5A1.5 1.5 0 0 0 4 5.5V14A1.5 1.5 0 0 0 5.5 15.5H8"/>
        <path d="M10 8H18.5A1.5 1.5 0 0 1 20 9.5V18A1.5 1.5 0 0 1 18.5 19.5H10A1.5 1.5 0 0 1 8.5 18V9.5A1.5 1.5 0 0 1 10 8Z"/>
      </g>
      <g className="tr3">
        <path d="M15.5 8V5.5A1.5 1.5 0 0 0 14 4H5.5A1.5 1.5 0 0 0 4 5.5V14A1.5 1.5 0 0 0 5.5 15.5H8"/>
        <path d="M10 8H18.5A1.5 1.5 0 0 1 20 9.5V18A1.5 1.5 0 0 1 18.5 19.5H10A1.5 1.5 0 0 1 8.5 18V9.5A1.5 1.5 0 0 1 10 8Z"/>
      </g>
      <g className="tr4">
        <path d="M15.5 8V5.5A1.5 1.5 0 0 0 14 4H5.5A1.5 1.5 0 0 0 4 5.5V14A1.5 1.5 0 0 0 5.5 15.5H8"/>
        <path d="M10 8H18.5A1.5 1.5 0 0 1 20 9.5V18A1.5 1.5 0 0 1 18.5 19.5H10A1.5 1.5 0 0 1 8.5 18V9.5A1.5 1.5 0 0 1 10 8Z"/>
      </g>
      <g className="fx">
        <path d="M15.5 8V5.5A1.5 1.5 0 0 0 14 4H5.5A1.5 1.5 0 0 0 4 5.5V14A1.5 1.5 0 0 0 5.5 15.5H8"/>
        <path d="M10 8H18.5A1.5 1.5 0 0 1 20 9.5V18A1.5 1.5 0 0 1 18.5 19.5H10A1.5 1.5 0 0 1 8.5 18V9.5A1.5 1.5 0 0 1 10 8Z"/>
      </g>
    </svg>
  );
}
