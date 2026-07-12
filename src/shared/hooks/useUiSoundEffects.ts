import { useEffect } from "react";
import { playUiSound } from "@/shared/lib/uiSound";

/**
 * アプリ全体のボタン操作音を document への委譲リスナーで一括再生するフック。
 * App のルートで1度だけマウントする。
 *
 * - クリック: 押せる(disabled でない)button を押したとき click.mp3
 * - ホバー : button に乗ったとき hover.mp3(同じボタン内の移動では鳴らさない)
 *
 * capture フェーズで拾うことで、コンポーネント側の stopPropagation の影響を
 * 受けずに全ボタンへ適用する。確認ダイアログ・成功・失敗の音は文脈が必要なため、
 * 各コンポーネントが playUiSound を直接呼ぶ。
 */
export function useUiSoundEffects(): void {
  useEffect(() => {
    let lastHovered: Element | null = null;

    function findEnabledButton(target: EventTarget | null): HTMLButtonElement | null {
      if (!(target instanceof Element)) return null;
      const button = target.closest("button");
      if (!button || button.disabled) return null;
      return button;
    }

    function onClick(e: MouseEvent) {
      if (findEnabledButton(e.target)) playUiSound("click");
    }

    function onMouseOver(e: MouseEvent) {
      const button = findEnabledButton(e.target);
      // ボタン外に出たらリセットし、同じボタンへ再度乗ったときも鳴るようにする
      if (!button) {
        lastHovered = null;
        return;
      }
      if (button === lastHovered) return;
      lastHovered = button;
      playUiSound("hover");
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("mouseover", onMouseOver, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mouseover", onMouseOver, true);
    };
  }, []);
}
