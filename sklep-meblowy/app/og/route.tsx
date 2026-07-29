import { ImageResponse } from "next/og";
import { COMPANY } from "@/app/_lib/company";
import { ogBrandPalette } from "@/app/_lib/seo-og";
import { getThemeSettings } from "@/app/_lib/theme-settings";

// Brandowy obrazek udostępnień (og:image) — PNG 1200×630.
//
// DLACZEGO ROUTE HANDLER, A NIE app/opengraph-image.tsx:
// konwencja plikowa Next dokłada obrazek TYLKO wtedy, gdy dany segment nie
// ustawia własnego `openGraph.images` (node_modules/next/dist/lib/metadata/
// resolve-metadata.js → mergeStaticMetadata). Nasze strony budują pełny blok OG
// przez baseOpenGraph (musi tak być — Next nadpisuje `openGraph` w całości),
// więc konwencja nigdy by nie zadziałała. Route handler daje STABILNY URL /og,
// który baseOpenGraph wskazuje jawnie.
//
// Wcześniej og:image wskazywał /logo.svg — Facebook, LinkedIn i WhatsApp nie
// renderują SVG, więc każdy udostępniony link szedł bez obrazka.

// `revalidate` włącza prerender (bez tego route liczyłby PNG przy każdym
// żądaniu). Kolory czytamy przez getThemeSettings, którego wpis w cache ma tag
// "theme" unieważniany przez /admin/wyglad — dzięki temu obrazek przerysowuje
// się po zmianie palety, bez czekania na deploy. NIE używamy tu
// `force-static`: zamroziłoby paletę na wersję z buildu.
export const revalidate = 3600;

export async function GET() {
  // Satori nie zna zmiennych CSS — potrzebuje literałów, więc rozwiązujemy
  // tokeny motywu do konkretnych hexów.
  const { background, accent, text } = ogBrandPalette(await getThemeSettings());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background,
          padding: "90px",
        }}
      >
        {/* Delikatna rama w kolorze akcentu — sygnatura marki na podglądzie linku */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderLeft: `6px solid ${accent}`,
            paddingLeft: "56px",
          }}
        >
          <div
            style={{
              fontSize: 108,
              fontWeight: 700,
              color: text,
              letterSpacing: "0.08em",
              lineHeight: 1.05,
            }}
          >
            {COMPANY.brandName.toUpperCase()}
          </div>
          <div
            style={{
              fontSize: 40,
              color: accent,
              marginTop: "28px",
              letterSpacing: "0.02em",
            }}
          >
            Meble tapicerowane na wymiar
          </div>
          <div
            style={{
              fontSize: 30,
              color: text,
              opacity: 0.72,
              marginTop: "44px",
              letterSpacing: "0.16em",
            }}
          >
            {COMPANY.domain.toUpperCase()}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
