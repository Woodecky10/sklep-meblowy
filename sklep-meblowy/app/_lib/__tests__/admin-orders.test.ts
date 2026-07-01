import { describe, it, expect } from "vitest";
import { orderCustomerDisplay, orderItemsSummary } from "@/app/_lib/admin-orders";
import type { Address } from "@/app/_lib/types";

const addr: Address = {
  street: "ul. Meblowa 1",
  city: "Warszawa",
  postal_code: "00-001",
  country: "Polska",
  fullname: "Jan Kowalski",
};

describe("orderCustomerDisplay", () => {
  it("zarejestrowany: email i nazwisko z profilu", () => {
    const r = orderCustomerDisplay(
      { user_id: "u1", guest_email: null, shipping_address: addr },
      { email: "jan@example.com", full_name: "Jan K." }
    );
    expect(r).toEqual({ name: "Jan K.", email: "jan@example.com", isGuest: false });
  });

  it("zarejestrowany bez profilu: fallback nazwiska do adresu, email null", () => {
    const r = orderCustomerDisplay(
      { user_id: "u1", guest_email: null, shipping_address: addr },
      null
    );
    expect(r).toEqual({ name: "Jan Kowalski", email: null, isGuest: false });
  });

  it("gość: email z guest_email, nazwisko z adresu, isGuest=true", () => {
    const r = orderCustomerDisplay(
      { user_id: null, guest_email: "gosc@example.com", shipping_address: addr },
      null
    );
    expect(r).toEqual({ name: "Jan Kowalski", email: "gosc@example.com", isGuest: true });
  });

  it("brak nazwiska w adresie → name null", () => {
    const r = orderCustomerDisplay(
      { user_id: null, guest_email: "g@e.pl", shipping_address: { ...addr, fullname: undefined } },
      null
    );
    expect(r.name).toBeNull();
  });
});

describe("orderItemsSummary", () => {
  it("brak pozycji → myślnik", () => {
    expect(orderItemsSummary([])).toEqual({ label: "—", full: "—" });
  });

  it("jedna pozycja → sama nazwa", () => {
    const r = orderItemsSummary([{ product: { name: "Narożnik VEGAS MINI" } }]);
    expect(r.label).toBe("Narożnik VEGAS MINI");
    expect(r.full).toBe("Narożnik VEGAS MINI");
  });

  it("wiele pozycji → pierwsza nazwa + licznik, full = pełna lista", () => {
    const r = orderItemsSummary([
      { product: { name: "Sofa Porto" } },
      { product: { name: "Fotel Cashmere" } },
      { product: { name: "Łóżko Zen" } },
    ]);
    expect(r.label).toBe("Sofa Porto +2");
    expect(r.full).toBe("Sofa Porto, Fotel Cashmere, Łóżko Zen");
  });

  it("brak nazwy produktu → fallback", () => {
    expect(orderItemsSummary([{ product: null }]).label).toBe("produkt usunięty");
  });
});
