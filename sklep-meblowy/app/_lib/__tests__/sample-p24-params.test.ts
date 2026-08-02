import { describe, it, expect } from "vitest";
import { buildSampleP24Params } from "../sample-p24";
import { SAMPLE_UNIT_PRICE, sampleOrderTotal } from "../sample-pricing";

// Wzorzec: checkout-p24-params.test.ts. Te asercje pilnują dwóch rzeczy, które
// bez testu chroni wyłącznie komentarz: przeliczenia złotych na grosze
// i tego, że e-mail idzie z sesji, a nie z formularza.

describe("buildSampleP24Params", () => {
  it("kwota idzie w GROSZACH (2 płatne próbki = 30 zł = 3000 gr)", () => {
    const p = buildSampleP24Params({
      orderId: "ord-1",
      amountTotal: 30,
      paidCount: 2,
      sessionEmail: "klient@example.com",
      origin: "https://shop",
    });
    expect(p.amount).toBe(3000);
  });

  it("jedna płatna próbka to 1500 groszy, nie 15", () => {
    const p = buildSampleP24Params({
      orderId: "ord-1",
      amountTotal: sampleOrderTotal(1),
      paidCount: 1,
      sessionEmail: "klient@example.com",
      origin: "https://shop",
    });
    expect(SAMPLE_UNIT_PRICE).toBe(15);
    expect(p.amount).toBe(1500);
  });

  it("e-mail w transakcji to DOKŁADNIE e-mail przekazany z sesji", () => {
    const p = buildSampleP24Params({
      orderId: "ord-1",
      amountTotal: 15,
      paidCount: 1,
      sessionEmail: "Jan.Kowalski+probki@gmail.com",
      origin: "https://shop",
    });
    // Bez normalizacji i bez podmiany: klucz puli to osobna sprawa, do P24 idzie
    // adres, na który klient realnie dostanie potwierdzenie płatności.
    expect(p.email).toBe("Jan.Kowalski+probki@gmail.com");
  });

  it("PLN-only: waluta, kraj i język bez gałęzi DE", () => {
    const p = buildSampleP24Params({
      orderId: "ord-1",
      amountTotal: 45,
      paidCount: 3,
      sessionEmail: "k@e.pl",
      origin: "https://shop",
    });
    expect(p.currency).toBe("PLN");
    expect(p.country).toBe("PL");
    expect(p.language).toBe("pl");
  });

  it("notyfikacja idzie na OSOBNY endpoint próbek, nie na /api/p24/status", () => {
    const p = buildSampleP24Params({
      orderId: "ord-7",
      amountTotal: 15,
      paidCount: 1,
      sessionEmail: "k@e.pl",
      origin: "https://shop",
    });
    expect(p.urlStatus).toBe("https://shop/api/p24/probki-status");
    expect(p.urlReturn).toBe("https://shop/probki/sukces?zamowienie=ord-7");
    expect(p.sessionId).toBe("ord-7");
  });

  it("opis transakcji mówi, ile sztuk jest płatnych", () => {
    const p = buildSampleP24Params({
      orderId: "ord-1",
      amountTotal: 60,
      paidCount: 4,
      sessionEmail: "k@e.pl",
      origin: "https://shop",
    });
    expect(p.description).toContain("4");
  });
});
