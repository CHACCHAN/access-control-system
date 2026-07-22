import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { isAttendanceStatus, type AttendanceStatus } from "@/entities/member/model";
import { httpFetch } from "@/shared/lib/httpClient";

export type KioskSocketStatus = "connecting" | "connected" | "disconnected";

interface UseKioskSocketParams {
  /** Socket.IO サーバーの URL(空なら接続しない) */
  endpoint: string;
  /** 受信する更新イベント名(既定 statusUpdated) */
  eventName: string;
  /** ペイロード中のユーザー名フィールド名(既定 userName) */
  userField: string;
  /** ペイロード中の在室ステータスフィールド名(既定 newStatus) */
  statusField: string;
  /** 更新通知の内容をメンバー一覧へ反映する */
  onStatusUpdate: (username: string, status: AttendanceStatus) => void;
  /** ペイロードを解釈できなかったときの保険(一覧の再取得) */
  onFallback: () => void;
}

interface UseKioskSocketResult {
  status: KioskSocketStatus;
}

// 切断時の再接続間隔(socket.io の自動再接続に渡す)
const RECONNECT_DELAY_MS = 5000;
const RECONNECT_DELAY_MAX_MS = 15000;
// 接続診断(下記 diagnoseConnection)のタイムアウト
const DIAGNOSE_TIMEOUT_MS = 8000;

/**
 * 接続に失敗したとき、原因を1回だけ調べてログへ残す。
 * 実機には devtools が無く、socket.io のエラーは "websocket error" 等としか
 * 出ないため、設定画面の「ログ」だけで切り分けられるようにする。
 *
 * Socket.IO サーバーは `/socket.io/?EIO=4&transport=polling` に対して
 * `0{"sid":...}` で始まるハンドシェイクを返す。これ以外が返る場合は
 * 「そもそも Socket.IO サーバーに届いていない」ことを意味する。
 */
async function diagnoseConnection(endpoint: string): Promise<void> {
  const url = `${endpoint.replace(/\/+$/, "")}/socket.io/?EIO=4&transport=polling`;
  try {
    const response = await httpFetch(url, {}, DIAGNOSE_TIMEOUT_MS);
    const contentType = response.headers.get("content-type") ?? "";
    const body = (await response.text()).slice(0, 200);

    if (contentType.includes("text/html")) {
      console.error(
        `[kiosk-socket] 診断: ${url} が HTML を返しました(status=${response.status})。` +
          "認証プロキシ(OAuth2 Proxy 等)のログインページの可能性があります。" +
          "サーバー側で /socket.io/ を認証の対象外にしてください",
      );
      return;
    }
    if (!response.ok) {
      console.error(
        `[kiosk-socket] 診断: ハンドシェイクが status=${response.status} を返しました: ${body}`,
      );
      return;
    }
    if (body.startsWith("0{")) {
      console.error(
        "[kiosk-socket] 診断: Socket.IO サーバーは応答していますが接続できません。" +
          "リバースプロキシが WebSocket の Upgrade を中継していない可能性があります",
      );
      return;
    }
    console.error(`[kiosk-socket] 診断: 想定外の応答です: ${body}`);
  } catch (err) {
    console.error(
      `[kiosk-socket] 診断: ハンドシェイクへ到達できません: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

function isSupportedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    // socket.io は http(s) / ws(s) のいずれの表記でも接続できる
    return ["http:", "https:", "ws:", "wss:"].includes(url.protocol);
  } catch {
    return false;
  }
}

/**
 * キオスク端末向けの Socket.IO クライアント。サーバーから在室状況の更新通知
 * (既定イベント名 `statusUpdated`)を受け取り、対象メンバーのステータスを
 * 一覧へ即時反映する。ペイロードを解釈できない場合だけ一覧を再取得する。
 *
 * 通信は socket.io-client の自動再接続に任せる(切断時は一定間隔で再試行)。
 *
 * トランスポートは **WebSocket を優先し、失敗したら HTTP ポーリングへフォール
 * バック**する(`tryAllTransports`)。実機(WebKitGTK + カスタムスキーム)では
 * ポーリングのハンドシェイクが CORS で弾かれる一方、リバースプロキシが
 * WebSocket の Upgrade を中継していない環境ではポーリングしか通らないため、
 * どちらか一方に固定せず両方試す。
 *
 * 接続できない場合は `diagnoseConnection` が原因の候補をログへ残す。
 */
export function useKioskSocket({
  endpoint,
  eventName,
  userField,
  statusField,
  onStatusUpdate,
  onFallback,
}: UseKioskSocketParams): UseKioskSocketResult {
  const [status, setStatus] = useState<KioskSocketStatus>("connecting");
  // 効果を張り直さずに最新のコールバックを呼ぶためのミラー
  const onStatusUpdateRef = useRef(onStatusUpdate);
  onStatusUpdateRef.current = onStatusUpdate;
  const onFallbackRef = useRef(onFallback);
  onFallbackRef.current = onFallback;

  useEffect(() => {
    if (!endpoint) {
      setStatus("disconnected");
      return;
    }
    if (!isSupportedUrl(endpoint)) {
      console.error(`[kiosk-socket] Socket.IO の URL が不正です: ${endpoint.slice(0, 200)}`);
      setStatus("disconnected");
      return;
    }

    setStatus("connecting");
    // 接続失敗の診断は原因が変わらない限り1回だけ(再接続のたびに走らせない)
    let diagnosed = false;
    let socket: Socket;
    try {
      socket = io(endpoint, {
        transports: ["websocket", "polling"],
        tryAllTransports: true,
        reconnectionDelay: RECONNECT_DELAY_MS,
        reconnectionDelayMax: RECONNECT_DELAY_MAX_MS,
      });
    } catch (err) {
      console.error("[kiosk-socket] 接続を開始できません:", err);
      setStatus("disconnected");
      return;
    }

    socket.on("connect", () => {
      console.info(
        `[kiosk-socket] 接続しました: ${endpoint}(イベント: ${eventName} / 経路: ${socket.io.engine.transport.name})`,
      );
      diagnosed = false;
      setStatus("connected");
    });

    socket.on("disconnect", (reason) => {
      console.warn(`[kiosk-socket] 切断されました(${reason})。再接続します`);
      setStatus("disconnected");
    });

    socket.on("connect_error", (err) => {
      console.error(`[kiosk-socket] 接続エラー: ${err.message}(接続先: ${endpoint})`);
      setStatus("disconnected");
      // socket.io のエラーは "websocket error" 等としか出ず原因が分からないため、
      // 初回だけハンドシェイクを直接叩いて切り分け結果をログへ残す。
      if (!diagnosed) {
        diagnosed = true;
        void diagnoseConnection(endpoint);
      }
    });

    socket.on(eventName, (payload: unknown) => {
      console.info(`[kiosk-socket] ${eventName} 受信: ${JSON.stringify(payload)?.slice(0, 500)}`);
      // ペイロードの形はサーバー実装に依存する。読み取れた場合だけ即時反映し、
      // 読み取れない場合は取りこぼさないよう一覧を再取得する。
      const record =
        payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
      const username = record?.[userField];
      const nextStatus = record?.[statusField];
      if (typeof username === "string" && username !== "" && isAttendanceStatus(nextStatus)) {
        onStatusUpdateRef.current(username, nextStatus);
        return;
      }
      console.warn(
        `[kiosk-socket] ペイロードから ${userField} / ${statusField} を読み取れないため一覧を再取得します`,
      );
      onFallbackRef.current();
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [endpoint, eventName, userField, statusField]);

  return { status };
}
