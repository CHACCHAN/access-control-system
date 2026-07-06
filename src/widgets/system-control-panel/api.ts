import { invoke } from "@tauri-apps/api/core";

export async function shutdownComputer(): Promise<void> {
  await invoke("shutdown_computer");
}

export async function restartComputer(): Promise<void> {
  await invoke("restart_computer");
}
