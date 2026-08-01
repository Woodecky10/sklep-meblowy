import { describe, it, expect, vi, beforeEach } from "vitest";

// Testy akcji składającej zamówienie. Sesja, warstwa danych i P24 są atrapami —
// sprawdzamy WYŁĄCZNIE to, co akcja robi z niezaufanym wejściem: skąd bierze
// e-mail (klucz darmowej puli!), kiedy w ogóle dochodzi do płatności i jaka
// kwota do niej idzie.

let sessionUser: { id: string; email?: string } | null = null;

const createSampleOrderMock = vi.fn();
const registerTransactionMock = vi.fn();

vi.mock("@/app/_lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
  }),
}));

vi.mock("@/app/_lib/samples", () => ({
  createSampleOrder: (...args: unknown[]) => createSampleOrderMock(...args),
}));

vi.mock("@/app/_lib/p24", () => ({
  registerTransaction: (...args: unknown[]) => registerTransactionMock(...args),
  trnRequestUrl: (token: string) => `https://p24.test/trnRequest/${token}`,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "https://shop.test" }),
}));

import { submitSampleOrder } from "../actions";

function formData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("selections", JSON.stringify([{ fabricId: "fab-1", fabricName: "Riviera", color: "16" }]));
  fd.set("name", "Jan Kowalski");
  fd.set("street", "Testowa 1");
  fd.set("postal_code", "00-001");
  fd.set("city", "Warszawa");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessionUser = { id: "user-1", email: "klient@example.com" };
  createSampleOrderMock.mockResolvedValue({
    orderId: "ord-1",
    amountTotal: 0,
    freeCount: 1,
    paidCount: 0,
  });
  registerTransactionMock.mockResolvedValue("token-abc");
});

describe("submitSampleOrder — tożsamość", () => {
  it("bez sesji nie dotyka warstwy danych", async () => {
    sessionUser = null;
    const res = await submitSampleOrder(formData());
    expect(res).toEqual({ ok: false, error: "Zamawianie próbek wymaga zalogowania" });
    expect(createSampleOrderMock).not.toHaveBeenCalled();
  });

  it("konto bez e-maila jest odrzucane (bez e-maila nie ma klucza puli)", async () => {
    sessionUser = { id: "user-1" };
    const res = await submitSampleOrder(formData());
    expect(res.ok).toBe(false);
    expect(createSampleOrderMock).not.toHaveBeenCalled();
  });

  it("e-mail PODSTAWIONY w formularzu jest ignorowany — liczy się sesja", async () => {
    // Gdyby akcja czytała to pole, atakujący spaliłby cudzą pulę na rok:
    // normalizeEmailKey("ofiara+x@gmail.com") to klucz prawdziwej skrzynki ofiary.
    await submitSampleOrder(formData({ email: "ofiara@gmail.com" }));

    expect(createSampleOrderMock).toHaveBeenCalledTimes(1);
    const arg = createSampleOrderMock.mock.calls[0][0] as { email: string; userId: string };
    expect(arg.email).toBe("klient@example.com");
    expect(arg.userId).toBe("user-1");
  });
});

describe("submitSampleOrder — walidacja wejścia", () => {
  it("niepoprawny JSON nie leci do bazy", async () => {
    const res = await submitSampleOrder(formData({ selections: "{nie-json" }));
    expect(res).toEqual({ ok: false, error: "Nieprawidłowy wybór próbek" });
    expect(createSampleOrderMock).not.toHaveBeenCalled();
  });

  it("wpis bez koloru jest odrzucany zanim dotknie klucza obcego fabric_id", async () => {
    const res = await submitSampleOrder(
      formData({ selections: JSON.stringify([{ fabricId: "fab-1", fabricName: "X" }]) })
    );
    expect(res).toEqual({ ok: false, error: "Nieprawidłowy wybór próbek" });
    expect(createSampleOrderMock).not.toHaveBeenCalled();
  });

  it("pusty wybór = komunikat, nie zamówienie", async () => {
    const res = await submitSampleOrder(formData({ selections: "[]" }));
    expect(res).toEqual({ ok: false, error: "Wybierz przynajmniej jedną próbkę" });
    expect(createSampleOrderMock).not.toHaveBeenCalled();
  });

  it("brak adresu zatrzymuje zamówienie", async () => {
    const res = await submitSampleOrder(formData({ city: "  " }));
    expect(res.ok).toBe(false);
    expect(createSampleOrderMock).not.toHaveBeenCalled();
  });
});

describe("submitSampleOrder — rozwidlenie na kwocie", () => {
  it("zamówienie darmowe nie otwiera bramki płatności", async () => {
    const res = await submitSampleOrder(formData());
    expect(res).toEqual({ ok: true, data: { orderId: "ord-1", redirectUrl: null } });
    expect(registerTransactionMock).not.toHaveBeenCalled();
  });

  it("zamówienie płatne rejestruje transakcję na kwotę w GROSZACH", async () => {
    createSampleOrderMock.mockResolvedValue({
      orderId: "ord-2",
      amountTotal: 30,
      freeCount: 3,
      paidCount: 2,
    });

    const res = await submitSampleOrder(formData());

    const params = registerTransactionMock.mock.calls[0][0] as Record<string, unknown>;
    expect(params.amount).toBe(3000);
    expect(params.currency).toBe("PLN");
    expect(params.email).toBe("klient@example.com");
    expect(params.urlStatus).toBe("https://shop.test/api/p24/probki-status");
    expect(res).toEqual({
      ok: true,
      data: { orderId: "ord-2", redirectUrl: "https://p24.test/trnRequest/token-abc" },
    });
  });

  it("błąd warstwy danych KOŃCZY zamówienie (żadnego 'lecimy dalej bez gratisów')", async () => {
    createSampleOrderMock.mockRejectedValue(new Error("Nie udało się sprawdzić puli: boom"));

    const res = await submitSampleOrder(formData());

    expect(res.ok).toBe(false);
    expect(registerTransactionMock).not.toHaveBeenCalled();
  });

  it("padnięta rejestracja P24 nie udaje sukcesu", async () => {
    createSampleOrderMock.mockResolvedValue({
      orderId: "ord-3",
      amountTotal: 15,
      freeCount: 0,
      paidCount: 1,
    });
    registerTransactionMock.mockRejectedValue(new Error("P24 register nieudany (500)"));

    const res = await submitSampleOrder(formData());

    expect(res.ok).toBe(false);
  });
});
