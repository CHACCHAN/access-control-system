export type AttendanceAction = "present" | "away" | "home";

export interface AttendanceActionOption {
  action: AttendanceAction;
  label: string;
}

export const ATTENDANCE_ACTIONS: AttendanceActionOption[] = [
  { action: "present", label: "在室" },
  { action: "away", label: "外出" },
  { action: "home", label: "帰宅" },
];

export async function postAttendance(
  username: string,
  action: AttendanceAction,
): Promise<{ success: true }> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  console.info("[dummy] postAttendance", { username, action });
  return { success: true };
}
