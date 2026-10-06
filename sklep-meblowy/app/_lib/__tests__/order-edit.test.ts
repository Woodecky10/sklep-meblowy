import { describe, it, expect } from "vitest";
import { parseOrderEditInput, EDIT_MAX_QUANTITY, type RawOrderEdit } from "../order-edit";

const base = (over: Partial<RawOrderEdit> = {}): RawOrderEdit => ({
  email: "Klient@Example.com",
  fullname: "Jan Kowalski",
  phone: "500600700",
  street: "Testowa 1",
  postal_code: "00-001",
  city: "Warszawa",
  country: "Polska",
  items: JSON.stringify([
    { id: "it-1", product_id: "p-1", custom_name: null, price: "2 650,00", quantity: "1", notes: "", variant_values: { Tkanina: "Riviera 16" } },
  ]),
  bundle_discount: "",
  promo_discount: "100",
  notify: "1",
  fingerprint: "fp",
  ...over,
});

describe("parseOrderEditInput", () => {
  it("poprawny formularz gościa → wartości znormalizowane", () => {
    const res = parseOrderEditInput(base(), { emailEditable: true });
    expect(res).toEqual({
      ok: true,
      value: {
        email: "klient@example.com",
        address: {
          fullname: "Jan Kowalski",
          street: "Testowa 1",
          postal_code: "00-001",
          city: "Warszawa",
          country: "Polska",
          phone: "500600700",
        },
        items: [
          {
            id: "it-1",
            product_id: "p-1",
            custom_name: null,
            price: 2650,
            quantity: 1,
            notes: null,
            variant_values: { Tkanina: "Riviera 16" },
          },
        ],
        bundle_discount: 0,
        promo_discount: 100,
        notify: true,
        fingerprint: "fp",
      },
    });
  });

  it("zamówienie z kontem: e-mail z formularza ignorowany (null), nawet gdy błędny", () => {
    const res = parseOrderEditInput(base({ email: "nie-mail" }), { emailEditable: false });
    expect(res.ok && res.value.email).toBeNull();
  });

  it("gość: błędny e-mail → błąd", () => {
    expect(parseOrderEditInput(base({ email: "jan@" }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Podaj poprawny adres e-mail klienta",
    });
  });

  it("brak kraju → Polska; brak telefonu → bez klucza phone", () => {
    const res = parseOrderEditInput(base({ country: "", phone: "" }), { emailEditable: true });
    expect(res.ok && res.value.address).toEqual({
      fullname: "Jan Kowalski",
      street: "Testowa 1",
      postal_code: "00-001",
      city: "Warszawa",
      country: "Polska",
    });
  });

  it("wymagane: imię i nazwisko, adres", () => {
    expect(parseOrderEditInput(base({ fullname: " " }), { emailEditable: true })).toMatchObject({ ok: false });
    expect(parseOrderEditInput(base({ city: "" }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Uzupełnij adres: ulica, kod pocztowy i miasto",
    });
  });

  it("zero pozycji → błąd (zamówienie nie może zostać puste)", () => {
    expect(parseOrderEditInput(base({ items: "[]" }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Zamówienie musi mieć co najmniej jedną pozycję",
    });
  });

  it("ilość 1–99, cena ≥ 0, ALBO produkt ALBO nazwa", () => {
    const item = (o: Record<string, unknown>) =>
      JSON.stringify([{ id: null, product_id: "p-1", custom_name: null, price: "10", quantity: "1", ...o }]);
    expect(parseOrderEditInput(base({ items: item({ quantity: String(EDIT_MAX_QUANTITY + 1) }) }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Pozycja 1: ilość musi być liczbą całkowitą od 1 do 99",
    });
    expect(parseOrderEditInput(base({ items: item({ price: "-5" }) }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Pozycja 1: cena musi być liczbą nie mniejszą od 0",
    });
    expect(parseOrderEditInput(base({ items: item({ custom_name: "Pufa" }) }), { emailEditable: true })).toMatchObject({ ok: false });
    expect(parseOrderEditInput(base({ items: item({ product_id: null }) }), { emailEditable: true })).toMatchObject({ ok: false });
  });

  it("pozycja spoza katalogu: warianty zawsze null; nowa pozycja ma id null", () => {
    const res = parseOrderEditInput(
      base({
        items: JSON.stringify([
          { id: "", product_id: null, custom_name: "Wniesienie mebli do 4. piętra", price: "250", quantity: "1", variant_values: { X: "Y" } },
        ]),
      }),
      { emailEditable: true }
    );
    expect(res.ok && res.value.items[0]).toEqual({
      id: null,
      product_id: null,
      custom_name: "Wniesienie mebli do 4. piętra",
      price: 250,
      quantity: 1,
      notes: null,
      variant_values: null,
    });
  });

  it("warianty: tylko pary tekst→tekst, puste wartości odpadają, pusty słownik → null", () => {
    const res = parseOrderEditInput(
      base({
        items: JSON.stringify([
          { id: "it-1", product_id: "p-1", custom_name: null, price: "1", quantity: "1", variant_values: { Tkanina: "Riviera 16", Strona: "", Liczba: 5 } },
        ]),
      }),
      { emailEditable: true }
    );
    expect(res.ok && res.value.items[0].variant_values).toEqual({ Tkanina: "Riviera 16" });
    const empty = parseOrderEditInput(
      base({ items: JSON.stringify([{ id: "it-1", product_id: "p-1", price: "1", quantity: "1", variant_values: { Strona: "" } }]) }),
      { emailEditable: true }
    );
    expect(empty.ok && empty.value.items[0].variant_values).toBeNull();
  });

  it("rabaty: puste → 0, ujemne → błąd", () => {
    expect(parseOrderEditInput(base({ promo_discount: "-1" }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Rabat musi być liczbą nie mniejszą od 0",
    });
  });

  it("notify tylko przy \"1\"; brak fingerprintu → błąd", () => {
    const res = parseOrderEditInput(base({ notify: undefined }), { emailEditable: true });
    expect(res.ok && res.value.notify).toBe(false);
    expect(parseOrderEditInput(base({ fingerprint: "" }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Brak stanu formularza — odśwież stronę edycji",
    });
  });

  it("nieczytelny JSON pozycji → błąd", () => {
    expect(parseOrderEditInput(base({ items: "{" }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Nieczytelna lista pozycji — odśwież stronę i spróbuj ponownie",
    });
  });
});
