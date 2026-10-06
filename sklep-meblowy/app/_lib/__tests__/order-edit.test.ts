import { describe, it, expect } from "vitest";
import {
  parseOrderEditInput,
  EDIT_MAX_QUANTITY,
  planOrderEdit,
  orderEditTotal,
  orderEditNoteLine,
  appendAdminNote,
  orderEditFingerprint,
  type RawOrderEdit,
  type CurrentOrderItem,
  type OrderEditItem,
} from "../order-edit";

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

const cur = (over: Partial<CurrentOrderItem> = {}): CurrentOrderItem => ({
  id: "it-1",
  product_id: "p-1",
  custom_name: "",
  price: 2650,
  quantity: 1,
  notes: null,
  variant_values: { Tkanina: "Riviera 16" },
  ...over,
});
const ed = (over: Partial<OrderEditItem> = {}): OrderEditItem => ({
  id: "it-1",
  product_id: "p-1",
  custom_name: null,
  price: 2650,
  quantity: 1,
  notes: null,
  variant_values: { Tkanina: "Riviera 16" },
  ...over,
});

describe("planOrderEdit", () => {
  it("bez zmian → pusty plan", () => {
    expect(planOrderEdit([cur()], [ed()])).toEqual({ ok: true, value: { inserts: [], updates: [], deletes: [] } });
  });

  it("zmiana ceny, ilości, uwag i wariantu → jeden update z samymi zmienionymi polami", () => {
    const res = planOrderEdit(
      [cur()],
      [ed({ price: 2400, quantity: 2, notes: "pilne", variant_values: { Tkanina: "Sawana 21" } })]
    );
    expect(res).toEqual({
      ok: true,
      value: {
        inserts: [],
        updates: [
          {
            id: "it-1",
            patch: { price: 2400, quantity: 2, notes: "pilne", variant_values: { Tkanina: "Sawana 21" } },
          },
        ],
        deletes: [],
      },
    });
  });

  it("kolejność kluczy wariantu i null vs {} nie są zmianą", () => {
    const a = cur({ variant_values: { Tkanina: "R", Strona: "Lewa" } });
    expect(planOrderEdit([a], [ed({ variant_values: { Strona: "Lewa", Tkanina: "R" } })])).toMatchObject({
      ok: true,
      value: { updates: [] },
    });
    expect(planOrderEdit([cur({ variant_values: null })], [ed({ variant_values: null })])).toMatchObject({
      ok: true,
      value: { updates: [] },
    });
  });

  it("nowa pozycja (id null) → insert; brak w edycji → delete", () => {
    const res = planOrderEdit(
      [cur(), cur({ id: "it-2", product_id: null, custom_name: "Pufa", variant_values: null })],
      [ed(), ed({ id: null, product_id: null, custom_name: "Wniesienie mebli do 4. piętra", price: 250, variant_values: null })]
    );
    expect(res).toEqual({
      ok: true,
      value: {
        inserts: [
          {
            product_id: null,
            custom_name: "Wniesienie mebli do 4. piętra",
            price: 250,
            quantity: 1,
            notes: null,
            variant_values: null,
            bundle_id: null,
            bundle_label: null,
          },
        ],
        updates: [],
        deletes: ["it-2"],
      },
    });
  });

  it("zmiana nazwy pozycji spoza katalogu → update custom_name", () => {
    const res = planOrderEdit(
      [cur({ product_id: null, custom_name: "Pufa", variant_values: null })],
      [ed({ product_id: null, custom_name: "Pufa Vena", variant_values: null })]
    );
    expect(res).toMatchObject({ ok: true, value: { updates: [{ id: "it-1", patch: { custom_name: "Pufa Vena" } }] } });
  });

  it("id spoza zamówienia, zdublowane id albo zmieniony produkt → błąd", () => {
    expect(planOrderEdit([cur()], [ed({ id: "obce" })])).toEqual({
      ok: false,
      error: "Pozycja nie należy do tego zamówienia — odśwież stronę",
    });
    expect(planOrderEdit([cur()], [ed(), ed()])).toMatchObject({ ok: false });
    expect(planOrderEdit([cur()], [ed({ product_id: "p-2" })])).toEqual({
      ok: false,
      error: "Nie można zmienić produktu w istniejącej pozycji — usuń ją i dodaj nową",
    });
  });
});

describe("orderEditTotal", () => {
  it("Σ cena × ilość − rabaty, do grosza, nie mniej niż 0", () => {
    expect(orderEditTotal([{ price: 2650, quantity: 1 }, { price: 250, quantity: 1 }], 0, 100)).toBe(2800);
    expect(orderEditTotal([{ price: 0.1, quantity: 3 }], 0, 0)).toBe(0.3);
    expect(orderEditTotal([{ price: 100, quantity: 1 }], 50, 80)).toBe(0);
  });
});

describe("ślad edycji w notatce", () => {
  it("linijka z datą w strefie Europe/Warsaw i sumami", () => {
    const at = new Date("2026-10-06T12:22:00Z"); // 14:22 czasu polskiego (CEST)
    expect(orderEditNoteLine(at, 2900, 3150, "pln")).toBe(
      "06.10.2026, 14:22 — edycja zamówienia: suma 2900 zł → 3150 zł"
    );
    expect(orderEditNoteLine(at, 2900, 3150, "pln", true)).toBe(
      "06.10.2026, 14:22 — edycja zamówienia: suma 2900 zł → 3150 zł (zapis przerwany — sprawdź pozycje)"
    );
  });
  it("appendAdminNote: dopisuje w nowej linii, pusta notatka → sama linijka", () => {
    expect(appendAdminNote(null, "L")).toBe("L");
    expect(appendAdminNote("  ", "L")).toBe("L");
    expect(appendAdminNote("stara", "L")).toBe("stara\nL");
  });
});

describe("orderEditFingerprint", () => {
  it("kolejność pozycji bez znaczenia; zmiana ceny, ilości albo sumy zmienia skrót", () => {
    const a = orderEditFingerprint(2900, [
      { id: "a", quantity: 1, price: 2650 },
      { id: "b", quantity: 1, price: 250 },
    ]);
    const b = orderEditFingerprint(2900, [
      { id: "b", quantity: 1, price: 250 },
      { id: "a", quantity: 1, price: 2650 },
    ]);
    expect(a).toBe(b);
    expect(orderEditFingerprint(2900, [{ id: "a", quantity: 2, price: 2650 }])).not.toBe(
      orderEditFingerprint(2900, [{ id: "a", quantity: 1, price: 2650 }])
    );
    expect(orderEditFingerprint(2901, [{ id: "a", quantity: 1, price: 2650 }])).not.toBe(
      orderEditFingerprint(2900, [{ id: "a", quantity: 1, price: 2650 }])
    );
  });
});

describe("parseOrderEditInput — brak maila (zamówienie ręczne)", () => {
  it("allowNoEmail + no_email → email null", () => {
    const res = parseOrderEditInput(base({ email: "", no_email: "1" }), { emailEditable: true, allowNoEmail: true });
    expect(res.ok && res.value.email).toBe(null);
  });

  it("bez allowNoEmail no_email jest ignorowane — e-mail wymagany", () => {
    expect(parseOrderEditInput(base({ email: "", no_email: "1" }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Podaj poprawny adres e-mail klienta",
    });
  });

  it("allowNoEmail bez zaznaczenia → e-mail walidowany", () => {
    expect(parseOrderEditInput(base({ email: "jan@" }), { emailEditable: true, allowNoEmail: true }).ok).toBe(false);
  });
});
