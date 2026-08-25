import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-violet-600/20 text-violet-300",
        secondary:
          "border border-white/10 bg-white/5 text-slate-300",
        destructive:
          "border border-red-500/20 bg-red-500/10 text-red-400",
        outline:
          "border border-white/15 text-slate-300",
        success:
          "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
        cyan:
          "border border-cyan-500/20 bg-cyan-500/10 text-cyan-400",
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
