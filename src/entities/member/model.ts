/** 在室管理サーバーと画面全体で共有するメンバーモデル。 */
export const ATTENDANCE_STATUSES = ["在室", "外出", "帰宅"] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface Member {
  username: string;
  name: string;
  status: AttendanceStatus;
  /** ArcFace embedding。旧データなど512次元以外はRust側で照合対象外になる。 */
  descriptor?: number[];
}

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

/**
 * 外部APIのJSONをランタイムでも検証する。
 * TypeScriptの型注釈だけでは不正なstatus等を防げず、描画時のクラッシュに
 * つながるため、信頼境界でMemberへ変換する。
 */
export function parseMembers(payload: unknown): Member[] {
  if (!Array.isArray(payload)) {
    throw new Error("メンバー一覧APIの応答が配列ではありません");
  }
  if (payload.length > 10_000) {
    throw new Error("メンバー一覧APIの件数が上限(10000件)を超えています");
  }

  const usernames = new Set<string>();

  return payload.map((value, index) => {
    if (!value || typeof value !== "object") {
      throw new Error(`メンバー一覧APIの ${index + 1} 件目がオブジェクトではありません`);
    }

    const candidate = value as Record<string, unknown>;
    if (typeof candidate.username !== "string" || candidate.username.trim() === "") {
      throw new Error(`メンバー一覧APIの ${index + 1} 件目に有効なusernameがありません`);
    }
    if (!usernames.add(candidate.username)) {
      throw new Error(`メンバー一覧APIにusernameの重複があります: ${candidate.username}`);
    }
    if (typeof candidate.name !== "string" || candidate.name.trim() === "") {
      throw new Error(`メンバー一覧APIの ${index + 1} 件目に有効なnameがありません`);
    }
    if (!isAttendanceStatus(candidate.status)) {
      throw new Error(
        `メンバー一覧APIの ${index + 1} 件目に不正なstatusがあります: ${String(candidate.status)}`,
      );
    }

    const descriptor = candidate.descriptor;
    if (
      descriptor !== undefined &&
      descriptor !== null &&
      (!Array.isArray(descriptor) || !descriptor.every((item) => typeof item === "number" && Number.isFinite(item)))
    ) {
      throw new Error(`メンバー一覧APIの ${index + 1} 件目に不正なdescriptorがあります`);
    }
    if (Array.isArray(descriptor) && descriptor.length > 4096) {
      throw new Error(`メンバー一覧APIの ${index + 1} 件目のdescriptorが長すぎます`);
    }

    return {
      username: candidate.username,
      name: candidate.name,
      status: candidate.status,
      ...(Array.isArray(descriptor) ? { descriptor: descriptor as number[] } : {}),
    };
  });
}
