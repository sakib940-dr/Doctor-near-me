import { BadgeCheck, ShieldAlert } from 'lucide-react';

type VerifiedBadgeProps = {
  verified?: boolean;
  label?: string;
  className?: string;
};

export default function VerifiedBadge({ verified = true, label, className = '' }: VerifiedBadgeProps) {
  const resolvedLabel = label || (verified ? 'Verified' : 'Not verified yet');
  const Icon = verified ? BadgeCheck : ShieldAlert;
  return (
    <span
      className={`marketplace-verified-badge${verified ? '' : ' unverified'} ${className}`.trim()}
      title={resolvedLabel}
      aria-label={resolvedLabel}
    >
      <Icon />
      <span>{resolvedLabel}</span>
    </span>
  );
}
