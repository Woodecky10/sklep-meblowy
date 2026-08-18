import { describe, it, expect } from "vitest";
import {
  generateInviteToken,
  hashInviteToken,
  inviteState,
  reviewUrlFor,
  INVITE_TTL_DNI,
} from "@/app/_lib/review-tokens";

const TERAZ = new Date("2026-08-18T10:00:00Z");

describe("token zaproszenia", () => {
  it("generuje token o stałej długości i różny za każdym razem", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
  });

  it("skrót jest powtarzalny i nie jest samym tokenem", () => {
    const t = generateInviteToken();
    expect(hashInviteToken(t)).toBe(hashInviteToken(t));
    expect(hashInviteToken(t)).not.toBe(t);
  });

  it("ważność liczona jest w dniach", () => {
    expect(INVITE_TTL_DNI).toBe(90);
  });
});

describe("inviteState", () => {
  const bazowe = {
    used_at: null as string | null,
    expires_at: "2026-11-16T10:00:00Z",
  };

  it("świeże zaproszenie jest w porządku", () => {
    expect(inviteState(bazowe, TERAZ)).toBe("ok");
  });

  it("zużyte zaproszenie jest zużyte — nawet jeśli jeszcze ważne", () => {
    expect(inviteState({ ...bazowe, used_at: "2026-08-19T10:00:00Z" }, TERAZ)).toBe("used");
  });

  it("wygasłe zaproszenie jest wygasłe", () => {
    expect(inviteState({ ...bazowe, expires_at: "2026-08-17T10:00:00Z" }, TERAZ)).toBe("expired");
  });

  // Kolejność sprawdzeń ma znaczenie dla komunikatu: ktoś, kto już napisał,
  // ma zobaczyć „już dziękujemy", a nie „link wygasł".
  it("zużycie bije wygaśnięcie", () => {
    expect(
      inviteState(
        { used_at: "2026-08-16T10:00:00Z", expires_at: "2026-08-17T10:00:00Z" },
        TERAZ
      )
    ).toBe("used");
  });
});

// Wymóg ze specyfikacji: „właściwy adres w linku" dla gościa i dla konta.
// To jedyny fragment budowania maila, w którym da się popełnić cichy błąd —
// gość dostający link do karty produktu nie ma jak napisać opinii, bo nie jest
// zalogowany, a mail wygląda na poprawny.
describe("reviewUrlFor", () => {
  const base = "https://www.mollien.pl";

  it("gość dostaje link z tokenem", () => {
    expect(
      reviewUrlFor({ base, locale: "pl", maKonto: false, productId: "p1", token: "abc" })
    ).toBe("https://www.mollien.pl/opinia/abc");
  });

  it("posiadacz konta dostaje link na kartę produktu do sekcji opinii", () => {
    expect(
      reviewUrlFor({ base, locale: "pl", maKonto: true, productId: "p1", token: "abc" })
    ).toBe("https://www.mollien.pl/produkt/p1#opinie");
  });

  it("wersja niemiecka niesie prefiks /de", () => {
    expect(
      reviewUrlFor({ base, locale: "de", maKonto: false, productId: "p1", token: "abc" })
    ).toBe("https://www.mollien.pl/de/opinia/abc");
  });

  // Gdyby ktoś kiedyś zawołał to bez tokenu dla gościa, link prowadziłby
  // do /opinia/undefined. Lepiej rzucić w testach niż wysłać taki mail.
  it("rzuca, gdy gość nie ma tokenu", () => {
    expect(() =>
      reviewUrlFor({ base, locale: "pl", maKonto: false, productId: "p1", token: null })
    ).toThrow();
  });
});
