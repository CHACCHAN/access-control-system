import type { AppSettings } from "@/shared/hooks/useSettings";

// 保存時に「端末の再起動が必要な設定」を宣言的に管理するポリシー。
// SettingsPage は保存前にここへ問い合わせ、該当する変更があるときだけ
// 再起動確認モーダルを表示する(それ以外は保存のみで即時反映)。

export interface RestartRequiredItem {
  /** 再起動確認モーダルに表示する項目名 */
  label: string;
  /** 保存前(saved)と保存内容(draft)を比べ、再起動が必要な変更かを判定する */
  changed: (saved: AppSettings, draft: AppSettings) => boolean;
}

/**
 * 再起動が必要な設定項目の一覧。**現在は空 = 全設定が保存だけで反映される。**
 *
 * - エンドポイント・APIトークン → MemberContext が変更を検知して自動再取得
 * - Socket.IO 接続先 → useKioskSocket が接続し直す
 * - performance.camera* → キャプチャスレッドが2秒間隔で設定を読み直す
 * - 照合パラメータ・gestureStatusMap → Rust 側が推論のたびに store を読む
 * - スケジュール・消灯・デザイン・外部サイト → React が settings の変更で再適用
 *
 * 今後「起動時にしか読まれない設定」を追加した場合はここに登録すること。
 * 登録した項目が変更された保存だけ、従来どおり再起動確認モーダルが出る。
 */
export const RESTART_REQUIRED_ITEMS: RestartRequiredItem[] = [];

/**
 * 保存で再起動が必要になる変更項目のラベル一覧を返す(無ければ空配列)。
 * `items` は単体テスト用の差し替え口で、通常は既定の一覧を使う。
 */
export function restartRequiredChanges(
  saved: AppSettings,
  draft: AppSettings,
  items: RestartRequiredItem[] = RESTART_REQUIRED_ITEMS,
): string[] {
  return items.filter((item) => item.changed(saved, draft)).map((item) => item.label);
}
