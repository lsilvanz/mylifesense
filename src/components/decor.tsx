// Playful cloud + sparkle motifs (from the habit-tracker reference). Purely
// decorative; rendered inside gradient hero areas with white shapes.

export function Clouds({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 140"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <g fill="currentColor">
        <g opacity="0.9">
          <ellipse cx="70" cy="34" rx="30" ry="16" />
          <ellipse cx="100" cy="40" rx="22" ry="13" />
          <ellipse cx="46" cy="42" rx="18" ry="11" />
        </g>
        <g opacity="0.5">
          <ellipse cx="320" cy="26" rx="34" ry="17" />
          <ellipse cx="352" cy="34" rx="22" ry="12" />
          <ellipse cx="292" cy="34" rx="18" ry="10" />
        </g>
        <g opacity="0.35">
          <ellipse cx="210" cy="104" rx="30" ry="15" />
          <ellipse cx="238" cy="110" rx="20" ry="11" />
        </g>
      </g>
    </svg>
  );
}

export function Sparkle({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 0c.6 6.2 5.8 11.4 12 12-6.2.6-11.4 5.8-12 12-.6-6.2-5.8-11.4-12-12C6.2 11.4 11.4 6.2 12 0z" />
    </svg>
  );
}
