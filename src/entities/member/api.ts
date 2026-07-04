export type AttendanceStatus = "在室" | "外出" | "帰宅";

export interface Member {
  username: string;
  name: string;
  status: AttendanceStatus;
  descriptor?: number[];
}

const MEMBERS_API_URL = "https://portal.naka.ai.chibatech.ac.jp/api/members";

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

export async function fetchMembers(): Promise<Member[]> {
  if (import.meta.env.DEV) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return DUMMY_MEMBERS;
  }

  const response = await fetch(MEMBERS_API_URL);
  if (!response.ok) {
    throw new Error(`メンバー一覧の取得に失敗しました: ${response.status}`);
  }
  return response.json();
}
