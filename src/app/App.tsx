import { useEffect, useRef, useState } from "react";
import { MemberListPanel } from "@/widgets/member-list-panel/MemberListPanel";
import { FaceAuthPanel } from "@/widgets/face-auth-panel/FaceAuthPanel";
import { AttendanceActionSheet } from "@/widgets/attendance-action-sheet/AttendanceActionSheet";
import { restartComputer } from "@/widgets/system-control-panel/api";
import { BootCheckScreen } from "@/widgets/boot-check-screen/BootCheckScreen";
import { SettingsPage } from "@/widgets/settings-page/SettingsPage";
import { StatusFooter } from "@/widgets/status-footer/StatusFooter";
import { AppProviders } from "./providers/AppProviders";
import { useFaceAuth } from "@/features/face-auth/FaceAuthContext";
import { useKioskSocket } from "@/features/kiosk-socket/useKioskSocket";
import { ScreenDimmer } from "@/features/screen-dimmer/ScreenDimmer";
import { useMembers } from "@/entities/member/MemberContext";
import { isAnimatedPattern, PATTERN_CLASS, useSettings } from "@/shared/hooks/useSettings";
import { useUiSoundEffects } from "@/shared/hooks/useUiSoundEffects";
import { applyHardwareVolume } from "@/shared/lib/hardwareVolume";
import "./App.css";

// 顔認証パネルのモード。register 中は左パネルを顔登録フォームへ差し替える。
export type AuthMode = "recognize" | "register";

export default function App() {
  const [hasBooted, setHasBooted] = useState(false);
  // ボタンのクリック/ホバー音(全画面共通・document 委譲)
  useUiSoundEffects();

  return (
    <>
      {!hasBooted ? (
        <BootCheckScreen onContinue={() => setHasBooted(true)} />
      ) : (
        <AppProviders>
          <MainScreen />
        </AppProviders>
      )}
      {/* システム状態フッターは起動チェック中・設定画面中を含む全ページで常駐 */}
      <StatusFooter />
    </>
  );
}

function currentHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function MainScreen() {
  const { visionError } = useFaceAuth();
  const { settings, isLoading: isSettingsLoading } = useSettings();
  const { refetch } = useMembers();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // 顔認証パネルのモード。App レベルで持ち、登録中は左パネルを登録フォームに
  // 差し替えつつ右パネルのカメラ検出可視化を継続させる。
  const [authMode, setAuthMode] = useState<AuthMode>("recognize");
  const lastFiredKeyRef = useRef<string | null>(null);

  useKioskSocket(settings.wsEndpoint, refetch, settings.wsSignalField, settings.wsSignalValue);

  // 1分ごとに現在時刻をチェックし、再起動スケジュールと一致したら再起動する。
  // HH:MM は日をまたいで毎日同じ値になるため、発火済みかどうかは日付込みの
  // キーで管理し、翌日も同じ時刻に再起動できるようにしている。
  useEffect(() => {
    function checkRebootSchedule() {
      if (!settings.rebootSchedule) return;
      const now = new Date();
      const current = currentHHMM();
      if (current !== settings.rebootSchedule) return;

      const fireKey = `${now.toDateString()}_${current}`;
      if (lastFiredKeyRef.current === fireKey) return;
      lastFiredKeyRef.current = fireKey;
      restartComputer();
    }

    const timer = window.setInterval(checkRebootSchedule, 60_000);
    return () => window.clearInterval(timer);
  }, [settings.rebootSchedule]);

  // 保存済みのハードウェア音量(ALSA)を起動時に端末へ反映する。
  // ALSA のミキサー状態は再起動で失われる場合があるため、アプリ側でも保証する。
  useEffect(() => {
    if (isSettingsLoading) return;
    void applyHardwareVolume(settings.hardwareVolume);
  }, [isSettingsLoading, settings.hardwareVolume]);

  // 静的パターンはトップ画面全体に敷く。アニメーション付き(回路/信号)は
  // 右側(顔認証パネル)の背景にのみ描画するため、ここでは敷かない。
  const pattern = settings.appearance.backgroundPattern;
  const pagePatternClass = isAnimatedPattern(pattern) ? "" : (PATTERN_CLASS[pattern] ?? "cyber-grid");

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-50 dark:bg-[#070b14]">
      {/* トップ画面全体にも設定ページと同じ背景パターンを薄く敷き、統一感を出す */}
      {pagePatternClass && (
        <div className={`${pagePatternClass} pointer-events-none absolute inset-0 opacity-60`} />
      )}
      {/*
        grid-rows-[minmax(0,1fr)] が無いと、暗黙の行トラックは既定で「コンテンツに
        合わせて伸びるサイズ(auto)」になる。子要素に min-h-0 を付けるだけでは
        行トラック自体の上限が定まらないため、コンテンツ量に応じて行(ひいては
        グリッド自体)が h-full を超えて伸びてしまう。minmax(0,1fr) で明示的に
        「コンテナの高さちょうど・下限0(縮小可)」にし、はみ出た分は各パネル内部の
        overflow-y-auto に処理させる。
      */}
      {/* pb-7 はシステム状態フッター(h-7)ぶんの余白 */}
      <div className="relative z-10 grid h-full grid-cols-2 grid-rows-[minmax(0,1fr)] divide-x divide-slate-200 pb-7 dark:divide-cyan-400/10 *:min-h-0">
        <MemberListPanel mode={authMode} setMode={setAuthMode} />
        <FaceAuthPanel
          onOpenSettings={() => setIsSettingsOpen(true)}
          mode={authMode}
          setMode={setAuthMode}
        />
      </div>

      {visionError && (
        <p className="fixed bottom-9 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 font-mono text-xs text-rose-600 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-400">
          [vision] {visionError}
        </p>
      )}

      <AttendanceActionSheet />

      {isSettingsOpen && <SettingsPage onClose={() => setIsSettingsOpen(false)} />}

      <ScreenDimmer />
    </main>
  );
}
