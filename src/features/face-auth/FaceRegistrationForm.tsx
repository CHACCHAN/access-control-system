import { useEffect, useRef, useState } from "react";
import { useMembers } from "@/entities/member/MemberContext";
import { registerDescriptor } from "@/entities/member/api";
import { useSettings } from "@/shared/hooks/useSettings";
import { captureFaceEmbedding } from "@/shared/lib/visionApi";
import { playUiSound } from "@/shared/lib/uiSound";
import { useFaceAuth } from "./FaceAuthContext";
import { CheckIcon, CloseIcon, ScanFaceIcon } from "@/shared/ui/icons";

interface FaceRegistrationFormProps {
  onClose: () => void;
}

type CaptureState = "idle" | "capturing" | "success" | "error";

// 操作されないまま放置された場合に、自動的に認証モードへ戻すまでの時間
const IDLE_TIMEOUT_MS = 60_000;

/**
 * 顔登録フォーム。従来はカメラ映像へ被せるオーバーレイだったが、登録中も
 * 右側で顔検出の可視化を続けたいため、左パネル(メンバー一覧の位置)に
 * 差し替えて表示する。右側のカメラを見ながら自分の名前を選んで登録できる。
 */
export function FaceRegistrationForm({ onClose }: FaceRegistrationFormProps) {
  const { members } = useMembers();
  const { settings } = useSettings();
  const customBg = settings.appearance.registerPanelBg;
  const { visionReady, enroll } = useFaceAuth();
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
    return m.name.toLowerCase().includes(query) || m.username.toLowerCase().includes(query);
  });

  async function handleCapture() {
    if (!selectedUsername) {
      setMessage("登録するメンバーを選択してください");
      return;
    }
    if (!visionReady) return;

    setCaptureState("capturing");
    setMessage(null);

    try {
      // 顔検出〜embedding抽出はRust側で行う。顔が写っていない・小さすぎる
      // 場合はメッセージ付きのエラーが返る。
      const { embedding } = await captureFaceEmbedding();

      await registerDescriptor(
        selectedUsername,
        embedding,
        settings.postEndpoint,
        settings.apiToken,
        settings.descriptorBodyTemplate,
      );
      enroll(selectedUsername, embedding);
      playUiSound("success");
      setCaptureState("success");
      setMessage("顔情報を登録しました");
      setTimeout(onClose, 1200);
    } catch (err) {
      playUiSound("error");
      setCaptureState("error");
      setMessage(`登録に失敗しました: ${String(err)}`);
    }
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col gap-4 bg-slate-50/60 p-6 dark:bg-transparent"
      // background ショートハンドで既定色ごと上書きする(未設定はテーマ既定)
      style={customBg ? { background: customBg } : undefined}
    >
      <header className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <ScanFaceIcon className="h-5 w-5 text-cyan-500 dark:text-cyan-400" />
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-cyan-600/80 dark:text-cyan-400/70">
              // enroll
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              顔を登録する
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              右のカメラを見ながらメンバーを選んで登録します
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-cyan-400/50 hover:text-cyan-600 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 dark:shadow-none dark:hover:border-cyan-400/50 dark:hover:text-cyan-300"
          aria-label="登録をやめる"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="名前・ユーザー名で検索"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/15"
      />

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white/60 dark:border-white/10 dark:bg-slate-950/40">
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
                ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
            }`}
          >
            <span>{m.name}</span>
            <span className="font-mono text-xs text-slate-400 dark:text-slate-500">
              @{m.username}
            </span>
          </button>
        ))}
      </div>

      <button
        onClick={handleCapture}
        disabled={!visionReady || captureState === "capturing" || captureState === "success"}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 py-3 text-sm font-semibold text-slate-950 shadow-glow transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
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
          className={`text-xs ${
            captureState === "error"
              ? "text-rose-600 dark:text-rose-400"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {message}
        </p>
      )}
    </section>
  );
}
