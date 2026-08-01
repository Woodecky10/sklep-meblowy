import { describe, it, expect, vi, beforeEach } from "vitest";

// Rozliczenie płatności za PRÓBKI (POST /api/p24/probki-status). Testujemy
// bramki, przez które przechodzą pieniądze: podpis, kwotę (złote ↔ grosze),
// walutę, dedup i to, czy nieudany zapis w bazie prosi P24 o ponowienie.
//
// Warstwa danych i `verifyTransaction` są atrapami, ale PODPIS liczymy
// prawdziwym p24Sign — inaczej test bramki podpisu sprawdzałby atrapę.

const CRC = "abc123crc";

vi.stubEnv("P24_MERCHANT_ID", "1234");
vi.stubEnv("P24_POS_ID", "1234");
vi.stubEnv("P24_API_KEY", "key");
vi.stubEnv("P24_CRC", CRC);
vi.stubEnv("P24_BASE_URL", "https://sandbox.przelewy24.pl");

const getSampleOrderByIdMock = vi.fn();
const markSampleOrderPaidMock = vi.fn();
const verifyTransactionMock = vi.fn();

vi.mock("@/app/_lib/samples", () => ({
  getSampleOrderById: (...args: unknown[]) => getSampleOrderByIdMock(...args),
  markSampleOrderPaid: (...args: unknown[]) => markSampleOrderPaidMock(...args),
}));

vi.mock("@/app/_lib/p24", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/_lib/p24")>();
  return {
    ...actual,
    verifyTransaction: (...args: unknown[]) => verifyTransactionMock(...args),
  };
});

import { expectedNotificationSign, type P24Notification } from "../p24-events";
import { POST, expectedSampleAmount } from "../../api/p24/probki-status/route";

function notification(over: Partial<P24Notification> = {}): P24Notification {
  const base: P24Notification = {
    merchantId: 1234,
    posId: 1234,
    sessionId: "ord-1",
    amount: 1500,
    originAmount: 1500,
    currency: "PLN",
    orderId: 987654,
    methodId: 1,
    statement: "stmt-1",
    sign: "",
    ...over,
  };
  // Podpis liczymy PO nadpisaniach, żeby zmiana kwoty w teście dawała
  // notyfikację poprawnie podpisaną (to bramka kwoty ma ją odrzucić, nie podpis).
  return { ...base, sign: over.sign ?? expectedNotificationSign(base, CRC) };
}

function post(body: unknown) {
  return POST(
    new Request("https://sklep.test/api/p24/probki-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  );
}

function order(over: Record<string, unknown> = {}) {
  return {
    id: "ord-1",
    user_id: "user-1",
    status: "new",
    payment_status: "pending",
    amount_total: 15,
    items: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  getSampleOrderByIdMock.mockResolvedValue(order());
  markSampleOrderPaidMock.mockResolvedValue(true);
  verifyTransactionMock.mockResolvedValue(true);
});

describe("expectedSampleAmount", () => {
  it("przelicza złote na grosze (amount_total jest w złotych, notyfikacja w groszach)", () => {
    expect(expectedSampleAmount(15)).toBe(1500);
    expect(expectedSampleAmount(45)).toBe(4500);
    expect(expectedSampleAmount(0)).toBe(0);
    expect(expectedSampleAmount(0.1 + 0.2)).toBe(30); // bez błędu floata
  });
});

describe("POST /api/p24/probki-status — bramka podpisu", () => {
  it("podrobiony podpis → 400 i zero ruchu w bazie", async () => {
    const res = await post(notification({ sign: "podrobka" }));

    expect(res.status).toBe(400);
    expect(getSampleOrderByIdMock).not.toHaveBeenCalled();
    expect(markSampleOrderPaidMock).not.toHaveBeenCalled();
  });

  it("niepoprawny JSON → 400", async () => {
    const res = await post("{nie-json");
    expect(res.status).toBe(400);
    expect(getSampleOrderByIdMock).not.toHaveBeenCalled();
  });

  it("poprawny JSON, który nie jest obiektem, nie wywraca handlera", async () => {
    const res = await post("null");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/p24/probki-status — zamówienie", () => {
  it("nieznane zamówienie → 200 (P24 nie ma czego ponawiać), bez rozliczenia", async () => {
    getSampleOrderByIdMock.mockResolvedValue(null);

    const res = await post(notification());

    expect(res.status).toBe(200);
    expect(verifyTransactionMock).not.toHaveBeenCalled();
    expect(markSampleOrderPaidMock).not.toHaveBeenCalled();
  });

  it("ponowiona notyfikacja dla opłaconego zamówienia nie płaci drugi raz", async () => {
    getSampleOrderByIdMock.mockResolvedValue(order({ payment_status: "paid" }));

    const res = await post(notification());

    expect(res.status).toBe(200);
    expect(verifyTransactionMock).not.toHaveBeenCalled();
    expect(markSampleOrderPaidMock).not.toHaveBeenCalled();
  });

  it("anulowane zamówienie i tak dostaje payment_ref (bez niego nie ma z czego zrobić zwrotu)", async () => {
    getSampleOrderByIdMock.mockResolvedValue(order({ status: "cancelled" }));

    const res = await post(notification());

    expect(res.status).toBe(200);
    expect(markSampleOrderPaidMock).toHaveBeenCalledWith("ord-1", "987654");
  });
});

describe("POST /api/p24/probki-status — kwota i waluta", () => {
  it("kwota w GROSZACH zgadza się z amount_total w złotych → rozliczenie", async () => {
    const res = await post(notification({ amount: 1500 }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(verifyTransactionMock).toHaveBeenCalledWith({
      sessionId: "ord-1",
      orderId: 987654,
      amount: 1500,
      currency: "PLN",
    });
    expect(markSampleOrderPaidMock).toHaveBeenCalledWith("ord-1", "987654");
  });

  it("kwota podana jak w złotych (15 zamiast 1500) NIE rozlicza zamówienia", async () => {
    const res = await post(notification({ amount: 15 }));

    expect(res.status).toBe(200);
    expect(verifyTransactionMock).not.toHaveBeenCalled();
    expect(markSampleOrderPaidMock).not.toHaveBeenCalled();
  });

  it("zaniżona kwota nie rozlicza zamówienia", async () => {
    getSampleOrderByIdMock.mockResolvedValue(order({ amount_total: 45 }));

    const res = await post(notification({ amount: 1500 }));

    expect(res.status).toBe(200);
    expect(markSampleOrderPaidMock).not.toHaveBeenCalled();
  });

  it("inna waluta niż PLN nie rozlicza zamówienia (próbki są PLN-only)", async () => {
    const res = await post(notification({ currency: "EUR" }));

    expect(res.status).toBe(200);
    expect(markSampleOrderPaidMock).not.toHaveBeenCalled();
  });

  it("zamowienia w calosci darmowego (amount_total 0) nie da sie oplacic notyfikacja", async () => {
    getSampleOrderByIdMock.mockResolvedValue(
      order({ amount_total: 0, payment_status: "none" })
    );

    const res = await post(notification({ amount: 1500 }));

    expect(res.status).toBe(200);
    expect(markSampleOrderPaidMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/p24/probki-status — verify i zapis", () => {
  it("verify odrzucony → zamówienie zostaje nieopłacone", async () => {
    verifyTransactionMock.mockResolvedValue(false);

    const res = await post(notification());

    expect(res.status).toBe(200);
    expect(markSampleOrderPaidMock).not.toHaveBeenCalled();
  });

  it("błąd zapisu → 500, żeby P24 ponowiło notyfikację", async () => {
    markSampleOrderPaidMock.mockRejectedValue(new Error("db down"));

    const res = await post(notification());

    expect(res.status).toBe(500);
  });

  it("powtórka po rozliczeniu (claim przegrany) dalej odpowiada 200", async () => {
    markSampleOrderPaidMock.mockResolvedValue(false);

    const res = await post(notification());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });
});
