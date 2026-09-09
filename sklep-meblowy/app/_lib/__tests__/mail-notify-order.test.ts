import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getOrderByIdMock = vi.fn();
const getProfilesByIdsMock = vi.fn();

vi.mock("../orders", () => ({
  getOrderById: (...args: unknown[]) => getOrderByIdMock(...args),
  getProfilesByIds: (...args: unknown[]) => getProfilesByIdsMock(...args),
}));

const sendMailMock = vi.fn();

vi.mock("../mail/send", () => ({
  sendMail: (...args: unknown[]) => sendMailMock(...args),
}));

// Bez tego mocka getMailBranding() prawdziwie odpytuje store_settings przez
// createAdminClient — na maszynie z wypełnionym .env.local to jest żywy
// odczyt z podłączonego projektu Supabase (produkcja), bo Vitest wczytuje
// .env* do process.env i ten plik nie mockował dotąd branding-server.
// Fabryka async, żeby móc bezpiecznie zaimportować prawdziwy `brandingFromRaw`
// (obok hoistingu vi.mock) i zbudować deterministyczną fiksturę, której
// kształt nie może rozjechać się z typem MailBranding.
vi.mock("../mail/branding-server", async () => {
  const { brandingFromRaw } = await import("../mail/branding");
  return {
    getMailBranding: vi.fn(async () => brandingFromRaw(null)),
  };
});

import {
  notifyOrderPlaced,
  notifyStatusChange,
  sendExternalOrderAcceptedMail,
} from "../mail/notify-order";

// Zamówienie minimalne, ale kompletne pod kątem pól, których faktycznie
// dotykają OrderConfirmation i AdminNewOrder (patrz sekcja "pola wymagane
// przez szablony" w raporcie Task 4).
const MINIMAL_ORDER = {
  id: "order-int-test-1",
  user_id: null,
  guest_email: "klient@example.com",
  status: "processing",
  total: 199.99,
  currency: "pln",
  fx_rate: null,
  shipping_address: {
    fullname: "Jan Testowy",
    street: "Testowa 1",
    postal_code: "00-001",
    city: "Warszawa",
    country: "Polska",
    phone: "500600700",
  },
  payment_method: "online",
  promo_code_id: null,
  promo_discount: 0,
  bundle_discount: 0,
  created_at: new Date().toISOString(),
  order_number: 4242,
  admin_note: null,
  carrier: null,
  tracking_number: null,
  delivery_cost: null,
  delivery_paid: false,
  status_updated_at: null,
  source: null,
  items: [
    {
      id: "item-1",
      order_id: "order-int-test-1",
      product_id: "prod-1",
      quantity: 1,
      price: 199.99,
      variant_values: null,
      notes: null,
      bundle_id: null,
      bundle_label: null,
      custom_name: "",
      product: { name: "Fotel testowy" },
    },
  ],
};

// Pozycja SPOZA KATALOGU (migracja 82): brak product_id, brak joina z products,
// nazwa wyłącznie w custom_name. Szablony muszą pokazać właśnie ją, a nie
// zastępcze „Produkt".
const CUSTOM_ITEM = {
  id: "item-custom-1",
  order_id: "order-int-test-1",
  product_id: null,
  quantity: 2,
  price: 250,
  variant_values: null,
  notes: null,
  bundle_id: null,
  bundle_label: null,
  custom_name: "Pufa na zamówienie",
  product: null,
};

describe("notifyOrderPlaced", () => {
  beforeEach(() => {
    getOrderByIdMock.mockReset();
    getProfilesByIdsMock.mockReset();
    sendMailMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("błąd odczytu zamówienia nie rzuca — to jest sedno kontraktu (webhook/checkout nie mogą się wywalić)", async () => {
    getOrderByIdMock.mockRejectedValue(new Error("DB nieosiągalna"));

    await expect(notifyOrderPlaced("any-id")).resolves.toBeUndefined();

    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("wysyła mail do klienta ORAZ do właścicielki, gdy MAIL_ADMIN_TO jest ustawiony", async () => {
    getOrderByIdMock.mockResolvedValue(MINIMAL_ORDER);
    sendMailMock.mockResolvedValue(true);
    vi.stubEnv("MAIL_ADMIN_TO", "wlascicielka@mollien.pl");

    await notifyOrderPlaced(MINIMAL_ORDER.id);

    expect(sendMailMock).toHaveBeenCalledTimes(2);

    const [customerCall, adminCall] = sendMailMock.mock.calls.map((c) => c[0]);

    expect(customerCall.to).toBe(MINIMAL_ORDER.guest_email);
    expect(customerCall.subject).toContain(String(MINIMAL_ORDER.order_number));

    expect(adminCall.to).toBe("wlascicielka@mollien.pl");
    expect(adminCall.subject).toContain("Nowe zamówienie");
  });

  it("pozycja spoza katalogu → w obu mailach jej nazwa, nie zastępcze „Produkt”", async () => {
    getOrderByIdMock.mockResolvedValue({ ...MINIMAL_ORDER, items: [CUSTOM_ITEM] });
    sendMailMock.mockResolvedValue(true);
    vi.stubEnv("MAIL_ADMIN_TO", "wlascicielka@mollien.pl");

    await notifyOrderPlaced(MINIMAL_ORDER.id);

    const [customerCall, adminCall] = sendMailMock.mock.calls.map((c) => c[0]);
    expect(customerCall.html).toContain("Pufa na zamówienie");
    expect(customerCall.html).not.toContain(">Produkt<");
    expect(adminCall.html).toContain("Pufa na zamówienie");
  });
});

// Ręczna wysyłka z karty zamówienia (decyzja właściciela 2026-09-09: automat
// znika). Funkcja dostaje zamówienie i GOTOWĄ treść z panelu — nie czyta bazy
// i nie zna szablonowych akapitów.
describe("sendExternalOrderAcceptedMail — wysyłka z przycisku w panelu", () => {
  const EXTERNAL = { guest_email: "klient@example.com", user_id: null };

  beforeEach(() => {
    getOrderByIdMock.mockReset();
    getProfilesByIdsMock.mockReset();
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue(true);
  });

  it("wysyła DOKŁADNIE treść wpisaną w panelu, pod temat „Dziękujemy za zamówienie”", async () => {
    const res = await sendExternalOrderAcceptedMail(
      EXTERNAL,
      "Dzień dobry,\n\nzamówienie z Allegro przyjęte. Realizacja do 10 dni."
    );

    expect(res).toEqual({ ok: true });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.to).toBe(EXTERNAL.guest_email);
    expect(payload.subject).toBe("Dziękujemy za zamówienie – Mollien 🤍");
    expect(payload.html).toContain("zamówienie z Allegro przyjęte. Realizacja do 10 dni.");
    // Stara, sztywna treść szablonu zniknęła razem z automatem.
    expect(payload.html).not.toContain("21 dni roboczych");
  });

  it("nie czyta zamówienia z bazy — treść i adresat przychodzą z akcji", async () => {
    await sendExternalOrderAcceptedMail(EXTERNAL, "Dzień dobry,");

    expect(getOrderByIdMock).not.toHaveBeenCalled();
  });

  it("odmowa Resenda WRACA do panelu jako błąd — inaczej niż w automacie, który połykał wszystko", async () => {
    sendMailMock.mockResolvedValue(false);

    const res = await sendExternalOrderAcceptedMail(EXTERNAL, "Dzień dobry,");

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/Nie udało się wysłać/);
  });

  it("zamówienie bez adresu e-mail → błąd, zero wysyłki", async () => {
    const res = await sendExternalOrderAcceptedMail({ guest_email: null, user_id: null }, "Treść");

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/adresu e-mail/);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("klient zalogowany (bez guest_email) → adres z profilu", async () => {
    getProfilesByIdsMock.mockResolvedValue({ "user-1": { email: "konto@example.com" } });

    const res = await sendExternalOrderAcceptedMail(
      { guest_email: null, user_id: "user-1" },
      "Dzień dobry,"
    );

    expect(res).toEqual({ ok: true });
    expect(sendMailMock.mock.calls[0][0].to).toBe("konto@example.com");
  });
});

describe("notifyStatusChange — zamówienie zewnętrzne", () => {
  const EXTERNAL_ORDER = { ...MINIMAL_ORDER, source: "Allegro", status: "processing" };

  beforeEach(() => {
    getOrderByIdMock.mockReset();
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue(true);
  });

  it("processing + źródło → NIC nie wysyła (automat zniknął 2026-09-09) i nawet nie czyta bazy", async () => {
    getOrderByIdMock.mockResolvedValue(EXTERNAL_ORDER);

    await notifyStatusChange(EXTERNAL_ORDER.id, "processing", "paid");

    expect(sendMailMock).not.toHaveBeenCalled();
    expect(getOrderByIdMock).not.toHaveBeenCalled();
  });

  it("processing BEZ źródła (sklep) → nic nie wysyła, jak dotąd", async () => {
    getOrderByIdMock.mockResolvedValue({ ...MINIMAL_ORDER, source: null });

    await notifyStatusChange(MINIMAL_ORDER.id, "processing", "paid");

    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("shipped + źródło → mail „w drodze” bez zmian", async () => {
    getOrderByIdMock.mockResolvedValue({ ...EXTERNAL_ORDER, status: "shipped" });

    await notifyStatusChange(EXTERNAL_ORDER.id, "shipped", "processing");

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0][0].subject).toContain("jest w drodze");
  });

  it("delivered → nie czyta nawet zamówienia (tani filtr)", async () => {
    await notifyStatusChange("any", "delivered", "shipped");

    expect(getOrderByIdMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("cancelled + źródło → mail o anulowaniu BEZ obietnicy zwrotu", async () => {
    getOrderByIdMock.mockResolvedValue({ ...EXTERNAL_ORDER, status: "cancelled" });

    await notifyStatusChange(EXTERNAL_ORDER.id, "cancelled", "paid");

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0][0].html).not.toContain("zwrotu środków");
  });
});
