import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

// HTTP リクエストに使う fetch を実行環境で切り替える。
//
// - 実機(Tauri): WebKitGTK の CORS 制約を避けるため、Rust(reqwest)側から
//   リクエストする @tauri-apps/plugin-http の fetch を使う。サーバーが
//   Access-Control-Allow-Origin を返さなくても疎通できる。
//
// - 開発時(ブラウザ): ブラウザ標準の fetch は CORS 制約を受けるため、外部 API へ
//   直接は届かないことが多い。そこで `bun run dev` が立ち上げる中継サーバー
//   (scripts/dev.ts / localhost:DEV_PROXY_PORT)を経由する。中継サーバーは
//   Bun(サーバーサイド)で本来のエンドポイントへ転送するため CORS 制約を受けない。
//   フロントは常に localhost の中継サーバーへ投げ、転送先は ?url= で渡す。
//
// - 万一 DEV でない状態でブラウザ実行された場合(例: vite preview)は中継が無いので
//   標準 fetch にフォールバックする。

// scripts/dev.ts の PROXY_PORT と一致させること
const DEV_PROXY_PORT = 8787;
const DEV_PROXY_BASE = `http://localhost:${DEV_PROXY_PORT}/proxy`;

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

// 本来のエンドポイントを中継サーバーの ?url= に載せ替えてリクエストする。
function devProxyFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const target = toUrlString(input);
  const proxied = `${DEV_PROXY_BASE}?url=${encodeURIComponent(target)}`;
  return globalThis.fetch(proxied, init);
}

export const httpFetch: typeof globalThis.fetch = isTauri()
  ? (tauriFetch as unknown as typeof globalThis.fetch)
  : import.meta.env.DEV
    ? (devProxyFetch as typeof globalThis.fetch)
    : globalThis.fetch.bind(globalThis);
