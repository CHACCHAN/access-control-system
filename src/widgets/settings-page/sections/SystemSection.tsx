import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useAppVersion } from "@/shared/hooks/useAppVersion";
import {
  exitToShell,
  restartComputer,
  shutdownComputer,
} from "@/widgets/system-control-panel/api";
import { playUiSound } from "@/shared/lib/uiSound";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { PowerIcon, RestartIcon, ServerIcon, TerminalIcon } from "@/shared/ui/icons";
import { SectionHeader, SettingsCard } from "../fields";

// 確認を挟む電源系操作。トップ画面左下にあった電源パネルをここへ統合した。
type PendingAction = "restart" | "shutdown" | "exit" | null;

interface IconType {
  ({ className }: { className?: string }): React.ReactNode;
}

// 操作の重さで色分けする:
// - 再起動        : 黄(注意。少し待てば復帰する)
// - シャットダウン: 赤(最も影響が大きい。現地で電源を入れ直すまで停止)
// - 終了          : グレー(管理用の中立操作。シェルへ戻るだけ)
interface ActionInfo {
  label: string;
  title: string;
  detail: string;
  icon: IconType;
  /** 一覧側の操作ボタン */
  rowButton: string;
  /** ダイアログの見出し(eyebrow)の文言と色 */
  eyebrow: string;
  eyebrowClass: string;
  /** ダイアログのアイコンボックス・枠線・実行ボタン */
  iconBox: string;
  dialogBorder: string;
  confirmButton: string;
}

const ACTION_INFO: Record<Exclude<PendingAction, null>, ActionInfo> = {
  restart: {
    label: "再起動",
    title: "端末を再起動",
    detail: "このコンピュータが再起動します",
    icon: RestartIcon,
    rowButton:
      "border-amber-400/60 text-amber-600 hover:bg-amber-100 dark:border-amber-500/30 dark:text-amber-400 dark:hover:bg-amber-500/10",
    eyebrow: "caution",
    eyebrowClass: "text-amber-500 dark:text-amber-400",
    iconBox: "bg-amber-500/10 text-amber-500 dark:text-amber-400",
    dialogBorder: "border-slate-200 dark:border-amber-500/25",
    confirmButton: "bg-amber-500 hover:bg-amber-400 text-white",
  },
  shutdown: {
    label: "シャットダウン",
    title: "端末をシャットダウン",
    detail: "このコンピュータが電源オフになります",
    icon: PowerIcon,
    rowButton:
      "border-rose-300 text-rose-600 hover:bg-rose-100 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10",
    eyebrow: "danger zone",
    eyebrowClass: "text-rose-500 dark:text-rose-400",
    iconBox: "bg-rose-500/10 text-rose-500 dark:text-rose-400",
    dialogBorder: "border-slate-200 dark:border-rose-500/25",
    confirmButton: "bg-rose-500 hover:bg-rose-400 text-white",
  },
  exit: {
    label: "終了",
    title: "シェルに戻る",
    detail: "アプリを終了し、起動前のシェル画面に戻ります",
    icon: TerminalIcon,
    rowButton:
      "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10",
    eyebrow: "exit",
    eyebrowClass: "text-slate-500 dark:text-slate-400",
    iconBox: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    dialogBorder: "border-slate-200 dark:border-white/15",
    confirmButton: "bg-slate-600 hover:bg-slate-500 text-white",
  },
};

async function executeAction(action: Exclude<PendingAction, null>): Promise<void> {
  // ブラウザでの開発時は実行せず、見た目だけ確認できればよい
  if (!isTauri()) return;
  if (action === "restart") await restartComputer();
  else if (action === "shutdown") await shutdownComputer();
  else await exitToShell();
}

/**
 * システム操作(危険区域)。端末の再起動・シャットダウン・アプリ終了を
 * 確認付きで提供する。バージョン情報・クレジットもここに集約する。
 */
export function SystemSection() {
  const version = useAppVersion();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!pendingAction) return;
    setIsExecuting(true);
    setError(null);
    try {
      await executeAction(pendingAction);
      setIsExecuting(false);
      setPendingAction(null);
    } catch (err) {
      playUiSound("error");
      setError(err instanceof Error ? err.message : String(err));
      setIsExecuting(false);
    }
  }

  function closeDialog() {
    if (isExecuting) return;
    setPendingAction(null);
    setError(null);
  }

  return (
    <SettingsCard>
      <SectionHeader
        icon={ServerIcon}
        eyebrow="SYSTEM"
        title="システム"
        description="電源操作・アプリケーションとバージョンの管理"
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">バージョン</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              access-control-system
            </p>
          </div>
          <span className="rounded-md border border-cyan-500/30 bg-cyan-500/5 px-2.5 py-1 font-mono text-xs text-cyan-700 dark:text-cyan-300">
            v{version ?? "—"}
          </span>
        </div>

        {/* 電源操作。操作の重さで色分け(再起動=黄 / シャットダウン=赤 / 終了=グレー) */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-slate-950/40">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-600/80 dark:text-cyan-400/70">
            power control
          </p>

          <div className="mt-2 space-y-3">
            {(Object.keys(ACTION_INFO) as Exclude<PendingAction, null>[]).map((action) => {
              const info = ACTION_INFO[action];
              const Icon = info.icon;
              return (
                <div key={action} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {info.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{info.detail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingAction(action)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-medium transition ${info.rowButton}`}
                  >
                    <Icon className="h-4 w-4" />
                    {info.label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* クレジット */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-600/80 dark:text-cyan-400/70">
            credits
          </p>
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">作成者</span>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                中山裕哉 <span className="font-mono text-xs text-slate-500 dark:text-slate-400">24G3102</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">ライセンス</span>
              <span className="font-mono text-xs text-slate-700 dark:text-slate-200">MIT License</span>
            </div>
          </div>
          <p className="mt-2.5 border-t border-slate-200 pt-2 text-[11px] leading-relaxed text-slate-400 dark:border-white/5 dark:text-slate-500">
            本ソフトウェアは MIT ライセンスの下で提供されます。ソフトウェアは「現状のまま」提供され、明示または黙示を問わずいかなる保証もありません。
          </p>
        </div>
      </div>

      {/* 実行確認ダイアログ(操作の重さに応じた色)。共通部品が body 直下に
          ポータル描画するため、カードの backdrop-blur の影響を受けず全画面中央に出る */}
      {pendingAction &&
        (() => {
          const info = ACTION_INFO[pendingAction];
          const Icon = info.icon;
          return (
            <ConfirmDialog
              eyebrow={info.eyebrow}
              eyebrowClass={info.eyebrowClass}
              icon={<Icon className="h-6 w-6" />}
              iconBoxClass={info.iconBox}
              borderClass={info.dialogBorder}
              title={`本当に${info.label}しますか？`}
              message={info.detail}
              error={error}
              confirmLabel={`${info.label}する`}
              confirmButtonClass={info.confirmButton}
              busy={isExecuting}
              onCancel={closeDialog}
              onConfirm={() => void handleConfirm()}
            />
          );
        })()}
    </SettingsCard>
  );
}
