import { BadgeCheck } from 'lucide-react';

type VerifiedBadgeProps = {
  label?: string;
  className?: string;
};

export default function VerifiedBadge({ label = 'যাচাইকৃত', className = '' }: VerifiedBadgeProps) {
  return (
    <span className={`marketplace-verified-badge ${className}`.trim()} title={label} aria-label={label}>
      <BadgeCheck />
      <span>{label}</span>
    </span>
  );
}
