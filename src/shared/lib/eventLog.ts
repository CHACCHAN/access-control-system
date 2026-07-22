// アプリ全体のイベントログ(通信系・console出力・更新通知等)を
// メモリ上に保持するだけのシンプルなストア。永続化はせず、アプリ再起動の
// たびに内容がリセットされる仕様(設定画面の「ログ」タブから閲覧する)。

export type LogLevel = "log" | "info" | "warn" | "error";

export interface LogEntry {
  id: number;
  timestamp: number;
  level: LogLevel;
  message: string;
}

// 長時間稼働するキオスクでメモリを圧迫しないよう、保持件数の上限を設ける。
const MAX_ENTRIES = 1000;
const MAX_MESSAGE_LENGTH = 4000;

let entries: LogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (arg === undefined) return "undefined";
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/**
 * ログを1件追加する。console.log 等と同じく、複数の引数をスペース区切りで
 * 連結して1つのメッセージにする。
 */
export function addLogEntry(level: LogLevel, ...args: unknown[]): void {
  const formatted = args.map(formatArg).join(" ");
  const message =
    formatted.length > MAX_MESSAGE_LENGTH
      ? `${formatted.slice(0, MAX_MESSAGE_LENGTH)}…[truncated]`
      : formatted;
  // useSyncExternalStoreはObject.isでsnapshotを比較するため、追記時にも新しい
  // 配列参照を作る。同じ参照へpushするとログ画面が更新されない。
  entries = [...entries, { id: nextId++, timestamp: Date.now(), level, message }].slice(
    -MAX_ENTRIES,
  );
  notify();
}

export function getLogEntries(): LogEntry[] {
  return entries;
}

export function clearLogEntries(): void {
  entries = [];
  notify();
}

export function subscribeLogEntries(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

let consoleCaptureInstalled = false;

/**
 * console.log/info/warn/error をラップし、元の出力はそのまま行いつつ
 * イベントログにも記録する。アプリ起動時に一度だけ呼び出すこと
 * (何度呼んでも二重にラップしないようガードしている)。
 */
export function installConsoleCapture(): void {
  if (consoleCaptureInstalled) return;
  consoleCaptureInstalled = true;

  (["log", "info", "warn", "error"] as const).forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      addLogEntry(level, ...args);
    };
  });
}
