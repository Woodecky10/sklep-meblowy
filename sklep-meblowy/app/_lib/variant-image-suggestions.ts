// Podpowiedzi zdjęć dla edytora produktu: URL-e już przypisane do wartości
// opcji wariantów (`value_images`) WSZYSTKICH produktów. Admin wybiera z nich
// zamiast wgrywać ten sam plik (np. rysunek stelaża) przy każdym produkcie.
// Czysty moduł bez importów server-only (wzorzec product-features.ts) —
// wejście defensywne, bo to surowy JSONB z Supabase.
//
// Świadomie POMIJAMY opcję „Tkanina" (EXCLUDED_OPTION_SLUGS): zdjęcie mebla
// w konkretnej tkaninie nie nadaje się do ponownego użycia, a przy ~20
// tkaninach × produkty lista miałaby setki pozycji. Galerie produktów
// (`products.images`) też nie są źródłem — decyzja właściciela w specu.

import {
  EXCLUDED_OPTION_SLUGS,
  displayOptionName,
  normalizeOptionName,
  optionParamSlug,
} from "./option-filter";
import { normalizeSearchText } from "./search-normalize";

export type VariantImageSuggestion = {
  url: string;
  // Wartość opcji i nazwa produktu z PIERWSZEGO wystąpienia URL-a — służą
  // wyłącznie za podpis miniatury („Drewniany · ROMA").
  value: string;
  productName: string;
};

export type VariantImageGroup = {
  // normalizeOptionName(nazwa) — klucz grupowania i dopasowania kontekstu.
  key: string;
  // Forma wyświetlana w nagłówku grupy („STELAŻ" → „Stelaż").
  name: string;
  images: VariantImageSuggestion[];
};

export function collectVariantImageSuggestions(
  rows: { name: unknown; variants: unknown }[]
): VariantImageGroup[] {
  const groups = new Map<string, VariantImageGroup>();
  // Dedupe GLOBALNY: ten sam URL wisi w wielu produktach (bliźniaki rozmiarowe
  // współdzielą zdjęcia), a w wybieraku ma być jedna miniatura.
  const seenUrls = new Set<string>();

  for (const rawRow of rows) {
    const productName =
      typeof rawRow.name === "string" ? rawRow.name.trim() : "";
    const variants = rawRow.variants;
    if (!variants || typeof variants !== "object") continue;
    const options = (variants as { options?: unknown }).options;
    if (!Array.isArray(options)) continue;

    for (const rawOption of options) {
      if (!rawOption || typeof rawOption !== "object") continue;
      const rawName = (rawOption as { name?: unknown }).name;
      if (typeof rawName !== "string") continue;
      const key = normalizeOptionName(rawName);
      if (!key || EXCLUDED_OPTION_SLUGS.has(optionParamSlug(rawName))) continue;
      const valueImages = (rawOption as { value_images?: unknown }).value_images;
      if (!valueImages || typeof valueImages !== "object") continue;

      for (const [rawValue, urls] of Object.entries(
        valueImages as Record<string, unknown>
      )) {
        if (!Array.isArray(urls)) continue;
        for (const url of urls) {
          if (typeof url !== "string" || !url.trim()) continue;
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);
          // Grupa powstaje dopiero przy pierwszym zdjęciu — dzięki temu opcje
          // bez zdjęć nie tworzą pustych nagłówków w wybieraku.
          let group = groups.get(key);
          if (!group) {
            group = { key, name: displayOptionName(rawName), images: [] };
            groups.set(key, group);
          }
          group.images.push({ url, value: rawValue.trim(), productName });
        }
      }
    }
  }

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

// Grupa zgodna z opcją, z której otwarto wybierak, idzie na początek
// (otwarte z „STELAŻ" → stelaże pierwsze). Reszta zachowuje kolejność.
export function sortGroupsForContext(
  groups: VariantImageGroup[],
  contextOptionName: string | null | undefined
): VariantImageGroup[] {
  const ctx = contextOptionName ? normalizeOptionName(contextOptionName) : "";
  if (!ctx) return groups;
  const match = groups.filter((g) => g.key === ctx);
  if (match.length === 0) return groups;
  return [...match, ...groups.filter((g) => g.key !== ctx)];
}

// Szukajka wybieraka: wszystkie tokeny zapytania muszą wystąpić w „nazwa opcji
// + wartość + produkt" (po normalizeSearchText → bez diakrytyków, dowolna
// kolejność słów). Grupy bez trafień wypadają.
export function filterGroups(
  groups: VariantImageGroup[],
  query: string
): VariantImageGroup[] {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return groups;
  const out: VariantImageGroup[] = [];
  for (const group of groups) {
    const images = group.images.filter((img) => {
      const haystack = normalizeSearchText(
        `${group.name} ${img.value} ${img.productName}`
      );
      return tokens.every((t) => haystack.includes(t));
    });
    if (images.length > 0) out.push({ ...group, images });
  }
  return out;
}
