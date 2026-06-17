import { describe, it, expect } from "vitest";
import { orderCustomerDisplay } from "@/app/_lib/admin-orders";
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
