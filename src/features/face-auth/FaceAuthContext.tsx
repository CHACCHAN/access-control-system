import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useCamera, type CameraStatus } from "@/shared/hooks/useCamera";
import { useNativeCameraFeed } from "@/shared/hooks/useNativeCameraFeed";
import { useFaceApiModels } from "@/shared/hooks/useFaceApiModels";
import { useMembers } from "@/entities/member/MemberContext";
import type { Member } from "@/entities/member/api";

export interface EnrolledFace {
  username: string;
  descriptor: Float32Array;
}

// 開発時(ブラウザ/webview上のデバッグ)は <video> + getUserMedia、実機(Tauri)は
// Rust側がv4l2から取得したフレームを <img> で表示するため、要素の種類が異なる。
// face-api.js はどちらも TNetInput として直接受け付けられるので、呼び出し側は
// mediaKind を意識する必要があれば参照し、そうでなければ mediaRef をそのまま渡せばよい。
export type FaceMediaElement = HTMLVideoElement | HTMLImageElement;
export type FaceMediaKind = "video" | "img";

interface FaceAuthContextValue {
  mediaRef: RefObject<FaceMediaElement | null>;
  mediaKind: FaceMediaKind;
  cameraStatus: CameraStatus;
  cameraError: string | null;
  faceApiReady: boolean;
  faceApiError: string | null;
  enrolledFaces: EnrolledFace[];
  enroll: (username: string, descriptor: Float32Array) => void;
}

const FaceAuthContext = createContext<FaceAuthContextValue | null>(null);

interface CameraFeed {
  mediaRef: RefObject<FaceMediaElement | null>;
  mediaKind: FaceMediaKind;
  status: CameraStatus;
  error: string | null;
}

/**
 * カメラ以外(FaceAPIモデル・登録済み顔特徴)の共通ロジック。カメラの取得方法
 * (ブラウザ版/Tauriネイティブ版)によらず、この内側は完全に共通。
 */
function FaceAuthProviderInner({
  camera,
  children,
}: {
  camera: CameraFeed;
  children: ReactNode;
}) {
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
        mediaRef: camera.mediaRef,
        mediaKind: camera.mediaKind,
        cameraStatus: camera.status,
        cameraError: camera.error,
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

function BrowserFaceAuthProvider({ children }: { children: ReactNode }) {
  const { videoRef, status, error } = useCamera();
  return (
    <FaceAuthProviderInner camera={{ mediaRef: videoRef, mediaKind: "video", status, error }}>
      {children}
    </FaceAuthProviderInner>
  );
}

function NativeFaceAuthProvider({ children }: { children: ReactNode }) {
  const { imgRef, status, error } = useNativeCameraFeed();
  return (
    <FaceAuthProviderInner camera={{ mediaRef: imgRef, mediaKind: "img", status, error }}>
      {children}
    </FaceAuthProviderInner>
  );
}

/**
 * 顔認証まわりの状態(カメラ映像・FaceAPIモデルのロード状況・登録済み顔特徴)を
 * まとめて扱う Provider。カメラを起動するので、ブートチェック完了後にのみ
 * マウントすること(マウント自体が起動トリガーを兼ねる)。
 *
 * API からメンバーに顔特徴ベクトルが提供されている場合はそれを初期値とし、
 * このセッション中にその場で登録した顔情報で上書きする。
 *
 * カメラの取得方法は実行環境で分岐する(isTauri() はプロセス起動中に変化
 * しないため、これは実質的に「どちらのコンポーネントを描画するか」という
 * 通常の条件付きレンダリングであり、フックの呼び出し順を壊さない)。
 */
export function FaceAuthProvider({ children }: { children: ReactNode }) {
  return isTauri() ? (
    <NativeFaceAuthProvider>{children}</NativeFaceAuthProvider>
  ) : (
    <BrowserFaceAuthProvider>{children}</BrowserFaceAuthProvider>
  );
}

export function useFaceAuth(): FaceAuthContextValue {
  const ctx = useContext(FaceAuthContext);
  if (!ctx) throw new Error("useFaceAuth は <FaceAuthProvider> の内側で使用してください");
  return ctx;
}
