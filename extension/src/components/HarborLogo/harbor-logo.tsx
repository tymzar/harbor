// The Harbor mark at small sizes, as in the toolbar icon (src/assets/img/favicon.svg): a breakwater
// shelters a calm line from the wave outside. Drawn in the theme's accent so it follows dark mode.
export function HarborLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true" className="shrink-0 text-accent">
      <rect width="128" height="128" rx="30" fill="currentColor" />
      <g stroke="var(--accent-foreground)" strokeLinecap="round" fill="none">
        <path d="M22 40c10.5-10 21-10 31.5 0s21 10 31.5 0" strokeOpacity=".6" strokeWidth="13" />
        <path d="M104 52v28a24 24 0 0 1-24 24H24" strokeWidth="15" />
      </g>
      <rect x="24" y="64" width="54" height="14" rx="7" fill="var(--accent-foreground)" />
    </svg>
  );
}
