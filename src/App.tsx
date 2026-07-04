import { useState } from "react";
import { LeftSideContent } from "./components/LeftSideContent";
import { RightSideContent } from "./components/RightSideContent";
import { AttendanceActionSheet } from "./components/AttendanceActionSheet";
import { useCamera } from "./hooks/useCamera";
import { useFaceApi } from "./hooks/useFaceApi";
import { useEnrolledFaces } from "./hooks/useEnrolledFaces";
import { useMembers } from "./hooks/useMembers";
import type { Member } from "./api/members";
import "./App.css";

export default function App() {
  const { videoRef, status: cameraStatus, error: cameraError } = useCamera();
  const { status: faceApiStatus, error: faceApiError } = useFaceApi();
  const { enrolledFaces, enroll } = useEnrolledFaces();
  const { members, isLoading: membersLoading, error: membersError } = useMembers();
  const [activeMember, setActiveMember] = useState<Member | null>(null);

  return (
    <main className="h-screen w-screen bg-slate-950">
      <div className="grid h-full grid-cols-2 divide-x divide-white/10">
        <LeftSideContent
          members={members}
          isLoading={membersLoading}
          error={membersError}
          activeUsername={activeMember?.username ?? null}
          onSelectMember={setActiveMember}
        />
        <RightSideContent
          videoRef={videoRef}
          cameraStatus={cameraStatus}
          cameraError={cameraError}
          faceApiReady={faceApiStatus === "ready"}
          members={members}
          enrolledFaces={enrolledFaces}
          onEnroll={enroll}
          onSelectMember={setActiveMember}
          isPaused={activeMember !== null}
        />
      </div>

      {faceApiError && (
        <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-rose-500/10 px-4 py-2 text-xs text-rose-400">
          FaceAPI エラー: {faceApiError}
        </p>
      )}

      {activeMember && (
        <AttendanceActionSheet member={activeMember} onClose={() => setActiveMember(null)} />
      )}
    </main>
  );
}
