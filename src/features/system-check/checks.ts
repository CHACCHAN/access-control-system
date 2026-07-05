import { invoke, isTauri } from "@tauri-apps/api/core";
import { checkMembersApiAlive } from "../../entities/member/api";
import { loadFaceApiModels } from "../../shared/hooks/useFaceApiModels";

export interface BootCheck {
  id: string;
  label: string;
  run: () => Promise<boolean>;
}

// ブラウザ単体で開いている場合(Tauri アプリとして動いていない)はハードウェアを
// 問い合わせようがないため、素通りさせる
async function checkHardware(command: string): Promise<boolean> {
  if (!isTauri()) return true;
  try {
    return await invoke<boolean>(command);
  } catch {
    return false;
  }
}

export const BOOT_CHECKS: BootCheck[] = [
  {
    id: "camera",
    label: "カメラ",
    run: () => checkHardware("check_camera_device"),
  },
  {
    id: "display",
    label: "ディスプレイ",
    run: () => checkHardware("check_display"),
  },
  {
    id: "face-models",
    label: "顔認証モデル",
    run: () => loadFaceApiModels().then(
      () => true,
      () => false,
    ),
  },
  {
    id: "members-api",
    label: "サーバー接続",
    run: checkMembersApiAlive,
  },
];
