import { useEffect, useState, type FormEvent } from "react";
import { useSettings, type AppSettings } from "@/shared/hooks/useSettings";
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

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  function handleSave(e: FormEvent) {
    e.preventDefault();
    updateSettings(draft);
    setSavedAt(Date.now());
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
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white transition hover:bg-sky-400"
        >
          <CheckIcon className="h-4 w-4" />
          保存する
        </button>

        {savedAt && (
          <p className="mt-3 text-center text-xs text-emerald-600 dark:text-emerald-400">
            保存しました
          </p>
        )}
      </form>
    </div>
  );
}
