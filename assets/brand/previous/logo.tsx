/** AIRO: a path-shaped A and the spark of an AI travel partner. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
      <rect x="2" y="2" width="60" height="60" rx="19" fill="var(--logo-tile, #103E36)" />
      <path d="M16 46L27.5 19.5C28.2 17.9 30.5 17.9 31.2 19.5L43 46" stroke="var(--logo-letter, #DDF8E8)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20.5 36.5C27 31 33 40 39 34" stroke="var(--logo-route, #79D8B1)" strokeWidth="4" strokeLinecap="round" />
      <path d="M47 11L49.6 17.4L56 20L49.6 22.6L47 29L44.4 22.6L38 20L44.4 17.4Z" fill="var(--logo-spark, #D3F59A)" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span role="img" aria-label="아이로 AIRO" className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="size-9 shrink-0" />
      <span aria-hidden="true" className="text-[27px] leading-none font-semibold tracking-[-0.07em]">airo<span className="text-primary">.</span></span>
    </span>
  );
}
