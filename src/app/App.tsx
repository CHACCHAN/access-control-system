import { useEffect, useRef, useState } from "react";
import { MemberListPanel } from "@/widgets/member-list-panel/MemberListPanel";
import { FaceAuthPanel } from "@/widgets/face-auth-panel/FaceAuthPanel";
import { AttendanceActionSheet } from "@/widgets/attendance-action-sheet/AttendanceActionSheet";
import { SystemControlPanel } from "@/widgets/system-control-panel/SystemControlPanel";
import { restartComputer } from "@/widgets/system-control-panel/api";
import { BootCheckScreen } from "@/widgets/boot-check-screen/BootCheckScreen";
import { SettingsPanel } from "@/widgets/settings-panel/SettingsPanel";
import { AppProviders } from "./providers/AppProviders";
import { useFaceAuth } from "@/features/face-auth/FaceAuthContext";
import { useKioskSocket } from "@/features/kiosk-socket/useKioskSocket";
import { useMembers } from "@/entities/member/MemberContext";
import { useSettings } from "@/shared/hooks/useSettings";
import "./App.css";

export default function App() {
  const [hasBooted, setHasBooted] = useState(false);

  if (!hasBooted) {
    return <BootCheckScreen onContinue={() => setHasBooted(true)} />;
  }

  return (
    <AppProviders>
      <MainScreen />
    </AppProviders>
  );
}

function currentHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function MainScreen() {
  const { faceApiError } = useFaceAuth();
  const { settings } = useSettings();
  const { refetch } = useMembers();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const lastFiredMinuteRef = useRef<string | null>(null);

  useKioskSocket(settings.wsEndpoint, refetch);

  // 1分ごとに現在時刻をチェックし、再起動スケジュールと一致したら再起動する
  useEffect(() => {
    function checkRebootSchedule() {
      if (!settings.rebootSchedule) return;
      const current = currentHHMM();
      if (current !== settings.rebootSchedule) return;
      if (lastFiredMinuteRef.current === current) return;
      lastFiredMinuteRef.current = current;
      restartComputer();
    }

    const timer = window.setInterval(checkRebootSchedule, 60_000);
    return () => window.clearInterval(timer);
  }, [settings.rebootSchedule]);

  return (
    <main className="h-screen w-screen bg-slate-100 dark:bg-slate-950">
      <div className="grid h-full grid-cols-2 divide-x divide-slate-200 dark:divide-white/10">
        <MemberListPanel />
        <FaceAuthPanel onOpenSettings={() => setIsSettingsOpen(true)} />
      </div>

      <SystemControlPanel />

      {faceApiError && (
        <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-rose-100 px-4 py-2 text-xs text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
          FaceAPI エラー: {faceApiError}
        </p>
      )}

      <AttendanceActionSheet />

      {isSettingsOpen && <SettingsPanel onClose={() => setIsSettingsOpen(false)} />}
    </main>
  );
}
