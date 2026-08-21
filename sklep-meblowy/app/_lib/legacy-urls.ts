// Stare adresy z czasów, gdy każda tkanina była płaską podstroną: /tkanina-woolly.
// Dziś tkaniny żyją pod /tkaniny/<slug>, więc stare adresy dają 404 — a Google
// je nadal indeksuje. Trasa app/[slug] używa tego helpera, żeby zamienić taki
// 404 na przekierowanie 308 (patrz app/[slug]/page.tsx).
const LEGACY_FABRIC_RE = /^tkanina-(.+)$/;

// Wyłuskuje slug tkaniny ze starego adresu; null dla każdego innego sluga.
// Samo dopasowanie nie znaczy, że tkanina istnieje — to sprawdza wywołujący.
export function legacyFabricSlug(slug: string): string | null {
  return LEGACY_FABRIC_RE.exec(slug)?.[1] ?? null;
}
