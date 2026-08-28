"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme === "light" ? "light" : "dark"}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-(--bg-surface) group-[.toaster]:text-(--text-primary) group-[.toaster]:border-(--border-default) group-[.toaster]:shadow-(--shadow-overlay) group-[.toaster]:rounded-lg",
          description: "group-[.toast]:text-(--text-secondary)",
          actionButton:
            "group-[.toast]:bg-(--action-primary) group-[.toast]:text-(--action-on-primary)",
          cancelButton:
            "group-[.toast]:bg-(--bg-subtle) group-[.toast]:text-(--text-secondary)",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
