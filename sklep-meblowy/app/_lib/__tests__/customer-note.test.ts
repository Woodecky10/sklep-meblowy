import { describe, it, expect } from "vitest";
import { normalizeCustomerNote, customerNoteInsert } from "@/app/_lib/customer-note";

describe("normalizeCustomerNote", () => {
  it("przycina białe znaki na brzegach, zachowuje nowe linie w środku", () =>
    expect(normalizeCustomerNote("  dzwonić po 16\ndomofon 12  ")).toBe("dzwonić po 16\ndomofon 12"));
  it("pusty, same spacje i entery → null", () => {
    expect(normalizeCustomerNote("")).toBeNull();
    expect(normalizeCustomerNote("   \n\t ")).toBeNull();
  });
  it("nie-string → null", () => {
    expect(normalizeCustomerNote(undefined)).toBeNull();
    expect(normalizeCustomerNote(null)).toBeNull();
    expect(normalizeCustomerNote(123)).toBeNull();
  });
  it("tnie do 1000 znaków", () => expect(normalizeCustomerNote("a".repeat(1500))).toHaveLength(1000));
});

describe("customerNoteInsert", () => {
  it("brak uwag → pusty obiekt (insert bez klucza, działa przed migracją)", () =>
    expect(customerNoteInsert(null)).toEqual({}));
  it("uwagi → klucz customer_note", () =>
    expect(customerNoteInsert("dzwonić")).toEqual({ customer_note: "dzwonić" }));
});
