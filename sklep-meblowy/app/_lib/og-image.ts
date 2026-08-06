// Czyste helpery kafelka udostępnień (og:image) — bez I/O, w całości testowalne.
// Konsument: app/og/route.tsx.
//
// DLACZEGO SNIFFUJEMY MAGIC BYTES, A NIE UFAMY ROZSZERZENIU:
// dwa niezależne powody, oba potwierdzone na żywym storage.
//
// 1. Satori (renderer `next/og`) rasteryzuje TYLKO JPEG i PNG. WebP i AVIF
//    wywalają render błędem "u2 is not iterable" — sprawdzone renderem testowym.
//    Panel dopuszcza WebP/AVIF przy innych uploadach (validateImageUpload), więc
//    obrazek podany tutaj musi przejść własną bramkę. Bez niej jeden plik
//    zgasiłby og:image na WSZYSTKICH stronach (route rzuca → 500 → brak obrazka).
// 2. Nazwy plików w buckecie kłamią: obiekt `…-82deb531….png` ma w środku JPEG
//    (magic ffd8ff). Sprawdzanie końcówki URL-a dawałoby fałszywe wyniki
//    w obie strony.

export type SniffedMime = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

// Formaty, które Satori faktycznie narysuje. Reszta ma trafić na fallback,
// a nie w błąd renderu.
export const OG_RENDERABLE_MIME = ["image/jpeg", "image/png"] as const;
export type OgRenderableMime = (typeof OG_RENDERABLE_MIME)[number];

function matches(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

const ASCII = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = ASCII("RIFF");
const WEBP = ASCII("WEBP");
const FTYP = ASCII("ftyp");
const AVIF_BRANDS = [ASCII("avif"), ASCII("avis")];

// Rozpoznaje format po zawartości. Zwraca null dla wszystkiego, czego nie znamy
// (w tym dla wejścia za krótkiego na sygnaturę) — wołający ma wtedy zejść na
// kolejnego kandydata, nie zgadywać.
export function sniffImageMime(bytes: Uint8Array): SniffedMime | null {
  if (matches(bytes, 0, JPEG)) return "image/jpeg";
  if (matches(bytes, 0, PNG)) return "image/png";
  // WebP: kontener RIFF z typem WEBP na pozycji 8.
  if (matches(bytes, 0, RIFF) && matches(bytes, 8, WEBP)) return "image/webp";
  // AVIF: pudełko ISO-BMFF `ftyp` na pozycji 4, marka na pozycji 8.
  if (matches(bytes, 4, FTYP) && AVIF_BRANDS.some((b) => matches(bytes, 8, b))) {
    return "image/avif";
  }
  return null;
}

export function isOgRenderable(mime: SniffedMime | null): mime is OgRenderableMime {
  return mime === "image/jpeg" || mime === "image/png";
}

// Kolejność prób dla zdjęcia na kafelku:
//   1. zdjęcie wskazane jawnie w /admin/wyglad (store_settings.og_image_url),
//   2. pierwszy aktywny slajd hero ze zdjęciem — wyłącznie jako siatka
//      bezpieczeństwa, gdy admin jeszcze nic nie wybrał.
//
// Slajd NIE jest ścieżką główną: kadr og:image to 1200×630, a slajdy mają
// dowolne proporcje i bywają promocyjne (a promocja wskakuje na pozycję 1
// podczas kampanii). Automat psułby wizytówkę niewidocznie.
//
// Pusta lista = wołający rysuje kartę brandową. Nigdy nie zwracamy pustego
// stringa ani duplikatu — każdy kandydat kosztuje jedno pobranie w renderze.
export function ogPhotoCandidates(
  configuredUrl: string | null | undefined,
  slideImageUrls: readonly (string | null | undefined)[] = []
): string[] {
  const out: string[] = [];
  for (const raw of [configuredUrl, ...slideImageUrls]) {
    if (typeof raw !== "string") continue;
    const url = raw.trim();
    if (!url || out.includes(url)) continue;
    out.push(url);
  }
  return out;
}

// Kafelek nie może wisieć na wolnym storage — po timeoucie schodzimy na
// kolejnego kandydata, a w ostateczności na kartę brandową.
export const OG_FETCH_TIMEOUT_MS = 5000;

// Pobiera pierwsze zdjęcie, które Satori faktycznie narysuje, i oddaje je jako
// `data:` URI. `null` = żaden kandydat się nie nadał → wołający rysuje kartę
// brandową.
//
// DLACZEGO POBIERAMY SAMI, ZAMIAST DAĆ SATORI <img src="https://…">:
// przy zdalnym src błąd sieci albo nieobsługiwany format leci w ŚRODKU renderu
// i wywala cały route → brak og:image na WSZYSTKICH stronach sklepu. Pobranie
// z góry pozwala odrzucić zły plik i narysować kartę awaryjną.
//
// `fetchImpl` jest wstrzykiwane wyłącznie po to, żeby dało się to przetestować
// bez sieci — produkcja używa globalnego fetch.
export async function loadOgPhotoDataUri(
  candidates: readonly string[],
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  for (const url of candidates) {
    try {
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(OG_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn(`[og] pomijam ${url}: HTTP ${res.status}`);
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      // Sniffing po zawartości, NIE po rozszerzeniu — w buckecie są pliki .png
      // z JPEG-iem w środku, a Satori wywala się na WebP i AVIF.
      const mime = sniffImageMime(bytes);
      if (!isOgRenderable(mime)) {
        console.warn(`[og] pomijam ${url}: format ${mime ?? "nieznany"} (tylko JPEG/PNG)`);
        continue;
      }
      return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
    } catch (err) {
      console.warn(`[og] pomijam ${url}: pobranie nieudane`, err);
    }
  }
  return null;
}
