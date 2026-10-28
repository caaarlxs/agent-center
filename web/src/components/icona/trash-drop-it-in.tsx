// From Icona (icona.works, MIT), unchanged (stroke 2, as Lucide): played
// once by components/icona/moment.tsx.
import { type CSSProperties, type SVGProps } from "react";

const CSS = `
  .icona-trash-drop-it-in .n1{transform-box:fill-box;transform-origin:0% 100%}
  .icona-trash-drop-it-in .n2{transform-box:fill-box;transform-origin:-110% 100%}
  .icona-trash-drop-it-in .n3{transform-box:fill-box;transform-origin:50% 50%}
  .icona-trash-drop-it-in .n4{transform-box:fill-box;transform-origin:50% 50%}
  .icona-trash-drop-it-in .n5{transform-box:fill-box;transform-origin:50% 50%}
  .icona-trash-drop-it-in .n6{transform-box:fill-box;transform-origin:50% 50%;transform:translateY(-6px) rotate(220deg);opacity:0}
  @keyframes icona-trash-drop-it-in-n1-1{
    0%{transform:translateY(0px) rotate(0deg);animation-timing-function:linear;}
    1.333%{transform:translateY(-0.011px) rotate(-0.2774deg);animation-timing-function:linear;}
    2.667%{transform:translateY(-0.05px) rotate(-1.2666deg);animation-timing-function:linear;}
    4%{transform:translateY(-0.1319px) rotate(-3.342deg);animation-timing-function:linear;}
    5.333%{transform:translateY(-0.2855px) rotate(-7.233deg);animation-timing-function:linear;}
    6.667%{transform:translateY(-0.5619px) rotate(-14.2347deg);animation-timing-function:linear;}
    8%{transform:translateY(-0.9381px) rotate(-23.7653deg);animation-timing-function:linear;}
    9.333%{transform:translateY(-1.2145px) rotate(-30.767deg);animation-timing-function:linear;}
    10.667%{transform:translateY(-1.3681px) rotate(-34.658deg);animation-timing-function:linear;}
    12%{transform:translateY(-1.45px) rotate(-36.7334deg);animation-timing-function:linear;}
    13.333%{transform:translateY(-1.489px) rotate(-37.7226deg);animation-timing-function:linear;}
    14.667%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    16%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    17.333%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    18.667%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    20%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    21.333%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    22.667%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    24%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    25.333%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    26.667%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    28%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    29.333%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    30.667%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    32%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    33.333%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    34.667%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    36%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    37.333%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    38.667%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    40%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    41.25%{transform:translateY(-1.4783px) rotate(-37.3924deg);animation-timing-function:linear;}
    42.5%{transform:translateY(-1.3938px) rotate(-35.0265deg);animation-timing-function:linear;}
    43.75%{transform:translateY(-1.1879px) rotate(-29.2601deg);animation-timing-function:linear;}
    45%{transform:translateY(-0.75px) rotate(-17deg);animation-timing-function:linear;}
    46.25%{transform:translateY(-0.3121px) rotate(-4.7399deg);animation-timing-function:linear;}
    47.5%{transform:translateY(-0.1062px) rotate(1.0265deg);animation-timing-function:linear;}
    48.75%{transform:translateY(-0.0217px) rotate(3.3924deg);animation-timing-function:linear;}
    50%{transform:translateY(0px) rotate(4deg);animation-timing-function:linear;}
    51.389%{transform:translateY(0px) rotate(3.9757deg);animation-timing-function:linear;}
    52.778%{transform:translateY(0px) rotate(3.8906deg);animation-timing-function:linear;}
    54.167%{transform:translateY(0px) rotate(3.7168deg);animation-timing-function:linear;}
    55.556%{transform:translateY(0px) rotate(3.4037deg);animation-timing-function:linear;}
    56.944%{transform:translateY(0px) rotate(2.8576deg);animation-timing-function:linear;}
    58.333%{transform:translateY(0px) rotate(2deg);animation-timing-function:linear;}
    59.722%{transform:translateY(0px) rotate(1.1424deg);animation-timing-function:linear;}
    61.111%{transform:translateY(0px) rotate(0.5963deg);animation-timing-function:linear;}
    62.5%{transform:translateY(0px) rotate(0.2832deg);animation-timing-function:linear;}
    63.889%{transform:translateY(0px) rotate(0.1094deg);animation-timing-function:linear;}
    65.278%{transform:translateY(0px) rotate(0.0243deg);animation-timing-function:linear;}
    66.667%{transform:translateY(0px) rotate(0deg);animation-timing-function:linear;}
    100%{transform:translateY(0px) rotate(0deg);}
  }
  @keyframes icona-trash-drop-it-in-n2-1{
    0%{transform:translateY(0px) rotate(0deg);animation-timing-function:linear;}
    1.333%{transform:translateY(-0.011px) rotate(-0.2774deg);animation-timing-function:linear;}
    2.667%{transform:translateY(-0.05px) rotate(-1.2666deg);animation-timing-function:linear;}
    4%{transform:translateY(-0.1319px) rotate(-3.342deg);animation-timing-function:linear;}
    5.333%{transform:translateY(-0.2855px) rotate(-7.233deg);animation-timing-function:linear;}
    6.667%{transform:translateY(-0.5619px) rotate(-14.2347deg);animation-timing-function:linear;}
    8%{transform:translateY(-0.9381px) rotate(-23.7653deg);animation-timing-function:linear;}
    9.333%{transform:translateY(-1.2145px) rotate(-30.767deg);animation-timing-function:linear;}
    10.667%{transform:translateY(-1.3681px) rotate(-34.658deg);animation-timing-function:linear;}
    12%{transform:translateY(-1.45px) rotate(-36.7334deg);animation-timing-function:linear;}
    13.333%{transform:translateY(-1.489px) rotate(-37.7226deg);animation-timing-function:linear;}
    14.667%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    16%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    17.333%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    18.667%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    20%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    21.333%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    22.667%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    24%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    25.333%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    26.667%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    28%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    29.333%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    30.667%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    32%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    33.333%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    34.667%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    36%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    37.333%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    38.667%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    40%{transform:translateY(-1.5px) rotate(-38deg);animation-timing-function:linear;}
    41.25%{transform:translateY(-1.4783px) rotate(-37.3924deg);animation-timing-function:linear;}
    42.5%{transform:translateY(-1.3938px) rotate(-35.0265deg);animation-timing-function:linear;}
    43.75%{transform:translateY(-1.1879px) rotate(-29.2601deg);animation-timing-function:linear;}
    45%{transform:translateY(-0.75px) rotate(-17deg);animation-timing-function:linear;}
    46.25%{transform:translateY(-0.3121px) rotate(-4.7399deg);animation-timing-function:linear;}
    47.5%{transform:translateY(-0.1062px) rotate(1.0265deg);animation-timing-function:linear;}
    48.75%{transform:translateY(-0.0217px) rotate(3.3924deg);animation-timing-function:linear;}
    50%{transform:translateY(0px) rotate(4deg);animation-timing-function:linear;}
    51.389%{transform:translateY(0px) rotate(3.9757deg);animation-timing-function:linear;}
    52.778%{transform:translateY(0px) rotate(3.8906deg);animation-timing-function:linear;}
    54.167%{transform:translateY(0px) rotate(3.7168deg);animation-timing-function:linear;}
    55.556%{transform:translateY(0px) rotate(3.4037deg);animation-timing-function:linear;}
    56.944%{transform:translateY(0px) rotate(2.8576deg);animation-timing-function:linear;}
    58.333%{transform:translateY(0px) rotate(2deg);animation-timing-function:linear;}
    59.722%{transform:translateY(0px) rotate(1.1424deg);animation-timing-function:linear;}
    61.111%{transform:translateY(0px) rotate(0.5963deg);animation-timing-function:linear;}
    62.5%{transform:translateY(0px) rotate(0.2832deg);animation-timing-function:linear;}
    63.889%{transform:translateY(0px) rotate(0.1094deg);animation-timing-function:linear;}
    65.278%{transform:translateY(0px) rotate(0.0243deg);animation-timing-function:linear;}
    66.667%{transform:translateY(0px) rotate(0deg);animation-timing-function:linear;}
    100%{transform:translateY(0px) rotate(0deg);}
  }
  @keyframes icona-trash-drop-it-in-n3-1{
    0%{transform:translateY(0px);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    16.667%{transform:translateY(0px);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    33.333%{transform:translateY(0.8px);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    50%{transform:translateY(-0.3px);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    66.667%{transform:translateY(0px);}
    100%{transform:translateY(0px);}
  }
  @keyframes icona-trash-drop-it-in-n4-1{
    0%{transform:translateY(0px);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    16.667%{transform:translateY(0px);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    33.333%{transform:translateY(0.8px);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    50%{transform:translateY(-0.3px);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    66.667%{transform:translateY(0px);}
    100%{transform:translateY(0px);}
  }
  @keyframes icona-trash-drop-it-in-n5-1{
    0%{transform:translateY(0px);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    16.667%{transform:translateY(0px);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    33.333%{transform:translateY(0.8px);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    50%{transform:translateY(-0.3px);animation-timing-function:cubic-bezier(0.22,1,0.36,1);}
    66.667%{transform:translateY(0px);}
    100%{transform:translateY(0px);}
  }
  @keyframes icona-trash-drop-it-in-n6-1{
    0%{transform:translateY(-6px) rotate(0deg);animation-timing-function:linear;}
    1.389%{transform:translateY(-6px) rotate(0deg);animation-timing-function:linear;}
    2.778%{transform:translateY(-6px) rotate(0deg);animation-timing-function:linear;}
    4.167%{transform:translateY(-6px) rotate(0deg);animation-timing-function:linear;}
    5.556%{transform:translateY(-6px) rotate(0deg);animation-timing-function:linear;}
    6.944%{transform:translateY(-6px) rotate(0deg);animation-timing-function:linear;}
    8.333%{transform:translateY(-6px) rotate(0deg);animation-timing-function:linear;}
    9.722%{transform:translateY(-6px) rotate(0deg);animation-timing-function:linear;}
    11.111%{transform:translateY(-6px) rotate(0deg);animation-timing-function:linear;}
    12.5%{transform:translateY(-6px) rotate(0deg);animation-timing-function:linear;}
    13.889%{transform:translateY(-6px) rotate(0deg);animation-timing-function:linear;}
    15.278%{transform:translateY(-6px) rotate(0deg);animation-timing-function:linear;}
    16.667%{transform:translateY(-6px) rotate(0deg);animation-timing-function:linear;}
    18.037%{transform:translateY(-5.9649px) rotate(1.2084deg);animation-timing-function:linear;}
    19.407%{transform:translateY(-5.8592px) rotate(4.5758deg);animation-timing-function:linear;}
    20.778%{transform:translateY(-5.6817px) rotate(9.7896deg);animation-timing-function:linear;}
    22.148%{transform:translateY(-5.4311px) rotate(16.61deg);animation-timing-function:linear;}
    23.519%{transform:translateY(-5.1054px) rotate(24.8488deg);animation-timing-function:linear;}
    24.889%{transform:translateY(-4.7021px) rotate(34.3561deg);animation-timing-function:linear;}
    26.259%{transform:translateY(-4.2178px) rotate(45.0101deg);animation-timing-function:linear;}
    27.63%{transform:translateY(-3.6484px) rotate(56.7115deg);animation-timing-function:linear;}
    29%{transform:translateY(-2.9882px) rotate(69.3785deg);animation-timing-function:linear;}
    30.37%{transform:translateY(-2.2301px) rotate(82.9441deg);animation-timing-function:linear;}
    31.741%{transform:translateY(-1.3644px) rotate(97.3535deg);animation-timing-function:linear;}
    33.111%{transform:translateY(-0.3779px) rotate(112.5632deg);animation-timing-function:linear;}
    34.481%{transform:translateY(0.7482px) rotate(128.5404deg);animation-timing-function:linear;}
    35.852%{transform:translateY(2.0419px) rotate(145.2636deg);animation-timing-function:linear;}
    37.222%{transform:translateY(3.5481px) rotate(162.7251deg);animation-timing-function:linear;}
    38.593%{transform:translateY(5.3476px) rotate(180.9379deg);animation-timing-function:linear;}
    39.963%{transform:translateY(7.6187px) rotate(199.9558deg);animation-timing-function:linear;}
    41.333%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    42.667%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    44%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    45.333%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    46.667%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    48%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    49.333%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    50.667%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    52%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    53.333%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    54.667%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    56%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    57.333%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    58.667%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    60%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    61.333%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    62.667%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    64%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    65.333%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    66.667%{transform:translateY(11px) rotate(220deg);animation-timing-function:linear;}
    100%{transform:translateY(11px) rotate(220deg);}
  }
  @keyframes icona-trash-drop-it-in-n6-2{
    0%{opacity:0;animation-timing-function:linear;}
    13.889%{opacity:0;animation-timing-function:linear;}
    16.111%{opacity:1;animation-timing-function:linear;}
    37.778%{opacity:1;animation-timing-function:linear;}
    40%{opacity:0;}
    100%{opacity:0;}
  }
  .icona-trash-drop-it-in[data-animate="loop"] .n1,.icona-trash-drop-it-in[data-animate="hover"]:is(:hover,:focus-visible) .n1{animation:icona-trash-drop-it-in-n1-1 calc(1.8s / var(--icona-speed, 1)) linear var(--icona-iter,1)}
  .icona-trash-drop-it-in[data-animate="loop"] .n2,.icona-trash-drop-it-in[data-animate="hover"]:is(:hover,:focus-visible) .n2{animation:icona-trash-drop-it-in-n2-1 calc(1.8s / var(--icona-speed, 1)) linear var(--icona-iter,1)}
  .icona-trash-drop-it-in[data-animate="loop"] .n3,.icona-trash-drop-it-in[data-animate="hover"]:is(:hover,:focus-visible) .n3{animation:icona-trash-drop-it-in-n3-1 calc(1.8s / var(--icona-speed, 1)) linear var(--icona-iter,1)}
  .icona-trash-drop-it-in[data-animate="loop"] .n4,.icona-trash-drop-it-in[data-animate="hover"]:is(:hover,:focus-visible) .n4{animation:icona-trash-drop-it-in-n4-1 calc(1.8s / var(--icona-speed, 1)) linear var(--icona-iter,1)}
  .icona-trash-drop-it-in[data-animate="loop"] .n5,.icona-trash-drop-it-in[data-animate="hover"]:is(:hover,:focus-visible) .n5{animation:icona-trash-drop-it-in-n5-1 calc(1.8s / var(--icona-speed, 1)) linear var(--icona-iter,1)}
  .icona-trash-drop-it-in[data-animate="loop"] .n6,.icona-trash-drop-it-in[data-animate="hover"]:is(:hover,:focus-visible) .n6{animation:icona-trash-drop-it-in-n6-1 calc(1.8s / var(--icona-speed, 1)) linear var(--icona-iter,1) alternate forwards,icona-trash-drop-it-in-n6-2 calc(1.8s / var(--icona-speed, 1)) linear var(--icona-iter,1)}
  .icona-trash-drop-it-in[data-animate="loop"]{--icona-iter:infinite}
  @media (prefers-reduced-motion:reduce){.icona-trash-drop-it-in *{animation:none!important}}
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

/** Drop It In - Trash (outline). */
export function TrashDropItInIcon({ size = 24, color = "currentColor", strokeWidth = 2, speed = 1, animate = "hover", className, style, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className ? `icona-trash-drop-it-in ${className}` : "icona-trash-drop-it-in"}
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
        <path d="M4 6.5H20" className="n1"/>
        <path d="M9.5 6.5V5A1.5 1.5 0 0 1 11 3.5H13A1.5 1.5 0 0 1 14.5 5V6.5" className="n2"/>
        <path d="M6 6.5L6.9 19.1A1.5 1.5 0 0 0 8.4 20.5H15.6A1.5 1.5 0 0 0 17.1 19.1L18 6.5" className="n3"/>
        <path d="M10 10.5V16.5" className="n4"/>
        <path d="M14 10.5V16.5" className="n5"/>
        <path d="M10.5 1L13.5 1.5L13 4L10 3.5Z" className="n6"/>
      </g>
    </svg>
  );
}
