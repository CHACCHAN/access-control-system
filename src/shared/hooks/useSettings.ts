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

// リクエストボディの JSON テンプレート内で、実際の値に置き換えるプレース
// ホルダー。バックエンド側のフィールド名が変わっても、アプリを再ビルドせず
// 設定画面(APIボディ)からテンプレートを書き換えるだけで追従できるようにする。
export const DEFAULT_DESCRIPTOR_BODY_TEMPLATE = JSON.stringify(
  { descriptor: "{{descriptor}}" },
  null,
  2,
);
export const DEFAULT_ATTENDANCE_BODY_TEMPLATE = JSON.stringify(
  { userName: "{{username}}", name: "{{name}}", newStatus: "{{status}}" },
  null,
  2,
);

export interface AppSettings {
  theme: Theme;
  rebootSchedule: string;
  screenOffSchedule: string;
  getEndpoint: string;
  // 顔特徴ベクトル登録 API(POST {postEndpoint}/{username})
  postEndpoint: string;
  // 在室状況更新 API(POST {attendanceEndpoint})。descriptor 登録とは別のエンドポイント。
  attendanceEndpoint: string;
  wsEndpoint: string;
  apiToken: string;
  descriptorBodyTemplate: string;
  attendanceBodyTemplate: string;
  // WebSocket で届くシグナルのうち、どのフィールドがどの値になっていれば
  // 「更新あり」とみなすか({ message: "update" } 以外の形式にも追従できるように)。
  wsSignalField: string;
  wsSignalValue: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  rebootSchedule: "",
  screenOffSchedule: "",
  getEndpoint: "",
  postEndpoint: "",
  attendanceEndpoint: "",
  wsEndpoint: "",
  apiToken: "",
  descriptorBodyTemplate: DEFAULT_DESCRIPTOR_BODY_TEMPLATE,
  attendanceBodyTemplate: DEFAULT_ATTENDANCE_BODY_TEMPLATE,
  wsSignalField: "message",
  wsSignalValue: "update",
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
  // autoSave はデフォルト100msデバウンスでのディスク書き込みのため、set() の
  // resolve だけでは実際の書き込み完了を保証しない。保存直後に再起動を伴う
  // 呼び出し元(設定画面)があるため、ここで明示的に save() を待って
  // ディスクへの書き込みを確実に完了させてから戻る。
  await store.save();
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
