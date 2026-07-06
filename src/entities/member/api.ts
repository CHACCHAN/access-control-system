export type AttendanceStatus = "在室" | "外出" | "帰宅";

export interface Member {
  username: string;
  name: string;
  status: AttendanceStatus;
  descriptor?: number[];
}

const DUMMY_MEMBERS: Member[] = [
  {
    username: "dummy.student01",
    name: "ダミー 太郎",
    descriptor: Array.from({ length: 128 }, () => Math.random() * 2 - 1),
    status: "在室",
  },
  {
    username: "dummy.student02",
    name: "ダミー 花子",
    descriptor: Array.from({ length: 128 }, () => Math.random() * 2 - 1),
    status: "外出",
  },
  {
    username: "dummy.student03",
    name: "ダミー 次郎",
    descriptor: Array.from({ length: 128 }, () => Math.random() * 2 - 1),
    status: "帰宅",
  },
  {
    username: "dummy.student04",
    name: "ダミー 三郎",
    descriptor: Array.from({ length: 128 }, () => Math.random() * 2 - 1),
    status: "在室",
  },
  {
    username: "dummy.student05",
    name: "ダミー 四郎",
    descriptor: Array.from({ length: 128 }, () => Math.random() * 2 - 1),
    status: "帰宅",
  },
  {
    username: "dummy.student06",
    name: "ダミー 五郎",
    descriptor: Array.from({ length: 128 }, () => Math.random() * 2 - 1),
    status: "帰宅",
  },
];

export async function fetchMembers(getEndpoint: string, apiToken: string): Promise<Member[]> {
  if (import.meta.env.DEV) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return DUMMY_MEMBERS;
  }

  const response = await fetch(getEndpoint, {
    headers: { Authorization: apiToken },
  });
  if (!response.ok) {
    throw new Error(`メンバー一覧の取得に失敗しました: ${response.status}`);
  }
  return response.json();
}

/**
 * メンバーAPIエンドポイントが生きているかどうかの起動時チェック。
 * 開発時はダミーデータ運用のため実際の通信は行わず、常に成功扱いにする。
 */
export async function checkMembersApiAlive(getEndpoint: string): Promise<boolean> {
  if (import.meta.env.DEV) return true;
  if (!getEndpoint) return false;

  try {
    const response = await fetch(getEndpoint);
    return response.ok;
  } catch {
    return false;
  }
}

export async function registerDescriptor(
  username: string,
  descriptor: number[],
  postEndpoint: string,
  apiToken: string,
): Promise<void> {
  if (import.meta.env.DEV) {
    console.log("[開発者モード] 特徴ベクトル登録(送信スキップ)", { username, descriptor });
    return;
  }

  const response = await fetch(`${postEndpoint}/${username}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiToken,
    },
    body: JSON.stringify({ descriptor }),
  });

  if (!response.ok) {
    throw new Error(`特徴ベクトルの登録に失敗しました: ${response.status}`);
  }
}
