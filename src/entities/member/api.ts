import { fetch } from "@tauri-apps/plugin-http";

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

export async function fetchMembers(
  getEndpoint: string,
  apiToken: string,
): Promise<Member[]> {
  if (import.meta.env.DEV) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return DUMMY_MEMBERS;
  }

  let response: Response;
  try {
    response = await fetch(getEndpoint, {
      headers: { Authorization: apiToken },
    });
  } catch (err) {
    // @tauri-apps/plugin-http の fetch は Rust(reqwest)側からリクエストするため
    // ブラウザのCORS制約は受けない。ここに来るのはDNS解決失敗・TLSエラー・
    // タイムアウト等、純粋なネットワーク/接続レベルの失敗。
    console.error("[fetchMembers] 接続エラー:", err);
    throw new Error(
      `サーバーに接続できませんでした: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(
      `[fetchMembers] HTTPエラー: status=${response.status} body=${body.slice(0, 200)}`,
    );
    throw new Error(`メンバー一覧の取得に失敗しました: ${response.status}`);
  }
  return response.json();
}

/**
 * メンバーAPIエンドポイントが生きているかどうかの起動時チェック。
 * 開発時はダミーデータ運用のため実際の通信は行わず、常に成功扱いにする。
 */
export async function checkMembersApiAlive(
  getEndpoint: string,
  apiToken: string,
): Promise<boolean> {
  if (import.meta.env.DEV) return true;
  if (!getEndpoint) return false;

  try {
    // fetchMembers と同じ Authorization ヘッダーを付けないと、認証必須の
    // エンドポイントでは常に 401 になり実際の疎通状況を反映できない。
    const response = await fetch(getEndpoint, {
      headers: { Authorization: apiToken },
    });
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
    console.log("[開発者モード] 特徴ベクトル登録(送信スキップ)", {
      username,
      descriptor,
    });
    return;
  }

  const response = await fetch(`${postEndpoint}/${username}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // fetchMembers / checkMembersApiAlive と同じく、設定画面には
      // "Bearer xxx" の形で丸ごと入力してもらう運用のため、ここで "Bearer "
      // を重ねて付けない(付けると "Bearer Bearer xxx" になってしまう)。
      Authorization: apiToken,
    },
    body: JSON.stringify({ descriptor }),
  });

  if (!response.ok) {
    throw new Error(`特徴ベクトルの登録に失敗しました: ${response.status}`);
  }
}
