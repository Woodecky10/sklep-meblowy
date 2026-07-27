// Cechy tkaniny pokazywane klientowi jako pigułki przy wyborze tkaniny.
// Czysty moduł (zero importów server-only) — testowalny w vitest (env node).
//
// Zestaw cech NIE jest już zamknięty w kodzie: definicje żyją w tabeli
// `fabric_property_defs` i admin dodaje własne w /admin/tkaniny. W kodzie
// zostaje tylko to, czego nie da się wpisać w formularzu — biblioteka ikonek
// (SVG to kod). W `fabrics.properties` leżą same kody cech.
import { slugifyTitle } from "./pages";

// Klucze ikonek dostępnych w panelu; kolejność = kolejność siatki wyboru.
export const FABRIC_PROPERTY_ICONS = [
  "drop",
  "paw",
  "sparkle",
  "leaf",
  "shield",
  "sun",
  "flame",
  "weave",
  "durability",
  "breathable",
] as const;

export type FabricPropertyIcon = (typeof FABRIC_PROPERTY_ICONS)[number];

export function isFabricPropertyIcon(value: unknown): value is FabricPropertyIcon {
  return typeof value === "string" && (FABRIC_PROPERTY_ICONS as readonly string[]).includes(value);
}

// Limit długości podpisu — pigułka ma zostać pigułką, nie akapitem.
export const FABRIC_PROPERTY_LABEL_MAX = 60;

export type FabricPropertyDef = {
  code: string;
  label: string;
  labelDe: string | null;
  // null = klucz spoza biblioteki (np. ikonka usunięta z kodu) → render bez ikonki.
  icon: FabricPropertyIcon | null;
  sortOrder: number;
};

// Wejście defensywne: to surowe wiersze z bazy albo `undefined`, gdy zapytanie
// padło (brak tabeli przed migracją) — nic z tego nie może wysypać karty produktu.
export function buildFabricPropertyDefs(rows: unknown): FabricPropertyDef[] {
  if (!Array.isArray(rows)) return [];
  const out: FabricPropertyDef[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const code = typeof r.code === "string" ? r.code.trim() : "";
    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (!code || !label) continue;
    const labelDe = typeof r.label_de === "string" ? r.label_de.trim() : "";
    out.push({
      code,
      label,
      labelDe: labelDe || null,
      icon: isFabricPropertyIcon(r.icon) ? r.icon : null,
      sortOrder: typeof r.sort_order === "number" ? r.sort_order : 0,
    });
  }
  return out.sort((a, b) => a.sortOrder - b.sortOrder);
}

// Kody zapisane przy tkaninie → definicje, w kolejności z panelu. Kod bez
// definicji (usunięta cecha) jest pomijany; duplikaty odsiane.
export function resolveFabricProperties(
  codes: unknown,
  defs: FabricPropertyDef[]
): FabricPropertyDef[] {
  if (!Array.isArray(codes) || defs.length === 0) return [];
  const wanted = new Set<string>();
  for (const c of codes) {
    if (typeof c !== "string") continue;
    wanted.add(c.trim());
  }
  return defs.filter((d) => wanted.has(d.code));
}

// Kody nadesłane checkboxami panelu → uporządkowana lista: trim, odsiew
// nie-stringów i pustych, dedupe, kolejność wejścia zachowana.
export function normalizePropertyCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const code = v.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

// Zostawia tylko kody istniejące w słowniku (`fabric_property_defs`). Zestaw
// cech nie jest już zamknięty w kodzie, więc to jedyna zapora przed
// wstrzyknięciem dowolnego kodu spreparowanym requestem.
export function filterKnownCodes(codes: string[], known: Set<string>): string[] {
  return codes.filter((c) => known.has(c));
}

// Fragment payloadu zapisu tkaniny dotyczący cech. `sectionRendered` mówi, czy
// formularz w ogóle pokazał checkboxy (marker `properties_present`):
// - true  → zapisz dokładnie to, co zaznaczono (pusto = admin odznaczył wszystko),
// - false → BRAK klucza `properties`, czyli nie ruszaj tego, co tkanina już ma.
// Bez tego rozróżnienia niedostępny słownik (np. przed migracją 64) kasowałby
// przy każdej edycji tkaniny jej dotychczasowe cechy — po cichu i bezpowrotnie.
export function fabricPropertiesPatch(
  sectionRendered: boolean,
  codes: string[]
): { properties?: string[] } {
  return sectionRendered ? { properties: codes } : {};
}

// Kod cechy generowany raz, przy tworzeniu — stabilny przy zmianie nazwy, bo
// tkaniny trzymają kod, nie napis (wzorzec fabricSlug dla tkanin).
export function propertyCodeSlug(name: string, taken: Set<string>): string {
  const base = slugifyTitle(name) || "cecha";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
