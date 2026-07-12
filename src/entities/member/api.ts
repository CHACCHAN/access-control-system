// メンバー取得・顔特徴ベクトル登録の API 呼び出し。
// fetch は shared/lib/httpClient の httpFetch を使い、実機(Tauri)では
// Rust(reqwest)経由で CORS 制約を受けずに、開発時(ブラウザ)ではブラウザ標準の
// fetch で、いずれも「設定画面に入力したエンドポイント」へ実際に通信する。
import { httpFetch } from "@/shared/lib/httpClient";
import { applyBodyTemplate } from "@/shared/lib/apiBodyTemplate";

export type AttendanceStatus = "在室" | "外出" | "帰宅";

export interface Member {
  username: string;
  name: string;
  status: AttendanceStatus;
  descriptor?: number[];
}

export async function fetchMembers(
  getEndpoint: string,
  apiToken: string,
): Promise<Member[]> {
  if (!getEndpoint) {
    throw new Error(
      "メンバー取得APIが未設定です。設定画面でエンドポイントを入力して保存してください",
    );
  }

  let response: Response;
  try {
    response = await httpFetch(getEndpoint, {
      headers: { Authorization: apiToken },
    });
  } catch (err) {
    // DNS解決失敗・TLSエラー・タイムアウト等、純粋なネットワーク/接続レベルの失敗。
    // (実機の plugin-http は CORS 制約を受けないが、開発時のブラウザ fetch は
    //  CORS 制約を受けるため、ここに来ることがある)
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
 * エンドポイント未設定の場合は疎通不可(false)として扱う。
 */
export async function checkMembersApiAlive(
  getEndpoint: string,
  apiToken: string,
): Promise<boolean> {
  if (!getEndpoint) return false;

  try {
    // fetchMembers と同じ Authorization ヘッダーを付けないと、認証必須の
    // エンドポイントでは常に 401 になり実際の疎通状況を反映できない。
    const response = await httpFetch(getEndpoint, {
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
  if (!postEndpoint) {
    throw new Error("顔特徴ベクトル登録APIが未設定です。設定画面で入力してください");
  }

  const body = applyBodyTemplate(bodyTemplate, { username, descriptor });
  console.log(`[registerDescriptor] POST ${postEndpoint}/${username}`, body);
  const response = await httpFetch(`${postEndpoint}/${username}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // 設定画面には "Bearer xxx" の形で丸ごと入力してもらう運用のため、
      // ここで "Bearer " を重ねて付けない(付けると "Bearer Bearer xxx" になる)。
      Authorization: apiToken,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // サーバーの拒否理由(例: pgvector のカラムが VECTOR(128) のままで 512次元を
    // 受け付けない等)をそのまま出せるよう、レスポンスボディも添えて投げる。
    const errorBody = await response.text().catch(() => "");
    console.error(
      `[registerDescriptor] HTTPエラー: status=${response.status} body=${errorBody.slice(0, 200)}`,
    );
    throw new Error(
      `特徴ベクトルの登録に失敗しました: ${response.status}${
        errorBody ? ` ${errorBody.slice(0, 120)}` : ""
      }`,
    );
  }
  console.log(`[registerDescriptor] ${username} の登録に成功しました`);
}
