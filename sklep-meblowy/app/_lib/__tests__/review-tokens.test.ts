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

// Zgłoszenie z 2026-08-27: „po kliknięciu «Wystaw opinię» nic się nie dzieje".
// Posiadacz konta dostawał goły `/produkt/<id>#opinie`, a formularz w tej sekcji
// renderuje się WYŁĄCZNIE zalogowanemu (getReviewStatus → "not_logged_in") — z
// maila klika się zwykle bez sesji, więc klient widział notkę „Zaloguj się" i
// żadnego pola. Decyzja właściciela: obie grupy mają dojść do formularza, gość
// od razu, konto przez logowanie z powrotem na to samo miejsce.
describe("reviewUrlFor", () => {
  const base = "https://www.mollien.pl";

  it("gość dostaje formularz z tokenem", () => {
    expect(
      reviewUrlFor({ base, locale: "pl", maKonto: false, productId: "p1", token: "abc" })
    ).toBe("https://www.mollien.pl/opinia/abc");
  });

  it("posiadacz konta dostaje logowanie z powrotem na sekcję opinii", () => {
    expect(
      reviewUrlFor({ base, locale: "pl", maKonto: true, productId: "p1", token: "abc" })
    ).toBe("https://www.mollien.pl/logowanie?next=%2Fprodukt%2Fp1%23opinie");
  });

  // Regresja: adres dla konta NIE MOŻE być gołą kartą produktu, bo tam formularz
  // dla niezalogowanego się nie pojawia i to właśnie zgłosiła klientka.
  it("adres dla konta prowadzi na logowanie, nie na samą kartę produktu", () => {
    const url = reviewUrlFor({
      base,
      locale: "pl",
      maKonto: true,
      productId: "p1",
      token: "abc",
    });
    expect(url).toContain("/logowanie");
    expect(url).toContain("next=");
    expect(url).not.toBe("https://www.mollien.pl/produkt/p1#opinie");
  });

  it("wersja niemiecka niesie prefiks /de w obu ścieżkach", () => {
    expect(
      reviewUrlFor({ base, locale: "de", maKonto: false, productId: "p1", token: "abc" })
    ).toBe("https://www.mollien.pl/de/opinia/abc");
    // Cel powrotu też musi być niemiecki, inaczej po zalogowaniu klient wypada
    // na polską kartę produktu.
    expect(
      reviewUrlFor({ base, locale: "de", maKonto: true, productId: "p1", token: "abc" })
    ).toBe("https://www.mollien.pl/de/logowanie?next=%2Fde%2Fprodukt%2Fp1%23opinie");
  });

  // Bez tokenu link gościa prowadziłby do /opinia/undefined. Lepiej rzucić w
  // testach niż wysłać taki mail.
  it("rzuca, gdy gość nie ma tokenu", () => {
    expect(() =>
      reviewUrlFor({ base, locale: "pl", maKonto: false, productId: "p1", token: null })
    ).toThrow();
  });

  // Konto tokenu nie potrzebuje — jego link go nie zawiera.
  it("konto nie potrzebuje tokenu", () => {
    expect(() =>
      reviewUrlFor({ base, locale: "pl", maKonto: true, productId: "p1", token: null })
    ).not.toThrow();
  });
});
