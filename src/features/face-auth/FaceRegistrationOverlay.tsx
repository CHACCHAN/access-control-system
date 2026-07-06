import { useEffect, useRef, useState } from "react";
import * as faceapi from "@vladmandic/face-api";
import { useMembers } from "@/entities/member/MemberContext";
import { registerDescriptor } from "@/entities/member/api";
import { useSettings } from "@/shared/hooks/useSettings";
import { useFaceAuth } from "./FaceAuthContext";
import { ArrowUpIcon, CheckIcon, CloseIcon, ScanFaceIcon } from "@/shared/ui/icons";

interface FaceRegistrationOverlayProps {
  onClose: () => void;
}

type CaptureState = "idle" | "capturing" | "success" | "error";

// 操作されないまま放置された場合に、自動的に認証モードへ戻すまでの時間
const IDLE_TIMEOUT_MS = 60_000;

export function FaceRegistrationOverlay({ onClose }: FaceRegistrationOverlayProps) {
  const { members } = useMembers();
  const { settings } = useSettings();
  const { videoRef, faceApiReady, enroll } = useFaceAuth();
  const [selectedUsername, setSelectedUsername] = useState(members[0]?.username ?? "");
  const [search, setSearch] = useState("");
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onCloseRef.current();
    }, IDLE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [search, selectedUsername, captureState]);

  const filteredMembers = members.filter((m) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      m.name.toLowerCase().includes(query) || m.username.toLowerCase().includes(query)
    );
  });

  async function handleCapture() {
    if (!selectedUsername) {
      setMessage("登録するメンバーを選択してください");
      return;
    }
    const video = videoRef.current;
    if (!video || !faceApiReady) return;

    setCaptureState("capturing");
    setMessage(null);

    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setCaptureState("error");
        setMessage("顔が検出できませんでした。カメラに正面を向けてください");
        return;
      }

      await registerDescriptor(
        selectedUsername,
        Array.from(detection.descriptor),
        settings.postEndpoint,
        settings.apiToken,
      );
      enroll(selectedUsername, detection.descriptor);
      setCaptureState("success");
      setMessage("顔情報を登録しました");
      setTimeout(onClose, 1200);
    } catch (err) {
      setCaptureState("error");
      setMessage(`登録に失敗しました: ${String(err)}`);
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-linear-to-t from-white/95 via-white/60 to-transparent p-6 animate-fade-in dark:from-slate-950/95 dark:via-slate-950/60 dark:to-transparent">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/70 p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        aria-label="閉じる"
      >
        <CloseIcon className="h-5 w-5" />
      </button>

      {captureState !== "success" && (
        <div className="pointer-events-none fixed inset-x-0 top-8 z-50 flex justify-center animate-fade-in">
          <div className="flex flex-col items-center gap-3">
            <ArrowUpIcon className="h-14 w-14 animate-bounce text-sky-500 dark:text-sky-400" />
            <p className="rounded-full bg-white/90 px-6 py-2.5 text-lg font-semibold text-slate-700 shadow-lg backdrop-blur dark:bg-slate-950/80 dark:text-slate-200">
              カメラを見てください
            </p>
          </div>
        </div>
      )}

      <div className="animate-slide-up rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-slate-900/90">
        <div className="flex items-center gap-2 text-slate-900 dark:text-slate-200">
          <ScanFaceIcon className="h-5 w-5 text-sky-500 dark:text-sky-400" />
          <h3 className="text-base font-semibold">新しい顔を登録する</h3>
        </div>

        <label className="mt-4 block text-xs font-medium text-slate-500 dark:text-slate-400">
          登録するメンバー
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="名前・ユーザー名で検索"
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
        />

        <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-800/60">
          {filteredMembers.length === 0 && (
            <p className="px-3 py-3 text-xs text-slate-400 dark:text-slate-500">
              該当するメンバーが見つかりません
            </p>
          )}
          {filteredMembers.map((m) => (
            <button
              key={m.username}
              type="button"
              onClick={() => setSelectedUsername(m.username)}
              className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition ${
                m.username === selectedUsername
                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
              }`}
            >
              <span>{m.name}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">@{m.username}</span>
            </button>
          ))}
        </div>

        <button
          onClick={handleCapture}
          disabled={!faceApiReady || captureState === "capturing" || captureState === "success"}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {captureState === "capturing" ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              解析中...
            </>
          ) : captureState === "success" ? (
            <>
              <CheckIcon className="h-4 w-4" />
              登録完了
            </>
          ) : (
            "この顔を登録する"
          )}
        </button>

        {message && (
          <p
            className={`mt-3 text-xs ${
              captureState === "error"
                ? "text-rose-600 dark:text-rose-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
