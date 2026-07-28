// Czyste helpery do zarządzania zdjęciami produktów (bez importu supabase/next),
// żeby były testowalne w izolacji.

// Które URL-e zdjęć danego produktu wolno fizycznie skasować ze storage przy
// jego usuwaniu. Duplikacja oferty współdzieli te same URL-e między bliźniakami
// rozmiarowymi (buildDuplicatePayload), więc kasowanie „na ślepo" po URL
// skasowałoby pliki wciąż używane przez inny produkt. Kasujemy tylko te URL-e,
// których NIE ma w zdjęciach żadnego innego produktu. Deduplikuje wejście.
export function imageUrlsToDelete(
  targetImages: string[],
  otherProductsImages: string[][]
): string[] {
  const stillUsed = new Set<string>();
  for (const imgs of otherProductsImages) {
    for (const url of imgs) stillUsed.add(url);
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const url of targetImages) {
    if (seen.has(url) || stillUsed.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

// Czyści value_images opcji przy zapisie wariantów (updateProductVariants):
// zostawia tylko wpisy dla istniejących wartości opcji, tylko poprawne URL-e
// http(s) (max 2000 znaków), bez pustych tablic. Zwraca undefined gdy nic nie
// zostało — klucz znika z JSONB (wzorzec jak value_prices).
export function cleanValueImages(
  values: string[],
  valueImages: unknown
): Record<string, string[]> | undefined {
  if (
    typeof valueImages !== "object" ||
    valueImages === null ||
    Array.isArray(valueImages)
  ) {
    return undefined;
  }
  const valueSet = new Set(values);
  const out: Record<string, string[]> = {};
  for (const [value, urls] of Object.entries(
    valueImages as Record<string, unknown>
  )) {
    if (!valueSet.has(value) || !Array.isArray(urls)) continue;
    const clean = urls.filter(
      (u): u is string =>
        typeof u === "string" &&
        u.length > 0 &&
        u.length <= 2000 &&
        /^https?:\/\//.test(u)
    );
    if (clean.length > 0) out[value] = clean;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// Wszystkie URL-e zdjęć produktu: galeria (images) + zdjęcia wartości opcji
// (variants.options[].value_images). Do czyszczenia Storage przy usuwaniu
// produktu (deleteProduct). Przyjmuje unknown — dane prosto z DB (JSONB może
// mieć dowolny kształt), śmieci są pomijane. Output jest zdeduplikowany
// (pierwsze wystąpienie wygrywa).
export function collectProductImageUrls(
  images: unknown,
  variants: unknown
): string[] {
  const out: string[] = [];
  if (Array.isArray(images)) {
    for (const u of images) {
      if (typeof u === "string" && u) out.push(u);
    }
  }
  const options = (variants as { options?: unknown } | null)?.options;
  if (Array.isArray(options)) {
    for (const opt of options) {
      const vi = (opt as { value_images?: unknown } | null)?.value_images;
      if (typeof vi !== "object" || vi === null || Array.isArray(vi)) continue;
      for (const urls of Object.values(vi)) {
        if (!Array.isArray(urls)) continue;
        for (const u of urls) {
          if (typeof u === "string" && u) out.push(u);
        }
      }
    }
  }
  return [...new Set(out)];
}
