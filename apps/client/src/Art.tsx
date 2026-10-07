import type { Ship } from "../../../packages/shared/src/types";
export function ShipArt({
  kind = "tug",
  className = "",
  label = "Salvage ship",
}: {
  kind?: Ship | string;
  className?: string;
  label?: string;
}) {
  const v =
    kind === "courier"
      ? 1
      : kind === "barge"
        ? 2
        : kind === "survey"
          ? 3
          : Array.from(kind).reduce((n, c) => n + c.charCodeAt(0), 0) % 4;
  return (
    <svg
      className={className}
      viewBox="0 0 360 190"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={`metal-${kind}`} x2="0" y2="1">
          <stop stopColor="#354650" />
          <stop offset="1" stopColor="#151e27" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="#354650" strokeWidth="1">
        <path d="M20 95h320M180 18v154" />
        <circle cx="180" cy="95" r="75" strokeDasharray="3 8" />
        <path d="M28 28h30M28 28v25M332 162h-30M332 162v-25" />
      </g>
      <g
        transform={`rotate(${v === 1 ? -12 : v === 3 ? 10 : -4} 180 95)`}
        stroke="#75d5d0"
        strokeWidth="1.5"
        fill={`url(#metal-${kind})`}
      >
        <path
          d={
            v === 0
              ? "M70 70h48l25-19h70l39 31 40 8v22l-40 7-32 21h-80l-22-22H70z"
              : v === 1
                ? "M65 84h48l32-26h37l20 20 89 12v20l-89 12-20 16h-38l-31-23H65z"
                : v === 2
                  ? "M62 68h55v-14h114v19h37l32 30-32 29h-39v12H115v-16H62z"
                  : "M74 81h52l18-27h50l18 29 87 9v20l-87 10-18 27h-50l-18-26H74z"
          }
        />
        <path
          d="M119 72v43M150 60v68M204 78v45"
          stroke="#354650"
          strokeWidth="6"
        />
        <path d="M148 72h40v31h-40zM219 91h34v14h-34z" fill="#0b1117" />
        <path d="M68 86h24v24H68" fill="#ffb14a" stroke="none" />
        <path d="M163 82h9m6 0h9m-24 7h24" stroke="#ffb14a" strokeWidth="3" />
        <circle cx="232" cy="99" r="3" fill="#75d5d0" />
        <path
          d="M104 131l-11 11m154-77 15-15"
          stroke="#ffb14a"
          strokeDasharray="2 4"
        />
      </g>
    </svg>
  );
}
