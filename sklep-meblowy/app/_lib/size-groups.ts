// Czysta logika selektora rozmiaru — bez zależności server-only, żeby była
// testowalna bez mockowania Supabase (wzorzec jak localize.ts / search-filter.ts).
// Server-owe pobranie rodzeństwa jest w products.ts (getSizeSiblings).

export type SizeOption = { id: string; label: string; current: boolean };

type SizeSibling = { id: string; size_label: string | null; name: string };

// Etykieta rozmiaru: size_label po trim, albo nazwa produktu jako fallback
// (także dla pustego/whitespace label). Współdzielone przez selektor na sklepie
// (buildSizeOptions) i panel admina (getSizeGroupMembersAdmin) — jedno źródło
// semantyki fallbacku.
export function sizeLabelOf(item: { size_label: string | null; name: string }): string {
  return item.size_label?.trim() || item.name;
}

// Buduje opcje selektora rozmiaru z rodzeństwa (produktów z tym samym size_group).
// Etykieta = size_label (po trim) lub nazwa produktu jako fallback.
// Sortowanie naturalne po etykiecie (numeric) → "140×200" < "160×200" < "180×200".
// Locale przypięte do "pl" (nie default runtime'u) — sort deterministyczny po
// stronie serwera niezależnie od locale OS/Node.
// Zwraca [] gdy < 2 pozycji — jedna aukcja nie potrzebuje selektora.
export function buildSizeOptions(
  siblings: SizeSibling[],
  currentId: string
): SizeOption[] {
  const options: SizeOption[] = siblings.map((s) => ({
    id: s.id,
    label: sizeLabelOf(s),
    current: s.id === currentId,
  }));
  options.sort((a, b) =>
    a.label.localeCompare(b.label, "pl", { numeric: true })
  );
  return options.length >= 2 ? options : [];
}

// ── Łączenie grup rozmiarów (panel admina) ─────────────────────────────
// Klucz size_group jest wewnętrzny (niewidoczny dla klienta) — generowany
// automatycznie, więc czytelny slug tylko ułatwia debug.

// Slug bazowy z nazwy produktu: lowercase, bez diakrytyków, nie-alfanumeryczne
// → "-", bez wielokrotnych/skrajnych myślników. Pusty wynik → "grupa".
export function groupKeyBase(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // usuń łączące znaki diakrytyczne
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "grupa";
}

// Składa klucz z bazy nazwy + sufiksu. Sufiks wstrzykiwany, żeby funkcja była
// deterministyczna (losowanie robi warstwa akcji).
export function buildGroupKey(name: string, suffix: string): string {
  return `${groupKeyBase(name)}-${suffix}`;
}

// Wybiera wspólny klucz size_group przy łączeniu dwóch produktów:
//  - bieżący ma grupę → jego klucz wygrywa (członkowie targetu dołączą do niego),
//  - tylko target ma grupę → bieżący ją adoptuje,
//  - żaden nie ma → nowy klucz (newKey).
export function pickGroupKey(
  currentKey: string | null,
  targetKey: string | null,
  newKey: string
): string {
  if (currentKey) return currentKey;
  if (targetKey) return targetKey;
  return newKey;
}
