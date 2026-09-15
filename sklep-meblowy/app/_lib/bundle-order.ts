// Czysta logika kolejności zestawów (migracja 83: bundles.sort_order) — bez
// importów server-only, wspólna dla warstwy odczytu, akcji panelu i edytora
// (optymistyczne sortowanie po przeciągnięciu). Testy: bundle-order.test.ts.

export type BundleOrderRow = { sort_order: number; created_at: string };

// sort_order rosnąco; przy remisie nowsze pierwsze — dokładnie tak zestawy
// były sortowane przed migracją 83 (order by created_at desc), więc wiersze
// bez ustawionej kolejności (wszystkie 0) zachowują dawny porządek.
export function byBundleSortOrder(a: BundleOrderRow, b: BundleOrderRow): number {
  return a.sort_order - b.sort_order || b.created_at.localeCompare(a.created_at);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReorderValidation = { ok: true; ids: string[] } | { ok: false; error: string };

// Odrzucamy CAŁE żądanie, gdy którekolwiek id jest puste, nie-UUID albo
// powtórzone. reorder_bundles przenumerowuje DOKŁADNIE to, co dostanie, więc
// samo `.filter(Boolean)` przestawiłoby podzbiór zestawów (reszta ze starymi
// numerami), a akcja zgłosiłaby „Kolejność zapisana" — cicha, częściowa zmiana
// zameldowana jako sukces (ta sama lekcja co reorderCollections).
export function validateReorderIds(order: { id: string }[]): ReorderValidation {
  if (!Array.isArray(order) || order.length === 0) {
    return { ok: false, error: "Pusta lista kolejności" };
  }
  const ids = order.map((o) => o.id);
  if (ids.some((id) => typeof id !== "string" || !UUID_RE.test(id))) {
    return { ok: false, error: "Lista kolejności zawiera nieprawidłowe id — nic nie zapisano" };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "Lista kolejności zawiera powtórzone id — nic nie zapisano" };
  }
  return { ok: true, ids };
}
