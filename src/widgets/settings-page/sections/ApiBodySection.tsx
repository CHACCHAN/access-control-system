import type { Dispatch, SetStateAction } from "react";
import type { AppSettings } from "@/shared/hooks/useSettings";
import { isValidJsonTemplate } from "@/shared/lib/apiBodyTemplate";
import { BracesIcon } from "@/shared/ui/icons";
import { Field, INPUT_CLASS, SectionHeader, SettingsCard, TEXTAREA_CLASS } from "../fields";

interface SectionProps {
  draft: AppSettings;
  setDraft: Dispatch<SetStateAction<AppSettings>>;
}

/**
 * 各APIリクエストのボディ・Socket.IO 更新通知の読み取り方を編集するセクション。
 * バックエンド側のフィールド名が変わっても、アプリを再ビルドせずここで
 * テンプレートを書き換えるだけで追従できるようにするための設定。
 */
export function ApiBodySection({ draft, setDraft }: SectionProps) {
  const descriptorValid = isValidJsonTemplate(draft.descriptorBodyTemplate);
  const attendanceValid = isValidJsonTemplate(draft.attendanceBodyTemplate);

  return (
    <SettingsCard>
      <SectionHeader
        icon={BracesIcon}
        eyebrow="REQUEST BODY"
        title="APIボディ"
        description="送信するJSONのテンプレートと、更新通知の読み取り方"
      />

      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="descriptor-body-template"
              className="text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              顔特徴ベクトル登録 (POST)
            </label>
            <ValidityBadge valid={descriptorValid} />
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-cyan-600/70 dark:text-cyan-400/60">
            {"{{username}}  {{descriptor}}"}
          </p>
          <textarea
            id="descriptor-body-template"
            value={draft.descriptorBodyTemplate}
            onChange={(e) => setDraft((d) => ({ ...d, descriptorBodyTemplate: e.target.value }))}
            spellCheck={false}
            className={`${TEXTAREA_CLASS} mt-1.5 h-28 ${
              descriptorValid
                ? "border-slate-200 dark:border-white/10"
                : "border-rose-400 dark:border-rose-500/50"
            }`}
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="attendance-body-template"
              className="text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              在室状況更新 (POST)
            </label>
            <ValidityBadge valid={attendanceValid} />
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-cyan-600/70 dark:text-cyan-400/60">
            {"{{username}}  {{name}}  {{status}}"}
          </p>
          <textarea
            id="attendance-body-template"
            value={draft.attendanceBodyTemplate}
            onChange={(e) => setDraft((d) => ({ ...d, attendanceBodyTemplate: e.target.value }))}
            spellCheck={false}
            className={`${TEXTAREA_CLASS} mt-1.5 h-28 ${
              attendanceValid
                ? "border-slate-200 dark:border-white/10"
                : "border-rose-400 dark:border-rose-500/50"
            }`}
          />
        </div>

        <div className="border-t border-dashed border-slate-200 pt-5 dark:border-white/10">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Socket.IO 更新通知
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            このイベント名で受信したペイロードから、ユーザー名と在室ステータスを読み取って一覧へ即時反映します(読み取れない場合は一覧を再取得します)
          </p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="イベント名" htmlFor="socket-event-name">
              <input
                id="socket-event-name"
                type="text"
                value={draft.socketEventName}
                onChange={(e) => setDraft((d) => ({ ...d, socketEventName: e.target.value }))}
                placeholder="statusUpdated"
                spellCheck={false}
                className={`${INPUT_CLASS} font-mono`}
              />
            </Field>
            <Field label="ユーザー名フィールド" htmlFor="socket-user-field">
              <input
                id="socket-user-field"
                type="text"
                value={draft.socketUserField}
                onChange={(e) => setDraft((d) => ({ ...d, socketUserField: e.target.value }))}
                placeholder="userName"
                spellCheck={false}
                className={`${INPUT_CLASS} font-mono`}
              />
            </Field>
            <Field label="ステータスフィールド" htmlFor="socket-status-field">
              <input
                id="socket-status-field"
                type="text"
                value={draft.socketStatusField}
                onChange={(e) => setDraft((d) => ({ ...d, socketStatusField: e.target.value }))}
                placeholder="newStatus"
                spellCheck={false}
                className={`${INPUT_CLASS} font-mono`}
              />
            </Field>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}

function ValidityBadge({ valid }: { valid: boolean }) {
  return valid ? (
    <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
      ● valid
    </span>
  ) : (
    <span className="font-mono text-[10px] uppercase tracking-wider text-rose-500">
      ● json error
    </span>
  );
}
