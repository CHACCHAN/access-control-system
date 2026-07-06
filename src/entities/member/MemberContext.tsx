import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useSettings } from "@/shared/hooks/useSettings";
import { fetchMembers, type AttendanceStatus, type Member } from "./api";

interface MemberContextValue {
  members: Member[];
  isLoading: boolean;
  error: string | null;
  activeMember: Member | null;
  selectMember: (member: Member) => void;
  clearSelection: () => void;
  updateStatus: (username: string, status: AttendanceStatus) => void;
  refetch: () => void;
}

const MemberContext = createContext<MemberContextValue | null>(null);

/**
 * メンバー一覧の取得・在室状況の更新・選択中メンバーをまとめて扱う Provider。
 * メンバー一覧を必要とする画面(一覧・顔認証・出席操作)はここから直接参照する。
 */
export function MemberProvider({ children }: { children: ReactNode }) {
  const { settings, isLoading: isSettingsLoading } = useSettings();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeUsername, setActiveUsername] = useState<string | null>(null);

  // showSpinner: 初回読み込みだけスケルトン表示にし、WebSocket 更新シグナルなど
  // による裏側での再取得ではメンバー一覧がちらつかないようにする
  const loadMembers = useCallback(
    (showSpinner: boolean) => {
      if (showSpinner) setIsLoading(true);
      return fetchMembers(settings.getEndpoint, settings.apiToken)
        .then((data) => {
          setMembers(data);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => {
          if (showSpinner) setIsLoading(false);
        });
    },
    [settings.getEndpoint, settings.apiToken],
  );

  const refetch = useCallback(() => {
    loadMembers(false);
  }, [loadMembers]);

  useEffect(() => {
    // 設定(取得先エンドポイント)の読み込みが終わるまでは問い合わせない
    if (isSettingsLoading) return;
    loadMembers(true);
  }, [isSettingsLoading, loadMembers]);

  const activeMember = members.find((m) => m.username === activeUsername) ?? null;

  function selectMember(member: Member) {
    setActiveUsername(member.username);
  }

  function clearSelection() {
    setActiveUsername(null);
  }

  function updateStatus(username: string, status: AttendanceStatus) {
    setMembers((prev) => prev.map((m) => (m.username === username ? { ...m, status } : m)));
  }

  return (
    <MemberContext.Provider
      value={{
        members,
        isLoading,
        error,
        activeMember,
        selectMember,
        clearSelection,
        updateStatus,
        refetch,
      }}
    >
      {children}
    </MemberContext.Provider>
  );
}

export function useMembers(): MemberContextValue {
  const ctx = useContext(MemberContext);
  if (!ctx) throw new Error("useMembers は <MemberProvider> の内側で使用してください");
  return ctx;
}
