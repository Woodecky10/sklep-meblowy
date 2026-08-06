import { getThemeSettingsUncached } from "@/app/_lib/theme-settings";
import { getOgImageUrlUncached } from "@/app/_lib/og-image-settings";
import ThemeEditor from "./ThemeEditor";
import OgImageCard from "./OgImageCard";

// Panel admina jest PL-only. Guard w layoucie; akcje wołają requireAdmin().
export default async function AdminThemePage() {
  const [settings, ogImageUrl] = await Promise.all([
    getThemeSettingsUncached(),
    getOgImageUrlUncached(),
  ]);
  return (
    <>
      <ThemeEditor initialSettings={settings} />
      {/* Kafelek udostępnień siedzi tu, a nie w ThemeEditor: to osobny zapis
          (własna akcja i własny tag cache), więc nie ma go po co wciągać
          w formularz motywu. */}
      <div className="mt-8">
        <OgImageCard initialUrl={ogImageUrl} />
      </div>
    </>
  );
}
