// Czysta logika selektora rozmiaru — bez zależności server-only, żeby była
// testowalna bez mockowania Supabase (wzorzec jak localize.ts / search-filter.ts).
// Server-owe pobranie rodzeństwa jest w products.ts (getSizeSiblings).

export type SizeOption = { id: string; label: string; current: boolean };

type SizeSibling = { id: string; size_label: string | null; name: string };

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
    label: s.size_label?.trim() || s.name,
    current: s.id === currentId,
  }));
  options.sort((a, b) =>
    a.label.localeCompare(b.label, "pl", { numeric: true })
  );
  return options.length >= 2 ? options : [];
}
