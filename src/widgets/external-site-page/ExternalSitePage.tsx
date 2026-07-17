import { useEffect, useRef, useState } from "react";
import { httpFetch } from "@/shared/lib/httpClient";
import { useSettings, type ExternalSite } from "@/shared/hooks/useSettings";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  GlobeIcon,
  HomeIcon,
  RestartIcon,
} from "@/shared/ui/icons";
import { decodeHtmlBytes, injectBase, isHtmlContentType, stripScripts } from "./externalSiteHtml";

interface ExternalSitePageProps {
  onClose: () => void;
}

// 外部サイトのため API より余裕を持たせる
const SITE_FETCH_TIMEOUT_MS = 20_000;

function isValidSiteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** 一覧・ヘッダーに表示するサイト名(名前が空なら URL のホスト名)。 */
function siteDisplayName(site: ExternalSite): string {
  const name = site.name.trim();
  if (name) return name;
  try {
    return new URL(site.url).host;
  } catch {
    return site.url;
  }
}

/** リダイレクト追跡後の最終URLを特定する(相対URL解決の基準)。 */
function resolveFinalUrl(response: Response, requestedUrl: string): string {
  // 開発時の中継サーバは Response.url が中継URLになるため専用ヘッダーで受け取る
  const headerUrl = response.headers.get("x-final-url");
  if (headerUrl && isValidSiteUrl(headerUrl)) return headerUrl;
  if (response.url && !response.url.includes("/proxy?url=") && isValidSiteUrl(response.url)) {
    return response.url;
  }
  return requestedUrl;
}

interface NavigateOptions {
  method?: "GET" | "POST";
  body?: URLSearchParams;
  /** true なら現在ページを履歴へ積まない(サイトを開いた直後・再読み込み・戻る) */
  replace?: boolean;
}

/**
 * 外部サイト(ポータル・Wiki 等)の閲覧ページ。
 *
 * 設定(API接続)に登録した外部サイトを一覧表示し、選択したサイトを
 * アプリ内ブラウザで開く(1件だけ登録されている場合は直接開く)。
 *
 * iframe に URL を直接読み込ませる方式は、サイト側の X-Frame-Options /
 * CSP(frame-ancestors)で拒否される。そのため他の API と同じ通信経路
 * (開発時=中継サーバ / 実機=Rust reqwest の plugin-http)で HTML を取得し、
 * <script> を除去・<base> を注入してから同一オリジンの iframe へ書き込む。
 * ページ内のリンク・フォームはクリック/送信を横取りして同じ経路で遷移する
 * (=すべての通信がサーバサイド経由になる)。
 *
 * 制約: サイト側の JavaScript は実行しない(セキュリティ上も意図的)。
 * サーバーレンダリングされた通常のサイト向け。
 */
export function ExternalSitePage({ onClose }: ExternalSitePageProps) {
  const { settings } = useSettings();
  // URL 形式が正しいものだけを開ける対象にする
  const sites = settings.externalSites.filter((site) => isValidSiteUrl(site.url));

  // 1件だけならランチャーを挟まず直接開く
  const [activeSite, setActiveSite] = useState<ExternalSite | null>(() =>
    sites.length === 1 ? sites[0] : null,
  );

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  const currentUrlRef = useRef<string | null>(null);
  const historyRef = useRef<string[]>([]);
  // 進行中の取得を識別し、遅れて届いた古いページで新しいページを上書きしない
  const requestSeqRef = useRef(0);
  // エラー時の「再試行」用に最後に要求したURLを保持
  const lastAttemptRef = useRef<{ url: string; options: NavigateOptions } | null>(null);

  async function navigate(url: string, options: NavigateOptions = {}): Promise<void> {
    const { method = "GET", body, replace = false } = options;
    const seq = ++requestSeqRef.current;
    lastAttemptRef.current = { url, options };
    setIsLoading(true);
    setError(null);
    try {
      const response = await httpFetch(
        url,
        {
          method,
          ...(body
            ? {
                body: body.toString(),
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
              }
            : {}),
        },
        SITE_FETCH_TIMEOUT_MS,
      );
      if (seq !== requestSeqRef.current) return;

      const contentType = response.headers.get("content-type");
      if (!isHtmlContentType(contentType)) {
        setError(
          `このコンテンツはアプリ内では表示できません(${(contentType ?? "").split(";")[0]})`,
        );
        return;
      }

      const finalUrl = resolveFinalUrl(response, url);
      const html = decodeHtmlBytes(await response.arrayBuffer(), contentType);
      renderDocument(html, finalUrl);

      if (!replace && currentUrlRef.current) {
        historyRef.current.push(currentUrlRef.current);
      }
      currentUrlRef.current = finalUrl;
      setCurrentUrl(finalUrl);
      setCanGoBack(historyRef.current.length > 0);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      setError(
        `ページを取得できませんでした: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      if (seq === requestSeqRef.current) setIsLoading(false);
    }
  }

  // インターセプタ(iframe 内のイベント)から常に最新の navigate を呼ぶ
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  /** 整形済み HTML を iframe(about:blank)へ書き込み、リンク・フォームを横取りする。 */
  function renderDocument(rawHtml: string, pageUrl: string): void {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    const html = injectBase(stripScripts(rawHtml), pageUrl);
    doc.open();
    doc.write(html);
    doc.close();

    doc.addEventListener("click", (event) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const rawHref = anchor.getAttribute("href");
      if (!rawHref) return;

      // ページ内アンカーはその場でスクロール(再取得しない)
      if (rawHref.startsWith("#")) {
        event.preventDefault();
        const id = decodeURIComponent(rawHref.slice(1));
        (doc.getElementById(id) ?? doc.getElementsByName(id)[0])?.scrollIntoView();
        return;
      }

      let resolved: URL;
      try {
        resolved = new URL(rawHref, pageUrl);
      } catch {
        event.preventDefault();
        return;
      }
      // mailto: 等は無視。http(s) はすべて同じ経路(サーバサイド)で開く
      event.preventDefault();
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        void navigateRef.current(resolved.toString());
      }
    });

    doc.addEventListener("submit", (event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form) return;
      event.preventDefault();

      // form.action プロパティは action 属性が無いと about:blank を返すため、
      // 属性値をページURL基準で解決する
      const actionAttr = form.getAttribute("action");
      let action: URL;
      try {
        action = actionAttr ? new URL(actionAttr, pageUrl) : new URL(pageUrl);
      } catch {
        return;
      }
      if (action.protocol !== "http:" && action.protocol !== "https:") return;

      const params = new URLSearchParams();
      new FormData(form).forEach((value, key) => {
        if (typeof value === "string") params.append(key, value); // ファイルは非対応
      });

      if ((form.getAttribute("method") ?? "get").toLowerCase() === "post") {
        void navigateRef.current(action.toString(), { method: "POST", body: params });
      } else {
        action.search = params.toString();
        void navigateRef.current(action.toString());
      }
    });
  }

  function goBack(): void {
    const previous = historyRef.current.pop();
    setCanGoBack(historyRef.current.length > 0);
    if (previous) void navigate(previous, { replace: true });
  }

  function reload(): void {
    const attempt = lastAttemptRef.current;
    if (attempt) {
      void navigate(attempt.url, { ...attempt.options, replace: true });
    } else if (activeSite) {
      void navigate(activeSite.url, { replace: true });
    }
  }

  /** ランチャーへ戻る(閲覧状態は破棄する)。 */
  function backToList(): void {
    requestSeqRef.current += 1; // 進行中の取得を無効化
    historyRef.current = [];
    currentUrlRef.current = null;
    lastAttemptRef.current = null;
    setActiveSite(null);
    setCurrentUrl(null);
    setCanGoBack(false);
    setError(null);
    setIsLoading(false);
  }

  // サイトを開いたら(=iframe がマウントされたら)読み込みを開始する
  const activeSiteUrl = activeSite?.url ?? null;
  useEffect(() => {
    if (!activeSiteUrl) return;
    historyRef.current = [];
    currentUrlRef.current = null;
    setCurrentUrl(null);
    setCanGoBack(false);
    void navigateRef.current(activeSiteUrl, { replace: true });
  }, [activeSiteUrl]);

  // 読み込みが長引いた場合の補足ヒント
  useEffect(() => {
    if (!isLoading) {
      setShowSlowHint(false);
      return;
    }
    const timer = window.setTimeout(() => setShowSlowHint(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 text-slate-900 animate-page-in dark:bg-[#070b14] dark:text-slate-100">
      {/* ヘッダー(設定ページと同じ構成: 閉じる + タイトル + ナビゲーション) */}
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white/70 px-6 py-4 backdrop-blur dark:border-cyan-400/10 dark:bg-slate-950/50">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:border-cyan-500/50 hover:text-cyan-600 dark:border-white/10 dark:text-slate-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-400"
            aria-label="外部サイトを閉じる"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-cyan-600/80 dark:text-cyan-400/70">
              // external sites
            </p>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              {activeSite ? siteDisplayName(activeSite) : "外部サイト"}
            </h1>
          </div>
          {activeSite && currentUrl && (
            <span className="ml-2 hidden max-w-md truncate rounded-md border border-slate-300 px-2.5 py-1 font-mono text-xs text-slate-500 sm:inline-block dark:border-white/10 dark:text-slate-400">
              {currentUrl}
            </span>
          )}
        </div>

        {activeSite && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={goBack}
              disabled={!canGoBack || isLoading}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:border-cyan-500/50 hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-400"
              aria-label="前のページへ戻る"
            >
              <ChevronRightIcon className="h-5 w-5 rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => void navigate(activeSite.url)}
              disabled={isLoading}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:border-cyan-500/50 hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-400"
              aria-label="このサイトのトップへ"
            >
              <HomeIcon className="h-4.5 w-4.5" />
            </button>
            <button
              type="button"
              onClick={reload}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-600 transition hover:border-cyan-500/50 hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-400"
            >
              <RestartIcon className="h-4 w-4" />
              再読み込み
            </button>
            {sites.length > 1 && (
              <button
                type="button"
                onClick={backToList}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-600 transition hover:border-cyan-500/50 hover:text-cyan-600 dark:border-white/10 dark:text-slate-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-400"
              >
                <GlobeIcon className="h-4 w-4" />
                サイト一覧
              </button>
            )}
          </div>
        )}
      </header>

      {/* 本体 */}
      <div className="relative min-h-0 flex-1">
        {sites.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <GlobeIcon className="h-10 w-10 text-slate-400 dark:text-slate-600" />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              外部サイトが登録されていません
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              設定 → API接続 →「外部サイト」で、名前と URL(http/https)を登録できます
            </p>
          </div>
        ) : activeSite === null ? (
          // ランチャー: 登録済みサイトの一覧から選ぶ
          <div className="h-full overflow-y-auto p-8">
            <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
              {sites.map((site) => (
                <button
                  key={`${site.name}\0${site.url}`}
                  type="button"
                  onClick={() => setActiveSite(site)}
                  className="cyber-corners flex items-center gap-4 rounded-xl border border-slate-200 bg-white/80 p-5 text-left shadow-sm transition hover:border-cyan-400/60 hover:shadow-md dark:border-white/10 dark:bg-slate-900/40 dark:shadow-none dark:hover:border-cyan-400/50"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-600 dark:border-cyan-400/20 dark:text-cyan-400">
                    <GlobeIcon className="h-6 w-6" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {siteDisplayName(site)}
                    </span>
                    <span className="block truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                      {site.url}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* 取得済みHTMLの描画先(about:blank のまま保持し、document.write で流し込む) */}
            <iframe
              ref={iframeRef}
              title={`外部サイト: ${siteDisplayName(activeSite)}`}
              className="h-full w-full border-0 bg-white"
            />
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center dark:bg-[#070b14]">
                <GlobeIcon className="h-10 w-10 text-rose-400" />
                <p className="max-w-lg text-sm text-slate-600 dark:text-slate-300">{error}</p>
                <button
                  type="button"
                  onClick={reload}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-cyan-500/50 hover:text-cyan-600 dark:border-white/10 dark:text-slate-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-400"
                >
                  <RestartIcon className="h-4 w-4" />
                  再試行
                </button>
              </div>
            )}
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-50/90 backdrop-blur-sm dark:bg-[#070b14]/90">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                <p className="font-mono text-xs uppercase tracking-wider text-cyan-600/80 dark:text-cyan-400/70">
                  loading…
                </p>
                {showSlowHint && (
                  <p className="max-w-md px-6 text-center text-xs leading-relaxed text-slate-400 dark:text-slate-500">
                    読み込みに時間がかかっています。URL とネットワーク疎通を確認してください
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
