import type { AttendanceStatus } from "@/entities/member/api";

export type AttendanceAction = AttendanceStatus;

export async function postAttendance(
  username: string,
  action: AttendanceAction,
): Promise<{ success: true }> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  console.info("[dummy] postAttendance", { username, action });
  return { success: true };
}
