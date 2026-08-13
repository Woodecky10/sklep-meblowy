// Wzornik do zamawiania próbek — czysta warstwa nad katalogiem tkanin.
//
// BEZ importów serwerowych: te funkcje wołane są z komponentu klienckiego
// (app/probki/SampleForm.tsx) przy każdym znaku wpisanym w wyszukiwarkę, więc
// muszą działać w przeglądarce. I/O tkanin siedzi w fabrics.ts, wycena
// w sample-pricing.ts — tutaj wyłącznie kształtowanie listy i wybór.

import { filterBySearch } from "./search-normalize";
import type { SampleSelection } from "./sample-pricing";
import type { Fabric, FabricPriceGroup } from "./types";

// Okrojona tkanina wysyłana do przeglądarki. `Fabric` z bazy wiezie opis HTML,
// tłumaczenia i listę poleconych produktów — przy ~200 tkaninach to kilkaset
// kilobajtów payloadu, z których wzornik nie używa ani bajtu.
export type SampleFabric = {
  id: string;
  name: string;
  slug: string;
  groupId: string;
  // Numery kolorów (przycięte, bez pustych) — jednostka zamówienia.
  colors: string[];
  // Numer koloru → URL zdjęcia wzornika. Tylko kolory ze zdjęciem.
  images: Record<string, string>;
};

export type SampleGroup = { id: string; name: string };

export type SampleCatalogSection = {
  id: string;
  name: string;
  fabrics: SampleFabric[];
};

// Sekcja-śmietnik dla tkanin, których grupa cenowa nie przyszła w propsie.
// Nie powinna się zdarzyć (group_id to NOT NULL FK), ale gdyby lista grup
// przyszła niekompletna, tkanina ma zniknąć z widoku po CICHU — a to jest
// dokładnie ten rodzaj awarii, którego nikt nie zgłosi.
export const SAMPLE_OTHER_GROUP_ID = "__pozostale__";
const SAMPLE_OTHER_GROUP_NAME = "Pozostałe tkaniny";

// Tkanina bez ani jednego koloru nie ma czego wyciąć — pomijamy ją zamiast
// renderować pustą kartę, przy której klient zastanawia się, co kliknąć.
export function toSampleFabrics(fabrics: Fabric[]): SampleFabric[] {
  const out: SampleFabric[] = [];
  for (const f of fabrics) {
    const images: Record<string, string> = {};
    const colors: string[] = [];
    for (const raw of f.colors ?? []) {
      const code = String(raw ?? "").trim();
      if (!code || colors.includes(code)) continue;
      colors.push(code);
      // Klucz w color_images bywa zapisany bez przycięcia — sprawdzamy oba,
      // inaczej kafelek gubi zdjęcie przez jedną spację w adminie.
      const url = f.color_images?.[raw] ?? f.color_images?.[code];
      if (url) images[code] = url;
    }
    if (colors.length === 0) continue;
    out.push({
      id: f.id,
      name: f.name,
      slug: f.slug,
      groupId: f.group_id,
      colors,
      images,
    });
  }
  return out;
}

export function toSampleGroups(groups: FabricPriceGroup[]): SampleGroup[] {
  // Dopłata grupy dotyczy mebla, nie próbki (każda kosztuje tyle samo), więc
  // do wzornika jedzie sama nazwa — jako nagłówek sekcji, jak w /tkaniny.
  return groups.map((g) => ({ id: g.id, name: g.name }));
}

// Sekcje wzornika: kolejność grup jak w katalogu, w środku tkaniny w kolejności
// przekazanej z serwera (sort_order + nazwa). Puste sekcje znikają, żeby przy
// wyszukiwaniu nie zostawały same nagłówki.
export function buildSampleCatalog(
  fabrics: SampleFabric[],
  groups: SampleGroup[],
  query: string
): SampleCatalogSection[] {
  // filterBySearch na pustej frazie zwraca całą listę, więc wzornik nie zawęża
  // się, dopóki klient nic nie wpisze. Odmiana obsłużona fallbackiem: „welury"
  // znajdzie „Welur", ale dopiero gdy dokładne dopasowanie nie da nic.
  const matching = filterBySearch(fabrics, query, (f) => [f.name]);

  const byGroup = new Map<string, SampleFabric[]>();
  for (const f of matching) {
    const bucket = byGroup.get(f.groupId);
    if (bucket) bucket.push(f);
    else byGroup.set(f.groupId, [f]);
  }

  const sections: SampleCatalogSection[] = [];
  const known = new Set<string>();
  for (const g of groups) {
    known.add(g.id);
    const items = byGroup.get(g.id);
    if (items && items.length > 0) sections.push({ id: g.id, name: g.name, fabrics: items });
  }

  const orphans = matching.filter((f) => !known.has(f.groupId));
  if (orphans.length > 0) {
    sections.push({
      id: SAMPLE_OTHER_GROUP_ID,
      name: SAMPLE_OTHER_GROUP_NAME,
      fabrics: orphans,
    });
  }
  return sections;
}

// Ten sam klucz, po którym dedupeSelections (sample-pricing.ts) skleja pozycje:
// jedna próbka to para tkanina + kolor.
export function sampleSelectionKey(fabricId: string, color: string): string {
  return `${fabricId}::${color}`;
}

// Klik w kafelek przełącza wybór. Dopisujemy NA KONIEC, bo kolejność decyduje
// o tym, które sztuki baza rozliczy jako darmowe (pierwsze `free` pozycji) —
// odznaczenie i ponowne zaznaczenie przesuwa próbkę na koniec kolejki i tak
// samo widzi to podsumowanie na pasku.
export function toggleSampleSelection(
  selections: SampleSelection[],
  item: SampleSelection
): SampleSelection[] {
  const key = sampleSelectionKey(item.fabricId, item.color);
  const without = selections.filter((s) => sampleSelectionKey(s.fabricId, s.color) !== key);
  if (without.length !== selections.length) return without;
  return [...selections, item];
}

// Preselekcja z `?tkanina=<slug>`: klient przyszedł ze strony tkaniny, więc
// pierwszy kolor tej tkaniny ma być zaznaczony od wejścia. Nieznany slug nie
// jest błędem — po prostu nic nie zaznaczamy.
export function preselectSamples(
  fabrics: SampleFabric[],
  slug: string | null | undefined
): SampleSelection[] {
  if (!slug) return [];
  const fabric = fabrics.find((f) => f.slug === slug);
  if (!fabric || fabric.colors.length === 0) return [];
  return [{ fabricId: fabric.id, fabricName: fabric.name, color: fabric.colors[0] }];
}
