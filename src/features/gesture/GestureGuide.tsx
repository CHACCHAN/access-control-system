import { useSettings, type GestureStatusMap } from "@/shared/hooks/useSettings";
import type { GestureKind } from "@/shared/lib/visionApi";
import {
  GesturePaperIcon,
  GestureRockIcon,
  GestureScissorsIcon,
  GestureThumbsDownIcon,
} from "@/shared/ui/icons";

interface IconType {
  ({ className }: { className?: string }): React.ReactNode;
}

// 設定キー ↔ 検出ジェスチャー ↔ アイコンの対応
const GESTURE_DEFS: { key: keyof GestureStatusMap; kind: GestureKind; icon: IconType }[] = [
  { key: "rock", kind: "Rock", icon: GestureRockIcon },
  { key: "scissors", kind: "Scissors", icon: GestureScissorsIcon },
  { key: "paper", kind: "Paper", icon: GesturePaperIcon },
];

interface GestureGuideProps {
  /** 直近に検出されたジェスチャー(ハイライト表示用) */
  detectedGesture: GestureKind | null;
  /** 上に添える案内文 */
  title: string;
  /** 「ちがう」ジェスチャー(rejectGesture)の案内も表示するか(確認カード用) */
  includeReject?: boolean;
  /**
   * このステータスに割り当てられたジェスチャーを「使用不可」の色で表示する。
   * 対象メンバーの現在のステータスを渡す(同じステータスへの更新は行われないため)。
   */
  unavailableStatus?: string | null;
}

/**
 * ジェスチャー→在室ステータスの割り当てを案内する共通UI。
 * 設定でステータスが割り当てられているジェスチャーだけを表示し、
 * 検出中のジェスチャーをハイライトする。confirm カードでは「ちがう」
 * ジェスチャー(サムズダウン)の案内も加える。表示対象が無ければ何も出さない。
 */
export function GestureGuide({
  detectedGesture,
  title,
  includeReject = false,
  unavailableStatus = null,
}: GestureGuideProps) {
  const { settings } = useSettings();
  const assigned = GESTURE_DEFS.filter(({ key }) => settings.gestureStatusMap[key] !== "");
  const showReject = includeReject && settings.rejectGesture !== "";
  if (assigned.length === 0 && !showReject) return null;

  const chipClass = (active: boolean, reject: boolean, unavailable = false) => {
    // 現在と同じステータスのジェスチャーは更新に使えないため、
    // 検出中でもハイライトせず淡色のまま示す(アイコンの色だけで伝える)
    if (unavailable) {
      return "flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-xs text-slate-300 opacity-70 transition dark:text-slate-600";
    }
    return `flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
      active
        ? reject
          ? "scale-105 border-rose-500/50 bg-rose-500/10 font-semibold text-rose-600 dark:border-rose-400/40 dark:text-rose-300"
          : "scale-105 border-cyan-500/50 bg-cyan-500/10 font-semibold text-cyan-600 dark:border-cyan-400/40 dark:text-cyan-300"
        : "border-transparent text-slate-500 dark:text-slate-400"
    }`;
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40">
      <p className="text-center text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        {title}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        {assigned.map(({ key, kind, icon: Icon }) => {
          const status = settings.gestureStatusMap[key];
          const unavailable = unavailableStatus !== null && status === unavailableStatus;
          return (
            <span key={key} className={chipClass(detectedGesture === kind, false, unavailable)}>
              <Icon className="h-5 w-5" />
              {status}
            </span>
          );
        })}
        {showReject && (
          <span className={chipClass(detectedGesture === settings.rejectGesture, true)}>
            <GestureThumbsDownIcon className="h-5 w-5" />
            ちがう
          </span>
        )}
      </div>
    </div>
  );
}
