// Walidacja plików obrazów wgrywanych w panelu admina (audyt 2026-06-11 LOW).
// SVG jest CELOWO wykluczony — może nieść <script>/onload i daje stored XSS na
// cross-origin domenie Supabase Storage (serwowanej bez naszego CSP). Wcześniej
// akceptowaliśmy dowolne file.type startsWith("image/") + ufaliśmy nazwie pliku.
//
// Rozszerzenie bierzemy z (allowlistowanego) mime, nie z nazwy pliku — żeby
// "evil.svg" przesłany jako image/png nie wylądował z rozszerzeniem .svg.

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Węższa allowlista dla kafelka udostępnień (og:image). Satori — renderer
// next/og — rasteryzuje wyłącznie JPEG i PNG; na WebP i AVIF wywala się
// błędem "u2 is not iterable", co zgasiłoby og:image na WSZYSTKICH stronach.
// Panel konwertuje wgrany plik do JPEG jeszcze w przeglądarce, więc ta stała
// jest drugą bramką — na wypadek wysyłki z pominięciem UI.
export const OG_IMAGE_MIME = ["image/jpeg", "image/png"] as const;

export type ImageValidation =
  | { ok: true; file: File; ext: string; contentType: string }
  | { ok: false; error: string };

export function validateImageUpload(
  file: unknown,
  maxBytes: number = MAX_IMAGE_BYTES,
  allowedMime: readonly string[] = Object.keys(MIME_TO_EXT)
): ImageValidation {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Brak pliku" };
  }
  const ext = allowedMime.includes(file.type) ? MIME_TO_EXT[file.type] : undefined;
  if (!ext) {
    const nazwy = allowedMime.map((m) => MIME_TO_EXT[m]?.toUpperCase() ?? m).join(", ");
    return {
      ok: false,
      error: `Dozwolone formaty: ${nazwy} (SVG i inne niedozwolone)`,
    };
  }
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `Zdjęcie jest za duże (max ${Math.round(maxBytes / 1024 / 1024)} MB)`,
    };
  }
  return { ok: true, file, ext, contentType: file.type };
}
