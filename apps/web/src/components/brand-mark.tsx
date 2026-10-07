type BrandMarkProps = {
  readonly className?: string;
};

export const BrandMark = ({ className }: BrandMarkProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <rect
      x="8.25"
      y="2.75"
      width="13"
      height="13"
      rx="2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <rect
      x="2.75"
      y="8.25"
      width="13"
      height="13"
      rx="2.5"
      fill="var(--card)"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M6.25 13h6.5M6.25 16.25h4.25"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
