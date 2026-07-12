import { invoke } from "@tauri-apps/api/core";

export function shutdownComputer(): Promise<void> {
  return invoke("shutdown_computer");
}

export function restartComputer(): Promise<void> {
  return invoke("restart_computer");
}

export function exitToShell(): Promise<void> {
  return invoke("exit_app");
}
