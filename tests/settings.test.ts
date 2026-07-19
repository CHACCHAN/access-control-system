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
    // 連続一致回数の上限は実質無制限(入力ミス対策の9999のみ)
    expect(settings.performance.recognitionStableCount).toBe(999);
    expect(settings.performance.cameraJpegQuality).toBe(DEFAULT_PERFORMANCE.cameraJpegQuality);
  });

  test("連続一致回数の0と負数は1へクランプする", () => {
    const settings = normalizeSettings({
      performance: {
        ...DEFAULT_PERFORMANCE,
        recognitionStableCount: 0,
        gestureStableCount: -3,
      },
    });
    expect(settings.performance.recognitionStableCount).toBe(1);
    expect(settings.performance.gestureStableCount).toBe(1);
  });

  test("連続一致回数のNaNは既定値へ戻す", () => {
    const settings = normalizeSettings({
      performance: {
        ...DEFAULT_PERFORMANCE,
        recognitionStableCount: Number.NaN,
        gestureStableCount: Number.NaN,
      },
    });
    expect(settings.performance.recognitionStableCount).toBe(
      DEFAULT_PERFORMANCE.recognitionStableCount,
    );
    expect(settings.performance.gestureStableCount).toBe(DEFAULT_PERFORMANCE.gestureStableCount);
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
      { name: "ポータルサイト", url: "https://portal.example.com", headers: [] },
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
      { name: "Wiki", url: "https://wiki.example.com", headers: [] },
      { name: "", url: "https://a.example.com", headers: [] },
    ]);
  });

  test("外部サイトのHTTPヘッダーを正規化する(名前が空の行・不正型は除去)", () => {
    const settings = normalizeSettings({
      externalSites: [
        {
          name: "Portal",
          url: "https://portal.example.com",
          headers: [
            { name: " Authorization ", value: "Bearer xyz" },
            { name: "", value: "orphan-value" },
            { name: "X-Api-Key", value: 123 },
            "invalid",
          ],
        },
        // headers 未定義の旧データは空配列で補完
        { name: "Wiki", url: "https://wiki.example.com" },
      ],
    });
    expect(settings.externalSites[0].headers).toEqual([
      { name: "Authorization", value: "Bearer xyz" },
      { name: "X-Api-Key", value: "" },
    ]);
    expect(settings.externalSites[1].headers).toEqual([]);
  });

  test("ジェスチャーのカウントダウン秒数を0〜10へクランプする", () => {
    expect(normalizeSettings({}).gestureCountdownSeconds).toBe(3);
    expect(normalizeSettings({ gestureCountdownSeconds: 0 }).gestureCountdownSeconds).toBe(0);
    expect(normalizeSettings({ gestureCountdownSeconds: 99 }).gestureCountdownSeconds).toBe(10);
    expect(normalizeSettings({ gestureCountdownSeconds: -5 }).gestureCountdownSeconds).toBe(0);
    expect(
      normalizeSettings({ gestureCountdownSeconds: Number.NaN }).gestureCountdownSeconds,
    ).toBe(3);
    expect(normalizeSettings({ gestureCountdownSeconds: 2.6 }).gestureCountdownSeconds).toBe(3);
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
