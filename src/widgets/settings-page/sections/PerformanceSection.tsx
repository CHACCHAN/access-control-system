import type { Dispatch, SetStateAction } from "react";
import {
  DEFAULT_PERFORMANCE,
  type AppSettings,
  type PerformanceSettings,
} from "@/shared/hooks/useSettings";
import { GaugeIcon } from "@/shared/ui/icons";
import { Field, INPUT_CLASS, SectionHeader, SettingsCard } from "../fields";

interface SectionProps {
  draft: AppSettings;
  setDraft: Dispatch<SetStateAction<AppSettings>>;
}

// 数値フィールドの定義。既定値は DEFAULT_PERFORMANCE から表示し、
// 極端な値の最終的なクランプは利用側(フロントの各フック / Rust 側)が行う。
interface NumFieldDef {
  key: keyof PerformanceSettings;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}

const RECOGNITION_FIELDS: NumFieldDef[] = [
  {
    key: "recognitionIntervalMs",
    label: "顔認証の推論間隔 (ms)",
    hint: "recognize_face を呼ぶ間隔。推論(数百ms)より短くしても前回完了まで次は投げません",
    min: 200,
    max: 5000,
    step: 100,
  },
  {
    key: "recognitionStableCount",
    label: "顔認証の連続一致回数",
    hint: "同一人物がこの回数連続で認識されたときだけ確認カードを表示します(誤認識防止)",
    min: 1,
    max: 5,
    step: 1,
  },
  {
    key: "matchThreshold",
    label: "照合閾値(コサイン類似度)",
    hint: "この値以上で本人と判定。上げると厳格に、下げると認識されやすくなります",
    min: 0.1,
    max: 0.95,
    step: 0.05,
  },
  {
    key: "matchMargin",
    label: "誤認識防止マージン",
    hint: "1位と2位の類似度差がこの値未満なら「該当者なし」として弾きます",
    min: 0,
    max: 0.5,
    step: 0.01,
  },
  {
    key: "minFaceWidthRatio",
    label: "照合する最小顔サイズ比率(近接判定)",
    hint: "顔幅がフレーム幅のこの比率未満のうちは「もう少し近づいてください」を表示し照合しません。下げるほど遠くても認証を試みます",
    min: 0.05,
    max: 0.9,
    step: 0.01,
  },
];

const GESTURE_FIELDS: NumFieldDef[] = [
  {
    key: "gesturePollIntervalMs",
    label: "ジェスチャー認識の間隔 (ms)",
    hint: "在室状況シート表示中に detect_gesture を呼ぶ間隔",
    min: 200,
    max: 5000,
    step: 100,
  },
  {
    key: "gestureStableCount",
    label: "ジェスチャーの連続一致回数",
    hint: "同じ手の形がこの回数連続したときだけステータスを更新します(誤爆防止)",
    min: 1,
    max: 5,
    step: 1,
  },
];

const CAMERA_FIELDS: NumFieldDef[] = [
  {
    key: "cameraFrameIntervalMs",
    label: "カメラ映像の送信間隔 (ms)",
    hint: "Rust側からフロントへ base64 画像を送る間隔。100ms = 10fps。短いほど滑らかですがCPU負荷が上がります",
    min: 33,
    max: 2000,
    step: 10,
  },
  {
    key: "cameraJpegQuality",
    label: "カメラ映像の JPEG 品質",
    hint: "10〜100。下げると転送・エンコードが軽くなる代わりに画質が落ちます(推論には影響しません)",
    min: 10,
    max: 100,
    step: 5,
  },
];

export function PerformanceSection({ draft, setDraft }: SectionProps) {
  function setPerf(key: keyof PerformanceSettings, value: number) {
    setDraft((d) => ({ ...d, performance: { ...d.performance, [key]: value } }));
  }

  function renderFields(fields: NumFieldDef[]) {
    return fields.map(({ key, label, hint, min, max, step }) => (
      <Field
        key={key}
        label={label}
        htmlFor={`perf-${key}`}
        hint={`${hint}(既定: ${DEFAULT_PERFORMANCE[key]})`}
      >
        <input
          id={`perf-${key}`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft.performance[key]}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            setPerf(key, Number.isNaN(n) ? min : n);
          }}
          className={INPUT_CLASS}
        />
      </Field>
    ));
  }

  return (
    <SettingsCard>
      <div className="flex items-start justify-between gap-3">
        <SectionHeader
          icon={GaugeIcon}
          eyebrow="PERFORMANCE"
          title="パフォーマンス"
          description="推論の頻度やカメラ配信を端末スペックに合わせて調整します。カメラ・照合の項目は保存後の再起動で反映されます"
        />
        <button
          type="button"
          onClick={() => setDraft((d) => ({ ...d, performance: { ...DEFAULT_PERFORMANCE } }))}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-cyan-500/50 hover:text-cyan-600 dark:border-white/10 dark:text-slate-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-400"
        >
          既定値に戻す
        </button>
      </div>

      <div className="space-y-8">
        <div>
          <p className="mb-4 font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-cyan-600/80 dark:text-cyan-400/70">
            face recognition
          </p>
          <div className="space-y-5">{renderFields(RECOGNITION_FIELDS)}</div>
        </div>

        <div>
          <p className="mb-4 font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-cyan-600/80 dark:text-cyan-400/70">
            gesture
          </p>
          <div className="space-y-5">{renderFields(GESTURE_FIELDS)}</div>
        </div>

        <div>
          <p className="mb-4 font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-cyan-600/80 dark:text-cyan-400/70">
            camera feed
          </p>
          <div className="space-y-5">{renderFields(CAMERA_FIELDS)}</div>
        </div>
      </div>
    </SettingsCard>
  );
}
