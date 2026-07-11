import { createContext, useContext, useEffect, type ReactNode } from "react";
import {
  clampUiScale,
  useSettings,
  UI_SCALE_BASE_PX,
  type AccentColor,
  type Theme,
} from "@/shared/hooks/useSettings";

export type { Theme };

/**
 * <html> の data-accent 属性を切り替える(App.css の :root[data-accent=...] が
 * 参照し、cyan 系ユーティリティのパレットを丸ごと差し替える)。
 * 通常は ThemeProvider が保存済み設定を反映するが、設定画面のライブプレビュー
 * からも使うため関数として公開している。
 */
export function applyAccentAttribute(accent: AccentColor) {
  if (accent === "cyan") {
    delete document.documentElement.dataset.accent;
  } else {
    document.documentElement.dataset.accent = accent;
  }
}

/**
 * UI 全体の拡大率を <html> の font-size(rem 基準)に反映する。
 * Tailwind の rem ベースのサイズ・余白・文字が一括で拡大縮小する。
 * accent と同様、設定画面のライブプレビューからも使うため公開している。
 */
export function applyUiScale(scale: number) {
  document.documentElement.style.fontSize = `${UI_SCALE_BASE_PX * clampUiScale(scale)}px`;
}

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * ダーク/ライトテーマを アプリ全体で共有する Provider。
 * 実体は useSettings (tauri-plugin-store) が保持する設定の一部で、
 * ここではその値を <html> の "dark" クラス・data-accent 属性
 * (アクセントカラー。App.css の :root[data-accent=...] が参照)・
 * font-size(UI 拡大率)に反映する。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const theme = settings.theme;
  const accent = settings.appearance.accentColor;
  const uiScale = settings.uiScale;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    applyAccentAttribute(accent);
  }, [accent]);

  useEffect(() => {
    applyUiScale(uiScale);
  }, [uiScale]);

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
