import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus-ring) focus:ring-offset-2 focus:ring-offset-(--bg-canvas)",
  {
    variants: {
      variant: {
        default:
          "border border-[color-mix(in_srgb,var(--action-primary)_24%,transparent)] bg-(--bg-selected) text-(--action-primary)",
        secondary:
          "border border-(--border-default) bg-(--bg-subtle) text-(--text-secondary)",
        destructive:
          "border border-[color-mix(in_srgb,var(--status-negative)_28%,transparent)] bg-[color-mix(in_srgb,var(--status-negative)_10%,transparent)] text-(--status-negative)",
        outline:
          "border border-(--border-strong) text-(--text-secondary)",
        success:
          "border border-[color-mix(in_srgb,var(--status-positive)_28%,transparent)] bg-[color-mix(in_srgb,var(--status-positive)_10%,transparent)] text-(--status-positive)",
        cyan:
          "border border-[color-mix(in_srgb,var(--status-info)_28%,transparent)] bg-[color-mix(in_srgb,var(--status-info)_10%,transparent)] text-(--status-info)",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
