export interface Member {
  username: string;
  name: string;
}

const MEMBERS_API_URL = "https://portal.naka.ai.chibatech.ac.jp/api/members";

const DUMMY_MEMBERS: Member[] = [
  { username: "dummy.student01", name: "ダミー 太郎" },
  { username: "dummy.student02", name: "ダミー 花子" },
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
