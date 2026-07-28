// Slug tkaniny do /tkaniny/[slug] — czysty moduł (testowalny bez DB).
// Ta sama semantyka co backfill w migracji 56. Generowany raz przy tworzeniu
// tkaniny, stabilny przy zmianie nazwy (URL-e nie pękają).
import { slugifyTitle } from "./pages";

export function fabricSlug(name: string, taken: Set<string>): string {
  const base = slugifyTitle(name) || "tkanina";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
