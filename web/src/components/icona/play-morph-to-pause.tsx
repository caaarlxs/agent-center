// From Icona (icona.works, MIT), unchanged (stroke 2, as Lucide): played
// once by components/icona/moment.tsx.
import { type CSSProperties, type SVGProps } from "react";

const CSS = `
  .icona-play-morph-to-pause .fx{transform-origin:50% 50%;transform-box:view-box}
  .icona-play-morph-to-pause .tw{opacity:0;transform-origin:50% 50%;transform-box:view-box;transform:scale(0.5) rotate(40deg)}
  @keyframes icona-play-morph-to-pause-fx-1{
    0%{transform:scale(1) rotate(0deg);animation-timing-function:linear;}
    1.953%{transform:scale(0.9017) rotate(-7.8636deg);animation-timing-function:linear;}
    3.906%{transform:scale(0.8152) rotate(-14.7866deg);animation-timing-function:linear;}
    5.859%{transform:scale(0.7422) rotate(-20.6265deg);animation-timing-function:linear;}
    7.813%{transform:scale(0.683) rotate(-25.3592deg);animation-timing-function:linear;}
    9.766%{transform:scale(0.6366) rotate(-29.0728deg);animation-timing-function:linear;}
    11.719%{transform:scale(0.601) rotate(-31.9218deg);animation-timing-function:linear;}
    13.672%{transform:scale(0.574) rotate(-34.077deg);animation-timing-function:linear;}
    15.625%{transform:scale(0.5538) rotate(-35.6935deg);animation-timing-function:linear;}
    17.578%{transform:scale(0.5388) rotate(-36.8994deg);animation-timing-function:linear;}
    19.531%{transform:scale(0.5276) rotate(-37.7945deg);animation-timing-function:linear;}
    21.484%{transform:scale(0.5193) rotate(-38.4553deg);animation-timing-function:linear;}
    23.438%{transform:scale(0.5133) rotate(-38.9393deg);animation-timing-function:linear;}
    25.391%{transform:scale(0.5089) rotate(-39.2899deg);animation-timing-function:linear;}
    27.344%{transform:scale(0.5058) rotate(-39.54deg);animation-timing-function:linear;}
    29.297%{transform:scale(0.5036) rotate(-39.7146deg);animation-timing-function:linear;}
    31.25%{transform:scale(0.5021) rotate(-39.8329deg);animation-timing-function:linear;}
    33.203%{transform:scale(0.5011) rotate(-39.9098deg);animation-timing-function:linear;}
    35.156%{transform:scale(0.5005) rotate(-39.9568deg);animation-timing-function:linear;}
    37.109%{transform:scale(0.5002) rotate(-39.9829deg);animation-timing-function:linear;}
    39.063%{transform:scale(0.5001) rotate(-39.9952deg);animation-timing-function:linear;}
    41.016%{transform:scale(0.5) rotate(-39.9994deg);animation-timing-function:linear;}
    42.969%{transform:scale(0.5) rotate(-40deg);animation-timing-function:linear;}
    100%{transform:scale(0.5) rotate(-40deg);}
  }
  @keyframes icona-play-morph-to-pause-fx-2{
    0%{opacity:1;animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    42.969%{opacity:0;}
    100%{opacity:0;}
  }
  @keyframes icona-play-morph-to-pause-fx-3{
    0%{filter:blur(0px);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    42.969%{filter:blur(4px);}
    100%{filter:blur(4px);}
  }
  @keyframes icona-play-morph-to-pause-tw-1{
    0%{transform:scale(0.5) rotate(40deg);animation-timing-function:linear;}
    1.563%{transform:scale(0.5) rotate(40deg);animation-timing-function:linear;}
    3.125%{transform:scale(0.5) rotate(40deg);animation-timing-function:linear;}
    4.688%{transform:scale(0.5) rotate(40deg);animation-timing-function:linear;}
    6.25%{transform:scale(0.5) rotate(40deg);animation-timing-function:linear;}
    8.203%{transform:scale(0.5908) rotate(32.7382deg);animation-timing-function:linear;}
    10.156%{transform:scale(0.6721) rotate(26.2356deg);animation-timing-function:linear;}
    12.109%{transform:scale(0.7441) rotate(20.4718deg);animation-timing-function:linear;}
    14.063%{transform:scale(0.8072) rotate(15.4226deg);animation-timing-function:linear;}
    16.016%{transform:scale(0.8618) rotate(11.059deg);animation-timing-function:linear;}
    17.969%{transform:scale(0.9081) rotate(7.3484deg);animation-timing-function:linear;}
    19.922%{transform:scale(0.9468) rotate(4.254deg);animation-timing-function:linear;}
    21.875%{transform:scale(0.9783) rotate(1.7353deg);animation-timing-function:linear;}
    23.828%{transform:scale(1.0031) rotate(-0.2514deg);animation-timing-function:linear;}
    25.781%{transform:scale(1.0219) rotate(-1.7526deg);animation-timing-function:linear;}
    27.734%{transform:scale(1.0352) rotate(-2.8172deg);animation-timing-function:linear;}
    29.688%{transform:scale(1.0437) rotate(-3.496deg);animation-timing-function:linear;}
    31.641%{transform:scale(1.048) rotate(-3.841deg);animation-timing-function:linear;}
    33.594%{transform:scale(1.0488) rotate(-3.9045deg);animation-timing-function:linear;}
    35.547%{transform:scale(1.0467) rotate(-3.7394deg);animation-timing-function:linear;}
    37.5%{transform:scale(1.0425) rotate(-3.3975deg);animation-timing-function:linear;}
    39.453%{transform:scale(1.0366) rotate(-2.9299deg);animation-timing-function:linear;}
    41.406%{transform:scale(1.0298) rotate(-2.3859deg);animation-timing-function:linear;}
    43.359%{transform:scale(1.0227) rotate(-1.813deg);animation-timing-function:linear;}
    45.313%{transform:scale(1.0157) rotate(-1.2564deg);animation-timing-function:linear;}
    47.266%{transform:scale(1.0095) rotate(-0.7585deg);animation-timing-function:linear;}
    49.219%{transform:scale(1.0045) rotate(-0.3591deg);animation-timing-function:linear;}
    51.172%{transform:scale(1.0012) rotate(-0.095deg);animation-timing-function:linear;}
    53.125%{transform:scale(1) rotate(0deg);animation-timing-function:linear;}
    53.125%{transform:scale(1) rotate(0deg);animation-timing-function:linear;}
    100%{transform:scale(1) rotate(0deg);}
  }
  @keyframes icona-play-morph-to-pause-tw-2{
    0%{opacity:0;animation-timing-function:linear;}
    6.25%{opacity:0;animation-timing-function:cubic-bezier(0.34,1.56,0.64,1);}
    53.125%{opacity:1;}
    100%{opacity:1;}
  }
  @keyframes icona-play-morph-to-pause-tw-3{
    0%{filter:blur(4px);animation-timing-function:linear;}
    6.25%{filter:blur(4px);animation-timing-function:cubic-bezier(0.34,1.56,0.64,1);}
    53.125%{filter:blur(0px);}
    100%{filter:blur(0px);}
  }
  .icona-play-morph-to-pause[data-animate="loop"] .fx,.icona-play-morph-to-pause[data-animate="hover"]:is(:hover,:focus-visible) .fx{animation:icona-play-morph-to-pause-fx-1 calc(1.28s / var(--icona-speed, 1)) linear var(--icona-iter,1) alternate forwards,icona-play-morph-to-pause-fx-2 calc(1.28s / var(--icona-speed, 1)) linear var(--icona-iter,1) alternate forwards,icona-play-morph-to-pause-fx-3 calc(1.28s / var(--icona-speed, 1)) linear var(--icona-iter,1) alternate forwards}
  .icona-play-morph-to-pause[data-animate="loop"] .tw,.icona-play-morph-to-pause[data-animate="hover"]:is(:hover,:focus-visible) .tw{animation:icona-play-morph-to-pause-tw-1 calc(1.28s / var(--icona-speed, 1)) linear var(--icona-iter,1) alternate forwards,icona-play-morph-to-pause-tw-2 calc(1.28s / var(--icona-speed, 1)) linear var(--icona-iter,1) alternate forwards,icona-play-morph-to-pause-tw-3 calc(1.28s / var(--icona-speed, 1)) linear var(--icona-iter,1) alternate forwards}
  .icona-play-morph-to-pause[data-animate="loop"]{--icona-iter:infinite}
  @media (prefers-reduced-motion:reduce){.icona-play-morph-to-pause *{animation:none!important}}
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

/** Morph to Pause - Play (outline). */
export function PlayMorphToPauseIcon({ size = 24, color = "currentColor", strokeWidth = 2, speed = 1, animate = "hover", className, style, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className ? `icona-play-morph-to-pause ${className}` : "icona-play-morph-to-pause"}
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
        <path d="M8 5.5V18.5A0.75 0.75 0 0 0 9.1 19.15L19.5 12.65A0.75 0.75 0 0 0 19.5 11.35L9.1 4.85A0.75 0.75 0 0 0 8 5.5Z"/>
      </g>
      <g className="tw">
        <path d="M7 5H9.5A0.5 0.5 0 0 1 10 5.5V18.5A0.5 0.5 0 0 1 9.5 19H7A0.5 0.5 0 0 1 6.5 18.5V5.5A0.5 0.5 0 0 1 7 5Z"/>
        <path d="M14.5 5H17A0.5 0.5 0 0 1 17.5 5.5V18.5A0.5 0.5 0 0 1 17 19H14.5A0.5 0.5 0 0 1 14 18.5V5.5A0.5 0.5 0 0 1 14.5 5Z"/>
      </g>
    </svg>
  );
}
