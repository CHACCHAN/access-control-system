import { useMemo, useState } from "react";
import { MemberListPanel } from "./features/member-directory/MemberListPanel";
import { FaceAuthPanel } from "./features/face-auth/FaceAuthPanel";
import { AttendanceActionSheet } from "./features/attendance-action/AttendanceActionSheet";
import { useCamera } from "./shared/hooks/useCamera";
import { useFaceApiModels } from "./shared/hooks/useFaceApiModels";
import { useTheme } from "./shared/hooks/useTheme";
import { useEnrolledFaces } from "./features/face-auth/useEnrolledFaces";
import type { EnrolledFace } from "./features/face-auth/useEnrolledFaces";
import { useMembers } from "./entities/member/useMembers";
import type { AttendanceStatus, Member } from "./entities/member/api";
import "./App.css";

export default function App() {
  const { videoRef, status: cameraStatus, error: cameraError } = useCamera();
  const { status: faceApiStatus, error: faceApiError } = useFaceApiModels();
  const { theme, toggleTheme } = useTheme();
  const { enrolledFaces, enroll } = useEnrolledFaces();
  const {
    members,
    setMembers,
    isLoading: membersLoading,
    error: membersError,
  } = useMembers();
  const [activeUsername, setActiveUsername] = useState<string | null>(null);

  const activeMember = members.find((m) => m.username === activeUsername) ?? null;

  // API から顔特徴ベクトルが提供されているメンバーはそれを初期値とし、
  // このセッション中にその場で登録した顔情報で上書きする
  const mergedEnrolledFaces = useMemo(() => {
    const byUsername = new Map<string, EnrolledFace>(
      members
        .filter((m): m is Member & { descriptor: number[] } => !!m.descriptor?.length)
        .map((m) => [m.username, { username: m.username, descriptor: new Float32Array(m.descriptor) }]),
    );
    for (const face of enrolledFaces) {
      byUsername.set(face.username, face);
    }
    return [...byUsername.values()];
  }, [members, enrolledFaces]);

  function handleStatusChange(username: string, status: AttendanceStatus) {
    setMembers((prev) => prev.map((m) => (m.username === username ? { ...m, status } : m)));
  }

  function handleSelectMember(member: Member) {
    setActiveUsername(member.username);
  }

  return (
    <main className="h-screen w-screen bg-slate-100 dark:bg-slate-950">
      <div className="grid h-full grid-cols-2 divide-x divide-slate-200 dark:divide-white/10">
        <MemberListPanel
          members={members}
          isLoading={membersLoading}
          error={membersError}
          activeUsername={activeUsername}
          onSelectMember={handleSelectMember}
        />
        <FaceAuthPanel
          videoRef={videoRef}
          cameraStatus={cameraStatus}
          cameraError={cameraError}
          faceApiReady={faceApiStatus === "ready"}
          members={members}
          enrolledFaces={mergedEnrolledFaces}
          onEnroll={enroll}
          onSelectMember={handleSelectMember}
          isPaused={activeMember !== null}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </div>

      {faceApiError && (
        <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-rose-100 px-4 py-2 text-xs text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
          FaceAPI エラー: {faceApiError}
        </p>
      )}

      {activeMember && (
        <AttendanceActionSheet
          member={activeMember}
          onClose={() => setActiveUsername(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </main>
  );
}
