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
