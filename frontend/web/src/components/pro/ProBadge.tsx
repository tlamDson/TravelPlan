import { cn } from "@/lib/utils";
import { BRAND_GRADIENT_BADGE } from "@/lib/brandGradient";

interface ProBadgeProps {
  className?: string;
  children?: React.ReactNode;
}

export function ProBadge({ className, children = "PRO" }: ProBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-tag-purple-text/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white",
        BRAND_GRADIENT_BADGE,
        className,
      )}
    >
      {children}
    </span>
  );
}
