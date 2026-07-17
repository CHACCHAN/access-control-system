// 外部サイト表示用の HTML 整形ユーティリティ(純関数)。
//
// 取得した HTML はアプリと同一オリジンの iframe(about:blank)へ書き込むため、
// そのまま流すとサイト側のスクリプトがアプリの権限(Tauri IPC 等)で動いて
// しまう。ここで <script> を除去し(実機ではアプリ CSP の script-src 'self' でも
// 二重にブロックされる)、相対 URL が元サイトへ解決されるよう <base> を注入する。

/** content-type が HTML(または未指定)かどうか。非HTMLは表示対象外にする。 */
export function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return true; // ヘッダー無しの簡素なサーバーは HTML とみなす
  const normalized = contentType.toLowerCase();
  return normalized.includes("text/html") || normalized.includes("application/xhtml");
}

/**
 * <script> 要素と meta refresh を除去する。
 * meta refresh は iframe を直接リモートURLへ遷移させ、アプリ CSP(frame-src)で
 * ブロックされて白画面になるため取り除く。
 */
export function stripScripts(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/gi, "");
}

/**
 * <base href> を先頭(<head> 直後)へ注入する。HTML 仕様では最初の <base> が
 * 有効なため、ページ側に <base> があっても注入分が優先される。
 * 相対URL・ルート相対URL(/path)とも、この base を起点に元サイトへ解決される。
 */
export function injectBase(html: string, baseUrl: string): string {
  const baseTag = `<base href="${baseUrl.replace(/"/g, "&quot;")}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  }
  return baseTag + html;
}

/**
 * レスポンスボディを文字列へデコードする。
 * 優先順: Content-Type ヘッダーの charset → HTML 先頭の meta charset → UTF-8。
 * 未対応・不正な charset ラベルは無視して次の手段へフォールバックする。
 */
export function decodeHtmlBytes(buffer: ArrayBuffer, contentType: string | null): string {
  const bytes = new Uint8Array(buffer);
  const tryDecode = (label: string): string | null => {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      return null; // 未対応の charset ラベル
    }
  };

  const headerCharset = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  if (headerCharset) {
    const decoded = tryDecode(headerCharset);
    if (decoded !== null) return decoded;
  }

  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const metaCharset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(utf8.slice(0, 2048))?.[1];
  if (metaCharset && metaCharset.toLowerCase() !== "utf-8") {
    const decoded = tryDecode(metaCharset);
    if (decoded !== null) return decoded;
  }
  return utf8;
}
