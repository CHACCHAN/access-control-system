import type { Dispatch, SetStateAction } from "react";
import { MAX_EXTERNAL_SITES, type AppSettings, type ExternalSite } from "@/shared/hooks/useSettings";
import { CloseIcon, LinkIcon } from "@/shared/ui/icons";
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

        <div className="border-t border-dashed border-slate-200 pt-5 dark:border-white/10">
          <Field
            label="外部サイト"
            hint={`トップ画面の地球儀ボタンから開くサイト(ポータル等)。複数登録すると一覧から選べます(最大${MAX_EXTERNAL_SITES}件)。サイト側のJavaScriptは実行されないため、通常のWebページ向けです`}
          >
            <div className="space-y-2">
              {draft.externalSites.map((site, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={site.name}
                    onChange={(e) => updateSite(index, { name: e.target.value })}
                    placeholder="表示名"
                    aria-label={`外部サイト${index + 1}の表示名`}
                    className={`${INPUT_CLASS} w-36 shrink-0`}
                  />
                  <input
                    type="text"
                    value={site.url}
                    onChange={(e) => updateSite(index, { url: e.target.value })}
                    placeholder="https://portal.example.com"
                    aria-label={`外部サイト${index + 1}のURL`}
                    spellCheck={false}
                    className={MONO_INPUT_CLASS}
                  />
                  <button
                    type="button"
                    onClick={() => removeSite(index)}
                    aria-label={`外部サイト${index + 1}を削除`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-500 transition hover:border-rose-400/60 hover:text-rose-500 dark:border-white/10 dark:text-slate-400 dark:hover:border-rose-400/50 dark:hover:text-rose-400"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addSite}
                disabled={draft.externalSites.length >= MAX_EXTERNAL_SITES}
                className="rounded-lg border border-dashed border-slate-300 px-4 py-2 text-xs font-medium text-slate-600 transition hover:border-cyan-500/50 hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-slate-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-400"
              >
                + サイトを追加
              </button>
            </div>
          </Field>
        </div>
      </div>
    </SettingsCard>
  );

  function updateSite(index: number, patch: Partial<ExternalSite>) {
    setDraft((d) => ({
      ...d,
      externalSites: d.externalSites.map((site, i) =>
        i === index ? { ...site, ...patch } : site,
      ),
    }));
  }

  function removeSite(index: number) {
    setDraft((d) => ({
      ...d,
      externalSites: d.externalSites.filter((_, i) => i !== index),
    }));
  }

  function addSite() {
    setDraft((d) => {
      if (d.externalSites.length >= MAX_EXTERNAL_SITES) return d;
      return { ...d, externalSites: [...d.externalSites, { name: "", url: "" }] };
    });
  }
}
