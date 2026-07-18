import type { GestureCountdownState } from "./useGestureStatusLoop";
import {
  GesturePaperIcon,
  GestureRockIcon,
  GestureScissorsIcon,
} from "@/shared/ui/icons";

interface IconType {
  ({ className }: { className?: string }): React.ReactNode;
}

const GESTURE_ICONS: Partial<Record<GestureCountdownState["gesture"], IconType>> = {
  Rock: GestureRockIcon,
  Scissors: GestureScissorsIcon,
  Paper: GesturePaperIcon,
};

// SVG 進捗リングの半径(viewBox 100x100 内)
const RING_RADIUS = 44;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * ジェスチャー確定から送信までのカウントダウン表示(3→2→1)。
 * 進捗リングが1秒ごとに縮み、中央の数字がポップする。確認カードと
 * 在室ステータス操作シートの両方で使う共通コンポーネント。
 * カウント中に手を下ろす・別の手に変えるとキャンセルされる(フック側の挙動)。
 */
export function GestureCountdown({ countdown }: { countdown: GestureCountdownState }) {
  const { gesture, status, secondsLeft, totalSeconds } = countdown;
  const progress = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;
  const Icon = GESTURE_ICONS[gesture];

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-2 py-2 animate-scale-in"
    >
      <div className="relative h-28 w-28">
        {/* 認識中の脈動(既存の pulse-ring 装飾を流用) */}
        <div className="pointer-events-none absolute inset-1 rounded-full animate-pulse-ring" />
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="6"
            className="stroke-slate-200 dark:stroke-white/10"
          />
          {/* 残り時間リング: 1秒ごとの減少を linear transition で滑らかに見せる */}
          <circle
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            className="stroke-cyan-500 transition-[stroke-dashoffset] duration-1000 ease-linear dark:stroke-cyan-400"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {/* key を変えて1秒ごとに scale-in を再生させる */}
          <span
            key={secondsLeft}
            className="animate-scale-in font-mono text-5xl font-bold text-cyan-600 drop-shadow-[0_0_12px_rgba(34,211,238,0.45)] dark:text-cyan-300"
          >
            {secondsLeft}
          </span>
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
        {Icon && <Icon className="h-5 w-5 text-cyan-500 dark:text-cyan-400" />}
        「{status}」で記録します
      </p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        手を下ろすとキャンセルできます
      </p>
    </div>
  );
}
