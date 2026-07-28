// Renderuje szablony maili do plików HTML, żeby obejrzeć je w przeglądarce
// bez zakładania konta Resend i bez wysyłania czegokolwiek.
// Uruchom z katalogu sklep-meblowy/:
//   npx tsx scripts/preview-mail.mjs
// Wynik: mail-preview/*.html (katalog gitignorowany).
import { mkdirSync, writeFileSync } from "node:fs";
import { render } from "@react-email/components";
import { brandingFromRaw } from "../app/_lib/mail/branding.ts";
import { OrderConfirmation } from "../app/_lib/mail/templates/OrderConfirmation.tsx";
import { OrderShipped } from "../app/_lib/mail/templates/OrderShipped.tsx";
import { OrderCancelled } from "../app/_lib/mail/templates/OrderCancelled.tsx";
import { AuthConfirm } from "../app/_lib/mail/templates/AuthConfirm.tsx";
import { wasOrderPaid } from "../app/_lib/mail/status-notify.ts";

const OUT = "mail-preview";
mkdirSync(OUT, { recursive: true });

// Paleta z produkcji: preset "klasyczny" z navy nadpisanym na czarny.
const branding = brandingFromRaw({
  theme_preset: "klasyczny",
  theme_overrides: { navy: "#000000", cream: "#ffffff" },
  font_pair: "inter-playfair",
});

// UWAGA: total MUSI sie zgadzac z pozycjami, inaczej podglad uczy patrzenia
// obok liczb. Pozycje: 5900*1 + 1090*2 = 8080. 8080 - 320 (zestaw) - 200 (kod) = 7560.
const order = {
  id: "11111111-1111-1111-1111-111111111111",
  order_number: 1042,
  currency: "pln",
  total: 7560,
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

// Kurs jak seed w store_settings. W produkcji /api/checkout zapisuje pozycje
// JUZ przeliczone (toCharge), wiec zamowienie EUR ma ceny pozycji w EUR —
// fikstura musi to odwzorowac, inaczej podglad klamie.
const EUR_RATE = 0.23;
const toEur = (pln) => Math.ceil(pln * EUR_RATE);

const itemsDe = items.map((i) => ({ ...i, price: toEur(i.price) }));
const orderDe = {
  ...order,
  currency: "eur",
  bundle_discount: toEur(order.bundle_discount),
  promo_discount: toEur(order.promo_discount),
  total:
    itemsDe.reduce((s, i) => s + i.price * i.quantity, 0) -
    toEur(order.bundle_discount) -
    toEur(order.promo_discount),
};

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
      order: orderDe,
      items: itemsDe, branding, locale: "de",
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
  {
    name: "order-shipped-pl",
    el: OrderShipped({
      order, branding, locale: "pl",
      orderUrl: "https://www.mollien.pl/konto/zamowienia/" + order.id,
    }),
  },
  {
    name: "order-shipped-de",
    el: OrderShipped({
      order: { ...order, currency: "eur" }, branding, locale: "de",
      orderUrl: "https://www.mollien.pl/de/konto/zamowienia/" + order.id,
    }),
  },
  {
    name: "order-cancelled-paid-pl",
    el: OrderCancelled({ order, branding, locale: "pl", wasPaid: true }),
  },
  {
    name: "order-cancelled-unpaid-pl",
    el: OrderCancelled({ order, branding, locale: "pl", wasPaid: false }),
  },
  {
    name: "order-cancelled-cod-pl",
    el: OrderCancelled({
      order: { ...order, payment_method: "cod" },
      branding,
      locale: "pl",
      // Po poprawce wasOrderPaid("cod", ...) daje false, wiec ten wariant NIE
      // moze zawierac akapitu o zwrocie srodkow.
      wasPaid: wasOrderPaid("cod", "processing"),
    }),
  },
  {
    name: "auth-confirm-pl",
    el: AuthConfirm({
      branding,
      locale: "pl",
      // Placeholder Supabase — po wyrenderowaniu zostaje w HTML dosłownie
      // i to Supabase podstawia pod niego prawdziwy link.
      confirmationUrl: "{{ .ConfirmationURL }}",
    }),
  },
];

for (const c of cases) {
  let html = await render(c.el);
  // Supabase wymaga, żeby {{ .ConfirmationURL }} przeżyło render dosłownie w
  // atrybucie href — React/serializer HTML ma tendencję do percent-encodowania
  // nawiasów klamrowych i spacji w atrybutach URL. Naprawiamy to na wypadek,
  // gdyby render() zakodował placeholder.
  if (html.includes(encodeURI("{{ .ConfirmationURL }}"))) {
    html = html.replaceAll(encodeURI("{{ .ConfirmationURL }}"), "{{ .ConfirmationURL }}");
  }
  writeFileSync(`${OUT}/${c.name}.html`, html, "utf8");
  console.log(`OK ${OUT}/${c.name}.html`);
}
