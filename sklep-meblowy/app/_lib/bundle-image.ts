// Własne zdjęcie zestawu (migracja 85, właściciel 2026-11-04). Czysta logika
// bez I/O — wgrywanie i kasowanie plików żyje w app/admin/zestawy/actions.ts.
//
// Pliki lądują w istniejącym publicznym buckecie zdjęć produktów, w osobnym
// folderze. Kasujemy WYŁĄCZNIE pliki z tego folderu: gdyby w kolumnie kiedyś
// stanął adres zdjęcia produktu (ręczny wpis w bazie, import), podmiana
// zdjęcia zestawu nie może skasować zdjęcia z galerii produktu.
export const BUNDLE_IMAGE_BUCKET = "products";
export const BUNDLE_IMAGE_PREFIX = "zestawy/";

const PUBLIC_MARKER = `/storage/v1/object/public/${BUNDLE_IMAGE_BUCKET}/`;

// Ścieżka pliku w buckecie do usunięcia albo null, gdy adres nie jest naszym
// plikiem zestawu (pusty, zewnętrzny, inny bucket, inny folder, „../").
export function bundleImageStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const idx = url.indexOf(PUBLIC_MARKER);
  if (idx === -1) return null;
  const path = url.slice(idx + PUBLIC_MARKER.length).split(/[?#]/)[0];
  if (!path.startsWith(BUNDLE_IMAGE_PREFIX) || path.includes("..")) return null;
  return path.length > BUNDLE_IMAGE_PREFIX.length ? path : null;
}
