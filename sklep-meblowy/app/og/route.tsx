import { ImageResponse } from "next/og";
import { COMPANY } from "@/app/_lib/company";
import { OG_BRAND_TAGLINE, ogBrandPalette } from "@/app/_lib/seo-og";
import { getThemeSettings } from "@/app/_lib/theme-settings";
import { getOgImageUrl } from "@/app/_lib/og-image-settings";
import { getActiveSlides } from "@/app/_lib/slides";
import { loadOgPhotoDataUri, ogPhotoCandidates } from "@/app/_lib/og-image";

// Brandowy obrazek udostępnień (og:image) — PNG 1200×630.
//
// TREŚĆ: zdjęcie mebla na całą powierzchnię, BEZ napisów. Facebook renderuje
// pod obrazkiem własny pasek z domeną i tytułem strony, więc tekst na grafice
// byłby drugim nagłówkiem w tym samym kafelku. Napisy zostają wyłącznie na
// karcie awaryjnej, gdy nie ma żadnego zdjęcia.
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
// żądaniu). Dane czytamy przez unstable_cache z tagami ("theme", "og-image",
// "home-slides"), unieważnianymi w panelu — dzięki temu obrazek przerysowuje
// się po zmianie, bez czekania na deploy. NIE używamy `force-static`:
// zamroziłoby zdjęcie i paletę na wersję z buildu.
//
// UWAGA: 3600 to GÓRNA granica, nie faktyczny odstęp. Next bierze minimum
// z route'a i cache'ów w środku, a getActiveSlides ma revalidate 60 — dlatego
// `next build` raportuje dla /og "1m". Nawet gdyby propagacja tagów zawiodła,
// obrazek dogoni zmianę w minutę.
export const revalidate = 3600;

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

export async function GET() {
  const [theme, configuredUrl, slides] = await Promise.all([
    getThemeSettings(),
    getOgImageUrl(),
    // Slajdy to tylko siatka bezpieczeństwa — ich brak nie może wywrócić route'a.
    getActiveSlides().catch(() => []),
  ]);

  const photo = await loadOgPhotoDataUri(
    ogPhotoCandidates(
      configuredUrl,
      slides.map((s) => s.imageUrl)
    )
  );

  if (photo) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%" }}>
          {/* Zdjęcie wypełnia cały kadr; `cover` przycina nadmiar zamiast
              dokładać pasy — kafelek ma być pełen obrazu, nie letterboxem.
              To JSX Satoriego rysowany do PNG, a NIE DOM: next/image nie ma tu
              zastosowania, a tekst alternatywny podglądu niesie `alt`
              z OG_BRAND_IMAGE (seo-og.ts), nie ten element. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            src={photo}
            width={OG_WIDTH}
            height={OG_HEIGHT}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      ),
      { width: OG_WIDTH, height: OG_HEIGHT }
    );
  }

  // ŚCIEŻKA AWARYJNA: brak zdjęcia w panelu, brak slajdów, albo żaden plik nie
  // nadawał się do narysowania. Lepiej karta z nazwą marki niż udostępnienie
  // bez obrazka. Satori nie zna zmiennych CSS — potrzebuje literałów, więc
  // tokeny motywu rozwiązujemy do konkretnych hexów.
  const { background, accent, text } = ogBrandPalette(theme);

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
            {OG_BRAND_TAGLINE}
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
    { width: OG_WIDTH, height: OG_HEIGHT }
  );
}
