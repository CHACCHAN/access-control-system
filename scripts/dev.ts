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
const PROXY_PORT = Number(process.env.DEV_PROXY_PORT ?? 8787);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type,Accept",
  "Access-Control-Max-Age": "86400",
};

Bun.serve({
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

    // ブラウザ→中継サーバー間で付与されるヘッダのうち、転送すると不都合な
    // ものだけ除去して残りは引き継ぐ(Authorization / Content-Type などは維持)。
    const headers = new Headers(req.headers);
    for (const h of ["host", "origin", "referer", "connection", "content-length"]) {
      headers.delete(h);
    }

    try {
      const upstream = await fetch(target, {
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
});

const shutdown = () => {
  vite.kill();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await vite.exited;
