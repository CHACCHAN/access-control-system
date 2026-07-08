// この fetch() は @tauri-apps/plugin-http のものを使う(グローバルの
// window.fetch を上書きしている)。Rust(reqwest)側からリクエストするため
// ブラウザのCORS制約を受けない(entities/member/api.ts と同じ理由)。
import { fetch } from "@tauri-apps/plugin-http";
import type { AttendanceStatus } from "@/entities/member/api";
import { applyBodyTemplate } from "@/shared/lib/apiBodyTemplate";

export type AttendanceAction = AttendanceStatus;

export async function postAttendance(
  username: string,
  name: string,
  action: AttendanceAction,
  attendanceEndpoint: string,
  apiToken: string,
  bodyTemplate: string,
): Promise<{ success: true }> {
  if (import.meta.env.DEV) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    console.log("[開発者モード] 在室状況更新(送信スキップ)", { username, name, action });
    return { success: true };
  }

  const body = applyBodyTemplate(bodyTemplate, { username, name, status: action });
  console.log(`[postAttendance] POST ${attendanceEndpoint}`, body);
  const response = await fetch(attendanceEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // entities/member/api.ts と同じく、設定画面には "Bearer xxx" の形で
      // 丸ごと入力してもらう運用のため、ここで "Bearer " を重ねて付けない。
      Authorization: apiToken,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error(`[postAttendance] HTTPエラー: status=${response.status}`);
    throw new Error(`在室状況の更新に失敗しました: ${response.status}`);
  }
  console.log(`[postAttendance] ${username} の在室状況を ${action} に更新しました`);
  return { success: true };
}
