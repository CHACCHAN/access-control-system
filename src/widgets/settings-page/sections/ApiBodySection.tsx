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
 * 各APIリクエストのボディ・WebSocketシグナルの照合条件を編集するセクション。
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
        description="送信するJSONのテンプレートと更新シグナルの照合条件"
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
            WebSocketシグナル
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            受信メッセージのこのフィールドがこの値のとき「更新あり」とみなします
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label="フィールド名" htmlFor="ws-signal-field">
              <input
                id="ws-signal-field"
                type="text"
                value={draft.wsSignalField}
                onChange={(e) => setDraft((d) => ({ ...d, wsSignalField: e.target.value }))}
                placeholder="message"
                className={`${INPUT_CLASS} font-mono`}
              />
            </Field>
            <Field label="値" htmlFor="ws-signal-value">
              <input
                id="ws-signal-value"
                type="text"
                value={draft.wsSignalValue}
                onChange={(e) => setDraft((d) => ({ ...d, wsSignalValue: e.target.value }))}
                placeholder="update"
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
