import { describe, it, expect, vi, beforeEach } from "vitest";

// Akcje panelu próbek. Testujemy dwie rzeczy, których nie widać w czystej
// logice z sample-groups.ts: strażnika statusu (druga, nieodświeżona karta
// panelu potrafi wysłać zamówienie, które JUŻ poszło) i to, kiedy w ogóle
// wychodzi mail „próbki wysłane".

const requireAdminMock = vi.fn();
const getSampleOrderByIdMock = vi.fn();
const setSampleOrderStatusMock = vi.fn();
const cancelSampleOrderMock = vi.fn();
const notifySentMock = vi.fn();

vi.mock("@/app/_lib/admin", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));

vi.mock("@/app/_lib/samples", () => ({
  getSampleOrderById: (...args: unknown[]) => getSampleOrderByIdMock(...args),
  setSampleOrderStatus: (...args: unknown[]) => setSampleOrderStatusMock(...args),
  cancelSampleOrder: (...args: unknown[]) => cancelSampleOrderMock(...args),
}));

vi.mock("@/app/_lib/mail/sample-notify", () => ({
  notifyCustomerSampleSent: (...args: unknown[]) => notifySentMock(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// `after` poza kontekstem żądania rzuca — kolejkujemy zadania, żeby sprawdzić,
// czy akcja zaplanowała maila.
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

import { markSamplePacked, markSampleSent } from "../actions";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function order(over: Record<string, unknown> = {}) {
  return {
    id: "ord-1",
    status: "packed",
    payment_status: "paid",
    customer_name: "Anna Kowalska",
    customer_email: "klientka@example.com",
    items: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  afterTasks.length = 0;
  requireAdminMock.mockResolvedValue(undefined);
  getSampleOrderByIdMock.mockResolvedValue(order());
  // `true` = ten zapis TRAFIŁ w wiersz (CAS). Od tego zależy, czy wyjdzie mail.
  setSampleOrderStatusMock.mockResolvedValue(true);
});

describe("markSampleSent", () => {
  it("zapisuje status i planuje mail „próbki wysłane”", async () => {
    const res = await markSampleSent(formData({ id: "ord-1", tracking: "PX1" }));
    await runAfterTasks();

    expect(res.ok).toBe(true);
    expect(setSampleOrderStatusMock).toHaveBeenCalledWith("ord-1", "sent", "PX1");
    expect(notifySentMock).toHaveBeenCalledWith("ord-1");
  });

  it("⚠️ zamówienia JUŻ WYSŁANEGO nie da się wysłać drugi raz", async () => {
    // Scenariusz z dwiema kartami panelu: w drugiej, nieodświeżonej, formularz
    // „Wysłane" wciąż stoi z PUSTYM numerem nadania. Bez tej blokady kliknięcie
    // przestawiłoby `sent_at` na „teraz", nadpisało numer nadania pustym
    // stringiem i wysłało klientowi DRUGIEGO maila — bez numeru.
    getSampleOrderByIdMock.mockResolvedValue(order({ status: "sent" }));

    const res = await markSampleSent(formData({ id: "ord-1", tracking: "" }));
    await runAfterTasks();

    expect(res.ok).toBe(false);
    expect(setSampleOrderStatusMock).not.toHaveBeenCalled();
    expect(notifySentMock).not.toHaveBeenCalled();
  });

  it("anulowanego nie wysyłamy (i nie mailujemy)", async () => {
    getSampleOrderByIdMock.mockResolvedValue(order({ status: "cancelled" }));

    const res = await markSampleSent(formData({ id: "ord-1" }));
    await runAfterTasks();

    expect(res.ok).toBe(false);
    expect(setSampleOrderStatusMock).not.toHaveBeenCalled();
    expect(notifySentMock).not.toHaveBeenCalled();
  });

  it("⚠️ PRZEGRANY WYŚCIG: zapis nie trafił w wiersz → zero maila, zero sukcesu", async () => {
    // Strażnik czyta świeży stan, ale między odczytem a zapisem mieści się
    // druga karta panelu — obie potrafią go przejść. Zapis warunkowy przepuszcza
    // jedną; przegrana nie może wysłać klientowi duplikatu maila (bez numeru
    // nadania, bo w jej formularzu pole było puste).
    setSampleOrderStatusMock.mockResolvedValue(false);

    const res = await markSampleSent(formData({ id: "ord-1", tracking: "" }));
    await runAfterTasks();

    expect(res.ok).toBe(false);
    expect(notifySentMock).not.toHaveBeenCalled();
  });

  it("nieudany zapis nie wysyła maila o wysyłce, która się nie zapisała", async () => {
    setSampleOrderStatusMock.mockRejectedValue(new Error("db down"));

    const res = await markSampleSent(formData({ id: "ord-1" }));
    await runAfterTasks();

    expect(res.ok).toBe(false);
    expect(notifySentMock).not.toHaveBeenCalled();
  });

  it("brak identyfikatora kończy się przed dotknięciem bazy", async () => {
    const res = await markSampleSent(formData({ id: "  " }));

    expect(res.ok).toBe(false);
    expect(getSampleOrderByIdMock).not.toHaveBeenCalled();
    expect(notifySentMock).not.toHaveBeenCalled();
  });
});

describe("markSamplePacked", () => {
  it("wysłanego nie da się cofnąć do „spakowane” (paczka poszłaby drugi raz)", async () => {
    getSampleOrderByIdMock.mockResolvedValue(order({ status: "sent" }));

    const res = await markSamplePacked(formData({ id: "ord-1" }));

    expect(res.ok).toBe(false);
    expect(setSampleOrderStatusMock).not.toHaveBeenCalled();
  });
});
