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
