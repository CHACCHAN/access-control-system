import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useCamera, type CameraStatus } from "@/shared/hooks/useCamera";
import { useFaceApiModels } from "@/shared/hooks/useFaceApiModels";
import { useMembers } from "@/entities/member/MemberContext";
import type { Member } from "@/entities/member/api";

export interface EnrolledFace {
  username: string;
  descriptor: Float32Array;
}

interface FaceAuthContextValue {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraStatus: CameraStatus;
  cameraError: string | null;
  faceApiReady: boolean;
  faceApiError: string | null;
  enrolledFaces: EnrolledFace[];
  enroll: (username: string, descriptor: Float32Array) => void;
}

const FaceAuthContext = createContext<FaceAuthContextValue | null>(null);

/**
 * 顔認証まわりの状態(カメラ映像・FaceAPIモデルのロード状況・登録済み顔特徴)を
 * まとめて扱う Provider。カメラを起動するので、ブートチェック完了後にのみ
 * マウントすること(マウント自体が起動トリガーを兼ねる)。
 *
 * API からメンバーに顔特徴ベクトルが提供されている場合はそれを初期値とし、
 * このセッション中にその場で登録した顔情報で上書きする。
 */
export function FaceAuthProvider({ children }: { children: ReactNode }) {
  const { videoRef, status: cameraStatus, error: cameraError } = useCamera();
  const { status: faceApiStatus, error: faceApiError } = useFaceApiModels();
  const { members } = useMembers();
  const [registeredFaces, setRegisteredFaces] = useState<EnrolledFace[]>([]);

  const enrolledFaces = useMemo(() => {
    const byUsername = new Map<string, EnrolledFace>(
      members
        .filter((m): m is Member & { descriptor: number[] } => !!m.descriptor?.length)
        .map((m) => [m.username, { username: m.username, descriptor: new Float32Array(m.descriptor) }]),
    );
    for (const face of registeredFaces) {
      byUsername.set(face.username, face);
    }
    return [...byUsername.values()];
  }, [members, registeredFaces]);

  function enroll(username: string, descriptor: Float32Array) {
    setRegisteredFaces((prev) => [
      ...prev.filter((f) => f.username !== username),
      { username, descriptor },
    ]);
  }

  return (
    <FaceAuthContext.Provider
      value={{
        videoRef,
        cameraStatus,
        cameraError,
        faceApiReady: faceApiStatus === "ready",
        faceApiError,
        enrolledFaces,
        enroll,
      }}
    >
      {children}
    </FaceAuthContext.Provider>
  );
}

export function useFaceAuth(): FaceAuthContextValue {
  const ctx = useContext(FaceAuthContext);
  if (!ctx) throw new Error("useFaceAuth は <FaceAuthProvider> の内側で使用してください");
  return ctx;
}
