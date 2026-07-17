// 開発時(ブラウザ)用の CORS 回避中継サーバー + Vite 開発サーバーの起動スクリプト。
//
// ブラウザ標準の fetch は CORS 制約を受けるため、設定画面に入力した外部 API へ
// 直接リクエストすると Access-Control-Allow-Origin が無いエンドポイントで失敗する。
// そこで Bun(=ホスト側 / サーバーサイド)で動くこの中継サーバーを立て、
// フロントエンドは常に localhost の中継サーバーへリクエストし、中継サーバーが
// サーバーサイド fetch で本来のエンドポイントへ転送する(CORS 制約を受けない)。
//
// フロント側の対応: src/shared/lib/httpClient.ts が開発時(ブラウザ)のみ
//   http://localhost:<PROXY_PORT>/proxy?url=<本来のURL>
// へリクエストするよう切り替える。ポート番号は両者で一致させること。
//
// 実機(Tauri)では @tauri-apps/plugin-http が Rust(reqwest)経由でリクエストし
// CORS 制約を受けないため、この中継は使わない(起動はするが未使用)。

// httpClient.ts の DEV_PROXY_PORT と一致させること
const configuredProxyPort = Number(process.env.DEV_PROXY_PORT ?? 8787);
if (!Number.isInteger(configuredProxyPort) || configuredProxyPort <= 0 || configuredProxyPort > 65_535) {
  throw new Error(`DEV_PROXY_PORT が不正です: ${process.env.DEV_PROXY_PORT}`);
}
const PROXY_PORT = configuredProxyPort;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type,Accept",
  // 中継経由では Response.url が中継サーバのURLになるため、転送先の
  // 最終URL(リダイレクト追跡後)を X-Final-Url で伝える(ポータル表示で使用)。
  "Access-Control-Expose-Headers": "X-Final-Url",
  "Access-Control-Max-Age": "86400",
};

Bun.serve({
  // 任意URLへ転送できる開発専用機能なので、LANへ公開しない。
  hostname: "127.0.0.1",
  port: PROXY_PORT,
  async fetch(req) {
    // CORS プリフライト
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const target = new URL(req.url).searchParams.get("url");
    if (!target) {
      return new Response("missing ?url=", { status: 400, headers: CORS_HEADERS });
    }
    let targetUrl: URL;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response("invalid target URL", { status: 400, headers: CORS_HEADERS });
    }
    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
      return new Response("unsupported target protocol", { status: 400, headers: CORS_HEADERS });
    }

    // ブラウザ→中継サーバー間で付与されるヘッダのうち、転送すると不都合な
    // ものだけ除去して残りは引き継ぐ(Authorization / Content-Type などは維持)。
    const headers = new Headers(req.headers);
    for (const h of ["host", "origin", "referer", "connection", "content-length"]) {
      headers.delete(h);
    }

    try {
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body:
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : await req.arrayBuffer(),
        redirect: "follow",
      });

      const respHeaders = new Headers(CORS_HEADERS);
      const contentType = upstream.headers.get("content-type");
      if (contentType) respHeaders.set("Content-Type", contentType);
      if (upstream.url) respHeaders.set("X-Final-Url", upstream.url);

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: respHeaders,
      });
    } catch (err) {
      console.error(`[dev-proxy] 転送失敗 ${target}:`, err);
      return new Response(`proxy error: ${err instanceof Error ? err.message : String(err)}`, {
        status: 502,
        headers: CORS_HEADERS,
      });
    }
  },
});

console.log(
  `[dev-proxy] 中継サーバーを起動しました: http://localhost:${PROXY_PORT}/proxy?url=<転送先>`,
);

// Vite 開発サーバーを子プロセスとして起動する(ログはそのまま親に流す)。
const vite = Bun.spawn(["bunx", "vite", "--host"], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  // クライアント側も同じポートを参照できるようVite公開変数へ引き継ぐ。
  env: { ...process.env, VITE_DEV_PROXY_PORT: String(PROXY_PORT) },
});

const shutdown = () => {
  vite.kill();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await vite.exited;
