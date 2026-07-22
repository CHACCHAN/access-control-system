import { useEffect, useRef, useState, type FormEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useAppVersion } from "@/shared/hooks/useAppVersion";
import { useSettings, type AppSettings } from "@/shared/hooks/useSettings";
import { isValidJsonTemplate } from "@/shared/lib/apiBodyTemplate";
import { applyAccentAttribute } from "@/shared/theme/ThemeContext";
import { playUiSound } from "@/shared/lib/uiSound";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { restartComputer } from "@/shared/lib/systemCommands";
import {
  ArrowLeftIcon,
  BracesIcon,
  CheckIcon,
  GaugeIcon,
  HandIcon,
  LinkIcon,
  PaletteIcon,
  ServerIcon,
  SlidersIcon,
  TerminalIcon,
} from "@/shared/ui/icons";
import { restartRequiredChanges } from "./restartPolicy";
import { GeneralSection } from "./sections/GeneralSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { PerformanceSection } from "./sections/PerformanceSection";
import { ConnectionSection } from "./sections/ConnectionSection";
import { ApiBodySection } from "./sections/ApiBodySection";
import { GestureSection } from "./sections/GestureSection";
import { LogsSection } from "./sections/LogsSection";
import { SystemSection } from "./sections/SystemSection";

interface SettingsPageProps {
  onClose: () => void;
}

type SectionId =
  | "general"
  | "appearance"
  | "performance"
  | "connection"
  | "apibody"
  | "gesture"
  | "logs"
  | "system";

interface IconType {
  ({ className }: { className?: string }): React.ReactNode;
}

const SECTIONS: { id: SectionId; label: string; en: string; icon: IconType }[] = [
  { id: "general", label: "一般", en: "GENERAL", icon: SlidersIcon },
  { id: "appearance", label: "デザイン", en: "APPEARANCE", icon: PaletteIcon },
  { id: "performance", label: "パフォーマンス", en: "PERFORMANCE", icon: GaugeIcon },
  { id: "connection", label: "API接続", en: "CONNECTION", icon: LinkIcon },
  { id: "apibody", label: "APIボディ", en: "REQUEST BODY", icon: BracesIcon },
  { id: "gesture", label: "ジェスチャー", en: "GESTURE", icon: HandIcon },
  { id: "logs", label: "ログ", en: "LOGS", icon: TerminalIcon },
  { id: "system", label: "システム", en: "SYSTEM", icon: ServerIcon },
];

interface ValidationError {
  /** エラーの発生元セクション(エラー表示時にここへ自動で切り替える) */
  section: SectionId;
  message: string;
}

function validateSettings(settings: AppSettings): ValidationError | null {
  const invalid: string[] = [];
  if (!isValidJsonTemplate(settings.descriptorBodyTemplate)) {
    invalid.push("顔特徴ベクトル登録");
  }
  if (!isValidJsonTemplate(settings.attendanceBodyTemplate)) {
    invalid.push("在室状況更新");
  }
  if (invalid.length > 0) {
    return {
      section: "apibody",
      message: `${invalid.join("・")}のAPIボディが正しいJSONではありません`,
    };
  }

  const connectionError = (message: string): ValidationError => ({
    section: "connection",
    message,
  });

  const endpoints: Array<[string, string, readonly string[]]> = [
    ["メンバー取得API", settings.getEndpoint, ["http:", "https:"]],
    ["顔登録API", settings.postEndpoint, ["http:", "https:"]],
    ["在室更新API", settings.attendanceEndpoint, ["http:", "https:"]],
    // Socket.IO は http(s) 表記で指定するのが一般的だが、ws(s) 表記でも接続できる
    ["Socket.IO", settings.wsEndpoint, ["http:", "https:", "ws:", "wss:"]],
  ];
  for (const [label, value, protocols] of endpoints) {
    if (!value) continue;
    try {
      if (!protocols.includes(new URL(value).protocol)) {
        return connectionError(`${label}のURL形式が不正です`);
      }
    } catch {
      return connectionError(`${label}のURL形式が不正です`);
    }
  }

  // HTTP ヘッダー名として使える文字(RFC 9110 の token)
  const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
  for (const site of settings.externalSites) {
    const label = site.name.trim() || site.url || "(名称未設定)";
    if (!site.url.trim()) return connectionError(`外部サイト「${label}」のURLが未入力です`);
    try {
      if (!["http:", "https:"].includes(new URL(site.url).protocol)) {
        return connectionError(`外部サイト「${label}」のURL形式が不正です(http/httpsのみ)`);
      }
    } catch {
      return connectionError(`外部サイト「${label}」のURL形式が不正です(http/httpsのみ)`);
    }
    for (const header of site.headers) {
      const name = header.name.trim();
      if (name === "") continue; // 空行は保存時に除去される
      if (!HEADER_NAME_PATTERN.test(name)) {
        return connectionError(
          `外部サイト「${label}」のヘッダー名「${header.name}」が不正です(英数字と記号のみ、空白・コロン不可)`,
        );
      }
      if (/[\r\n]/.test(header.value)) {
        return connectionError(`外部サイト「${label}」のヘッダー値に改行は使えません`);
      }
    }
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 設定「ページ」。歯車ボタンから遷移してくるフルスクリーンの画面で、
 * 左のサイドバーで設定グループを切り替える(GitHub の設定画面に近い構成)。
 * デザインは GitHub 風のダーク基調にサイバー調のシアンアクセント・格子背景・
 * HUD 風の装飾を合わせている。
 *
 * 保存は draft をまとめて permanent 化する方式(どのセクションを編集しても
 * ヘッダーの「保存」1つで全設定が反映される)。保存した設定は再起動なしで
 * 即時反映される。再起動が必要な項目(restartPolicy.ts で宣言)が変更された
 * 場合のみ、保存前に再起動確認モーダルを挟む。
 */
export function SettingsPage({ onClose }: SettingsPageProps) {
  const { settings, updateSettings, isLoading: isSettingsLoading } = useSettings();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  // 再起動が必要な変更項目のラベル一覧。null 以外なら再起動確認モーダルを表示中
  const [pendingRestartItems, setPendingRestartItems] = useState<string[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // state の再レンダーより先に二重クリックされても、保存処理を1本に制限する。
  const saveInFlightRef = useRef(false);
  const version = useAppVersion();

  // draft の初期化は設定の非同期ロード完了時に一度だけ行う。
  // UIスケール・音量・テーマなど「保存不要で即反映」の項目は updateSettings を
  // 直接呼ぶ(=settings が変わる)ため、settings 変更のたびに draft を丸ごと
  // 同期すると他セクションの編集中の内容が消えてしまう。
  useEffect(() => {
    if (!isSettingsLoading) setDraft(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettingsLoading]);

  // アクセントカラーは保存前でも編集中の値をライブプレビューする。
  // 設定画面を閉じたら(保存の有無に関わらず)保存済みの値へ戻す。
  const savedAccent = settings.appearance.accentColor;
  const draftAccent = draft.appearance.accentColor;
  useEffect(() => {
    applyAccentAttribute(draftAccent);
  }, [draftAccent]);
  useEffect(() => {
    return () => applyAccentAttribute(savedAccent);
  }, [savedAccent]);

  // 編集内容が保存済みの設定と異なるか(未保存の変更があるか)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const isConfirmingSave = pendingRestartItems !== null;

  function reportValidationError(error: ValidationError) {
    setPendingRestartItems(null);
    // エラーの発生元セクションへ自動で切り替え、該当の入力欄をすぐ直せるようにする
    setActiveSection(error.section);
    setSaveError(error.message);
    playUiSound("error");
  }

  async function commitSave(restart: boolean) {
    if (saveInFlightRef.current) return;

    const validationError = validateSettings(draft);
    if (validationError) {
      reportValidationError(validationError);
      return;
    }

    saveInFlightRef.current = true;
    setPendingRestartItems(null);
    setIsSaving(true);
    setIsRestarting(false);
    setSaveError(null);
    // 失敗時に再試行できるよう、今回の処理が最後まで完了するまでは保存済みにしない。
    setSavedAt(null);

    let phase: "save" | "restart" = "save";
    try {
      // updateSettings の完了は、デバウンスされたstore.saveまで完了したことを意味する。
      // 保存された設定は各消費側(API再取得・Socket.IO再接続・Rustのstore再読込)が
      // 検知して即時反映するため、通常は再起動しない。
      await updateSettings(draft);

      // 再起動が必要な項目(restartPolicy.ts)が変更されたときだけ再起動する。
      if (restart && isTauri()) {
        phase = "restart";
        setIsRestarting(true);
        await restartComputer();
      }

      setSavedAt(Date.now());
      playUiSound("success");
    } catch (error) {
      const action = phase === "save" ? "設定の保存" : "端末の再起動";
      setSaveError(`${action}に失敗しました: ${errorMessage(error)}`);
      setIsRestarting(false);
      playUiSound("error");
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    if (saveInFlightRef.current || isSaving || isRestarting || isConfirmingSave) return;

    const validationError = validateSettings(draft);
    if (validationError) {
      reportValidationError(validationError);
      return;
    }

    setSaveError(null);
    // 再起動が必要な項目が変更された保存だけ、事前に確認モーダルを挟む。
    // それ以外は保存のみで即時反映される(端末は再起動しない)。
    const restartItems = isTauri() ? restartRequiredChanges(settings, draft) : [];
    if (restartItems.length > 0) {
      setPendingRestartItems(restartItems);
      return;
    }
    void commitSave(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 text-slate-900 animate-page-in dark:bg-[#070b14] dark:text-slate-100">
      {/* 背景装飾: 格子 + 上部のアクセントグロー + 走査線。
          設定の背景パターン(アニメーション含む)はトップページ専用の装飾のため、
          この画面では常に静的な格子に固定する(選択肢のプレビューは
          デザインセクション内のサムネイルで確認できる)。 */}
      <div className="cyber-grid pointer-events-none absolute inset-0 opacity-70" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-60 dark:opacity-100"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, color-mix(in srgb, var(--color-cyan-400) 10%, transparent), transparent 70%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-scan absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-cyan-400/40 to-transparent" />
      </div>

      {/* ヘッダー */}
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white/70 px-6 py-4 backdrop-blur dark:border-cyan-400/10 dark:bg-slate-950/50">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving || isRestarting}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:border-cyan-500/50 hover:text-cyan-600 dark:border-white/10 dark:text-slate-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-400"
            aria-label="戻る"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-cyan-600/80 dark:text-cyan-400/70">
              // system config
            </p>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              設定
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden rounded-md border border-slate-300 px-2.5 py-1 font-mono text-xs text-slate-500 sm:inline-block dark:border-white/10 dark:text-slate-400">
            v{version ?? "—"}
          </span>
          {savedAt && !isDirty && (
            <span className="hidden font-mono text-xs text-emerald-600 sm:inline dark:text-emerald-400">
              {isRestarting ? "再起動します…" : "保存済み"}
            </span>
          )}
          <button
            type="submit"
            form="settings-form"
            disabled={
              isSaving ||
              isRestarting ||
              isConfirmingSave ||
              (!isDirty && saveError === null)
            }
            className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-glow transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {isSaving || isRestarting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
            ) : (
              <CheckIcon className="h-4 w-4" />
            )}
            {isRestarting ? "再起動中…" : isSaving ? "保存中…" : "保存"}
          </button>
        </div>
      </header>

      {saveError && (
        <div
          role="alert"
          className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-b border-rose-200 bg-rose-50 px-6 py-2.5 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
        >
          <span>[settings] {saveError}</span>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="shrink-0 rounded-md border border-rose-300 px-2 py-1 text-xs transition hover:bg-rose-100 dark:border-rose-500/30 dark:hover:bg-rose-500/10"
          >
            閉じる
          </button>
        </div>
      )}

      {/* 本体: サイドバー + コンテンツ */}
      <div className="relative z-10 flex min-h-0 flex-1">
        {/* サイドバー */}
        <nav className="w-52 shrink-0 overflow-y-auto border-r border-slate-200 bg-white/40 p-3 dark:border-white/5 dark:bg-slate-950/30">
          {SECTIONS.map(({ id, label, en, icon: Icon }) => {
            const active = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setActiveSection(id)}
                className={`group relative mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                  active
                    ? "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
                }`}
              >
                {/* アクティブ時の左端のネオンバー */}
                <span
                  className={`absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-cyan-400 transition-opacity ${
                    active ? "opacity-100 shadow-glow-sm" : "opacity-0"
                  }`}
                />
                <Icon className="h-5 w-5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-tight">{label}</span>
                  <span className="block font-mono text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-600">
                    {en}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* コンテンツ */}
        <form
          id="settings-form"
          onSubmit={handleSave}
          className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8"
        >
          <div className="mx-auto max-w-2xl">
            {activeSection === "general" && (
              <GeneralSection draft={draft} setDraft={setDraft} />
            )}
            {activeSection === "appearance" && (
              <AppearanceSection draft={draft} setDraft={setDraft} />
            )}
            {activeSection === "performance" && (
              <PerformanceSection draft={draft} setDraft={setDraft} />
            )}
            {activeSection === "connection" && (
              <ConnectionSection draft={draft} setDraft={setDraft} />
            )}
            {activeSection === "apibody" && (
              <ApiBodySection draft={draft} setDraft={setDraft} />
            )}
            {activeSection === "gesture" && (
              <GestureSection draft={draft} setDraft={setDraft} />
            )}
            {activeSection === "logs" && <LogsSection />}
            {activeSection === "system" && <SystemSection />}
          </div>
        </form>
      </div>

      {/* 再起動が必要な項目が変更されたときだけ表示する確認モーダル(実機のみ)。
          電源操作と共通の確認ダイアログ部品 */}
      {pendingRestartItems && (
        <ConfirmDialog
          eyebrow="confirm"
          eyebrowClass="text-amber-500"
          borderClass="border-slate-200 dark:border-amber-500/25"
          title="設定を保存して再起動しますか？"
          message={`次の設定の反映には端末の再起動が必要です: ${pendingRestartItems.join("・")}`}
          confirmLabel={
            <>
              <CheckIcon className="h-4 w-4" />
              保存して再起動
            </>
          }
          confirmButtonClass="bg-amber-500 hover:bg-amber-400 text-white"
          busy={isSaving || isRestarting}
          onCancel={() => {
            if (!saveInFlightRef.current) setPendingRestartItems(null);
          }}
          onConfirm={() => void commitSave(true)}
        />
      )}
    </div>
  );
}
