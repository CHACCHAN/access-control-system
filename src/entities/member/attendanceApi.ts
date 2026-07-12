import { httpFetch } from "@/shared/lib/httpClient";
import { applyBodyTemplate } from "@/shared/lib/apiBodyTemplate";
import type { AttendanceStatus } from "./model";

/** 在室状況更新API。タップ・顔認証・ジェスチャーの全経路から再利用する。 */
export async function postAttendance(
  username: string,
  name: string,
  status: AttendanceStatus,
  attendanceEndpoint: string,
  apiToken: string,
  bodyTemplate: string,
): Promise<void> {
  if (!attendanceEndpoint) {
    throw new Error("在室状況更新APIが未設定です。設定画面で入力してください");
  }

  const body = applyBodyTemplate(bodyTemplate, { username, name, status });
  console.log(`[postAttendance] POST ${attendanceEndpoint}`, body);
  const response = await httpFetch(attendanceEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiToken,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      `[postAttendance] HTTPエラー: status=${response.status} body=${detail.slice(0, 200)}`,
    );
    throw new Error(
      `在室状況の更新に失敗しました: ${response.status}${detail ? ` ${detail.slice(0, 120)}` : ""}`,
    );
  }
  console.log(`[postAttendance] ${username} の在室状況を ${status} に更新しました`);
}
