// このファイル内の fetch() は全て @tauri-apps/plugin-http のものを使う
// (グローバルの window.fetch を上書きしている)。GET(fetchMembers /
// checkMembersApiAlive)だけでなく POST(registerDescriptor)も含め、
// ファイル内の全リクエストが Rust(reqwest)側から行われるため、
// ブラウザのCORS制約を受けない。
import { fetch } from "@tauri-apps/plugin-http";
import { applyBodyTemplate } from "@/shared/lib/apiBodyTemplate";

export type AttendanceStatus = "在室" | "外出" | "帰宅";

export interface Member {
  username: string;
  name: string;
  status: AttendanceStatus;
  descriptor?: number[];
}

const DUMMY_STATUSES: AttendanceStatus[] = ["在室", "外出", "帰宅"];
// メンバーが多い場合のレイアウト(スクロール等)を開発時にも確認できるよう、
// ある程度の件数をまとめて生成する。
const DUMMY_MEMBER_COUNT = 40;

const DUMMY_MEMBERS: Member[] = Array.from({ length: DUMMY_MEMBER_COUNT }, (_, i) => {
  const n = i + 1;
  return {
    username: `dummy.student${String(n).padStart(2, "0")}`,
    name: `ダミー ${n}号`,
    descriptor: Array.from({ length: 128 }, () => Math.random() * 2 - 1),
    status: DUMMY_STATUSES[i % DUMMY_STATUSES.length],
  };
});

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
  const members: Member[] = await response.json();
  console.log(`[fetchMembers] ${members.length}件取得しました`);
  return members;
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
    console.log(`[checkMembersApiAlive] status=${response.status}`);
    return response.ok;
  } catch (err) {
    console.error("[checkMembersApiAlive] 接続エラー:", err);
    return false;
  }
}

export async function registerDescriptor(
  username: string,
  descriptor: number[],
  postEndpoint: string,
  apiToken: string,
  bodyTemplate: string,
): Promise<void> {
  if (import.meta.env.DEV) {
    console.log("[開発者モード] 特徴ベクトル登録(送信スキップ)", {
      username,
      descriptor,
    });
    return;
  }

  const body = applyBodyTemplate(bodyTemplate, { username, descriptor });
  console.log(`[registerDescriptor] POST ${postEndpoint}/${username}`, body);
  const response = await fetch(`${postEndpoint}/${username}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // fetchMembers / checkMembersApiAlive と同じく、設定画面には
      // "Bearer xxx" の形で丸ごと入力してもらう運用のため、ここで "Bearer "
      // を重ねて付けない(付けると "Bearer Bearer xxx" になってしまう)。
      Authorization: apiToken,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error(`[registerDescriptor] HTTPエラー: status=${response.status}`);
    throw new Error(`特徴ベクトルの登録に失敗しました: ${response.status}`);
  }
  console.log(`[registerDescriptor] ${username} の登録に成功しました`);
}
