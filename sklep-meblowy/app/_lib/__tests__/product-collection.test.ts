import { describe, it, expect } from "vitest";
import {
  COLLECTION_FIELD,
  COLLECTION_PRESENT_FIELD,
  collectionIdFromForm,
  collectionChange,
  appendSortOrder,
} from "@/app/_lib/product-collection";

const FADO = { id: "11111111-1111-4111-8111-111111111111" };
const NORA = { id: "22222222-2222-4222-8222-222222222222" };
const KNOWN = [FADO, NORA];

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("collectionIdFromForm — pole „Kolekcja” w formularzu produktu", () => {
  it("formularz bez pola (brak znacznika obecności) → undefined, kolumny nie ruszamy", () => {
    expect(collectionIdFromForm(form({ name: "Sofa" }), KNOWN)).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("pusta lista kolekcji → undefined, nawet gdy pole jest (odczyt kolekcji mógł paść)", () => {
    // withFallback oddaje [] przy błędzie bazy — z pustej listy nigdy nie
    // odpinamy produktu, bo admin nie miał z czego wybrać.
    const fd = form({ [COLLECTION_PRESENT_FIELD]: "1", [COLLECTION_FIELD]: "" });
    expect(collectionIdFromForm(fd, [])).toEqual({ ok: true, value: undefined });
  });

  it("„— brak —” (pusta wartość) → null, czyli odpięcie", () => {
    const fd = form({ [COLLECTION_PRESENT_FIELD]: "1", [COLLECTION_FIELD]: "" });
    expect(collectionIdFromForm(fd, KNOWN)).toEqual({ ok: true, value: null });
  });

  it("id istniejącej kolekcji przechodzi (z przyciętymi spacjami)", () => {
    const fd = form({ [COLLECTION_PRESENT_FIELD]: "1", [COLLECTION_FIELD]: ` ${NORA.id} ` });
    expect(collectionIdFromForm(fd, KNOWN)).toEqual({ ok: true, value: NORA.id });
  });

  it("nieznane id → błąd z prośbą o odświeżenie (lista zmieniła się po otwarciu strony)", () => {
    const fd = form({
      [COLLECTION_PRESENT_FIELD]: "1",
      [COLLECTION_FIELD]: "33333333-3333-4333-8333-333333333333",
    });
    const r = collectionIdFromForm(fd, KNOWN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/odśwież/i);
  });

  it("nazwy pól są stałe (formularz i akcja muszą się zgadzać)", () => {
    expect(COLLECTION_FIELD).toBe("collection_id");
    expect(COLLECTION_PRESENT_FIELD).toBe("collection_present");
  });
});

describe("collectionChange — co zapisać przy zmianie przypisania", () => {
  it("pole nieobecne → nic", () => {
    expect(collectionChange(FADO.id, undefined)).toEqual({ kind: "none" });
    expect(collectionChange(null, undefined)).toEqual({ kind: "none" });
  });

  it("ta sama wartość → nic (kolejność w kolekcji zostaje nietknięta)", () => {
    expect(collectionChange(FADO.id, FADO.id)).toEqual({ kind: "none" });
    expect(collectionChange(null, null)).toEqual({ kind: "none" });
  });

  it("z kolekcji na „brak” → odpięcie", () => {
    expect(collectionChange(FADO.id, null)).toEqual({ kind: "unassign" });
  });

  it("nowa kolekcja (z braku albo z innej) → przypisanie do niej", () => {
    expect(collectionChange(null, FADO.id)).toEqual({ kind: "assign", collectionId: FADO.id });
    expect(collectionChange(FADO.id, NORA.id)).toEqual({ kind: "assign", collectionId: NORA.id });
  });
});

describe("appendSortOrder — produkt przypisany z karty idzie na koniec kolekcji", () => {
  it("pusta kolekcja → 0 (jak backfill migracji 75: pozycje od zera)", () => {
    expect(appendSortOrder(null)).toBe(0);
  });

  it("za ostatnim produktem", () => {
    expect(appendSortOrder(4)).toBe(5);
  });
});
