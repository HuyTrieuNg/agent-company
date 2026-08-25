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
            "h-9 items-center gap-0 overflow-hidden rounded-xl border border-white/10 bg-white/4 text-xs font-medium text-slate-300 hover:border-violet-500/50 hover:bg-violet-600/10 hover:text-slate-100 transition-all",
            collapsed
              ? "w-full justify-center px-0"
              : "flex w-full justify-center px-2 md:justify-start md:px-3"
          )}
        >
          {!mounted ? (
            <Sun className="h-3.5 w-3.5 shrink-0 opacity-0" aria-hidden="true" />
          ) : isLight ? (
            <Moon className="h-3.5 w-3.5 text-violet-400 shrink-0" />
          ) : (
            <Sun className="h-3.5 w-3.5 text-violet-400 shrink-0" />
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
