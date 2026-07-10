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

// ジェスチャー(グー/チョキ/パー)に割り当てる在室ステータス。
// 空文字は「割り当てなし(そのジェスチャーでは更新しない)」。
// Rust側(detect_gesture コマンド)もこの設定を読んで room_status を返すため、
// キー名(rock/scissors/paper)と既定値は src-tauri/src/vision/mod.rs と揃えること。
export interface GestureStatusMap {
  rock: string;
  scissors: string;
  paper: string;
}

export const DEFAULT_GESTURE_STATUS_MAP: GestureStatusMap = {
  rock: "在室",
  scissors: "外出",
  paper: "帰宅",
};

// パフォーマンス調整。推論のポーリング間隔やカメラ配信のパラメータを
// 端末スペックに合わせて設定画面から調整できるようにする。
// camera* / match* / minFaceWidthRatio は Rust 側も settings.json から読むため、
// キー名と既定値は src-tauri/src/settings.rs と揃えること。
export interface PerformanceSettings {
  /** 顔認証(recognize_face)のポーリング間隔(ms) */
  recognitionIntervalMs: number;
  /** 同一人物がこの回数連続で認識されたら確認カードを出す(誤爆防止) */
  recognitionStableCount: number;
  /** ジェスチャー認識(detect_gesture)のポーリング間隔(ms) */
  gesturePollIntervalMs: number;
  /** 同じジェスチャーがこの回数連続したときだけステータスを更新する */
  gestureStableCount: number;
  /** Rust側: フロントへ base64 画像を送るフレーム間隔(ms)。100ms = 10fps */
  cameraFrameIntervalMs: number;
  /** Rust側: フロントへ送る JPEG の品質(1-100) */
  cameraJpegQuality: number;
  /** Rust側: 1:N照合の類似度閾値(コサイン類似度) */
  matchThreshold: number;
  /** Rust側: 1位と2位の類似度差がこれ未満なら「該当者なし」にする */
  matchMargin: number;
  /** Rust側: 顔幅がフレーム幅のこの比率未満なら照合しない */
  minFaceWidthRatio: number;
}

export const DEFAULT_PERFORMANCE: PerformanceSettings = {
  recognitionIntervalMs: 1000,
  recognitionStableCount: 1,
  gesturePollIntervalMs: 700,
  gestureStableCount: 2,
  cameraFrameIntervalMs: 100,
  cameraJpegQuality: 75,
  matchThreshold: 0.5,
  matchMargin: 0.05,
  minFaceWidthRatio: 0.15,
};

// デザインのカスタマイズ。アクセントカラーは Tailwind の cyan 系 CSS 変数を
// 丸ごと差し替える方式(App.css の :root[data-accent=...])のため、
// 追加する場合は App.css にも対応するパレットを足すこと。
export type AccentColor = "cyan" | "emerald" | "violet" | "rose" | "amber" | "blue";
export type BackgroundPattern = "grid" | "dots" | "diagonal" | "none";
export type MemberListLayout = "grid" | "compact" | "list";

// 背景パターン → 装飾クラス(App.css)の対応。トップ画面と設定画面で共用する。
export const PATTERN_CLASS: Record<BackgroundPattern, string> = {
  grid: "cyber-grid",
  dots: "cyber-dots",
  diagonal: "cyber-diagonal",
  none: "",
};

export interface AppearanceSettings {
  accentColor: AccentColor;
  /** トップ画面と設定画面に敷く背景パターン */
  backgroundPattern: BackgroundPattern;
  /** メンバー一覧の並べ方(グリッド/3列コンパクト/1列リスト) */
  memberListLayout: MemberListLayout;
  /** トップ画面左(メンバー一覧)の背景色。空文字は既定のまま */
  memberPanelBg: string;
  /** トップ画面右(顔認証)の背景色。空文字は既定のまま */
  authPanelBg: string;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  accentColor: "cyan",
  backgroundPattern: "grid",
  memberListLayout: "grid",
  memberPanelBg: "",
  authPanelBg: "",
};

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
  // ジェスチャー認識(Rust側)の結果を在室ステータスへ変換するマッピング
  gestureStatusMap: GestureStatusMap;
  // 推論間隔・カメラ配信・照合パラメータの調整
  performance: PerformanceSettings;
  // アクセントカラー・背景・レイアウトのカスタマイズ
  appearance: AppearanceSettings;
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
  gestureStatusMap: DEFAULT_GESTURE_STATUS_MAP,
  performance: DEFAULT_PERFORMANCE,
  appearance: DEFAULT_APPEARANCE,
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
    if (!stored) return DEFAULT_SETTINGS;
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      // ネストしたオブジェクトは浅いマージだと保存済みの値で丸ごと
      // 置き換わり、後から追加したキーの既定値が失われるため個別にマージする
      gestureStatusMap: {
        ...DEFAULT_GESTURE_STATUS_MAP,
        ...stored.gestureStatusMap,
      },
      performance: {
        ...DEFAULT_PERFORMANCE,
        ...stored.performance,
      },
      appearance: {
        ...DEFAULT_APPEARANCE,
        ...stored.appearance,
      },
    };
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
