import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import { brandingFromRaw } from "../mail/branding";
import { OrderConfirmation } from "../mail/templates/OrderConfirmation";
import type { Order } from "../types";

function order(phone?: string) {
  return {
    id: "o1",
    user_id: null,
    guest_email: "a@example.com",
    status: "paid",
    total: 100,
    currency: "pln",
    shipping_address: {
      fullname: "Jan Kowalski",
      street: "Prosta 1",
      postal_code: "00-001",
      city: "Warszawa",
      country: "Polska",
      ...(phone ? { phone } : {}),
    },
    payment_method: "online",
    promo_discount: 0,
    bundle_discount: 0,
    created_at: "2026-11-18T10:00:00Z",
    order_number: 42,
  } as unknown as Order;
}

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

describe("telefon klienta w potwierdzeniu zamówienia", () => {
  it("pokazuje numer podany w zamówieniu", async () => {
    const html = await renderConfirmation(order("600 100 200"));
    expect(html).toContain("Telefon kontaktowy");
    expect(html).toContain("600 100 200");
  });
  it("bez numeru nie ma sekcji", async () =>
    expect(await renderConfirmation(order())).not.toContain("Telefon kontaktowy"));
  it("DE: Telefonnummer", async () =>
    expect(await renderConfirmation(order("600 100 200"), "de")).toContain("Telefonnummer"));
});
