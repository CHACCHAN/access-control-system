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

// scripts/dev.ts が DEV_PROXY_PORT を Vite 公開用の環境変数へ引き継ぐ。
const configuredProxyPort = Number(import.meta.env.VITE_DEV_PROXY_PORT ?? 8787);
const DEV_PROXY_PORT =
  Number.isInteger(configuredProxyPort) && configuredProxyPort > 0 && configuredProxyPort <= 65_535
    ? configuredProxyPort
    : 8787;
const DEV_PROXY_BASE = `http://localhost:${DEV_PROXY_PORT}/proxy`;

/** 外部APIが応答しない場合にキオスク操作を永久待機させないための上限。 */
export const HTTP_TIMEOUT_MS = 10_000;

export class HttpTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`APIリクエストがタイムアウトしました(${Math.round(timeoutMs / 1000)}秒)`);
    this.name = "HttpTimeoutError";
  }
}

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

const runtimeFetch: typeof globalThis.fetch = isTauri()
  ? (tauriFetch as unknown as typeof globalThis.fetch)
  : import.meta.env.DEV
    ? (devProxyFetch as typeof globalThis.fetch)
    : globalThis.fetch.bind(globalThis);

/**
 * 実行環境ごとの通信経路とタイムアウトを一箇所へ集約したfetch。
 * 呼び出し元のAbortSignalも維持し、画面遷移や新しい再取得で古い通信を中断できる。
 */
export async function httpFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = HTTP_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  let timedOut = false;

  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await runtimeFetch(input, { ...init, signal: controller.signal });
    // plugin-http/ブラウザfetchはいずれもヘッダー受信時点でresolveし得るため、
    // bodyもここで読み切る。これによりjson()/text()が別途永久待機せず、操作全体へ
    // 同じタイムアウトとAbortSignalを適用できる。このアプリのAPIは小さなJSONのみ。
    const body = await response.arrayBuffer();
    const bodyInit = [101, 204, 205, 304].includes(response.status) ? null : body;
    return new Response(bodyInit, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (err) {
    if (timedOut) throw new HttpTimeoutError(timeoutMs);
    throw err;
  } finally {
    window.clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}
