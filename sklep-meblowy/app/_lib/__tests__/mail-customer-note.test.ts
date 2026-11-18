import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import { brandingFromRaw } from "../mail/branding";
import { OrderConfirmation } from "../mail/templates/OrderConfirmation";
import { AdminNewOrder } from "../mail/templates/AdminNewOrder";
import type { Order } from "../types";

const order = {
  id: "o1",
  user_id: null,
  guest_email: "a@example.com",
  status: "paid",
  total: 100,
  currency: "pln",
  fx_rate: null,
  shipping_address: {
    fullname: "Jan Kowalski",
    street: "Prosta 1",
    postal_code: "00-001",
    city: "Warszawa",
    phone: "123456789",
  },
  payment_ref: null,
  payment_provider: null,
  payment_method: "online",
  promo_code_id: null,
  promo_discount: 0,
  bundle_discount: 0,
  created_at: "2026-11-18T10:00:00Z",
  order_number: 42,
  admin_note: null,
  carrier: null,
  tracking_number: null,
  delivery_cost: null,
  delivery_paid: false,
  status_updated_at: null,
  source: null,
} as unknown as Order;

function renderConfirmation(o: Order, locale: "pl" | "de" = "pl") {
  return render(
    OrderConfirmation({
      order: o,
      items: [],
      branding: brandingFromRaw(null),
      locale,
      orderUrl: "https://www.mollien.pl/konto/zamowienia/o1",
      hasAccount: false,
    })
  );
}

function renderAdminNewOrder(o: Order) {
  return render(
    AdminNewOrder({
      order: o,
      items: [],
      branding: brandingFromRaw(null),
      customerEmail: "a@example.com",
      adminUrl: "https://www.mollien.pl/admin/zamowienia/o1",
    })
  );
}

describe("uwagi klienta do zamówienia w mailach", () => {
  it("potwierdzenie dla klienta pokazuje uwagi z łamaniem linii", async () => {
    const html = await renderConfirmation({ ...order, customer_note: "dzwonić po 16\ndomofon 12" });
    expect(html).toContain("Uwagi do zamówienia");
    expect(html).toMatch(/dzwonić po 16(<br\s*\/?>)\s*domofon 12/);
  });
  it("bez uwag (null i undefined) nie ma sekcji", async () => {
    expect(await renderConfirmation({ ...order, customer_note: null })).not.toContain("Uwagi do zamówienia");
    expect(await renderConfirmation({ ...order })).not.toContain("Uwagi do zamówienia");
  });
  it("mail dla sklepu pokazuje uwagi", async () =>
    expect(await renderAdminNewOrder({ ...order, customer_note: "dzwonić po 16" })).toContain(
      "Uwagi do zamówienia: dzwonić po 16"
    ));
  it("DE: nagłówek Anmerkungen zur Bestellung", async () =>
    expect(await renderConfirmation({ ...order, customer_note: "x" }, "de")).toContain(
      "Anmerkungen zur Bestellung"
    ));
});
