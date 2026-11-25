/**
 * Geometric 20x20 Plimsoll load-line mark SVG.
 * Circle bisected by a horizontal load line, representing international
 * naval freeboard calibration (Samuel Plimsoll, Merchant Shipping Act 1876).
 */

interface PlimsollMarkProps {
  size?: number;
}

export function PlimsollMark({ size = 22 }: PlimsollMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="10"
        cy="10"
        r="6.25"
        stroke="var(--core2)"
        strokeWidth="1.75"
      />
      <line
        x1="1.5"
        y1="10"
        x2="18.5"
        y2="10"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="square"
      />
    </svg>
  );
}
