// Pole „Kolekcja” w formularzach produktu (nowy produkt + edytor) — część
// CZYSTA: odczyt z FormData, decyzja co zapisać, pozycja na końcu kolekcji.
// Bez importów supabase/next, żeby dało się testować vitestem (jak
// extra-categories.ts). Odczyty bazy i sam UPDATE robi
// app/admin/produkty/actions.ts.
//
// Tło (2026-10-29): produkt trafiał do kolekcji WYŁĄCZNIE z /admin/kolekcje
// („zaznacz produkty w kolekcji”). Koleżanka właściciela dodaje produkty
// kolekcjami i chciała przypisać produkt tam, gdzie go tworzy — na jego karcie.
// Panel Kolekcje zostaje bez zmian; obie drogi piszą tę samą kolumnę
// products.collection_id.

export const COLLECTION_FIELD = "collection_id";
// Znacznik „formularz MA pole kolekcji”. Bez niego akcja nie rusza kolumny —
// ten sam wzorzec co EXTRA_CATEGORIES_PRESENT_FIELD: formularz bez pola nie
// może po cichu odpiąć produktu.
export const COLLECTION_PRESENT_FIELD = "collection_present";

export type CollectionOption = { id: string; label: string };

export type CollectionFieldResult =
  | { ok: true; value: string | null | undefined }
  | { ok: false; error: string };

// undefined = kolumny nie ruszamy; null = „— brak —”; string = id kolekcji.
export function collectionIdFromForm(
  formData: FormData,
  known: readonly { id: string }[]
): CollectionFieldResult {
  if (formData.get(COLLECTION_PRESENT_FIELD) !== "1") return { ok: true, value: undefined };
  // Pusta lista = brak kolekcji w sklepie ALBO odczyt padł (withFallback → []).
  // W obu przypadkach admin nie miał z czego wybrać — nie odpinamy.
  if (known.length === 0) return { ok: true, value: undefined };
  const raw = formData.get(COLLECTION_FIELD);
  const id = typeof raw === "string" ? raw.trim() : "";
  if (id === "") return { ok: true, value: null };
  if (!known.some((c) => c.id === id)) {
    return { ok: false, error: "Nieznana kolekcja — odśwież stronę i wybierz ponownie" };
  }
  return { ok: true, value: id };
}

export type CollectionChange =
  | { kind: "none" }
  | { kind: "unassign" }
  | { kind: "assign"; collectionId: string };

// Ta sama wartość = nic, także po to, żeby zwykły zapis „Podstawowych danych”
// nie przestawiał produktu na koniec jego własnej kolekcji.
export function collectionChange(
  current: string | null,
  next: string | null | undefined
): CollectionChange {
  if (next === undefined || next === current) return { kind: "none" };
  if (next === null) return { kind: "unassign" };
  return { kind: "assign", collectionId: next };
}

// Pozycje w kolekcji liczą się od zera (backfill migracji 75 i
// reorder_collection_products: ord - 1). Produkt dopisany z karty idzie ZA
// ostatnim; null = kolekcja pusta.
export function appendSortOrder(maxExisting: number | null): number {
  return maxExisting === null ? 0 : maxExisting + 1;
}
