import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

function getInitialTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

interface UseThemeResult {
  theme: Theme;
  toggleTheme: () => void;
}

/**
 * ダーク/ライトテーマの切り替えを管理するフック。
 * 選択結果は localStorage に保存し、<html> に "dark" クラスを付け外しする。
 */
export function useTheme(): UseThemeResult {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return { theme, toggleTheme };
}
