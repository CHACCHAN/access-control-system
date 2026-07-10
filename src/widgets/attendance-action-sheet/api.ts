// 在室状況更新の API 呼び出し。fetch は shared/lib/httpClient の httpFetch を
// 使い、実機(Tauri)では Rust(reqwest)経由・開発時(ブラウザ)ではブラウザ標準の
// fetch で、いずれも設定画面に入力したエンドポイントへ実際に通信する。
import { httpFetch } from "@/shared/lib/httpClient";
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
  if (!attendanceEndpoint) {
    throw new Error("在室状況更新APIが未設定です。設定画面で入力してください");
  }

  const body = applyBodyTemplate(bodyTemplate, { username, name, status: action });
  console.log(`[postAttendance] POST ${attendanceEndpoint}`, body);
  const response = await httpFetch(attendanceEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // 設定画面には "Bearer xxx" の形で丸ごと入力してもらう運用のため、
      // ここで "Bearer " を重ねて付けない。
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
