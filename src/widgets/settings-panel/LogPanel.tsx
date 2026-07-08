import { useEffect, useRef } from "react";
import { useEventLog } from "@/shared/hooks/useEventLog";
import { clearLogEntries, type LogLevel } from "@/shared/lib/eventLog";

const LEVEL_CLASSES: Record<LogLevel, string> = {
  log: "text-slate-600 dark:text-slate-300",
  info: "text-sky-600 dark:text-sky-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-rose-600 dark:text-rose-400",
};

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

/**
 * アプリ全体のイベントログ(通信系・console出力・WebSocketシグナル等)を
 * 表示するパネル。ログはメモリ上のみで保持され、アプリ再起動でリセットされる。
 */
export function LogPanel() {
  const entries = useEventLog();
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          ログ({entries.length}件)
        </h3>
        <button
          type="button"
          onClick={clearLogEntries}
          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        >
          クリア
        </button>
      </div>

      <div
        ref={listRef}
        className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs dark:border-white/10 dark:bg-slate-950/60"
      >
        {entries.length === 0 && (
          <p className="text-slate-400 dark:text-slate-500">まだログがありません</p>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="flex gap-2 py-0.5 leading-relaxed">
            <span className="shrink-0 text-slate-400 dark:text-slate-600">
              {formatTime(entry.timestamp)}
            </span>
            <span className={`break-all ${LEVEL_CLASSES[entry.level]}`}>{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
