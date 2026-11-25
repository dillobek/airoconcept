type BrandLogoProps = {
  compact?: boolean;
  light?: boolean;
  className?: string;
};

export function BrandLogo({ compact = false, light = false, className = "" }: BrandLogoProps) {
  const wordColor = light ? "text-white" : "text-brand-deep";
  const conceptColor = light ? "text-white/75" : "text-brand-deep/65";

  return (
    <div className={`flex items-center gap-2.5 ${className}`} aria-label="AiroConcept">
      <svg viewBox="0 0 48 48" className="h-9 w-9 shrink-0" role="img" aria-hidden="true">
        <rect width="48" height="48" rx="11" className={light ? "fill-white/15" : "fill-brand"} />
        <path d="M10.5 34.5 23.5 11l12.8 23.5M16.6 25h13.8" fill="none" stroke="white" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && (
        <span className="leading-none tracking-tight">
          <span className={`block text-[17px] font-bold tracking-[0.12em] ${wordColor}`}>AIRO</span>
          <span className={`mt-0.5 block text-[10px] font-medium tracking-[0.24em] ${conceptColor}`}>concept</span>
        </span>
      )}
    </div>
  );
}
