export function Logo({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Oi Chat" role="img">
      <defs>
        <linearGradient id="oichat-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <path
        d="M32 6C17 6 6 16.4 6 29.5c0 7.4 3.6 14 9.4 18.3L13 58l11.6-6.1c2.3.6 4.8.9 7.4.9 15 0 26-10.4 26-23.3S47 6 32 6Z"
        fill="url(#oichat-g)"
      />
      <g fill="#fff">
        <rect x="22" y="23" width="4" height="13" rx="2" />
        <rect x="30" y="18" width="4" height="23" rx="2" />
        <rect x="38" y="23" width="4" height="13" rx="2" />
      </g>
    </svg>
  );
}
