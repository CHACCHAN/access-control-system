import { describe, expect, test } from "bun:test";
import { normalizeSettings } from "../src/shared/hooks/useSettings";
import {
  RESTART_REQUIRED_ITEMS,
  restartRequiredChanges,
  type RestartRequiredItem,
} from "../src/widgets/settings-page/restartPolicy";

describe("restartRequiredChanges", () => {
  const saved = normalizeSettings({});

  test("既定では再起動が必要な項目は無い(全設定が保存だけで即時反映される)", () => {
    expect(RESTART_REQUIRED_ITEMS).toHaveLength(0);
    const draft = normalizeSettings({
      getEndpoint: "https://example.com/api",
      wsEndpoint: "wss://example.com/ws",
      uiScale: 1.2,
    });
    expect(restartRequiredChanges(saved, draft)).toEqual([]);
  });

  test("登録された項目のうち、変更があったものだけをラベルで報告する", () => {
    const items: RestartRequiredItem[] = [
      { label: "UI スケール", changed: (s, d) => s.uiScale !== d.uiScale },
      { label: "変更なし項目", changed: () => false },
    ];
    const draft = normalizeSettings({ uiScale: 1.2 });
    expect(restartRequiredChanges(saved, draft, items)).toEqual(["UI スケール"]);
    expect(restartRequiredChanges(saved, saved, items)).toEqual([]);
  });
});
