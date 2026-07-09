import { isTauri } from "@tauri-apps/api/core";
import { checkMembersApiAlive } from "@/entities/member/api";
import { initVision } from "@/shared/lib/visionApi";
import { loadSettings } from "@/shared/hooks/useSettings";
import {
  checkNetwork,
  loadSystemSpec,
  testAudioOutput,
  testCameraCapture,
  testDisplay,
} from "./hardwareChecks";

export interface BootCheckResult {
  ok: boolean;
  detail?: string;
}

export interface BootCheck {
  id: string;
  label: string;
  run: () => Promise<BootCheckResult>;
}

export const BOOT_CHECKS: BootCheck[] = [
  {
    id: "camera",
    label: "カメラ",
    run: testCameraCapture,
  },
  {
    id: "audio",
    label: "音声出力",
    run: testAudioOutput,
  },
  {
    id: "display",
    label: "ディスプレイ",
    run: testDisplay,
  },
  {
    id: "vision-models",
    label: "顔認証・ジェスチャーモデル",
    run: () => {
      // 推論はRust側(ONNX Runtime)で行う。ブラウザ単体実行(UI開発)では
      // Rustバックエンドが存在しないため、他のハードウェアチェックと同様に省略する。
      if (!isTauri()) {
        return Promise.resolve({ ok: true, detail: "(ブラウザ実行のため省略)" });
      }
      return initVision().then(
        () => ({ ok: true, detail: "ONNXモデルのロード完了" }),
        (err) => ({ ok: false, detail: err instanceof Error ? err.message : String(err) }),
      );
    },
  },
  {
    id: "members-api",
    label: "サーバー接続",
    run: () =>
      loadSettings().then(async (settings) => ({
        ok: await checkMembersApiAlive(settings.getEndpoint, settings.apiToken),
      })),
  },
  {
    id: "network",
    label: "ネットワーク",
    run: checkNetwork,
  },
  {
    id: "system-spec",
    label: "サーバースペック",
    run: loadSystemSpec,
  },
];
