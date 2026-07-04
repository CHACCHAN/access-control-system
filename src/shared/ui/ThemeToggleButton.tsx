import type { Theme } from "../hooks/useTheme";
import { MoonIcon, SunIcon } from "./icons";

interface ThemeToggleButtonProps {
  theme: Theme;
  onToggle: () => void;
}

export function ThemeToggleButton({ theme, onToggle }: ThemeToggleButtonProps) {
  return (
    <button
      onClick={onToggle}
      aria-label={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-200 dark:shadow-none dark:hover:bg-slate-700"
    >
      {theme === "dark" ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
}
