import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSettings } from "@/shared/hooks/useSettings";
import { fetchMembers } from "./api";
import type { AttendanceStatus, Member } from "./model";

interface MemberContextValue {
  members: Member[];
  isLoading: boolean;
  error: string | null;
  activeMember: Member | null;
  selectMember: (member: Member) => void;
  clearSelection: () => void;
  clearSelectionIf: (username: string) => void;
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
  const requestRef = useRef<{
    key: string;
    controller: AbortController;
    promise: Promise<void>;
  } | null>(null);
  const queuedRefetchRef = useRef(false);
  const localStatusRevisionRef = useRef(0);

  // showSpinner: 初回読み込みだけスケルトン表示にし、WebSocket 更新シグナルなど
  // による裏側での再取得ではメンバー一覧がちらつかないようにする
  const loadMembers = useCallback(
    (showSpinner: boolean) => {
      const requestKey = `${settings.getEndpoint}\0${settings.apiToken}`;
      const inFlight = requestRef.current;
      if (inFlight?.key === requestKey) {
        // WebSocket通知のburstで通信を中断し続けない。処理中はdirtyだけを立て、
        // 完了後に高々1回の追従取得へまとめる。
        queuedRefetchRef.current = true;
        return inFlight.promise;
      }

      // 接続設定が変わった場合だけ旧endpointへの通信を中断する。
      if (inFlight) {
        requestRef.current = null;
        inFlight.controller.abort();
      }
      queuedRefetchRef.current = false;
      const controller = new AbortController();
      const statusRevision = localStatusRevisionRef.current;
      if (showSpinner) setIsLoading(true);
      const promise = fetchMembers(settings.getEndpoint, settings.apiToken, controller.signal)
        .then((data) => {
          if (requestRef.current?.controller !== controller || controller.signal.aborted) return;
          // このGET開始後にローカル更新が成功していれば、開始前のサーバー状態で
          // 画面を巻き戻さず、完了後の追従GETへ任せる。
          if (statusRevision !== localStatusRevisionRef.current) {
            queuedRefetchRef.current = true;
            return;
          }
          setMembers(data);
          setError(null);
        })
        .catch((err) => {
          if (requestRef.current?.controller !== controller || controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (requestRef.current?.controller !== controller) return;
          requestRef.current = null;
          // 背景更新が初回ロードを引き継いだ場合もスケルトンを確実に解除する。
          setIsLoading(false);
          if (queuedRefetchRef.current) {
            queuedRefetchRef.current = false;
            void loadMembers(false);
          }
        });
      requestRef.current = { key: requestKey, controller, promise };
      return promise;
    },
    [settings.getEndpoint, settings.apiToken],
  );

  const refetch = useCallback(() => {
    void loadMembers(false);
  }, [loadMembers]);

  useEffect(() => {
    // 設定(取得先エンドポイント)の読み込みが終わるまでは問い合わせない
    if (isSettingsLoading) return;
    void loadMembers(true);
  }, [isSettingsLoading, loadMembers]);

  useEffect(
    () => () => {
      const inFlight = requestRef.current;
      requestRef.current = null;
      queuedRefetchRef.current = false;
      inFlight?.controller.abort();
    },
    [],
  );

  const activeMember = useMemo(
    () => members.find((m) => m.username === activeUsername) ?? null,
    [members, activeUsername],
  );

  const selectMember = useCallback((member: Member) => {
    setActiveUsername(member.username);
  }, []);

  const clearSelection = useCallback(() => {
    setActiveUsername(null);
  }, []);

  const clearSelectionIf = useCallback((username: string) => {
    setActiveUsername((current) => (current === username ? null : current));
  }, []);

  const updateStatus = useCallback((username: string, status: AttendanceStatus) => {
    localStatusRevisionRef.current += 1;
    if (requestRef.current) queuedRefetchRef.current = true;
    setMembers((prev) => prev.map((m) => (m.username === username ? { ...m, status } : m)));
  }, []);

  const value = useMemo<MemberContextValue>(
    () => ({
      members,
      isLoading,
      error,
      activeMember,
      selectMember,
      clearSelection,
      clearSelectionIf,
      updateStatus,
      refetch,
    }),
    [
      members,
      isLoading,
      error,
      activeMember,
      selectMember,
      clearSelection,
      clearSelectionIf,
      updateStatus,
      refetch,
    ],
  );

  return (
    <MemberContext.Provider value={value}>{children}</MemberContext.Provider>
  );
}

export function useMembers(): MemberContextValue {
  const ctx = useContext(MemberContext);
  if (!ctx) throw new Error("useMembers は <MemberProvider> の内側で使用してください");
  return ctx;
}
