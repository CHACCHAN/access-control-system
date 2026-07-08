import { useSyncExternalStore } from "react";
import { getLogEntries, subscribeLogEntries, type LogEntry } from "@/shared/lib/eventLog";

/**
 * イベントログ(shared/lib/eventLog)を React コンポーネントから購読するフック。
 * ログ追加のたびに再レンダリングされる。
 */
export function useEventLog(): LogEntry[] {
  return useSyncExternalStore(subscribeLogEntries, getLogEntries);
}
