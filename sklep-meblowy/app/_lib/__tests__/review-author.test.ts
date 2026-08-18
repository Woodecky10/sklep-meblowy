import { describe, it, expect } from "vitest";
import { authorNameOf } from "@/app/_lib/reviews";

describe("authorNameOf", () => {
  it("dla konta bierze imię z profilu", () => {
    expect(authorNameOf({ user_id: "u1", guest_name: null }, "Julia K.")).toBe("Julia K.");
  });

  it("dla gościa bierze imię wpisane w formularzu", () => {
    expect(authorNameOf({ user_id: null, guest_name: "Anna" }, null)).toBe("Anna");
  });

  // Profil bez wypełnionego full_name istnieje w bazie — wtedy podpisu nie ma
  // i widok ma pokazać własny zastępnik, a nie pusty ciąg.
  it("zwraca null, gdy konto nie ma imienia w profilu", () => {
    expect(authorNameOf({ user_id: "u1", guest_name: null }, null)).toBeNull();
  });

  // Gość nigdy nie powinien mieć profilu, ale gdyby mapa coś zwróciła,
  // imię z formularza jest źródłem prawdy dla tej opinii.
  it("dla gościa ignoruje przypadkowe imię z profilu", () => {
    expect(authorNameOf({ user_id: null, guest_name: "Anna" }, "Ktoś Inny")).toBe("Anna");
  });
});
