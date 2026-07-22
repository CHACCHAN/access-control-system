import { useTheme } from "../theme/ThemeContext";
import { IconButton } from "./IconButton";
import { MoonIcon, SunIcon } from "./icons";

export function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();

  return (
    <IconButton
      label={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
      onClick={toggleTheme}
    >
      {theme === "dark" ? <SunIcon className="h-4.5 w-4.5" /> : <MoonIcon className="h-4.5 w-4.5" />}
    </IconButton>
  );
}
