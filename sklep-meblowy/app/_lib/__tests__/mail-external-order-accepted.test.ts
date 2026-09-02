import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import { brandingFromRaw } from "../mail/branding";
import {
  ExternalOrderAccepted,
  EXTERNAL_ORDER_ACCEPTED_SUBJECT,
} from "../mail/templates/ExternalOrderAccepted";
import type { Order } from "../types";

// Szablon czyta z zamówienia wyłącznie `source`; reszta to komplet pól typu.
const ORDER: Order = {
  id: "ext-1",
  user_id: null,
  guest_email: "klient@example.com",
  status: "processing",
  total: 1299.5,
  currency: "pln",
  fx_rate: null,
  shipping_address: {
    fullname: "Jan Kowalski",
    street: "Testowa 1",
    postal_code: "00-001",
    city: "Warszawa",
    country: "Polska",
  },
  payment_ref: null,
  payment_provider: null,
  payment_method: "online",
  promo_code_id: null,
  promo_discount: 0,
  bundle_discount: 0,
  created_at: "2026-09-02T10:00:00.000Z",
  order_number: 501,
  admin_note: null,
  carrier: null,
  tracking_number: null,
  delivery_cost: null,
  delivery_paid: false,
  status_updated_at: null,
  source: "Allegro",
};

async function html(over: Partial<Order> = {}) {
  return render(
    ExternalOrderAccepted({
      order: { ...ORDER, ...over },
      branding: brandingFromRaw(null),
      shopUrl: "https://www.mollien.pl",
    })
  );
}

describe("ExternalOrderAccepted", () => {
  it("temat dokładnie jak w zgłoszeniu właściciela (półpauza, białe serce)", () => {
    expect(EXTERNAL_ORDER_ACCEPTED_SUBJECT).toBe("Dziękujemy za zamówienie – Mollien 🤍");
  });

  it("podstawia nazwę źródła w miejsce „[Allegro]”", async () => {
    expect(await html()).toContain("Źródło zamówienia: Allegro");
    expect(await html({ source: "Vinted" })).toContain("Źródło zamówienia: Vinted");
  });

  it("zawiera treść ze zgłoszenia: przyjęcie, 21 dni roboczych, podpis", async () => {
    const out = await html();
    expect(out).toContain("dziękujemy za zakup i wybór Mollien");
    expect(out).toContain("przyjęte i przekazane do realizacji");
    expect(out).toContain("do 21 dni roboczych");
    expect(out).toContain("Zespół Mollien");
  });

  it("przycisk „Odwiedź sklep Mollien” prowadzi do sklepu", async () => {
    const out = await html();
    expect(out).toContain("Odwiedź sklep Mollien");
    expect(out).toContain('href="https://www.mollien.pl"');
  });

  it("NIE pokazuje numeru zamówienia sklepu — klient zna numer z marketplace", async () => {
    expect(await html()).not.toContain("#501");
  });
});
