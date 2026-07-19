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
      aria-atomic="true"
      className="flex flex-col items-center gap-3 py-2 animate-scale-in"
    >
      <div className="relative grid h-30 w-30 place-items-center">
        {/* アプリのアクセント色に追従するHUD風の発光レイヤー */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-5 rounded-full bg-cyan-400/20 blur-xl dark:bg-cyan-400/25"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-1 rounded-full border border-dashed border-cyan-500/30 animate-[spin_16s_linear_infinite] motion-reduce:animate-none dark:border-cyan-300/30"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-2 rounded-full animate-pulse-ring"
        />

        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full -rotate-90 overflow-visible"
        >
          {/* 外周の目盛り。進捗リングとは逆方向へ流れる印象を加える */}
          <circle
            cx="50"
            cy="50"
            r="48"
            fill="none"
            strokeWidth="1"
            strokeDasharray="1 5"
            className="stroke-cyan-500/35 dark:stroke-cyan-300/35"
          />
          <circle
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="7"
            className="stroke-slate-200/90 dark:stroke-white/10"
          />
          {/* 残り時間リング: 1秒ごとの減少を linear transition で滑らかに見せる */}
          <circle
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            style={{
              filter:
                "drop-shadow(0 0 4px color-mix(in srgb, var(--color-cyan-400) 75%, transparent))",
            }}
            className="stroke-cyan-500 transition-[stroke-dashoffset] duration-1000 ease-linear dark:stroke-cyan-300"
          />
        </svg>

        <div className="absolute inset-5 grid place-items-center rounded-full border border-cyan-500/25 bg-linear-to-br from-white via-cyan-50/90 to-slate-100 shadow-glow backdrop-blur-sm dark:border-cyan-300/20 dark:from-slate-950 dark:via-slate-900 dark:to-cyan-950/70">
          <span className="pointer-events-none absolute top-2 font-mono text-[8px] font-semibold uppercase tracking-[0.24em] text-cyan-700/60 dark:text-cyan-300/55">
            send in
          </span>
          {/*
            数字のグリフはフォントメトリクス上、行ボックス内で少し上に見える。
            アニメーションの transform と競合しない外側要素で2px下げて光学的に中央へ置く。
          */}
          <div className="translate-y-0.5">
            <span
              key={secondsLeft}
              style={{
                textShadow:
                  "0 0 10px color-mix(in srgb, var(--color-cyan-400) 65%, transparent), 0 0 24px color-mix(in srgb, var(--color-cyan-400) 30%, transparent)",
              }}
              className="block animate-countdown-tick font-mono text-[2.75rem] font-black leading-none tabular-nums text-cyan-600 dark:text-cyan-200"
            >
              {secondsLeft}
            </span>
          </div>
          <span className="pointer-events-none absolute bottom-2 font-mono text-[8px] font-semibold uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">
            sec
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-50/80 px-3.5 py-1.5 shadow-glow-sm dark:border-cyan-300/20 dark:bg-cyan-400/10">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500 dark:bg-cyan-300" />
        </span>
        {Icon && <Icon className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />}
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          「{status}」で記録します
        </p>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
        <span className="h-px w-5 bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
        <p>手を下ろすとキャンセルできます</p>
        <span className="h-px w-5 bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
      </div>
    </div>
  );
}
