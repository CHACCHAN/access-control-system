// API リクエストボディの JSON テンプレートに実際の値を埋め込むユーティリティ。
// テンプレートは通常の JSON で、値の位置に "{{key}}" という文字列を置くと、
// そのノード全体(文字列・配列・オブジェクトいずれの型でも)が values[key] に
// 置き換わる。バックエンドのフィールド名が変わっても、設定画面でテンプレート
// 文字列を書き換えるだけでアプリの再ビルドなしに追従できるようにするための仕組み。
const PLACEHOLDER_PATTERN = /^\{\{(\w+)\}\}$/;

function substitute(node: unknown, values: Record<string, unknown>): unknown {
  if (typeof node === "string") {
    const match = PLACEHOLDER_PATTERN.exec(node);
    if (match && match[1] in values) return values[match[1]];
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => substitute(item, values));
  }
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([key, value]) => [
        key,
        substitute(value, values),
      ]),
    );
  }
  return node;
}

/**
 * JSON テンプレート文字列をパースし、プレースホルダーを実値に置き換えて返す。
 * テンプレートが不正な JSON の場合は例外を投げる。
 */
export function applyBodyTemplate(template: string, values: Record<string, unknown>): unknown {
  const parsed = JSON.parse(template);
  return substitute(parsed, values);
}

/**
 * テンプレートが正しい JSON かどうかだけを確認する(設定画面の入力検証用)。
 */
export function isValidJsonTemplate(template: string): boolean {
  try {
    JSON.parse(template);
    return true;
  } catch {
    return false;
  }
}
