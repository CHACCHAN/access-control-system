import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useSettings, type Theme } from "@/shared/hooks/useSettings";

export type { Theme };

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * ダーク/ライトテーマを アプリ全体で共有する Provider。
 * 実体は useSettings (tauri-plugin-store) が保持する設定の一部で、
 * ここではその値を <html> の "dark" クラスに反映するだけを担う。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const theme = settings.theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  function toggleTheme() {
    updateSettings({ theme: theme === "dark" ? "light" : "dark" });
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme は <ThemeProvider> の内側で使用してください");
  return ctx;
}
