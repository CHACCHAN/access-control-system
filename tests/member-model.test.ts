import { describe, expect, test } from "bun:test";
import { parseMembers } from "../src/entities/member/model";

describe("parseMembers", () => {
  test("有効なAPI応答をMemberへ変換する", () => {
    expect(
      parseMembers([
        { username: "alice", name: "Alice", status: "在室", descriptor: [0.1, 0.2] },
      ]),
    ).toEqual([
      { username: "alice", name: "Alice", status: "在室", descriptor: [0.1, 0.2] },
    ]);
  });

  test("不正なstatusを描画層へ通さない", () => {
    expect(() => parseMembers([{ username: "alice", name: "Alice", status: "不明" }])).toThrow(
      "不正なstatus",
    );
  });

  test("非有限または非数値のdescriptorを拒否する", () => {
    expect(() =>
      parseMembers([
        { username: "alice", name: "Alice", status: "在室", descriptor: ["0.1"] },
      ]),
    ).toThrow("不正なdescriptor");
    expect(() =>
      parseMembers([{ username: "alice", name: "Alice", status: "在室", descriptor: [NaN] }]),
    ).toThrow("不正なdescriptor");
  });
});
