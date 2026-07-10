import { useEffect, useState, type FormEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useAppVersion } from "@/shared/hooks/useAppVersion";
import { PATTERN_CLASS, useSettings, type AppSettings } from "@/shared/hooks/useSettings";
import { applyAccentAttribute } from "@/shared/theme/ThemeContext";
import { restartComputer } from "@/widgets/system-control-panel/api";
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

/**
 * 設定「ページ」。歯車ボタンから遷移してくるフルスクリーンの画面で、
 * 左のサイドバーで設定グループを切り替える(GitHub の設定画面に近い構成)。
 * デザインは GitHub 風のダーク基調にサイバー調のシアンアクセント・格子背景・
 * HUD 風の装飾を合わせている。
 *
 * 保存は draft をまとめて permanent 化する方式(どのセクションを編集しても
 * ヘッダーの「保存」1つで全設定が反映される)。実機では反映のため保存後に
 * 自動再起動する(旧 SettingsPanel の挙動を踏襲)。
 */
export function SettingsPage({ onClose }: SettingsPageProps) {
  const { settings, updateSettings } = useSettings();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isConfirmingSave, setIsConfirmingSave] = useState(false);
  const version = useAppVersion();

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

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

  // 背景パターンも編集中の値でプレビュー(このページの背景に反映される)
  const previewPattern = PATTERN_CLASS[draft.appearance.backgroundPattern] ?? "cyber-grid";

  // 編集内容が保存済みの設定と異なるか(未保存の変更があるか)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  async function commitSave() {
    setIsConfirmingSave(false);
    await updateSettings(draft);
    setSavedAt(Date.now());
    // 設定変更(特にエンドポイント類)を確実に反映させるため、実機では保存後に自動再起動する
    if (isTauri()) {
      setIsRestarting(true);
      await restartComputer();
    }
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    // 実機では保存後に自動再起動するため、初回送信では確認を挟む
    if (isTauri() && !isConfirmingSave) {
      setIsConfirmingSave(true);
      return;
    }
    void commitSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 text-slate-900 animate-page-in dark:bg-[#070b14] dark:text-slate-100">
      {/* 背景装飾: 背景パターン(設定に追従) + 上部のアクセントグロー + 走査線 */}
      {previewPattern && (
        <div className={`${previewPattern} pointer-events-none absolute inset-0 opacity-70`} />
      )}
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
            disabled={isRestarting || (!isDirty && savedAt !== null)}
            className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-glow transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {isRestarting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
            ) : (
              <CheckIcon className="h-4 w-4" />
            )}
            保存
          </button>
        </div>
      </header>

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

      {/* 保存 → 再起動の確認モーダル(実機のみ) */}
      {isConfirmingSave && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="cyber-corners w-full max-w-sm rounded-xl border border-cyan-400/20 bg-white p-6 shadow-2xl animate-scale-in dark:bg-slate-900">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-amber-500">
              confirm
            </p>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
              保存すると設定を反映するため端末を再起動します。よろしいですか？
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmingSave(false)}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void commitSave()}
                disabled={isRestarting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRestarting ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <CheckIcon className="h-4 w-4" />
                )}
                保存して再起動
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
