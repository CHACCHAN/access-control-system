import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { SettingsProvider } from "@/shared/hooks/useSettings";
import { ThemeProvider } from "@/shared/theme/ThemeContext";
import { installConsoleCapture } from "@/shared/lib/eventLog";

// 通信系ログ・console.log出力を設定画面の「ログ」タブで見られるように、
// 描画開始前(できるだけ早いタイミング)でキャプチャを仕込む。
installConsoleCapture();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
