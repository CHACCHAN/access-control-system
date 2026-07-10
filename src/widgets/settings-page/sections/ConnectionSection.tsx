import type { Dispatch, SetStateAction } from "react";
import type { AppSettings } from "@/shared/hooks/useSettings";
import { LinkIcon } from "@/shared/ui/icons";
import { Field, INPUT_CLASS, MONO_INPUT_CLASS, SectionHeader, SettingsCard } from "../fields";

interface SectionProps {
  draft: AppSettings;
  setDraft: Dispatch<SetStateAction<AppSettings>>;
}

// エンドポイント系の入力定義。ラベル・プレースホルダをここに集約する。
const ENDPOINTS: {
  key: "getEndpoint" | "postEndpoint" | "attendanceEndpoint" | "wsEndpoint";
  label: string;
  hint: string;
  placeholder: string;
}[] = [
  {
    key: "getEndpoint",
    label: "メンバー取得 API (GET)",
    hint: "在室者一覧を取得するエンドポイント",
    placeholder: "https://example.com/api/kiosk_device",
  },
  {
    key: "postEndpoint",
    label: "顔特徴ベクトル登録 API (POST)",
    hint: "登録した顔の embedding を送信する先",
    placeholder: "https://example.com/api/kiosk_device",
  },
  {
    key: "attendanceEndpoint",
    label: "在室状況更新 API (POST)",
    hint: "在室・外出・帰宅の状態を更新する先",
    placeholder: "https://example.com/api/kiosk_device",
  },
  {
    key: "wsEndpoint",
    label: "WebSocket エンドポイント",
    hint: "更新シグナルを受け取るリアルタイム接続先",
    placeholder: "wss://example.com/ws",
  },
];

export function ConnectionSection({ draft, setDraft }: SectionProps) {
  return (
    <SettingsCard>
      <SectionHeader
        icon={LinkIcon}
        eyebrow="CONNECTION"
        title="API接続"
        description="サーバーとの通信先・認証情報をまとめて設定します"
      />

      <div className="space-y-5">
        {ENDPOINTS.map(({ key, label, hint, placeholder }) => (
          <Field key={key} label={label} htmlFor={key} hint={hint}>
            <input
              id={key}
              type="text"
              value={draft[key]}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              placeholder={placeholder}
              spellCheck={false}
              className={MONO_INPUT_CLASS}
            />
          </Field>
        ))}

        <div className="border-t border-dashed border-slate-200 pt-5 dark:border-white/10">
          <Field
            label="APIトークン"
            htmlFor="api-token"
            hint="全リクエストの Authorization ヘッダーに使用します(例: Bearer xxxxx)"
          >
            <input
              id="api-token"
              type="password"
              value={draft.apiToken}
              onChange={(e) => setDraft((d) => ({ ...d, apiToken: e.target.value }))}
              autoComplete="off"
              placeholder="Bearer ..."
              className={`${INPUT_CLASS} font-mono`}
            />
          </Field>
        </div>
      </div>
    </SettingsCard>
  );
}
