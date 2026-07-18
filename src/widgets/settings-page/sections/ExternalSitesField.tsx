import type { Dispatch, SetStateAction } from "react";
import {
  MAX_EXTERNAL_SITES,
  MAX_SITE_HEADERS,
  type AppSettings,
  type ExternalSite,
  type ExternalSiteHeader,
} from "@/shared/hooks/useSettings";
import { CloseIcon } from "@/shared/ui/icons";
import { INPUT_CLASS, MONO_INPUT_CLASS } from "../fields";

interface ExternalSitesFieldProps {
  draft: AppSettings;
  setDraft: Dispatch<SetStateAction<AppSettings>>;
}

// 追加ボタン(サイト・ヘッダー共通)の控えめな破線スタイル
const ADD_BUTTON_CLASS =
  "rounded-lg border border-dashed border-slate-300 px-4 py-2 text-xs font-medium text-slate-600 transition hover:border-cyan-500/50 hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-slate-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-400";

const REMOVE_BUTTON_CLASS =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-500 transition hover:border-rose-400/60 hover:text-rose-500 dark:border-white/10 dark:text-slate-400 dark:hover:border-rose-400/50 dark:hover:text-rose-400";

/**
 * 設定(API接続)の「外部サイト」編集フィールド。
 * サイトごとに 表示名・URL に加えて、ページ取得時に付与する任意の
 * HTTP ヘッダー(認証トークン等)を編集できる。
 * 幅の配分は grid 側で行う(INPUT_CLASS の w-full と行内の幅指定を
 * 1要素に共存させると Tailwind の幅ユーティリティが競合するため)。
 */
export function ExternalSitesField({ draft, setDraft }: ExternalSitesFieldProps) {
  function updateSite(index: number, patch: Partial<ExternalSite>) {
    setDraft((d) => ({
      ...d,
      externalSites: d.externalSites.map((site, i) =>
        i === index ? { ...site, ...patch } : site,
      ),
    }));
  }

  function updateHeader(siteIndex: number, headerIndex: number, patch: Partial<ExternalSiteHeader>) {
    setDraft((d) => ({
      ...d,
      externalSites: d.externalSites.map((site, i) =>
        i === siteIndex
          ? {
              ...site,
              headers: site.headers.map((header, j) =>
                j === headerIndex ? { ...header, ...patch } : header,
              ),
            }
          : site,
      ),
    }));
  }

  function addHeader(siteIndex: number) {
    setDraft((d) => ({
      ...d,
      externalSites: d.externalSites.map((site, i) =>
        i === siteIndex && site.headers.length < MAX_SITE_HEADERS
          ? { ...site, headers: [...site.headers, { name: "", value: "" }] }
          : site,
      ),
    }));
  }

  function removeHeader(siteIndex: number, headerIndex: number) {
    setDraft((d) => ({
      ...d,
      externalSites: d.externalSites.map((site, i) =>
        i === siteIndex
          ? { ...site, headers: site.headers.filter((_, j) => j !== headerIndex) }
          : site,
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
      return {
        ...d,
        externalSites: [...d.externalSites, { name: "", url: "", headers: [] }],
      };
    });
  }

  return (
    <div className="space-y-3">
      {draft.externalSites.map((site, index) => (
        <div
          key={index}
          className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40"
        >
          <div className="grid grid-cols-[9rem_minmax(0,1fr)_auto] items-center gap-2">
            <input
              type="text"
              value={site.name}
              onChange={(e) => updateSite(index, { name: e.target.value })}
              placeholder="表示名"
              aria-label={`外部サイト${index + 1}の表示名`}
              className={INPUT_CLASS}
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
              className={REMOVE_BUTTON_CLASS}
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          {/* サイトごとの任意 HTTP ヘッダー。ページ取得とリンク・フォーム遷移
              (サーバサイド経由の全リクエスト)に付与される。CSS・画像などの
              サブリソースはブラウザが直接読むため対象外 */}
          {site.headers.length > 0 && (
            <div className="space-y-2 border-l-2 border-slate-200 pl-3 dark:border-white/10">
              {site.headers.map((header, headerIndex) => (
                <div
                  key={headerIndex}
                  className="grid grid-cols-[9rem_minmax(0,1fr)_auto] items-center gap-2"
                >
                  <input
                    type="text"
                    value={header.name}
                    onChange={(e) => updateHeader(index, headerIndex, { name: e.target.value })}
                    placeholder="Authorization"
                    aria-label={`外部サイト${index + 1}のヘッダー${headerIndex + 1}の名前`}
                    spellCheck={false}
                    className={MONO_INPUT_CLASS}
                  />
                  <input
                    type="text"
                    value={header.value}
                    onChange={(e) => updateHeader(index, headerIndex, { value: e.target.value })}
                    placeholder="Bearer xxxxx"
                    aria-label={`外部サイト${index + 1}のヘッダー${headerIndex + 1}の値`}
                    spellCheck={false}
                    className={MONO_INPUT_CLASS}
                  />
                  <button
                    type="button"
                    onClick={() => removeHeader(index, headerIndex)}
                    aria-label={`外部サイト${index + 1}のヘッダー${headerIndex + 1}を削除`}
                    className={REMOVE_BUTTON_CLASS}
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => addHeader(index)}
            disabled={site.headers.length >= MAX_SITE_HEADERS}
            className={`${ADD_BUTTON_CLASS} px-3 py-1.5`}
          >
            + HTTPヘッダーを追加
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addSite}
        disabled={draft.externalSites.length >= MAX_EXTERNAL_SITES}
        className={ADD_BUTTON_CLASS}
      >
        + サイトを追加
      </button>
    </div>
  );
}
