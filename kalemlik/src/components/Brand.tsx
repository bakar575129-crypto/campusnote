export function LogoMark({size = 36}: {size?: number}) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#1f3a5f" />
      <path d="M18 14h22a6 6 0 0 1 6 6v30H24a6 6 0 0 1-6-6z" fill="#f4f2ed" />
      <path d="M18 44a6 6 0 0 1 6-6h22" fill="none" stroke="#d3ccbe" strokeWidth="2" />
      <path d="M25 22h14M25 28h14M25 34h9" stroke="#c9d6e8" strokeWidth="2" strokeLinecap="round" />
      <path d="M49.5 21.5l5 5L39 42l-7 2 2-7z" fill="#e0643a" />
      <path d="M32 44l2-7 5 5z" fill="#1b2433" />
    </svg>
  );
}

export function Brand({compact = false}: {compact?: boolean}) {
  return (
    <span className="brand">
      <LogoMark />
      {!compact && <span className="brand-name">Kalemlik</span>}
    </span>
  );
}
