"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  collapsed?: boolean;
}

const emptySubscribe = () => () => {};

export default function ThemeToggle({ collapsed = false }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const isLight = mounted && resolvedTheme === "light";
  const label = isLight ? "Giao diện tối" : "Giao diện sáng";
  const tooltip = isLight
    ? "Chuyển sang giao diện tối"
    : "Chuyển sang giao diện sáng";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          onClick={() => setTheme(isLight ? "dark" : "light")}
          aria-label={tooltip}
          className={cn(
            "items-center gap-0 overflow-hidden rounded-lg border border-(--border-default) bg-(--bg-surface) text-xs font-medium text-(--text-secondary) hover:border-(--border-strong) hover:bg-(--bg-subtle) hover:text-(--text-primary) transition-colors",
            collapsed
              ? "h-11 w-full justify-center px-0"
              : "h-9 flex w-full justify-center px-2 md:justify-start md:px-3"
          )}
        >
          {!mounted ? (
            <Sun className="h-3.5 w-3.5 shrink-0 opacity-0" aria-hidden="true" />
          ) : isLight ? (
            <Moon className="h-3.5 w-3.5 text-(--action-primary) shrink-0" />
          ) : (
            <Sun className="h-3.5 w-3.5 text-(--action-primary) shrink-0" />
          )}
          <span
            className={cn(
              "hidden overflow-hidden whitespace-nowrap transition-all duration-200 ease-in-out md:block",
              collapsed ? "w-0 opacity-0" : "ml-2.5 opacity-100"
            )}
          >
            {mounted ? label : ""}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" className={collapsed ? "" : "md:hidden"}>
        <p className="text-xs">{mounted ? tooltip : "Đổi giao diện"}</p>
      </TooltipContent>
    </Tooltip>
  );
}
