import { describe, expect, test } from "bun:test";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_PERFORMANCE,
  normalizeSettings,
} from "../src/shared/hooks/useSettings";

describe("normalizeSettings", () => {
  test("性能設定を安全な範囲へクランプする", () => {
    const settings = normalizeSettings({
      performance: {
        ...DEFAULT_PERFORMANCE,
        recognitionIntervalMs: 1,
        recognitionStableCount: 999,
        cameraJpegQuality: Number.NaN,
      },
    });
    expect(settings.performance.recognitionIntervalMs).toBe(200);
    expect(settings.performance.recognitionStableCount).toBe(5);
    expect(settings.performance.cameraJpegQuality).toBe(DEFAULT_PERFORMANCE.cameraJpegQuality);
  });

  test("トグルを正規化する(旧保存データはキー欠損)", () => {
    // 旧バージョンの保存データにはトグル系キーが無い → 既定値(有効)で補完
    const migrated = normalizeSettings({ rebootSchedule: "03:00", screenOffMinutes: 15 });
    expect(migrated.rebootScheduleEnabled).toBe(true);
    expect(migrated.screenOffEnabled).toBe(true);
    expect(migrated.presenceDimmingEnabled).toBe(true);

    // 不正型は既定値へ、boolean はそのまま維持
    const settings = normalizeSettings({
      rebootScheduleEnabled: "yes",
      screenOffEnabled: false,
      presenceDimmingEnabled: false,
    });
    expect(settings.rebootScheduleEnabled).toBe(true);
    expect(settings.screenOffEnabled).toBe(false);
    expect(settings.presenceDimmingEnabled).toBe(false);
  });

  test("外部サイト一覧を正規化し、旧portalUrlから移行する", () => {
    // 旧設定(単一 portalUrl)→ 外部サイト1件へ移行
    const migrated = normalizeSettings({ portalUrl: "https://portal.example.com" });
    expect(migrated.externalSites).toEqual([
      { name: "ポータルサイト", url: "https://portal.example.com" },
    ]);

    // 一覧が既にあれば portalUrl は無視。不正な要素・空行は除去、型も正規化
    const settings = normalizeSettings({
      portalUrl: "https://old.example.com",
      externalSites: [
        { name: "Wiki", url: "https://wiki.example.com" },
        { name: "", url: "" },
        "invalid",
        { name: 123, url: "https://a.example.com" },
      ],
    });
    expect(settings.externalSites).toEqual([
      { name: "Wiki", url: "https://wiki.example.com" },
      { name: "", url: "https://a.example.com" },
    ]);
  });

  test("不正なenumとパネル背景を既定値へ戻す", () => {
    const settings = normalizeSettings({
      theme: "invalid",
      appearance: {
        ...DEFAULT_APPEARANCE,
        backgroundPattern: "invalid",
        memberPanelBg: "url(https://example.com/image.png)",
      },
    });
    expect(settings.theme).toBe("dark");
    expect(settings.appearance.backgroundPattern).toBe(DEFAULT_APPEARANCE.backgroundPattern);
    expect(settings.appearance.memberPanelBg).toBe("");
  });
});
