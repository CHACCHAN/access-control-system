import { checkMembersApiAlive } from "@/entities/member/api";
import { loadFaceApiModels } from "@/shared/hooks/useFaceApiModels";
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
    id: "face-models",
    label: "顔認証モデル",
    run: () =>
      loadFaceApiModels().then(
        () => ({ ok: true }),
        (err) => ({ ok: false, detail: err instanceof Error ? err.message : String(err) }),
      ),
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
