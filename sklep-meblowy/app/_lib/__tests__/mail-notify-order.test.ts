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

import { notifyOrderPlaced } from "../mail/notify-order";

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
  stripe_payment_intent: null,
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
      product: { name: "Fotel testowy" },
    },
  ],
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
});
