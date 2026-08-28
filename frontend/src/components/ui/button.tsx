import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-canvas) disabled:pointer-events-none disabled:opacity-40 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default:
          "bg-(--action-primary) text-(--action-on-primary) hover:bg-(--action-primary-hover)",
        gradient:
          "bg-(--action-primary) text-(--action-on-primary) hover:bg-(--action-primary-hover)",
        destructive:
          "border border-[color-mix(in_srgb,var(--status-negative)_32%,transparent)] bg-[color-mix(in_srgb,var(--status-negative)_10%,transparent)] text-(--status-negative) hover:bg-[color-mix(in_srgb,var(--status-negative)_16%,transparent)]",
        outline:
          "border border-(--border-default) bg-(--bg-surface) text-(--text-secondary) hover:border-(--border-strong) hover:bg-(--bg-subtle) hover:text-(--text-primary)",
        secondary:
          "bg-(--bg-subtle) text-(--text-secondary) hover:bg-(--bg-selected) hover:text-(--text-primary)",
        ghost:
          "text-(--text-secondary) hover:bg-(--bg-subtle) hover:text-(--text-primary)",
        link:
          "text-(--action-primary) underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-2.5 text-[11px]",
        lg: "h-11 rounded-lg px-6 text-sm",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
