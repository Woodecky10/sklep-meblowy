import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Trzy maile próbek. Sedno tych testów to KONTRAKT modułu: żadna z funkcji nie
// rzuca, bo woła je notyfikacja P24 (wyjątek = 500 = ponowienie i mail parę
// razy), akcja klienta (wyjątek = błąd zamiast paczki) i akcja panelu
// (wyjątek = „nie udało się" mimo zapisanej wysyłki). Do tego: adres klienta
// bierze się ze SNAPSHOTU zamówienia, nie z sesji.

const getSampleOrderByIdMock = vi.fn();
const sendMailMock = vi.fn();

vi.mock("../samples", () => ({
  getSampleOrderById: (...args: unknown[]) => getSampleOrderByIdMock(...args),
}));

vi.mock("../mail/send", () => ({
  sendMail: (...args: unknown[]) => sendMailMock(...args),
}));

// Bez tej atrapy getMailBranding() odpytuje store_settings przez
// createAdminClient — czyli ŻYWĄ bazę produkcyjną, bo Vitest wczytuje .env*
// do process.env (ten sam powód co w mail-notify-order.test.ts).
vi.mock("../mail/branding-server", async () => {
  const { brandingFromRaw } = await import("../mail/branding");
  return { getMailBranding: vi.fn(async () => brandingFromRaw(null)) };
});

import {
  notifyAdminNewSampleOrder,
  notifyCustomerSampleOrder,
  notifyCustomerSampleSent,
} from "../mail/sample-notify";

const ORDER = {
  id: "a1b2c3d4-1111-2222-3333-444455556666",
  user_id: "user-1",
  customer_name: "Anna Kowalska",
  customer_email: "klientka@example.com",
  customer_phone: "600700800",
  shipping_address: { street: "Kwiatowa 12", postal_code: "61-001", city: "Poznań" },
  status: "new",
  payment_status: "paid",
  amount_total: 15,
  payment_ref: "987654",
  free_count: 3,
  paid_count: 1,
  email_key: "klientka@example.com",
  tracking: null,
  sent_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  items: [
    {
      id: "it-1",
      sample_order_id: "a1b2c3d4-1111-2222-3333-444455556666",
      fabric_id: "fab-1",
      color: "16",
      fabric_name: "Riviera",
      is_free: true,
      unit_price: 0,
      created_at: new Date().toISOString(),
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  getSampleOrderByIdMock.mockResolvedValue(ORDER);
  sendMailMock.mockResolvedValue(true);
  vi.stubEnv("MAIL_ADMIN_TO", "wlascicielka@mollien.pl");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://sklep.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sample-notify — żadna funkcja nie rzuca", () => {
  it("brak zamówienia (albo błąd odczytu) nie wywraca żadnej z trzech funkcji", async () => {
    getSampleOrderByIdMock.mockResolvedValue(null);

    await expect(notifyAdminNewSampleOrder("x")).resolves.toBeUndefined();
    await expect(notifyCustomerSampleOrder("x")).resolves.toBeUndefined();
    await expect(notifyCustomerSampleSent("x")).resolves.toBeUndefined();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("wyjątek z warstwy danych zostaje w środku", async () => {
    getSampleOrderByIdMock.mockRejectedValue(new Error("DB nieosiągalna"));

    await expect(notifyAdminNewSampleOrder("x")).resolves.toBeUndefined();
    await expect(notifyCustomerSampleOrder("x")).resolves.toBeUndefined();
    await expect(notifyCustomerSampleSent("x")).resolves.toBeUndefined();
  });

  it("padnięty Resend nie wychodzi na zewnątrz — klient i tak dostaje paczkę", async () => {
    sendMailMock.mockRejectedValue(new Error("Resend down"));

    await expect(notifyCustomerSampleOrder(ORDER.id)).resolves.toBeUndefined();
    await expect(notifyCustomerSampleSent(ORDER.id)).resolves.toBeUndefined();
    await expect(notifyAdminNewSampleOrder(ORDER.id)).resolves.toBeUndefined();
  });

  it("zamówienie bez adresu e-mail nie wysyła i nie rzuca", async () => {
    getSampleOrderByIdMock.mockResolvedValue({ ...ORDER, customer_email: "" });

    await expect(notifyCustomerSampleOrder(ORDER.id)).resolves.toBeUndefined();
    await expect(notifyCustomerSampleSent(ORDER.id)).resolves.toBeUndefined();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe("notifyAdminNewSampleOrder", () => {
  it("wysyła na MAIL_ADMIN_TO, nie na adres klienta", async () => {
    await notifyAdminNewSampleOrder(ORDER.id);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const payload = sendMailMock.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(payload.to).toBe("wlascicielka@mollien.pl");
    expect(payload.subject).toContain("Nowe zamówienie próbek");
    // Lista kolorów i link do panelu — po to ten mail w ogóle jest.
    expect(payload.html).toContain("Riviera");
    expect(payload.html).toContain("https://sklep.test/admin/probki");
  });

  it("bez MAIL_ADMIN_TO nie czyta nawet bazy", async () => {
    vi.stubEnv("MAIL_ADMIN_TO", "");

    await notifyAdminNewSampleOrder(ORDER.id);

    expect(getSampleOrderByIdMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe("notifyCustomerSampleOrder", () => {
  it("bierze adres ze SNAPSHOTU zamówienia", async () => {
    await notifyCustomerSampleOrder(ORDER.id);

    const payload = sendMailMock.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(payload.to).toBe("klientka@example.com");
    expect(payload.subject).toBe("Zamówienie próbek przyjęte");
    // Skrócony numer — ten sam, który klient widzi na /probki/sukces.
    expect(payload.html).toContain("A1B2C3D4");
  });
});

describe("notifyCustomerSampleSent", () => {
  it("wchodzi w mail z numerem nadania, gdy jest", async () => {
    getSampleOrderByIdMock.mockResolvedValue({ ...ORDER, status: "sent", tracking: "PX123456789" });

    await notifyCustomerSampleSent(ORDER.id);

    const payload = sendMailMock.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(payload.to).toBe("klientka@example.com");
    expect(payload.subject).toBe("Twoje próbki są w drodze");
    expect(payload.html).toContain("PX123456789");
    expect(payload.html).toContain("Numer nadania");
  });

  it("bez numeru nadania nie pokazuje pustej etykiety — próbki jadą zwykłą kopertą", async () => {
    getSampleOrderByIdMock.mockResolvedValue({ ...ORDER, status: "sent", tracking: "   " });

    await notifyCustomerSampleSent(ORDER.id);

    const payload = sendMailMock.mock.calls[0][0] as { html: string };
    expect(payload.html).not.toContain("Numer nadania");
    expect(payload.html).toContain("nie ma numeru do śledzenia");
  });
});
