import { useEffect, useState, type FormEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useAppVersion } from "@/shared/hooks/useAppVersion";
import { useSettings, type AppSettings } from "@/shared/hooks/useSettings";
import { exitToShell, restartComputer } from "@/widgets/system-control-panel/api";
import { CheckIcon, CloseIcon } from "@/shared/ui/icons";

interface SettingsPanelProps {
  onClose: () => void;
}

const FIELD_CLASSES =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500";
const LABEL_CLASSES = "mt-5 block text-xs font-medium text-slate-500 dark:text-slate-400";

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, updateSettings } = useSettings();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isConfirmingExit, setIsConfirmingExit] = useState(false);
  const version = useAppVersion();

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    await updateSettings(draft);
    setSavedAt(Date.now());
    // 設定変更(特にエンドポイント類)を確実に反映させるため、保存後は自動的に再起動する
    if (isTauri()) {
      setIsRestarting(true);
      await restartComputer();
    }
  }

  async function handleExitToShell() {
    if (isTauri()) {
      await exitToShell();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-fade-in dark:bg-slate-950/70">
      <form
        onSubmit={handleSave}
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl animate-scale-in dark:border-white/10 dark:bg-slate-900 dark:shadow-black/40"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-200"
          aria-label="閉じる"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">設定</h2>
        {version && (
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">v{version}</p>
        )}

        <label className="mt-6 block text-xs font-medium text-slate-500 dark:text-slate-400" htmlFor="reboot-schedule">
          再起動スケジュール
        </label>
        <input
          id="reboot-schedule"
          type="time"
          value={draft.rebootSchedule}
          onChange={(e) => setDraft((d) => ({ ...d, rebootSchedule: e.target.value }))}
          className={FIELD_CLASSES}
        />

        <label className={LABEL_CLASSES} htmlFor="screen-off-schedule">
          自動消灯時間
        </label>
        <input
          id="screen-off-schedule"
          type="time"
          value={draft.screenOffSchedule}
          onChange={(e) => setDraft((d) => ({ ...d, screenOffSchedule: e.target.value }))}
          className={FIELD_CLASSES}
        />

        <label className={LABEL_CLASSES} htmlFor="get-endpoint">
          メンバー取得 API(GET)
        </label>
        <input
          id="get-endpoint"
          type="text"
          value={draft.getEndpoint}
          onChange={(e) => setDraft((d) => ({ ...d, getEndpoint: e.target.value }))}
          placeholder="https://example.com/api/kiosk_device"
          className={FIELD_CLASSES}
        />

        <label className={LABEL_CLASSES} htmlFor="post-endpoint">
          在室状況更新 API(POST)
        </label>
        <input
          id="post-endpoint"
          type="text"
          value={draft.postEndpoint}
          onChange={(e) => setDraft((d) => ({ ...d, postEndpoint: e.target.value }))}
          placeholder="https://example.com/api/kiosk_device"
          className={FIELD_CLASSES}
        />

        <label className={LABEL_CLASSES} htmlFor="ws-endpoint">
          WebSocket エンドポイント
        </label>
        <input
          id="ws-endpoint"
          type="text"
          value={draft.wsEndpoint}
          onChange={(e) => setDraft((d) => ({ ...d, wsEndpoint: e.target.value }))}
          placeholder="wss://example.com/ws"
          className={FIELD_CLASSES}
        />

        <label className={LABEL_CLASSES} htmlFor="api-token">
          APIトークン
        </label>
        <input
          id="api-token"
          type="password"
          value={draft.apiToken}
          onChange={(e) => setDraft((d) => ({ ...d, apiToken: e.target.value }))}
          autoComplete="off"
          className={FIELD_CLASSES}
        />

        <button
          type="submit"
          disabled={isRestarting}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRestarting ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <CheckIcon className="h-4 w-4" />
          )}
          保存する
        </button>

        {savedAt && (
          <p className="mt-3 text-center text-xs text-emerald-600 dark:text-emerald-400">
            {isRestarting ? "保存しました。再起動します..." : "保存しました"}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5 dark:border-white/10">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">シェル</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              アプリを終了し、起動前のシェル画面に戻ります
            </p>
          </div>

          {isConfirmingExit ? (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmingExit(false)}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleExitToShell}
                className="rounded-full bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-400"
              >
                終了する
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirmingExit(true)}
              className="shrink-0 rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              終了
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
