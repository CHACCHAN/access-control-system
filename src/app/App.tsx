import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MemberListPanel } from "@/widgets/member-list-panel/MemberListPanel";
import { FaceAuthPanel } from "@/widgets/face-auth-panel/FaceAuthPanel";
import { AttendanceActionSheet } from "@/widgets/attendance-action-sheet/AttendanceActionSheet";
import { restartComputer } from "@/shared/lib/systemCommands";
import { BootCheckScreen } from "@/widgets/boot-check-screen/BootCheckScreen";
import { StatusFooter } from "@/widgets/status-footer/StatusFooter";
import { AppProviders } from "./providers/AppProviders";
import { useFaceAuth } from "@/features/face-auth/FaceAuthContext";
import { useKioskSocket } from "@/features/kiosk-socket/useKioskSocket";
import { ScreenDimmer } from "@/features/screen-dimmer/ScreenDimmer";
import { PresenceDimOverlay, usePresenceDim } from "@/features/screen-dimmer/PresenceDimmer";
import { useMembers } from "@/entities/member/MemberContext";
import { isAnimatedPattern, PATTERN_CLASS, useSettings } from "@/shared/hooks/useSettings";
import { useUiSoundEffects } from "@/shared/hooks/useUiSoundEffects";
import { applyHardwareVolume } from "@/shared/lib/hardwareVolume";
import type { AuthMode } from "@/features/face-auth/model";
import "./App.css";

// 通常運用では開かない管理画面を初期バンドルから分離し、キオスク起動時の
// JavaScript解析量を抑える。
const SettingsPage = lazy(() =>
  import("@/widgets/settings-page/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);

// 外部サイト閲覧ページも設定と同様に遅延読み込みで分離する。
const ExternalSitePage = lazy(() =>
  import("@/widgets/external-site-page/ExternalSitePage").then((module) => ({
    default: module.ExternalSitePage,
  })),
);

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
  const { refetch, applyRemoteStatus } = useMembers();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExternalSiteOpen, setIsExternalSiteOpen] = useState(false);
  const [isScreenDimmed, setIsScreenDimmed] = useState(false);
  // 顔認証パネルのモード。App レベルで持ち、登録中は左パネルを登録フォームに
  // 差し替えつつ右パネルのカメラ検出可視化を継続させる。
  const [authMode, setAuthMode] = useState<AuthMode>("recognize");
  // マウント時点の「分」を発火済みとして初期化する。スケジュール再起動後の
  // 起動が同じ分のうちに完了すると、マウント直後のチェックで再度再起動が
  // 走り続ける(再起動ループ)ため、起動した分には発火させない。
  const lastFiredKeyRef = useRef<string | null>(
    `${new Date().toDateString()}_${currentHHMM()}`,
  );

  // 在室状況の更新通知(Socket.IO)。対象メンバーだけを即時反映し、
  // ペイロードを解釈できない場合のみ一覧を取り直す。
  useKioskSocket({
    endpoint: settings.wsEndpoint,
    eventName: settings.socketEventName,
    userField: settings.socketUserField,
    statusField: settings.socketStatusField,
    onStatusUpdate: applyRemoteStatus,
    onFallback: refetch,
  });

  // 人物不在時の減光(自動消灯とは別の第1段階)。顔検出(下の onFaceSeen)と
  // 操作が両方途切れると半減光する。設定画面・外部サイト・完全消灯中は判定しない
  // (外部サイト閲覧中は iframe 内の操作が window へ届かず、誤減光するため)。
  const { isDim: isPresenceDim, reportPresence } = usePresenceDim(
    settings.presenceDimmingEnabled && !isSettingsOpen && !isExternalSiteOpen && !isScreenDimmed,
  );

  // 1分ごとに現在時刻をチェックし、再起動スケジュールと一致したら再起動する。
  // HH:MM は日をまたいで毎日同じ値になるため、発火済みかどうかは日付込みの
  // キーで管理し、翌日も同じ時刻に再起動できるようにしている。
  useEffect(() => {
    function checkRebootSchedule() {
      if (!settings.rebootScheduleEnabled || !settings.rebootSchedule) return;
      const now = new Date();
      const current = currentHHMM();
      if (current !== settings.rebootSchedule) return;

      const fireKey = `${now.toDateString()}_${current}`;
      if (lastFiredKeyRef.current === fireKey) return;
      lastFiredKeyRef.current = fireKey;
      void restartComputer().catch((err) => {
        console.error("[reboot-schedule] 自動再起動に失敗しました:", err);
        if (lastFiredKeyRef.current === fireKey) lastFiredKeyRef.current = null;
      });
    }

    // マウントした分は lastFiredKeyRef の初期値により発火しない(再起動ループ防止)。
    // スケジュール設定の変更後など、次の分以降の一致から発火する。
    checkRebootSchedule();
    const timer = window.setInterval(checkRebootSchedule, 60_000);
    return () => window.clearInterval(timer);
  }, [settings.rebootScheduleEnabled, settings.rebootSchedule]);

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
          onOpenExternalSite={() => setIsExternalSiteOpen(true)}
          mode={authMode}
          setMode={setAuthMode}
          isInteractive={!isSettingsOpen && !isExternalSiteOpen && !isScreenDimmed}
          onFaceSeen={reportPresence}
        />
      </div>

      {visionError && (
        <p className="fixed bottom-9 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 font-mono text-xs text-rose-600 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-400">
          [vision] {visionError}
        </p>
      )}

      <AttendanceActionSheet
        isInteractive={!isSettingsOpen && !isExternalSiteOpen && !isScreenDimmed}
      />

      {isSettingsOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 text-sm text-slate-300">
              設定を読み込んでいます…
            </div>
          }
        >
          <SettingsPage onClose={() => setIsSettingsOpen(false)} />
        </Suspense>
      )}

      {isExternalSiteOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 text-sm text-slate-300">
              外部サイトを読み込んでいます…
            </div>
          }
        >
          <ExternalSitePage onClose={() => setIsExternalSiteOpen(false)} />
        </Suspense>
      )}

      {/* 人物不在時の半減光(完全消灯の黒レイヤー z-200 より下) */}
      <PresenceDimOverlay isDim={isPresenceDim} />

      <ScreenDimmer onDimmedChange={setIsScreenDimmed} />
    </main>
  );
}
