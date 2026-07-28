// Renderuje szablony maili do plików HTML, żeby obejrzeć je w przeglądarce
// bez zakładania konta Resend i bez wysyłania czegokolwiek.
// Uruchom z katalogu sklep-meblowy/:
//   npx tsx scripts/preview-mail.mjs
// Wynik: mail-preview/*.html (katalog gitignorowany).
import { mkdirSync, writeFileSync } from "node:fs";
import { render } from "@react-email/components";
import { brandingFromRaw } from "../app/_lib/mail/branding.ts";
import { OrderConfirmation } from "../app/_lib/mail/templates/OrderConfirmation.tsx";

const OUT = "mail-preview";
mkdirSync(OUT, { recursive: true });

// Paleta z produkcji: preset "klasyczny" z navy nadpisanym na czarny.
const branding = brandingFromRaw({
  theme_preset: "klasyczny",
  theme_overrides: { navy: "#000000", cream: "#ffffff" },
  font_pair: "inter-playfair",
});

const order = {
  id: "11111111-1111-1111-1111-111111111111",
  order_number: 1042,
  currency: "pln",
  total: 7480,
  promo_discount: 200,
  bundle_discount: 320,
  payment_method: "online",
  status: "paid",
  shipping_address: {
    fullname: "Anna Kowalska",
    street: "Kwiatowa 12/3",
    postal_code: "61-001",
    city: "Poznań",
    country: "Polska",
    phone: "+48 600 700 800",
  },
  carrier: "Transport Mollien",
  tracking_number: "MOL-2026-0042",
};

const items = [
  {
    id: "i1",
    quantity: 1,
    price: 5900,
    variant_values: { Tkanina: "Astoria 05", "Kolor nóżek": "Czarny" },
    notes: "Proszę o kontakt dzień przed dostawą.",
    bundle_label: null,
    product: { name: "Narożnik VEGAS L" },
  },
  {
    id: "i2",
    quantity: 2,
    price: 1090,
    variant_values: { Tkanina: "Montes 12" },
    notes: null,
    bundle_label: "Zestaw salon",
    product: { name: "Puf MONTES" },
  },
];

const cases = [
  {
    name: "order-confirmation-pl",
    el: OrderConfirmation({
      order, items, branding, locale: "pl",
      orderUrl: "https://www.mollien.pl/konto/zamowienia/" + order.id,
    }),
  },
  {
    name: "order-confirmation-de",
    el: OrderConfirmation({
      order: { ...order, currency: "eur", total: 1720 },
      items, branding, locale: "de",
      orderUrl: "https://www.mollien.pl/de/konto/zamowienia/" + order.id,
    }),
  },
  {
    name: "order-confirmation-cod",
    el: OrderConfirmation({
      order: { ...order, payment_method: "cod" },
      items, branding, locale: "pl",
      orderUrl: "https://www.mollien.pl/konto/zamowienia/" + order.id,
    }),
  },
];

for (const c of cases) {
  const html = await render(c.el);
  writeFileSync(`${OUT}/${c.name}.html`, html, "utf8");
  console.log(`OK ${OUT}/${c.name}.html`);
}
