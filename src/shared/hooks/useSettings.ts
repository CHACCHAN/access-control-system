import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createElement } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { load, type Store } from "@tauri-apps/plugin-store";

export type Theme = "light" | "dark";

export interface AppSettings {
  theme: Theme;
  rebootSchedule: string;
  screenOffSchedule: string;
  getEndpoint: string;
  postEndpoint: string;
  wsEndpoint: string;
  apiToken: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  rebootSchedule: "",
  screenOffSchedule: "",
  getEndpoint: "",
  postEndpoint: "",
  wsEndpoint: "",
  apiToken: "",
};

const STORE_FILE = "settings.json";
const SETTINGS_KEY = "settings";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, {
      autoSave: true,
      defaults: { [SETTINGS_KEY]: DEFAULT_SETTINGS },
    });
  }
  return storePromise;
}

/**
 * 保存済みの設定を読み込む(ブラウザ単体で開いている場合や読み込みに失敗した
 * 場合はデフォルト値を返す)。React コンポーネント外(起動チェックなど)からも
 * 呼び出せるよう、Provider の初期化とは独立した関数として公開している。
 */
export async function loadSettings(): Promise<AppSettings> {
  if (!isTauri()) return DEFAULT_SETTINGS;

  try {
    const store = await getStore();
    const stored = await store.get<AppSettings>(SETTINGS_KEY);
    return stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function saveSettings(settings: AppSettings): Promise<void> {
  if (!isTauri()) return;
  const store = await getStore();
  await store.set(SETTINGS_KEY, settings);
}

interface SettingsContextValue {
  settings: AppSettings;
  isLoading: boolean;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * アプリ設定(テーマ・各種エンドポイント・APIトークン・再起動スケジュール)を
 * tauri-plugin-store で一元管理する Provider。設定は OS 標準の設定ディレクトリ
 * 配下の settings.json に自動保存される。
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let cancelled = false;

    loadSettings().then((loaded) => {
      if (cancelled) return;
      setSettings(loaded);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    const next = { ...settingsRef.current, ...partial };
    setSettings(next);
    return saveSettings(next);
  }, []);

  return createElement(SettingsContext.Provider, {
    value: { settings, isLoading, updateSettings },
    children,
  });
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings は <SettingsProvider> の内側で使用してください");
  return ctx;
}
