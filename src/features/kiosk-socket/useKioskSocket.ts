import { useEffect, useRef, useState } from "react";

export type KioskSocketStatus = "connecting" | "connected" | "disconnected";

interface UseKioskSocketResult {
  status: KioskSocketStatus;
}

// 切断時に再接続を試みるまでの間隔
const RECONNECT_DELAY_MS = 5000;
// 開発者モードで擬似的に更新シグナルを発火する間隔
const DEV_MOCK_SIGNAL_INTERVAL_MS = 15000;

/**
 * キオスク端末向けの WebSocket クライアント。サーバーから更新シグナルを
 * 受信するたびに onUpdateSignal を呼び出す(実際のメンバー一覧再取得は
 * 呼び出し側が担う)。接続が切れた場合は一定間隔で再接続を試みる。
 *
 * 開発者モードでは実際には接続せず、一定間隔でシグナルを擬似発火する。
 */
export function useKioskSocket(
  wsEndpoint: string,
  onUpdateSignal: () => void,
  signalField: string,
  signalValue: string,
): UseKioskSocketResult {
  const [status, setStatus] = useState<KioskSocketStatus>("connecting");
  const onUpdateSignalRef = useRef(onUpdateSignal);
  onUpdateSignalRef.current = onUpdateSignal;
  const signalFieldRef = useRef(signalField);
  signalFieldRef.current = signalField;
  const signalValueRef = useRef(signalValue);
  signalValueRef.current = signalValue;

  useEffect(() => {
    if (import.meta.env.DEV) {
      setStatus("connected");
      const timer = window.setInterval(() => {
        console.info("[開発者モード] WebSocket 更新シグナルを擬似発火");
        onUpdateSignalRef.current();
      }, DEV_MOCK_SIGNAL_INTERVAL_MS);
      return () => window.clearInterval(timer);
    }

    if (!wsEndpoint) {
      setStatus("disconnected");
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let cancelled = false;

    function connect() {
      setStatus("connecting");
      socket = new WebSocket(wsEndpoint);

      socket.onopen = () => {
        if (cancelled) return;
        console.info(`[kiosk-socket] 接続しました: ${wsEndpoint}`);
        setStatus("connected");
      };

      socket.onmessage = (event) => {
        if (cancelled) return;
        console.info(`[kiosk-socket] シグナル受信: ${event.data}`);
        try {
          const data = JSON.parse(event.data);
          if (data?.[signalFieldRef.current] === signalValueRef.current) {
            onUpdateSignalRef.current();
          }
        } catch {
          // JSON でないメッセージは無視する
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        console.warn("[kiosk-socket] 切断されました。再接続します");
        setStatus("disconnected");
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = () => {
        console.error("[kiosk-socket] エラーが発生しました");
        socket?.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [wsEndpoint]);

  return { status };
}
