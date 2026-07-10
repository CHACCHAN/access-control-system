import { useEffect, useRef } from "react";
import { useEventLog } from "@/shared/hooks/useEventLog";
import { clearLogEntries, type LogLevel } from "@/shared/lib/eventLog";
import { TerminalIcon } from "@/shared/ui/icons";
import { SectionHeader, SettingsCard } from "../fields";

const LEVEL_CLASSES: Record<LogLevel, string> = {
  log: "text-slate-600 dark:text-slate-300",
  info: "text-cyan-600 dark:text-cyan-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-rose-600 dark:text-rose-400",
};

const LEVEL_MARK: Record<LogLevel, string> = {
  log: "·",
  info: "i",
  warn: "!",
  error: "✕",
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
 * ターミナル風に表示するセクション。ログはメモリ上のみで保持され、
 * アプリ再起動でリセットされる。
 */
export function LogsSection() {
  const entries = useEventLog();
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <SettingsCard>
      <div className="flex items-start justify-between">
        <SectionHeader
          icon={TerminalIcon}
          eyebrow="LOGS"
          title="ログ"
          description={`通信内容や console 出力の履歴 (${entries.length}件)`}
        />
        <button
          type="button"
          onClick={clearLogEntries}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        >
          クリア
        </button>
      </div>

      <div
        ref={listRef}
        className="max-h-[52vh] min-h-[16rem] overflow-y-auto rounded-lg border border-slate-200 bg-slate-950/95 p-3 font-mono text-xs dark:border-white/10"
      >
        {entries.length === 0 && (
          <p className="text-slate-500">
            <span className="text-cyan-400">$</span> まだログがありません
          </p>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="flex gap-2 py-0.5 leading-relaxed">
            <span className="shrink-0 text-slate-600">{formatTime(entry.timestamp)}</span>
            <span className={`shrink-0 ${LEVEL_CLASSES[entry.level]}`}>
              {LEVEL_MARK[entry.level]}
            </span>
            <span className={`break-all ${LEVEL_CLASSES[entry.level]}`}>{entry.message}</span>
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}
