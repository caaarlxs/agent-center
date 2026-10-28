// From Icona (icona.works, MIT), unchanged (stroke 2, as Lucide): played
// once by components/icona/moment.tsx.

import { useEffect, useRef, type CSSProperties, type SVGProps } from "react";
import { ParticleField, playParticleScript, type ParticleScript } from "./particles";

const CSS = `
  .icona-paper-plane-fly-curve .fx{transform-origin:50% 50%;transform-box:view-box;transform:translateX(0px) translateY(0px) rotate(70deg)}
  @keyframes icona-paper-plane-fly-curve-fx-1{
    0%{transform:translateX(0px) translateY(0px) rotate(70deg);animation-timing-function:linear;}
    0.95%{transform:translateX(0.0403px) translateY(0.0439px) rotate(70deg);animation-timing-function:linear;}
    1.9%{transform:translateX(0.0805px) translateY(0.0878px) rotate(70deg);animation-timing-function:linear;}
    2.85%{transform:translateX(0.1208px) translateY(0.1317px) rotate(70deg);animation-timing-function:linear;}
    3.8%{transform:translateX(0.161px) translateY(0.1756px) rotate(70deg);animation-timing-function:linear;}
    4.75%{transform:translateX(0.2848px) translateY(0.2941px) rotate(70deg);animation-timing-function:linear;}
    5.7%{transform:translateX(0.4085px) translateY(0.4126px) rotate(70deg);animation-timing-function:linear;}
    6.65%{transform:translateX(0.5323px) translateY(0.5311px) rotate(70deg);animation-timing-function:linear;}
    7.6%{transform:translateX(0.656px) translateY(0.6496px) rotate(70deg);animation-timing-function:linear;}
    8.55%{transform:translateX(0.8723px) translateY(0.8031px) rotate(70deg);animation-timing-function:linear;}
    9.5%{transform:translateX(1.0885px) translateY(0.9566px) rotate(70deg);animation-timing-function:linear;}
    10.45%{transform:translateX(1.3047px) translateY(1.1101px) rotate(70deg);animation-timing-function:linear;}
    11.4%{transform:translateX(1.521px) translateY(1.2636px) rotate(70deg);animation-timing-function:linear;}
    12.35%{transform:translateX(1.8447px) translateY(1.3861px) rotate(66.6348deg);animation-timing-function:linear;}
    13.3%{transform:translateX(2.1685px) translateY(1.5086px) rotate(63.2696deg);animation-timing-function:linear;}
    14.25%{transform:translateX(2.4923px) translateY(1.6311px) rotate(59.9045deg);animation-timing-function:linear;}
    15.2%{transform:translateX(2.816px) translateY(1.7536px) rotate(56.5393deg);animation-timing-function:linear;}
    16.15%{transform:translateX(3.2683px) translateY(1.7527px) rotate(50.9584deg);animation-timing-function:linear;}
    17.1%{transform:translateX(3.7205px) translateY(1.7518px) rotate(45.3775deg);animation-timing-function:linear;}
    18.05%{transform:translateX(4.1728px) translateY(1.7509px) rotate(39.7966deg);animation-timing-function:linear;}
    19%{transform:translateX(4.625px) translateY(1.75px) rotate(34.2157deg);animation-timing-function:linear;}
    19.95%{transform:translateX(5.2328px) translateY(1.5069px) rotate(29.2803deg);animation-timing-function:linear;}
    20.9%{transform:translateX(5.8405px) translateY(1.2638px) rotate(24.3449deg);animation-timing-function:linear;}
    21.85%{transform:translateX(6.4482px) translateY(1.0207px) rotate(19.4095deg);animation-timing-function:linear;}
    22.8%{transform:translateX(7.056px) translateY(0.7776px) rotate(14.4741deg);animation-timing-function:linear;}
    23.75%{transform:translateX(7.8523px) translateY(0.1471px) rotate(11.0468deg);animation-timing-function:linear;}
    24.7%{transform:translateX(8.6485px) translateY(-0.4834px) rotate(7.6196deg);animation-timing-function:linear;}
    25.65%{transform:translateX(9.4448px) translateY(-1.1139px) rotate(4.1923deg);animation-timing-function:linear;}
    26.6%{transform:translateX(10.241px) translateY(-1.7444px) rotate(0.7651deg);animation-timing-function:linear;}
    27.55%{transform:translateX(11.2648px) translateY(-2.9339px) rotate(-1.4444deg);animation-timing-function:linear;}
    28.5%{transform:translateX(12.2885px) translateY(-4.1234px) rotate(-3.6538deg);animation-timing-function:linear;}
    29.45%{transform:translateX(13.3123px) translateY(-5.3129px) rotate(-5.8633deg);animation-timing-function:linear;}
    30.4%{transform:translateX(14.336px) translateY(-6.5024px) rotate(-8.0727deg);animation-timing-function:linear;}
    31.35%{transform:translateX(15.6323px) translateY(-8.4489px) rotate(-9.5178deg);animation-timing-function:linear;}
    32.3%{transform:translateX(16.9285px) translateY(-10.3954px) rotate(-10.9629deg);animation-timing-function:linear;}
    33.25%{transform:translateX(18.2248px) translateY(-12.3419px) rotate(-12.408deg);animation-timing-function:linear;}
    34.2%{transform:translateX(19.521px) translateY(-14.2884px) rotate(-13.8532deg);animation-timing-function:linear;}
    35.15%{transform:translateX(21.1407px) translateY(-17.2163px) rotate(-14.8153deg);animation-timing-function:linear;}
    36.1%{transform:translateX(22.7605px) translateY(-20.1442px) rotate(-15.7774deg);animation-timing-function:linear;}
    37.05%{transform:translateX(24.3803px) translateY(-23.0721px) rotate(-16.7396deg);animation-timing-function:linear;}
    38%{transform:translateX(26px) translateY(-26px) rotate(-17.7017deg);animation-timing-function:linear;}
    38.76%{transform:translateX(0px) translateY(-5.2px) rotate(-4.1331deg);animation-timing-function:linear;}
    39.52%{transform:translateX(-26px) translateY(15.6px) rotate(9.4354deg);animation-timing-function:linear;}
    40.432%{transform:translateX(-24.3506px) translateY(14.4524px) rotate(9.7665deg);animation-timing-function:linear;}
    41.344%{transform:translateX(-22.7012px) translateY(13.3049px) rotate(10.0976deg);animation-timing-function:linear;}
    42.256%{transform:translateX(-21.0518px) translateY(12.1573px) rotate(10.4288deg);animation-timing-function:linear;}
    43.168%{transform:translateX(-19.4023px) translateY(11.0098px) rotate(10.7599deg);animation-timing-function:linear;}
    44.08%{transform:translateX(-17.7529px) translateY(9.8622px) rotate(11.091deg);animation-timing-function:linear;}
    44.992%{transform:translateX(-16.5367px) translateY(9.0738px) rotate(11.513deg);animation-timing-function:linear;}
    45.904%{transform:translateX(-15.3205px) translateY(8.2854px) rotate(11.935deg);animation-timing-function:linear;}
    46.816%{transform:translateX(-14.1043px) translateY(7.4971px) rotate(12.357deg);animation-timing-function:linear;}
    47.728%{transform:translateX(-12.8881px) translateY(6.7087px) rotate(12.7791deg);animation-timing-function:linear;}
    48.64%{transform:translateX(-11.6719px) translateY(5.9203px) rotate(13.2011deg);animation-timing-function:linear;}
    49.552%{transform:translateX(-10.7975px) translateY(5.4028px) rotate(13.7214deg);animation-timing-function:linear;}
    50.464%{transform:translateX(-9.923px) translateY(4.8852px) rotate(14.2417deg);animation-timing-function:linear;}
    51.376%{transform:translateX(-9.0486px) translateY(4.3676px) rotate(14.7619deg);animation-timing-function:linear;}
    52.288%{transform:translateX(-8.1742px) translateY(3.8501px) rotate(15.2822deg);animation-timing-function:linear;}
    53.2%{transform:translateX(-7.2998px) translateY(3.3325px) rotate(15.8025deg);animation-timing-function:linear;}
    54.112%{transform:translateX(-6.6898px) translateY(3.011px) rotate(16.421deg);animation-timing-function:linear;}
    55.024%{transform:translateX(-6.0799px) translateY(2.6895px) rotate(17.0396deg);animation-timing-function:linear;}
    55.936%{transform:translateX(-5.4699px) translateY(2.368px) rotate(17.6581deg);animation-timing-function:linear;}
    56.848%{transform:translateX(-4.86px) translateY(2.0465px) rotate(18.2766deg);animation-timing-function:linear;}
    57.76%{transform:translateX(-4.25px) translateY(1.725px) rotate(18.8951deg);animation-timing-function:linear;}
    58.672%{transform:translateX(-3.8412px) translateY(1.5384px) rotate(19.5793deg);animation-timing-function:linear;}
    59.584%{transform:translateX(-3.4324px) translateY(1.3518px) rotate(20.2634deg);animation-timing-function:linear;}
    60.496%{transform:translateX(-3.0236px) translateY(1.1651px) rotate(20.9475deg);animation-timing-function:linear;}
    61.408%{transform:translateX(-2.6148px) translateY(0.9785px) rotate(21.6316deg);animation-timing-function:linear;}
    62.32%{transform:translateX(-2.2061px) translateY(0.7919px) rotate(22.3158deg);animation-timing-function:linear;}
    63.232%{transform:translateX(-1.9492px) translateY(0.6926px) rotate(22.9782deg);animation-timing-function:linear;}
    64.144%{transform:translateX(-1.6924px) translateY(0.5933px) rotate(23.6405deg);animation-timing-function:linear;}
    65.056%{transform:translateX(-1.4355px) translateY(0.4939px) rotate(24.3029deg);animation-timing-function:linear;}
    65.968%{transform:translateX(-1.1787px) translateY(0.3946px) rotate(24.9653deg);animation-timing-function:linear;}
    66.88%{transform:translateX(-0.9219px) translateY(0.2953px) rotate(25.6277deg);animation-timing-function:linear;}
    67.792%{transform:translateX(-0.7818px) translateY(0.2493px) rotate(26.1258deg);animation-timing-function:linear;}
    68.704%{transform:translateX(-0.6418px) translateY(0.2033px) rotate(26.6238deg);animation-timing-function:linear;}
    69.616%{transform:translateX(-0.5018px) translateY(0.1573px) rotate(27.1219deg);animation-timing-function:linear;}
    70.528%{transform:translateX(-0.3617px) translateY(0.1113px) rotate(27.62deg);animation-timing-function:linear;}
    71.44%{transform:translateX(-0.2217px) translateY(0.0653px) rotate(28.1181deg);animation-timing-function:linear;}
    72.352%{transform:translateX(-0.1773px) translateY(0.0523px) rotate(22.4945deg);animation-timing-function:linear;}
    73.264%{transform:translateX(-0.133px) translateY(0.0392px) rotate(16.8709deg);animation-timing-function:linear;}
    74.176%{transform:translateX(-0.0887px) translateY(0.0261px) rotate(11.2472deg);animation-timing-function:linear;}
    75.088%{transform:translateX(-0.0443px) translateY(0.0131px) rotate(5.6236deg);animation-timing-function:linear;}
    76%{transform:translateX(0px) translateY(0px) rotate(0deg);animation-timing-function:linear;}
    100%{transform:translateX(0px) translateY(0px) rotate(0deg);}
  }
  @keyframes icona-paper-plane-fly-curve-fx-2{
    0%{opacity:1;animation-timing-function:linear;}
    37.62%{opacity:1;animation-timing-function:linear;}
    38%{opacity:0;animation-timing-function:linear;}
    39.52%{opacity:0;animation-timing-function:linear;}
    39.9%{opacity:1;}
    100%{opacity:1;}
  }
  .icona-paper-plane-fly-curve[data-animate="loop"] .fx,.icona-paper-plane-fly-curve[data-animate="hover"]:is(:hover,:focus-visible) .fx{animation:icona-paper-plane-fly-curve-fx-1 calc(2.5s / var(--icona-speed, 1)) linear var(--icona-iter,1) alternate forwards,icona-paper-plane-fly-curve-fx-2 calc(2.5s / var(--icona-speed, 1)) linear var(--icona-iter,1)}
  .icona-paper-plane-fly-curve[data-animate="loop"]{--icona-iter:infinite}
  @media (prefers-reduced-motion:reduce){.icona-paper-plane-fly-curve *{animation:none!important}}
`;

/** Particle cues, on the 24-unit icon grid. */
const SCRIPT: ParticleScript = {
  "bursts": [],
  "emitters": [
    {
      "at": 0.15,
      "preset": "streaks",
      "rate": 10,
      "duration": 0.6,
      "x": 12,
      "y": 12,
      "angle": 200,
      "follow": true
    }
  ]
};
const PASS_SECONDS = 2.5;

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

/** Fly Curve - Paper Plane (outline), with particles. */
export function PaperPlaneFlyCurveIcon({ size = 24, color = "currentColor", strokeWidth = 2, speed = 1, animate = "hover", className, style, ...props }: IconProps) {
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
        className={className ? `icona-paper-plane-fly-curve ${className}` : "icona-paper-plane-fly-curve"}
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
          <path d="M20.5 3.5L3.5 10.5L10.5 13.5L13.5 20.5Z"/>
          <path d="M20.5 3.5L10.5 13.5"/>
        </g>
      </svg>
    </span>
  );
}
