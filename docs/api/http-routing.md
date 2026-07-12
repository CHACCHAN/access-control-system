# HTTP 通信経路仕様(CORS 回避を含む)

外部 API への HTTP リクエストは、実行環境によって経路が異なる。
分岐は `src/shared/lib/httpClient.ts` の `httpFetch` に集約されている。

## 経路一覧

| 実行環境 | 経路 | CORS |
|---|---|---|
| 実機(Tauri) | `@tauri-apps/plugin-http`(Rust の reqwest から送信) | 制約を受けない |
| 開発時(ブラウザ, `bun run dev`) | `http://localhost:8787/proxy?url=<本来のURL>` の中継サーバー経由 | 中継サーバーが回避 |
| その他(vite preview 等) | ブラウザ標準 fetch(フォールバック) | 制約を受ける |

## 実機(Tauri)

- WebKitGTK の CORS 制約を避けるため、`tauri-plugin-http` の fetch を使う。
  サーバーが `Access-Control-Allow-Origin` を返さなくても疎通できる。
- アクセス可能な URL は capability で制限している
  (`src-tauri/capabilities/default.json`): `https://*.chibatech.ac.jp/*`
  以外のホストへは接続できない。エンドポイントのドメインを変える場合はここも更新する。

## 開発時ブラウザ(中継サーバー)

`bun run dev`(`scripts/dev.ts`)が Vite と同時に中継サーバー(既定ポート 8787、
環境変数 `DEV_PROXY_PORT` で変更可)を起動する。

- フロントは常に `http://localhost:8787/proxy?url=<encodeURIComponent(本来のURL)>` へ
  リクエストし、中継サーバーがサーバーサイド fetch で転送する。
- メソッド・ボディ(GET/HEAD 以外は生バイト列をそのまま)・ヘッダーを引き継ぐ。
  ただし `host` / `origin` / `referer` / `connection` / `content-length` は転送前に除去。
- OPTIONS プリフライトには 204 + CORS 許可ヘッダーで応答する。
  許可ヘッダー: `Authorization, Content-Type, Accept`
- 転送失敗時は 502 でエラーメッセージを返す。
- ポート番号はフロント(`httpClient.ts` の `DEV_PROXY_PORT`)と一致させること。
  `scripts/dev.ts` が `DEV_PROXY_PORT` をVite公開変数へ引き継ぐため、環境変数で変更しても
  両者は同じ値になる。中継はlocalhostだけで待ち受け、HTTP(S)以外へは転送しない。

## WebSocket

WebSocket はブラウザ標準 API のため中継しない。実機・開発時とも設定の
エンドポイントへ直接接続する。
