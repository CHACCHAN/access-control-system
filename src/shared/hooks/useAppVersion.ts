import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";

/**
 * tauri.conf.json (ひいては Cargo.toml) のバージョンを取得する。
 * バージョン番号をフロントエンド側に決め打ちしないためのフック。
 */
export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    getVersion().then(setVersion).catch(() => setVersion(null));
  }, []);

  return version;
}
