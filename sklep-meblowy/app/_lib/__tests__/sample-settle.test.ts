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

const maybeSingleMock = vi.fn();
const markSampleOrderPaidMock = vi.fn();
const verifyTransactionMock = vi.fn();
const notifyCustomerMock = vi.fn();
const notifyAdminMock = vi.fn();

// `after` poza kontekstem żądania RZUCA (next/dist/server/after/after.js), więc
// bez tej atrapy każdy test wołający POST wywracałby się na wysyłce maila.
// Zadania kolejkujemy zamiast je gubić: to jedyny sposób, żeby sprawdzić, CO
// handler zaplanował po odpowiedzi — a to właśnie tam siedzi reguła „mail tylko
// przy pierwszym rozliczeniu".
const afterTasks: (() => unknown)[] = [];
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: () => unknown) => {
      afterTasks.push(task);
    },
  };
});

async function runAfterTasks() {
  for (const task of afterTasks) await task();
}

vi.mock("@/app/_lib/mail/sample-notify", () => ({
  notifyCustomerSampleOrder: (...args: unknown[]) => notifyCustomerMock(...args),
  notifyAdminNewSampleOrder: (...args: unknown[]) => notifyAdminMock(...args),
}));
// Co i skąd handler czyta — sprawdzamy wprost, bo rozliczenie NIE MOŻE
// przechodzić przez getSampleOrderById (helper połyka błąd odczytu).
const queries: { table: string; columns: string; id: unknown }[] = [];

vi.mock("@/app/_lib/supabase/server", () => ({
  createAdminClient: async () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (_col: string, id: unknown) => ({
          maybeSingle: () => {
            queries.push({ table, columns, id });
            return maybeSingleMock();
          },
        }),
      }),
    }),
  }),
}));

vi.mock("@/app/_lib/samples", () => ({
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

// Wiersz taki, jaki oddaje `select("status, payment_status, amount_total")`.
function row(over: Record<string, unknown> = {}) {
  return { data: { status: "new", payment_status: "pending", amount_total: 15, ...over }, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  afterTasks.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  maybeSingleMock.mockResolvedValue(row());
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
    expect(queries).toHaveLength(0);
    expect(markSampleOrderPaidMock).not.toHaveBeenCalled();
  });

  it("niepoprawny JSON → 400", async () => {
    const res = await post("{nie-json");
    expect(res.status).toBe(400);
    expect(queries).toHaveLength(0);
  });

  it("poprawny JSON, który nie jest obiektem, nie wywraca handlera", async () => {
    const res = await post("null");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/p24/probki-status — zamówienie", () => {
  it("czyta wiersz zamówienia próbek po sessionId, bez joinu pozycji", async () => {
    await post(notification());

    expect(queries).toEqual([
      { table: "sample_orders", columns: "status, payment_status, amount_total", id: "ord-1" },
    ]);
  });

  it("BŁĄD ODCZYTU bazy → 500, żeby P24 PONOWIŁO (inaczej wpłata przepada)", async () => {
    // ⚠️ Sedno: „nie ma wiersza" i „baza nie odpowiedziała" MUSZĄ dać różne
    // odpowiedzi. Gdyby oba dawały 200, chwilowa awaria Supabase kasowałaby
    // ponowienie, a zamówienie zostawało `pending` mimo pobranych pieniędzy.
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "timeout" } });

    const res = await post(notification());

    expect(res.status).toBe(500);
    expect(verifyTransactionMock).not.toHaveBeenCalled();
    expect(markSampleOrderPaidMock).not.toHaveBeenCalled();
  });

  it("nieznane zamówienie → 200 (P24 nie ma czego ponawiać), bez rozliczenia", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const res = await post(notification());

    expect(res.status).toBe(200);
    expect(verifyTransactionMock).not.toHaveBeenCalled();
    expect(markSampleOrderPaidMock).not.toHaveBeenCalled();
  });

  it("ponowiona notyfikacja dla opłaconego zamówienia nie płaci drugi raz", async () => {
    maybeSingleMock.mockResolvedValue(row({ payment_status: "paid" }));

    const res = await post(notification());

    expect(res.status).toBe(200);
    expect(verifyTransactionMock).not.toHaveBeenCalled();
    expect(markSampleOrderPaidMock).not.toHaveBeenCalled();
  });

  it("anulowane zamówienie i tak dostaje payment_ref (bez niego nie ma z czego zrobić zwrotu)", async () => {
    maybeSingleMock.mockResolvedValue(row({ status: "cancelled" }));

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
    maybeSingleMock.mockResolvedValue(row({ amount_total: 45 }));

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
    maybeSingleMock.mockResolvedValue(row({ amount_total: 0, payment_status: "none" }));

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

// Potwierdzenie zamówienia PŁATNEGO wychodzi wyłącznie stąd — akcja składająca
// zamówienie mailuje tylko darmowe (nie dziękujemy za porzuconą bramkę).
describe("POST /api/p24/probki-status — maile", () => {
  it("pierwsze rozliczenie planuje potwierdzenie dla klienta i powiadomienie właścicielki", async () => {
    await post(notification());
    await runAfterTasks();

    expect(notifyCustomerMock).toHaveBeenCalledWith("ord-1");
    expect(notifyAdminMock).toHaveBeenCalledWith("ord-1");
  });

  it("PONOWIONA notyfikacja nie wysyła potwierdzenia drugi raz", async () => {
    // ⚠️ Sedno: P24 ponawia notyfikację, dopóki nie dostanie 200. Gdyby mail
    // szedł poza zwycięzcą CAS-a, klient dostałby „dziękujemy" kilka razy.
    markSampleOrderPaidMock.mockResolvedValue(false);

    await post(notification());
    await runAfterTasks();

    expect(afterTasks).toHaveLength(0);
    expect(notifyCustomerMock).not.toHaveBeenCalled();
    expect(notifyAdminMock).not.toHaveBeenCalled();
  });

  it("ponowienie odbite na dedupie (payment_status już 'paid') też nie mailuje", async () => {
    maybeSingleMock.mockResolvedValue(row({ payment_status: "paid" }));

    await post(notification());
    await runAfterTasks();

    expect(notifyCustomerMock).not.toHaveBeenCalled();
  });

  it("za ANULOWANE zamówienie nie dziękujemy — payment_ref tak, mail nie", async () => {
    maybeSingleMock.mockResolvedValue(row({ status: "cancelled" }));

    await post(notification());
    await runAfterTasks();

    expect(markSampleOrderPaidMock).toHaveBeenCalledWith("ord-1", "987654");
    expect(notifyCustomerMock).not.toHaveBeenCalled();
    expect(notifyAdminMock).not.toHaveBeenCalled();
  });

  it("niezgodna kwota nie planuje żadnego maila", async () => {
    const res = await post(notification({ amount: 15 }));
    await runAfterTasks();

    expect(res.status).toBe(200);
    expect(notifyCustomerMock).not.toHaveBeenCalled();
  });
});
