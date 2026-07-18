import { useEffect } from "react";
import type { AttendanceStatus, Member } from "@/entities/member/model";
import type { GestureKind } from "@/shared/lib/visionApi";
import { playUiSound } from "@/shared/lib/uiSound";
import { GestureGuide } from "@/features/gesture/GestureGuide";
import { GestureCountdown } from "@/features/gesture/GestureCountdown";
import type { GestureCountdownState } from "@/features/gesture/useGestureStatusLoop";
import { CheckIcon } from "@/shared/ui/icons";

interface FaceMatchConfirmCardProps {
  member: Member;
  onConfirm: () => void;
  onReject: () => void;
  /** 直近に検出されたジェスチャー(案内のハイライト用) */
  detectedGesture: GestureKind | null;
  /** ジェスチャー確定後の送信カウントダウン(表示中は はい/ちがう を置き換える) */
  countdown: GestureCountdownState | null;
  /** ジェスチャーで直接記録が完了したときのステータス(完了表示に切り替える) */
  completedAction: AttendanceStatus | null;
  busy?: boolean;
}

/**
 * 顔認証で本人候補が見つかったときの確認カード。
 * 「はい」でステータス操作シートへ進むほか、このカードを出したまま
 * ジェスチャー(グー/チョキ/パー)をかざせば、その割り当てステータスで
 * 直接記録できる(案内を下部に表示)。
 */
export function FaceMatchConfirmCard({
  member,
  onConfirm,
  onReject,
  detectedGesture,
  countdown,
  completedAction,
  busy = false,
}: FaceMatchConfirmCardProps) {
  // 確認ダイアログの表示時に確認音を鳴らす(対象メンバーが変わったときも)
  useEffect(() => {
    playUiSound("confirmation");
  }, [member.username]);

  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center p-6">
      <div className="cyber-corners w-full max-w-sm animate-slide-up rounded-xl border border-slate-200 bg-white/95 p-6 text-center shadow-2xl backdrop-blur dark:border-cyan-400/25 dark:bg-slate-900/95">
        {completedAction ? (
          <div role="status" className="flex flex-col items-center gap-3 py-4 animate-scale-in">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {member.name} さんの {completedAction} を記録しました
            </p>
          </div>
        ) : (
          <>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-cyan-600/80 dark:text-cyan-400/70">
              match found
            </p>
            <div className="mx-auto mt-2 flex h-14 w-14 items-center justify-center rounded-xl bg-linear-to-br from-cyan-500 to-indigo-500 text-xl font-semibold text-white shadow-lg shadow-cyan-500/30">
              {member.name.slice(0, 1)}
            </div>
            <p className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
              {member.name} さんですか？
            </p>
            {countdown ? (
              // ジェスチャー確定後は「はい/ちがう」をカウントダウン表示に置き換える。
              // カウント中に手を下ろすとキャンセルされ、元の表示に戻る。
              <div className="mt-2">
                <GestureCountdown countdown={countdown} />
              </div>
            ) : (
              <>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={onReject}
                    disabled={busy}
                    className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    ちがう
                  </button>
                  <button
                    onClick={onConfirm}
                    disabled={busy}
                    className="flex-1 rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-slate-950 shadow-glow transition hover:bg-cyan-400"
                  >
                    はい
                  </button>
                </div>
                <div className="mt-4">
                  <GestureGuide
                    detectedGesture={detectedGesture}
                    title="ジェスチャーで直接記録、またはサムズダウンで「ちがう」を選べます"
                    includeReject
                    unavailableStatus={member.status}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
