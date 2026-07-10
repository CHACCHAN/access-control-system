import { useTheme } from "../theme/ThemeContext";
import { MoonIcon, SunIcon } from "./icons";

export function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-cyan-400/50 hover:text-cyan-600 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 dark:shadow-none dark:hover:border-cyan-400/50 dark:hover:text-cyan-300"
    >
      {theme === "dark" ? <SunIcon className="h-4.5 w-4.5" /> : <MoonIcon className="h-4.5 w-4.5" />}
    </button>
  );
}
