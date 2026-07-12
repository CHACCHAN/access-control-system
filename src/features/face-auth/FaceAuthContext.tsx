import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useCamera, type CameraStatus } from "@/shared/hooks/useCamera";
import { useNativeCameraFeed } from "@/shared/hooks/useNativeCameraFeed";
import { initVision, setEnrolledFaces } from "@/shared/lib/visionApi";
import { useMembers } from "@/entities/member/MemberContext";
import type { Member } from "@/entities/member/api";

export interface EnrolledFace {
  username: string;
  /** ArcFace 512次元 embedding(Rust側で抽出したもの) */
  embedding: number[];
}

// 開発時(ブラウザ/webview上のデバッグ)は <video> + getUserMedia、実機(Tauri)は
// Rust側がv4l2から取得したフレームを <img> で表示するため、要素の種類が異なる。
// どちらの場合も「表示専用」であり、検出・認識はRust側が独自にフレームを読む。
export type FaceMediaElement = HTMLVideoElement | HTMLImageElement;
export type FaceMediaKind = "video" | "img";

interface FaceAuthContextValue {
  mediaRef: RefObject<FaceMediaElement | null>;
  /** 実機(img)のみ: ちらつき対策のダブルバッファ裏面 */
  mediaBufferRef?: RefObject<HTMLImageElement | null>;
  mediaKind: FaceMediaKind;
  cameraStatus: CameraStatus;
  cameraError: string | null;
  /** Rust側の推論基盤(ONNXモデル)の準備状況 */
  visionReady: boolean;
  visionError: string | null;
  enrolledFaces: EnrolledFace[];
  enroll: (username: string, embedding: number[]) => void;
}

const FaceAuthContext = createContext<FaceAuthContextValue | null>(null);

interface CameraFeed {
  mediaRef: RefObject<FaceMediaElement | null>;
  mediaBufferRef?: RefObject<HTMLImageElement | null>;
  mediaKind: FaceMediaKind;
  status: CameraStatus;
  error: string | null;
}

/**
 * カメラ以外(推論基盤の初期化・登録済み顔特徴のRust側への同期)の共通ロジック。
 * カメラの取得方法(ブラウザ版/Tauriネイティブ版)によらず、この内側は共通。
 */
function FaceAuthProviderInner({
  camera,
  children,
}: {
  camera: CameraFeed;
  children: ReactNode;
}) {
  const { members } = useMembers();
  const [registeredFaces, setRegisteredFaces] = useState<EnrolledFace[]>([]);
  const [visionReady, setVisionReady] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);

  // Rust側の推論基盤(ONNX Runtime + モデル)を初期化する。ブートチェックで
  // 既に初期化済みなら即座に返る(Rust側で冪等)。
  useEffect(() => {
    let cancelled = false;
    initVision()
      .then(() => {
        if (!cancelled) setVisionReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        // ブラウザ単体実行(UI開発)ではRustバックエンドが存在せず必ず失敗する。
        // その場合はエラーバナーを出さず、認識機能が無効なまま表示だけ行う。
        if (isTauri()) {
          setVisionError(err instanceof Error ? err.message : String(err));
        } else {
          console.warn("[face-auth] ブラウザ実行のため推論基盤は利用できません:", err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enrolledFaces = useMemo(() => {
    const byUsername = new Map<string, EnrolledFace>(
      members
        .filter((m): m is Member & { descriptor: number[] } => !!m.descriptor?.length)
        .map((m) => [m.username, { username: m.username, embedding: m.descriptor }]),
    );
    for (const face of registeredFaces) {
      byUsername.set(face.username, face);
    }
    return [...byUsername.values()];
  }, [members, registeredFaces]);

  // 照合対象の embedding 一覧が変わるたびにRust側へ同期する。
  // 照合そのもの(全件コサイン類似度)はRust側で行う。
  useEffect(() => {
    setEnrolledFaces(
      enrolledFaces.map((f) => ({ username: f.username, embedding: f.embedding })),
    )
      .then((accepted) => {
        console.log(`[face-auth] 登録済み顔をRust側へ同期: ${accepted}/${enrolledFaces.length}件`);
      })
      .catch((err) => {
        console.error("[face-auth] 登録済み顔の同期に失敗:", err);
      });
  }, [enrolledFaces]);

  function enroll(username: string, embedding: number[]) {
    setRegisteredFaces((prev) => [
      ...prev.filter((f) => f.username !== username),
      { username, embedding },
    ]);
  }

  return (
    <FaceAuthContext.Provider
      value={{
        mediaRef: camera.mediaRef,
        mediaBufferRef: camera.mediaBufferRef,
        mediaKind: camera.mediaKind,
        cameraStatus: camera.status,
        cameraError: camera.error,
        visionReady,
        visionError,
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
  const { imgRef, imgBufferRef, status, error } = useNativeCameraFeed();
  return (
    <FaceAuthProviderInner
      camera={{
        mediaRef: imgRef,
        mediaBufferRef: imgBufferRef,
        mediaKind: "img",
        status,
        error,
      }}
    >
      {children}
    </FaceAuthProviderInner>
  );
}

/**
 * 顔認証まわりの状態(カメラ映像・Rust推論基盤の初期化状況・登録済み顔特徴)を
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
