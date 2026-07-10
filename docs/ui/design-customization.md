# デザインカスタマイズ仕様

設定画面「デザイン」(APPEARANCE)セクションから、アプリの外観を再ビルドなしで
変更できる。設定値は `settings.appearance` に保存される。

## テーマ(ライト / ダーク)

- `settings.theme`(一般セクション)。`<html>` の `dark` クラスで切り替える
  (Tailwind の `@custom-variant dark`)。
- 以下のカスタマイズはすべてライト / ダーク両テーマと併用できる。

## アクセントカラー

- 選択肢: シアン(既定)/ ブルー / エメラルド / バイオレット / ローズ / アンバー。
- **実装方式**: アプリのアクセントは Tailwind の cyan 系ユーティリティ
  (`text-cyan-400` 等)で書かれており、Tailwind v4 ではこれらが CSS 変数
  `--color-cyan-*` を参照する。`App.css` の `:root[data-accent="..."]` ブロックが
  この変数群を別パレットへ丸ごと差し替えることで、ボタン・見出し・グロー・
  顔検出枠まで一括で切り替わる。
- `ThemeProvider` が保存値を `<html data-accent="...">` に反映する(cyan は属性なし)。
- ネオングロー(`shadow-glow` 系)や背景パターンの色は `color-mix()` +
  `var(--color-cyan-400)` で定義されており、自動で追従する。
- 設定画面ではライブプレビューされ、保存せず閉じると保存値へ戻る。
- **色を追加する場合**: `useSettings.ts` の `AccentColor` 型と
  `AppearanceSection.tsx` の選択肢、`App.css` のパレット(50〜950 の 11 段階)を揃えて追加する。

## 背景パターン

- 選択肢: グリッド(既定)/ ドット / 斜線 / なし。
- トップ画面と設定ページの背景に薄く敷かれる装飾
  (`App.css` の `.cyber-grid` / `.cyber-dots` / `.cyber-diagonal`)。
- ライトはスレート系、ダークはアクセント色ベース。

## メンバー一覧レイアウト

| 値 | 表示 |
|---|---|
| grid(既定) | 2 列のカード |
| compact | 3 列の小さめカード |
| list | 1 列の横長リスト(アバター + 名前 + ステータスバッジ) |

`MemberCard` は `variant`(card / row)を持ち、list 選択時に row になる。

## パネル背景色

- トップ画面の左(メンバー一覧)・右(顔認証)パネルの背景色を個別に指定できる。
- カラーピッカーで指定し、「既定に戻す」で解除(空文字 = テーマ既定)。
- 適用は inline style の `background` ショートハンドで行い、既定のグラデーション
  ごと上書きする。

## デザイントークン(参考)

- 装飾クラス: `cyber-grid`(格子)、`cyber-corners`(カード四隅の HUD 風 L 字)、
  `animate-scan`(走査線)、`animate-glow`(グロー明滅)、`animate-pulse-ring`(認識中リング)。
- グロー影: `shadow-glow`(強)/ `shadow-glow-sm`(小・濃)/ `shadow-glow-bar`(バー用)。
  いずれもアクセント変数から `color-mix()` で生成される。
