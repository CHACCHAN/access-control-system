import { useEffect, useState, type FormEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useAppVersion } from "@/shared/hooks/useAppVersion";
import {
  useSettings,
  type AppSettings,
  type GestureStatusMap,
} from "@/shared/hooks/useSettings";
import { ATTENDANCE_STATUSES } from "@/entities/member/statusStyle";
import {
  exitToShell,
  restartComputer,
} from "@/widgets/system-control-panel/api";
import { CheckIcon, CloseIcon } from "@/shared/ui/icons";
import { LogPanel } from "./LogPanel";
import { ApiBodyPanel } from "./ApiBodyPanel";

interface SettingsPanelProps {
  onClose: () => void;
}

type RightPanel = "none" | "logs" | "apiBody";

const FIELD_CLASSES =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500";
const LABEL_CLASSES =
  "mt-5 block text-xs font-medium text-slate-500 dark:text-slate-400";
const GESTURE_FIELDS: { key: keyof GestureStatusMap; label: string }[] = [
  { key: "rock", label: "✊ グー" },
  { key: "scissors", label: "✌️ チョキ" },
  { key: "paper", label: "✋ パー" },
];

const TOOL_BUTTON_CLASSES = (active: boolean) =>
  `rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
    active
      ? "border-sky-400 bg-sky-500/10 text-sky-600 dark:text-sky-400"
      : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
  }`;

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, updateSettings } = useSettings();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isConfirmingExit, setIsConfirmingExit] = useState(false);
  const [isConfirmingSave, setIsConfirmingSave] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>("none");
  const version = useAppVersion();

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    // 実機では保存後に自動で再起動するため、初回の送信では確認クッションを
    // 挟むだけにし、実際の保存・再起動は確認後(2回目の送信)に行う。
    if (isTauri() && !isConfirmingSave) {
      setIsConfirmingSave(true);
      return;
    }
    setIsConfirmingSave(false);
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
      <div
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-scale-in dark:border-white/10 dark:bg-slate-900 dark:shadow-black/40 ${
          rightPanel !== "none" ? "max-w-4xl" : "max-w-md"
        }`}
      >
        {/* 設定/ログ共通のヘッダー。閉じるボタンをここに1つだけ置くことで、
            右カラム(ログ一覧)のヘッダーと重なるのを防ぐ。 */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-8 py-5 dark:border-white/10">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              設定
            </h2>
            {version && (
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                v{version}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-200"
            aria-label="閉じる"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <form
            onSubmit={handleSave}
            className={`min-h-0 flex-1 overflow-y-auto p-8 ${
              rightPanel !== "none"
                ? "border-r border-slate-200 dark:border-white/10"
                : ""
            }`}
          >
            <label
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
              htmlFor="reboot-schedule"
            >
              再起動スケジュール
            </label>
            <input
              id="reboot-schedule"
              type="time"
              value={draft.rebootSchedule}
              onChange={(e) =>
                setDraft((d) => ({ ...d, rebootSchedule: e.target.value }))
              }
              className={FIELD_CLASSES}
            />

            <label className={LABEL_CLASSES} htmlFor="screen-off-schedule">
              自動消灯時間
            </label>
            <input
              id="screen-off-schedule"
              type="time"
              value={draft.screenOffSchedule}
              onChange={(e) =>
                setDraft((d) => ({ ...d, screenOffSchedule: e.target.value }))
              }
              className={FIELD_CLASSES}
            />

            <label className={LABEL_CLASSES} htmlFor="get-endpoint">
              メンバー取得 API(GET)
            </label>
            <input
              id="get-endpoint"
              type="text"
              value={draft.getEndpoint}
              onChange={(e) =>
                setDraft((d) => ({ ...d, getEndpoint: e.target.value }))
              }
              placeholder="https://example.com/api/kiosk_device"
              className={FIELD_CLASSES}
            />

            <label className={LABEL_CLASSES} htmlFor="post-endpoint">
              顔特徴ベクトル登録 API(POST)
            </label>
            <input
              id="post-endpoint"
              type="text"
              value={draft.postEndpoint}
              onChange={(e) =>
                setDraft((d) => ({ ...d, postEndpoint: e.target.value }))
              }
              placeholder="https://example.com/api/kiosk_device"
              className={FIELD_CLASSES}
            />

            <label className={LABEL_CLASSES} htmlFor="attendance-endpoint">
              在室状況更新 API(POST)
            </label>
            <input
              id="attendance-endpoint"
              type="text"
              value={draft.attendanceEndpoint}
              onChange={(e) =>
                setDraft((d) => ({ ...d, attendanceEndpoint: e.target.value }))
              }
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
              onChange={(e) =>
                setDraft((d) => ({ ...d, wsEndpoint: e.target.value }))
              }
              placeholder="wss://example.com/ws"
              className={FIELD_CLASSES}
            />

            <p className={LABEL_CLASSES}>ジェスチャーの在室ステータス割り当て</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              カメラに向けたジェスチャーで在室ステータスを更新します
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {GESTURE_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label
                    className="block text-center text-xs text-slate-500 dark:text-slate-400"
                    htmlFor={`gesture-${key}`}
                  >
                    {label}
                  </label>
                  <select
                    id={`gesture-${key}`}
                    value={draft.gestureStatusMap[key]}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        gestureStatusMap: {
                          ...d.gestureStatusMap,
                          [key]: e.target.value,
                        },
                      }))
                    }
                    className={`${FIELD_CLASSES} text-center`}
                  >
                    {ATTENDANCE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                    <option value="">なし</option>
                  </select>
                </div>
              ))}
            </div>

            <label className={LABEL_CLASSES} htmlFor="api-token">
              APIトークン
            </label>
            <input
              id="api-token"
              type="password"
              value={draft.apiToken}
              onChange={(e) =>
                setDraft((d) => ({ ...d, apiToken: e.target.value }))
              }
              autoComplete="off"
              className={FIELD_CLASSES}
            />

            {isConfirmingSave ? (
              <div className="mt-6 animate-fade-in rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  保存すると設定を反映するため端末を再起動します。よろしいですか？
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsConfirmingSave(false)}
                    className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:bg-transparent dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={isRestarting}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRestarting ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <CheckIcon className="h-4 w-4" />
                    )}
                    保存して再起動する
                  </button>
                </div>
              </div>
            ) : (
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
            )}

            {savedAt && (
              <p className="mt-3 text-center text-xs text-emerald-600 dark:text-emerald-400">
                {isRestarting
                  ? "保存しました。再起動します..."
                  : "保存しました"}
              </p>
            )}

            <div className="mt-8 border-t border-slate-200 pt-5 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                開発者用
              </p>

              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    ログ
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    通信内容やconsole出力の履歴を表示します
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setRightPanel((p) => (p === "logs" ? "none" : "logs"))
                  }
                  className={TOOL_BUTTON_CLASSES(rightPanel === "logs")}
                >
                  {rightPanel === "logs" ? "閉じる" : "表示する"}
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    APIボディ
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    APIの照合条件を編集します
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setRightPanel((p) => (p === "apiBody" ? "none" : "apiBody"))
                  }
                  className={TOOL_BUTTON_CLASSES(rightPanel === "apiBody")}
                >
                  {rightPanel === "apiBody" ? "閉じる" : "表示する"}
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    シェル
                  </p>
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
                    className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    終了
                  </button>
                )}
              </div>
            </div>
          </form>

          {rightPanel !== "none" && (
            <div className="min-h-0 w-full max-w-md p-8">
              {rightPanel === "logs" ? (
                <LogPanel />
              ) : (
                <ApiBodyPanel draft={draft} setDraft={setDraft} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
