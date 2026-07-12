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

// 顔認証の確認カード(「◯◯さんですか?」)で「ちがう」を意味するジェスチャー。
// 分類はランドマークからのルールベース(新しいMLモデルは不要)。空文字は無効。
export type RejectGesture = "ThumbsDown" | "";
export const DEFAULT_REJECT_GESTURE: RejectGesture = "ThumbsDown";

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
// circuit / signal はアニメーション付き(電気信号が流れる演出)
export type BackgroundPattern =
  | "grid"
  | "dots"
  | "diagonal"
  | "circuit"
  | "signal"
  | "none";
export type MemberListLayout = "grid" | "compact" | "list";

// 背景パターン → 装飾クラス(App.css)の対応。
// 静的パターン(grid/dots/diagonal)はトップ画面全体に敷き、
// アニメーション付き(circuit/signal)は右側(顔認証パネル)の背景にのみ描画する。
export const PATTERN_CLASS: Record<BackgroundPattern, string> = {
  grid: "cyber-grid",
  dots: "cyber-dots",
  diagonal: "cyber-diagonal",
  circuit: "cyber-circuit",
  signal: "cyber-signal",
  none: "",
};

/** アニメーション付きパターン(顔認証パネルの背景にのみ描画する)かどうか */
export function isAnimatedPattern(pattern: BackgroundPattern): boolean {
  return pattern === "circuit" || pattern === "signal";
}

export interface AppearanceSettings {
  accentColor: AccentColor;
  /** 背景パターン。静的はトップ画面全体、アニメ付きは顔認証パネルのみに描画 */
  backgroundPattern: BackgroundPattern;
  /** メンバー一覧の並べ方(グリッド/3列コンパクト/1列リスト) */
  memberListLayout: MemberListLayout;
  /** トップ画面左(メンバー一覧)の背景色。空文字は既定のまま */
  memberPanelBg: string;
  /** トップ画面右(顔認証)の背景色。空文字は既定のまま */
  authPanelBg: string;
  /** 顔登録画面(左パネル差し替え)の背景色。空文字は既定のまま */
  registerPanelBg: string;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  accentColor: "cyan",
  backgroundPattern: "grid",
  memberListLayout: "grid",
  memberPanelBg: "",
  authPanelBg: "",
  registerPanelBg: "",
};

// UI 全体の拡大率。ルート要素の font-size(rem 基準)を倍率で切り替えて、
// Tailwind の rem ベースのサイズ・余白・文字を一括で拡大縮小する。
// キオスクの設置ディスプレイやタッチ操作のしやすさに合わせて調整する。
export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 1.5;
export const UI_SCALE_DEFAULT = 1;
/** rem の基準となる font-size(px)。ブラウザ既定と同じ 16px を 1.0 とする。 */
export const UI_SCALE_BASE_PX = 16;

/** UI 拡大率を許容範囲にクランプする(不正値・未設定は等倍にフォールバック)。 */
export function clampUiScale(scale: number): number {
  if (!Number.isFinite(scale)) return UI_SCALE_DEFAULT;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, scale));
}

/** ハードウェア音量(ALSA、0〜100%)の既定値 */
export const HARDWARE_VOLUME_DEFAULT = 80;

/** ハードウェア音量を 0〜100 にクランプする(不正値は既定値) */
export function clampHardwareVolume(volume: number): number {
  if (!Number.isFinite(volume)) return HARDWARE_VOLUME_DEFAULT;
  return Math.min(100, Math.max(0, Math.round(volume)));
}

export interface AppSettings {
  theme: Theme;
  // UI 全体の拡大率(1.0 = 等倍)
  uiScale: number;
  // スピーカーのハードウェア音量(ALSA Master、0〜100%)。
  // ソフトウェア音量ではなく端末の実音量。起動時と設定変更時に amixer で反映する。
  hardwareVolume: number;
  rebootSchedule: string;
  // 自動消灯までの無操作時間(分)。「時刻」ではなく「時間(経過)」で指定する。
  // 0 は無効。操作・人物接近(顔検出)で復帰する。
  screenOffMinutes: number;
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
  // 確認カードで「ちがう」を意味するジェスチャー("" は無効)
  rejectGesture: RejectGesture;
  // 推論間隔・カメラ配信・照合パラメータの調整
  performance: PerformanceSettings;
  // アクセントカラー・背景・レイアウトのカスタマイズ
  appearance: AppearanceSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  uiScale: UI_SCALE_DEFAULT,
  hardwareVolume: HARDWARE_VOLUME_DEFAULT,
  rebootSchedule: "",
  screenOffMinutes: 0,
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
  rejectGesture: DEFAULT_REJECT_GESTURE,
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
      // 不正・範囲外の拡大率で画面が壊れないよう読み込み時にクランプする
      uiScale: clampUiScale(stored.uiScale ?? UI_SCALE_DEFAULT),
      hardwareVolume: clampHardwareVolume(stored.hardwareVolume ?? HARDWARE_VOLUME_DEFAULT),
      // 旧バージョンの時刻指定(screenOffSchedule)からの移行時は未設定(0=無効)になる
      screenOffMinutes: Number.isFinite(stored.screenOffMinutes)
        ? Math.max(0, Math.round(stored.screenOffMinutes))
        : 0,
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
