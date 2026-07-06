import type { ReactNode } from "react";
import { MemberProvider } from "@/entities/member/MemberContext";
import { FaceAuthProvider } from "@/features/face-auth/FaceAuthContext";

/**
 * ブートチェック完了後の画面が必要とする Context をまとめてマウントするラッパー。
 * FaceAuthProvider はカメラを起動するため、ブート完了後にのみマウントされる
 * このコンポーネントの内側に置く。
 *
 * 依存関係: FaceAuthProvider は内部で useMembers() を参照するため、
 * 必ず MemberProvider より内側に配置すること。
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MemberProvider>
      <FaceAuthProvider>{children}</FaceAuthProvider>
    </MemberProvider>
  );
}
