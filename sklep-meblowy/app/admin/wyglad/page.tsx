import { getThemeSettingsUncached } from "@/app/_lib/theme-settings";
import ThemeEditor from "./ThemeEditor";

// Panel admina jest PL-only. Guard w layoucie; akcje wołają requireAdmin().
export default async function AdminThemePage() {
  const settings = await getThemeSettingsUncached();
  return <ThemeEditor initialSettings={settings} />;
}
