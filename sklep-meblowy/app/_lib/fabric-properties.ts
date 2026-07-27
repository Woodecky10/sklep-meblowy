// Cechy tkaniny pokazywane klientowi jako pigułki przy wyborze tkaniny
// (wodoodporna / przyjazna zwierzętom / łatwa w czyszczeniu). Czysty moduł
// (zero importów server-only) — testowalny w vitest (env node).
//
// Zestaw jest ZAMKNIĘTY i trzyma się w kodzie, nie w bazie: każda nowa cecha
// wymaga własnej ikonki i tłumaczenia PL/DE, czyli i tak zmiany w kodzie —
// słownik z CRUD-em w adminie niczego by nie oszczędził. W bazie leżą same
// kody (fabrics.properties text[]).

export type FabricPropertyCode = "waterproof" | "pet_friendly" | "easy_clean";

// Kolejność = kolejność wyświetlania pigułek. parseFabricProperties zwraca
// wynik zawsze w tej kolejności, więc render nie zależy od kolejności zapisu.
export const FABRIC_PROPERTY_CODES: readonly FabricPropertyCode[] = [
  "waterproof",
  "pet_friendly",
  "easy_clean",
];

// Wejście defensywne: kolumna może przyjść jako null (stary cache) albo z
// kodem, którego już nie znamy (usunięta cecha) — nic z tego nie może wysypać
// karty produktu.
export function parseFabricProperties(input: unknown): FabricPropertyCode[] {
  if (!Array.isArray(input)) return [];
  const found = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") continue;
    found.add(item.trim());
  }
  return FABRIC_PROPERTY_CODES.filter((code) => found.has(code));
}
