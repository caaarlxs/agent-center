import { type SVGProps } from "react";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "color"> {
  /** Width of the 24-unit icon box in px. */
  size?: number;
  /** Any CSS colour. Defaults to the surrounding text colour. */
  color?: string;
  strokeWidth?: number;
}

/** Bell (outline). */
export function BellIcon({ size = 24, color = "currentColor", strokeWidth = 1.5, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      color={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 3V4.5"/>
      <path d="M6 10.5A6 6 0 0 1 18 10.5V15L19.5 17.5H4.5L6 15Z"/>
      <path d="M10.2 20A2 2 0 0 0 13.8 20"/>
    </svg>
  );
}
