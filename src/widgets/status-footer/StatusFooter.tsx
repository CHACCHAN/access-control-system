import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

// タスクマネージャ表示のポーリング間隔。CPU使用率は前回リフレッシュとの
// 差分で計算されるため、短すぎると値が暴れる。
const POLL_INTERVAL_MS = 2000;
// この受信/送信レート(bytes/秒)を超えたら通信ランプを点灯する
const LAMP_ACTIVE_BPS = 1024;

interface SystemStats {
  cpuPercent: number;
  memPercent: number;
  memUsedGb: number;
  memTotalGb: number;
  rxBytesPerSec: number;
  txBytesPerSec: number;
  ip: string | null;
}

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)}MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)}KB/s`;
  return `${Math.round(bytesPerSec)}B/s`;
}

/** 使用率のミニバー(CPU / メモリ共用)。高負荷になるほど色が警告寄りになる。 */
function UsageBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const barColor =
    clamped >= 90 ? "bg-rose-400" : clamped >= 70 ? "bg-amber-400" : "bg-cyan-400";
  return (
    <span className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-slate-300/50 dark:bg-white/10">
      <span
        className={`block h-full rounded-full transition-all duration-500 ${barColor}`}
        style={{ width: `${clamped}%` }}
      />
    </span>
  );
}

/** 通信の上り/下りランプ。しきい値以上のトラフィックで点灯する。 */
function TrafficLamp({ active, direction }: { active: boolean; direction: "up" | "down" }) {
  const activeClass =
    direction === "up"
      ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]"
      : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full transition ${
        active ? activeClass : "bg-slate-400/40 dark:bg-white/15"
      }`}
      aria-label={direction === "up" ? "上り通信" : "下り通信"}
    />
  );
}

/**
 * 全ページ共通のシステム状態フッター。CPU・メモリ使用率、ネットワーク IP と
 * 上り/下りの通信ランプをリアルタイム表示する(Rust の get_system_stats を
 * ポーリング)。ブラウザ単体実行では取得できないためプレースホルダーを出す。
 */
export function StatusFooter() {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;
    let inFlight = false;

    async function poll() {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await invoke<SystemStats>("get_system_stats");
        if (!cancelled) setStats(result);
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        inFlight = false;
      }
    }

    void poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <footer className="fixed inset-x-0 bottom-0 z-[60] flex h-7 items-center gap-5 border-t border-slate-200 bg-white/85 px-4 font-mono text-[10px] text-slate-600 backdrop-blur dark:border-cyan-400/10 dark:bg-slate-950/85 dark:text-slate-400">
      <span className="flex items-center gap-1.5">
        <span className="uppercase tracking-wider text-slate-400 dark:text-slate-500">cpu</span>
        <UsageBar percent={stats?.cpuPercent ?? 0} />
        <span className="w-9 tabular-nums">
          {stats ? `${stats.cpuPercent.toFixed(0)}%` : "--%"}
        </span>
      </span>

      <span className="flex items-center gap-1.5">
        <span className="uppercase tracking-wider text-slate-400 dark:text-slate-500">mem</span>
        <UsageBar percent={stats?.memPercent ?? 0} />
        <span className="tabular-nums">
          {stats
            ? `${stats.memPercent.toFixed(0)}% (${stats.memUsedGb.toFixed(1)}/${stats.memTotalGb.toFixed(1)}GB)`
            : "--%"}
        </span>
      </span>

      <span className="flex items-center gap-1.5">
        <span className="uppercase tracking-wider text-slate-400 dark:text-slate-500">net</span>
        <span className="tabular-nums">{stats?.ip ?? "---.---.---.---"}</span>
        <span className="ml-1 flex items-center gap-1">
          <TrafficLamp direction="down" active={(stats?.rxBytesPerSec ?? 0) >= LAMP_ACTIVE_BPS} />
          <span className="w-14 tabular-nums">▼{formatRate(stats?.rxBytesPerSec ?? 0)}</span>
          <TrafficLamp direction="up" active={(stats?.txBytesPerSec ?? 0) >= LAMP_ACTIVE_BPS} />
          <span className="w-14 tabular-nums">▲{formatRate(stats?.txBytesPerSec ?? 0)}</span>
        </span>
      </span>

      {!isTauri() && (
        <span className="ml-auto text-slate-400 dark:text-slate-600">
          browser mode(実機で計測値を表示)
        </span>
      )}
    </footer>
  );
}
