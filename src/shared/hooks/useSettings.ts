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

// 外部サイト(ポータル・Wiki・スケジュール表など)。トップ画面の地球儀ボタン
// からアプリ内ブラウザ(サーバサイド取得型)で開く。
export interface ExternalSite {
  /** 一覧に表示する名前(空なら URL のホスト名を表示) */
  name: string;
  url: string;
}

/** 登録できる外部サイトの上限(設定画面・正規化の両方で使う) */
export const MAX_EXTERNAL_SITES = 12;

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
  minFaceWidthRatio: 0.22,
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
  // 自動再起動のオン/オフ。オフの間は rebootSchedule の時刻を保持したまま発火しない
  rebootScheduleEnabled: boolean;
  rebootSchedule: string;
  // 自動消灯のオン/オフ。オフの間は screenOffMinutes を保持したまま消灯しない
  screenOffEnabled: boolean;
  // 自動消灯までの無操作時間(分)。「時刻」ではなく「時間(経過)」で指定する。
  // 0 は無効。操作・人物接近(顔検出)で復帰する。
  screenOffMinutes: number;
  // 人物不在時の減光(自動消灯とは別)。カメラに顔が写っておらず操作も無い状態が
  // 続くと画面を半分暗くし、人が近づく(顔検出)か操作で即復帰する
  presenceDimmingEnabled: boolean;
  getEndpoint: string;
  // 外部サイト(ポータル等)。トップ画面の地球儀ボタンからアプリ内ブラウザで開く。
  // 複数登録すると一覧から選択、1件なら直接開く
  externalSites: ExternalSite[];
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
  rebootScheduleEnabled: true,
  rebootSchedule: "",
  screenOffEnabled: true,
  screenOffMinutes: 0,
  presenceDimmingEnabled: true,
  getEndpoint: "",
  externalSites: [],
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

/** 外部サイト一覧の正規化。旧設定(単一の portalUrl)からの移行も行う。 */
function normalizeExternalSites(stored: Partial<AppSettings>): ExternalSite[] {
  // 保存データは型未保証のため unknown として検証する
  const raw: unknown[] = Array.isArray(stored.externalSites) ? stored.externalSites : [];
  const sites = raw
    .filter((site): site is Record<string, unknown> => !!site && typeof site === "object")
    .map((site) => ({
      name: typeof site.name === "string" ? site.name : "",
      url: typeof site.url === "string" ? site.url : "",
    }))
    // 完全な空行は保存しない(編集途中の行を残さない)
    .filter((site) => site.name.trim() !== "" || site.url.trim() !== "")
    .slice(0, MAX_EXTERNAL_SITES);

  // 旧バージョンの portalUrl(単一URL)からの移行
  const legacyPortalUrl = (stored as { portalUrl?: unknown }).portalUrl;
  if (sites.length === 0 && typeof legacyPortalUrl === "string" && legacyPortalUrl.trim() !== "") {
    sites.push({ name: "ポータルサイト", url: legacyPortalUrl });
  }
  return sites;
}

function finiteInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  integer = false,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(max, Math.max(min, value));
  return integer ? Math.round(clamped) : clamped;
}

/** 保存ファイルやフォーム値を、全利用側が安全に扱えるAppSettingsへ正規化する。 */
export function normalizeSettings(value: unknown): AppSettings {
  const stored =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<AppSettings>)
      : {};
  const perf: Partial<PerformanceSettings> =
    stored.performance && typeof stored.performance === "object" ? stored.performance : {};
  const appearance: Partial<AppearanceSettings> =
    stored.appearance && typeof stored.appearance === "object" ? stored.appearance : {};
  const gesture: Partial<GestureStatusMap> =
    stored.gestureStatusMap && typeof stored.gestureStatusMap === "object"
      ? stored.gestureStatusMap
      : {};
  const stringValue = (candidate: unknown, fallback: string) =>
    typeof candidate === "string" ? candidate : fallback;
  const statusValue = (candidate: unknown, fallback: string) =>
    candidate === "" || candidate === "在室" || candidate === "外出" || candidate === "帰宅"
      ? candidate
      : fallback;
  const accentValues: readonly string[] = ["cyan", "emerald", "violet", "rose", "amber", "blue"];
  const patternValues: readonly string[] = ["grid", "dots", "diagonal", "circuit", "signal", "none"];
  const layoutValues: readonly string[] = ["grid", "compact", "list"];
  const panelColor = (candidate: unknown, fallback: string) =>
    typeof candidate === "string" && (candidate === "" || /^#[0-9a-fA-F]{6}$/.test(candidate))
      ? candidate
      : fallback;

  return {
    ...DEFAULT_SETTINGS,
    theme: stored.theme === "light" || stored.theme === "dark" ? stored.theme : DEFAULT_SETTINGS.theme,
    uiScale: clampUiScale(
      typeof stored.uiScale === "number" ? stored.uiScale : UI_SCALE_DEFAULT,
    ),
    hardwareVolume: clampHardwareVolume(
      typeof stored.hardwareVolume === "number"
        ? stored.hardwareVolume
        : HARDWARE_VOLUME_DEFAULT,
    ),
    rebootScheduleEnabled:
      typeof stored.rebootScheduleEnabled === "boolean"
        ? stored.rebootScheduleEnabled
        : DEFAULT_SETTINGS.rebootScheduleEnabled,
    rebootSchedule:
      typeof stored.rebootSchedule === "string" &&
      (stored.rebootSchedule === "" || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(stored.rebootSchedule))
        ? stored.rebootSchedule
        : "",
    screenOffEnabled:
      typeof stored.screenOffEnabled === "boolean"
        ? stored.screenOffEnabled
        : DEFAULT_SETTINGS.screenOffEnabled,
    screenOffMinutes: finiteInRange(stored.screenOffMinutes, 0, 0, 720, true),
    presenceDimmingEnabled:
      typeof stored.presenceDimmingEnabled === "boolean"
        ? stored.presenceDimmingEnabled
        : DEFAULT_SETTINGS.presenceDimmingEnabled,
    getEndpoint: stringValue(stored.getEndpoint, DEFAULT_SETTINGS.getEndpoint),
    externalSites: normalizeExternalSites(stored),
    postEndpoint: stringValue(stored.postEndpoint, DEFAULT_SETTINGS.postEndpoint),
    attendanceEndpoint: stringValue(
      stored.attendanceEndpoint,
      DEFAULT_SETTINGS.attendanceEndpoint,
    ),
    wsEndpoint: stringValue(stored.wsEndpoint, DEFAULT_SETTINGS.wsEndpoint),
    apiToken: stringValue(stored.apiToken, DEFAULT_SETTINGS.apiToken),
    descriptorBodyTemplate: stringValue(
      stored.descriptorBodyTemplate,
      DEFAULT_DESCRIPTOR_BODY_TEMPLATE,
    ),
    attendanceBodyTemplate: stringValue(
      stored.attendanceBodyTemplate,
      DEFAULT_ATTENDANCE_BODY_TEMPLATE,
    ),
    wsSignalField: stringValue(stored.wsSignalField, DEFAULT_SETTINGS.wsSignalField),
    wsSignalValue: stringValue(stored.wsSignalValue, DEFAULT_SETTINGS.wsSignalValue),
    gestureStatusMap: {
      rock: statusValue(gesture.rock, DEFAULT_GESTURE_STATUS_MAP.rock),
      scissors: statusValue(gesture.scissors, DEFAULT_GESTURE_STATUS_MAP.scissors),
      paper: statusValue(gesture.paper, DEFAULT_GESTURE_STATUS_MAP.paper),
    },
    rejectGesture:
      stored.rejectGesture === "" || stored.rejectGesture === "ThumbsDown"
        ? stored.rejectGesture
        : DEFAULT_REJECT_GESTURE,
    performance: {
      recognitionIntervalMs: finiteInRange(
        perf.recognitionIntervalMs,
        DEFAULT_PERFORMANCE.recognitionIntervalMs,
        200,
        5000,
        true,
      ),
      recognitionStableCount: finiteInRange(
        perf.recognitionStableCount,
        DEFAULT_PERFORMANCE.recognitionStableCount,
        1,
        5,
        true,
      ),
      gesturePollIntervalMs: finiteInRange(
        perf.gesturePollIntervalMs,
        DEFAULT_PERFORMANCE.gesturePollIntervalMs,
        200,
        5000,
        true,
      ),
      gestureStableCount: finiteInRange(
        perf.gestureStableCount,
        DEFAULT_PERFORMANCE.gestureStableCount,
        1,
        5,
        true,
      ),
      cameraFrameIntervalMs: finiteInRange(
        perf.cameraFrameIntervalMs,
        DEFAULT_PERFORMANCE.cameraFrameIntervalMs,
        33,
        2000,
        true,
      ),
      cameraJpegQuality: finiteInRange(
        perf.cameraJpegQuality,
        DEFAULT_PERFORMANCE.cameraJpegQuality,
        10,
        100,
        true,
      ),
      matchThreshold: finiteInRange(
        perf.matchThreshold,
        DEFAULT_PERFORMANCE.matchThreshold,
        0.1,
        0.95,
      ),
      matchMargin: finiteInRange(perf.matchMargin, DEFAULT_PERFORMANCE.matchMargin, 0, 0.5),
      minFaceWidthRatio: finiteInRange(
        perf.minFaceWidthRatio,
        DEFAULT_PERFORMANCE.minFaceWidthRatio,
        0,
        0.9,
      ),
    },
    appearance: {
      accentColor: accentValues.includes(String(appearance.accentColor))
        ? (appearance.accentColor as AccentColor)
        : DEFAULT_APPEARANCE.accentColor,
      backgroundPattern: patternValues.includes(String(appearance.backgroundPattern))
        ? (appearance.backgroundPattern as BackgroundPattern)
        : DEFAULT_APPEARANCE.backgroundPattern,
      memberListLayout: layoutValues.includes(String(appearance.memberListLayout))
        ? (appearance.memberListLayout as MemberListLayout)
        : DEFAULT_APPEARANCE.memberListLayout,
      memberPanelBg: panelColor(appearance.memberPanelBg, DEFAULT_APPEARANCE.memberPanelBg),
      authPanelBg: panelColor(appearance.authPanelBg, DEFAULT_APPEARANCE.authPanelBg),
      registerPanelBg: panelColor(
        appearance.registerPanelBg,
        DEFAULT_APPEARANCE.registerPanelBg,
      ),
    },
  };
}

const STORE_FILE = "settings.json";
const SETTINGS_KEY = "settings";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, {
      // 保存タイミングは下の直列キューで一元管理する。プラグイン側の自動保存と
      // 明示的な save() が競合・重複しないよう、autoSave は無効にする。
      autoSave: false,
      defaults: { [SETTINGS_KEY]: DEFAULT_SETTINGS },
    }).catch((error) => {
      // 一時的な読み込み失敗を永続的にキャッシュしない。次回更新時に再試行できるようにする。
      storePromise = null;
      throw error;
    });
  }
  return storePromise;
}

// UIスケール・音量のスライダーは短時間に多数の更新を発生させる。
// 更新ごとの store.set/save は避けつつ、「呼び出し元の Promise が完了した時点では
// その更新を含む最新スナップショットがディスクへ保存済み」という保証は維持する。
const SAVE_DEBOUNCE_MS = 100;

interface SaveWaiter {
  resolve: () => void;
  reject: (reason: unknown) => void;
}

interface PendingSave {
  settings: AppSettings;
  waiters: SaveWaiter[];
}

let pendingSave: PendingSave | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
// 常に resolve する tail を使い、1回の保存失敗後も後続保存を直列に継続できるようにする。
let saveQueueTail: Promise<void> = Promise.resolve();

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    gestureStatusMap: { ...settings.gestureStatusMap },
    performance: { ...settings.performance },
    appearance: { ...settings.appearance },
    externalSites: settings.externalSites.map((site) => ({ ...site })),
  };
}

async function persistSettings(settings: AppSettings): Promise<void> {
  const store = await getStore();
  await store.set(SETTINGS_KEY, settings);
  // set() の resolve だけではディスク書き込み完了を保証しないため、再起動前にも
  // 確実に反映されるよう明示的な save() の完了まで待つ。
  await store.save();
}

/** 保留中の最新版を直列保存キューへ移し、その保存処理を返す。 */
function flushPendingSave(): Promise<void> {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  const batch = pendingSave;
  if (!batch) return saveQueueTail;
  pendingSave = null;

  const operation = saveQueueTail.then(() => persistSettings(batch.settings));
  // tail 自体は失敗を吸収する。個々の呼び出し元には下の waiters 経由で失敗を返す。
  saveQueueTail = operation.then(
    () => undefined,
    () => undefined,
  );
  operation.then(
    () => batch.waiters.forEach(({ resolve }) => resolve()),
    (error) => batch.waiters.forEach(({ reject }) => reject(error)),
  );
  return operation;
}

function scheduleSettingsSave(settings: AppSettings): Promise<void> {
  if (!isTauri()) return Promise.resolve();

  let waiter!: SaveWaiter;
  const completion = new Promise<void>((resolve, reject) => {
    waiter = { resolve, reject };
  });

  if (pendingSave) {
    // 同じデバウンス窓の更新は、全変更を含む最新スナップショット1件へまとめる。
    pendingSave.settings = cloneSettings(settings);
    pendingSave.waiters.push(waiter);
  } else {
    pendingSave = { settings: cloneSettings(settings), waiters: [waiter] };
  }

  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    // 各 waiter が本来の失敗を受け取るため、タイマー側では未処理拒否だけを防ぐ。
    void flushPendingSave().catch(() => {});
  }, SAVE_DEBOUNCE_MS);

  // 即時反映系の既存呼び出し元には Promise を意図的に待たない箇所もある。
  // その場合も unhandledrejection にせず、await する呼び出し元には元の拒否を返す。
  void completion.catch(() => {});
  return completion;
}

/**
 * 保存済みの設定を読み込む(ブラウザ単体で開いている場合や読み込みに失敗した
 * 場合はデフォルト値を返す)。React コンポーネント外(起動チェックなど)からも
 * 呼び出せるよう、Provider の初期化とは独立した関数として公開している。
 */
export async function loadSettings(): Promise<AppSettings> {
  if (!isTauri()) return DEFAULT_SETTINGS;

  try {
    // Provider の再マウントなどで直前の保存が残っている場合、古い値を読まないよう
    // 保留分をキューへ移して、先行する保存処理が落ち着いてから読み込む。
    void flushPendingSave().catch(() => {});
    await saveQueueTail;
    const store = await getStore();
    const stored = await store.get<AppSettings>(SETTINGS_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    return normalizeSettings(stored);
  } catch {
    return DEFAULT_SETTINGS;
  }
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

  useEffect(() => {
    let cancelled = false;

    loadSettings().then((loaded) => {
      if (cancelled) return;
      settingsRef.current = loaded;
      setSettings(loaded);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      // Provider が外れても、既に返した更新Promiseと保存内容を失わない。
      void flushPendingSave().catch(() => {});
    };
  }, []);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    const next = normalizeSettings({ ...settingsRef.current, ...partial });
    // React の次レンダーを待たず同期更新する。同一tickの連続呼び出しも直前の変更を引き継ぐ。
    settingsRef.current = next;
    setSettings(next);
    return scheduleSettingsSave(next);
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
