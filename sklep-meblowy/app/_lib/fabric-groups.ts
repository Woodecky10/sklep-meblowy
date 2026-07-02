// Czysta logika grupowania tkanin po kategorii — bez zależności server-only,
// testowalna bez mockowania Supabase (wzorzec jak size-groups.ts). Używane przez
// FabricPicker w edytorze wariantów.
import type { Fabric } from "./types";

export const NO_CATEGORY_LABEL = "Bez kategorii";

export type FabricGroup = { category: string; fabrics: Fabric[] };

// Grupuje tkaniny po `category` (po trim). Puste/null/undefined → NO_CATEGORY_LABEL.
// Kategorie sortowane alfabetycznie (pl); NO_CATEGORY_LABEL zawsze na końcu.
// Kolejność tkanin w grupie zachowana z wejścia (już posortowane sort_order/name).
export function groupFabricsByCategory(fabrics: Fabric[]): FabricGroup[] {
  const map = new Map<string, Fabric[]>();
  for (const f of fabrics) {
    const cat = f.category?.trim() || NO_CATEGORY_LABEL;
    const arr = map.get(cat);
    if (arr) arr.push(f);
    else map.set(cat, [f]);
  }
  const named = [...map.keys()]
    .filter((c) => c !== NO_CATEGORY_LABEL)
    .sort((a, b) => a.localeCompare(b, "pl"));
  const ordered = map.has(NO_CATEGORY_LABEL) ? [...named, NO_CATEGORY_LABEL] : named;
  return ordered.map((category) => ({ category, fabrics: map.get(category)! }));
}

// Stan zaznaczenia grupy względem zbioru zaznaczonych nazw tkanin.
export function groupSelectionState(
  group: FabricGroup,
  selectedNames: Set<string>
): "none" | "some" | "all" {
  if (group.fabrics.length === 0) return "none";
  let sel = 0;
  for (const f of group.fabrics) if (selectedNames.has(f.name)) sel++;
  if (sel === 0) return "none";
  if (sel === group.fabrics.length) return "all";
  return "some";
}
