import type { Dispatch, SetStateAction } from "react";
import type { AppSettings } from "@/shared/hooks/useSettings";
import { isValidJsonTemplate } from "@/shared/lib/apiBodyTemplate";

const TEXTAREA_CLASSES =
  "mt-1.5 h-32 w-full resize-none rounded-xl border bg-white px-3 py-2.5 font-mono text-xs text-slate-900 outline-none focus:border-sky-400 dark:bg-slate-800 dark:text-slate-100";
const INPUT_CLASSES =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-sky-400 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100";

interface ApiBodyPanelProps {
  draft: AppSettings;
  setDraft: Dispatch<SetStateAction<AppSettings>>;
}

/**
 * 各APIリクエストのボディ・WebSocketシグナルの照合条件を編集するパネル。
 * バックエンド側のフィールド名が変わっても、アプリを再ビルドせずここで
 * テンプレートを書き換えるだけで追従できるようにするための設定。
 *
 * 値は呼び出し元(SettingsPanel)の draft と共有しており、保存は設定画面
 * 本体の「保存する」ボタンで行う(このパネル自体には保存ボタンを持たない)。
 */
export function ApiBodyPanel({ draft, setDraft }: ApiBodyPanelProps) {
  const descriptorValid = isValidJsonTemplate(draft.descriptorBodyTemplate);
  const attendanceValid = isValidJsonTemplate(draft.attendanceBodyTemplate);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">APIボディ</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        編集後は設定画面の「保存する」を押してください。
      </p>

      <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        <div>
          <div className="flex items-center justify-between">
            <label
              className="text-xs font-medium text-slate-500 dark:text-slate-400"
              htmlFor="descriptor-body-template"
            >
              顔特徴ベクトル登録(POST)
            </label>
            {!descriptorValid && (
              <span className="text-xs font-medium text-rose-500">JSON不正</span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            {'使用可能: {{username}}, {{descriptor}}'}
          </p>
          <textarea
            id="descriptor-body-template"
            value={draft.descriptorBodyTemplate}
            onChange={(e) =>
              setDraft((d) => ({ ...d, descriptorBodyTemplate: e.target.value }))
            }
            spellCheck={false}
            className={`${TEXTAREA_CLASSES} ${
              descriptorValid
                ? "border-slate-200 dark:border-white/10"
                : "border-rose-400 dark:border-rose-500/50"
            }`}
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label
              className="text-xs font-medium text-slate-500 dark:text-slate-400"
              htmlFor="attendance-body-template"
            >
              在室状況更新(POST)
            </label>
            {!attendanceValid && (
              <span className="text-xs font-medium text-rose-500">JSON不正</span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            {'使用可能: {{username}}, {{name}}, {{status}}'}
          </p>
          <textarea
            id="attendance-body-template"
            value={draft.attendanceBodyTemplate}
            onChange={(e) =>
              setDraft((d) => ({ ...d, attendanceBodyTemplate: e.target.value }))
            }
            spellCheck={false}
            className={`${TEXTAREA_CLASSES} ${
              attendanceValid
                ? "border-slate-200 dark:border-white/10"
                : "border-rose-400 dark:border-rose-500/50"
            }`}
          />
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            WebSocketシグナル
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            受信したメッセージのこのフィールドがこの値のとき、更新ありとみなします
          </p>
          <div className="mt-1.5 flex gap-2">
            <div className="flex-1">
              <label
                className="text-[11px] text-slate-400 dark:text-slate-500"
                htmlFor="ws-signal-field"
              >
                フィールド名
              </label>
              <input
                id="ws-signal-field"
                type="text"
                value={draft.wsSignalField}
                onChange={(e) => setDraft((d) => ({ ...d, wsSignalField: e.target.value }))}
                placeholder="message"
                className={INPUT_CLASSES}
              />
            </div>
            <div className="flex-1">
              <label
                className="text-[11px] text-slate-400 dark:text-slate-500"
                htmlFor="ws-signal-value"
              >
                値
              </label>
              <input
                id="ws-signal-value"
                type="text"
                value={draft.wsSignalValue}
                onChange={(e) => setDraft((d) => ({ ...d, wsSignalValue: e.target.value }))}
                placeholder="update"
                className={INPUT_CLASSES}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
