import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { SettingsProvider } from "@/shared/hooks/useSettings";
import { ThemeProvider } from "@/shared/theme/ThemeContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
