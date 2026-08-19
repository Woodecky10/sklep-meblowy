// Renderuje szablony maili do plików HTML, żeby obejrzeć je w przeglądarce
// bez zakładania konta Resend i bez wysyłania czegokolwiek.
// Uruchom z katalogu sklep-meblowy/:
//   npm run preview:mail
// Wynik: mail-preview/*.html (katalog gitignorowany).
import { mkdirSync, writeFileSync } from "node:fs";
import { render } from "@react-email/components";
import { brandingFromRaw } from "../app/_lib/mail/branding.ts";
import { OrderConfirmation } from "../app/_lib/mail/templates/OrderConfirmation.tsx";
import { OrderShipped } from "../app/_lib/mail/templates/OrderShipped.tsx";
import { OrderCancelled } from "../app/_lib/mail/templates/OrderCancelled.tsx";
import { AdminNewOrder } from "../app/_lib/mail/templates/AdminNewOrder.tsx";
import { AuthConfirm } from "../app/_lib/mail/templates/AuthConfirm.tsx";
import { PasswordReset } from "../app/_lib/mail/templates/PasswordReset.tsx";
import { AdminNewSampleOrder } from "../app/_lib/mail/templates/AdminNewSampleOrder.tsx";
import { SampleOrderConfirmation } from "../app/_lib/mail/templates/SampleOrderConfirmation.tsx";
import { SampleOrderSent } from "../app/_lib/mail/templates/SampleOrderSent.tsx";
import { AdminNewReview } from "../app/_lib/mail/templates/AdminNewReview.tsx";
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

// customerEmail/adminUrl dla AdminNewOrder (mail #4 — patrz FIX 7): adres
// oczywiscie-fikcyjny + URL panelu w stylu localhost, zeby nikt nie pomylil
// tego z prawdziwym namierzeniem klienta.
const FAKE_CUSTOMER_EMAIL = "jan.kowalski@example.com";
const ADMIN_URL = "http://localhost:3000/admin/zamowienia/" + order.id;

// ── Próbki tkanin ────────────────────────────────────────────────────────
// Trzy gratisy w oknie 12 miesięcy, każda kolejna 15 zł, dostawa zawsze 0 zł.
// Fikstura celowo MIESZANA (3 gratis + 1 płatna): tylko taka pokazuje naraz
// wiersz „gratis" i wiersz z ceną, więc kwota 15 zł musi się zgadzać z listą.
const sampleOrder = {
  id: "a1b2c3d4-1111-2222-3333-444455556666",
  customer_name: "Anna Kowalska",
  customer_email: FAKE_CUSTOMER_EMAIL,
  customer_phone: "+48 600 700 800",
  shipping_address: {
    fullname: "Anna Kowalska",
    street: "Kwiatowa 12/3",
    postal_code: "61-001",
    city: "Poznań",
  },
  status: "new",
  payment_status: "paid",
  amount_total: 15,
  free_count: 3,
  paid_count: 1,
  tracking: null,
};

const sampleItems = [
  { id: "s1", fabric_name: "Riviera", color: "16", is_free: true, unit_price: 0 },
  { id: "s2", fabric_name: "Astoria", color: "05", is_free: true, unit_price: 0 },
  { id: "s3", fabric_name: "Montes", color: "12", is_free: true, unit_price: 0 },
  { id: "s4", fabric_name: "Velvet", color: "21", is_free: false, unit_price: 15 },
];

// Wariant w całości z darmowej puli: payment_status "none" i zero złotych —
// zamówienie, które NIGDY nie widziało bramki płatności.
const sampleOrderFree = {
  ...sampleOrder,
  payment_status: "none",
  amount_total: 0,
  free_count: 3,
  paid_count: 0,
};
const sampleItemsFree = sampleItems.slice(0, 3);

const SAMPLE_ORDER_URL = "https://www.mollien.pl/probki/sukces?zamowienie=" + sampleOrder.id;
const SAMPLE_SHOP_URL = "https://www.mollien.pl/sklep";

// ── Opinie klientów ──────────────────────────────────────────────────────
// Task 8: AdminNewReview / notifyAdminNewReview — mail do właścicielki po
// KAŻDYM zapisie opinii (nowej i edycji). Ten sam rodzaj luki co FIX 7
// (mail do właścicielki nieobecny w podglądzie) — naprawiona od razu przy
// dodaniu szablonu, żeby nie czekać na osobne zgłoszenie. Fikstura ma
// wyłącznie cztery pola, które szablon przyjmuje (Pick w typie propsów
// AdminNewReview) — bez guest_email i pól moderacyjnych, których mail nie
// pokazuje.
const review = {
  rating: 5,
  comment:
    "Narożnik stoi u nas od miesiąca i nadal wygląda jak nowy. Bardzo wygodny, polecam każdemu, kto szuka czegoś solidnego.",
  author_name: "Anna Kowalska",
  product_name: "Narożnik VEGAS L",
};
const REVIEWS_ADMIN_URL = "http://localhost:3000/admin/opinie";

const cases = [
  {
    name: "order-confirmation-pl",
    el: OrderConfirmation({
      order, items, branding, locale: "pl",
      orderUrl: "https://www.mollien.pl/konto/zamowienia/" + order.id,
      hasAccount: true,
    }),
  },
  {
    name: "order-confirmation-de",
    el: OrderConfirmation({
      order: orderDe,
      items: itemsDe, branding, locale: "de",
      orderUrl: "https://www.mollien.pl/de/konto/zamowienia/" + order.id,
      hasAccount: true,
    }),
  },
  {
    name: "order-confirmation-cod",
    el: OrderConfirmation({
      order: { ...order, payment_method: "cod" },
      items, branding, locale: "pl",
      orderUrl: "https://www.mollien.pl/konto/zamowienia/" + order.id,
      hasAccount: true,
    }),
  },
  {
    name: "order-shipped-pl",
    el: OrderShipped({
      order, branding, locale: "pl",
      orderUrl: "https://www.mollien.pl/konto/zamowienia/" + order.id,
      hasAccount: true,
    }),
  },
  {
    name: "order-shipped-de",
    el: OrderShipped({
      order: { ...order, currency: "eur" }, branding, locale: "de",
      orderUrl: "https://www.mollien.pl/de/konto/zamowienia/" + order.id,
      hasAccount: true,
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
    // FIX 7: niemiecki akapit o zwrocie srodkow nigdy nie byl wyrenderowany —
    // ten sam fixture EUR (orderDe) co order-confirmation-de, wasPaid: true
    // wymusza renderowanie zdania o zwrocie.
    name: "order-cancelled-de",
    el: OrderCancelled({ order: orderDe, branding, locale: "de", wasPaid: true }),
  },
  {
    // FIX 7: mail do wlascicielki (AdminNewOrder) byl calkowicie nieobecny w
    // podgladzie. Te same pozycje/zamowienie co order-confirmation-pl.
    name: "admin-new-order",
    el: AdminNewOrder({
      order, items, branding,
      customerEmail: FAKE_CUSTOMER_EMAIL,
      adminUrl: ADMIN_URL,
    }),
  },
  {
    name: "auth-confirm-pl",
    el: AuthConfirm({
      branding,
      locale: "pl",
      // Placeholdery Supabase — po wyrenderowaniu zostają w HTML dosłownie
      // i to Supabase podstawia pod nie prawdziwe wartości przy wysyłce.
      //
      // NIE używamy {{ .ConfirmationURL }}: on prowadzi do endpointu
      // /auth/v1/verify Supabase, który sam zużywa token i przekierowuje na
      // `redirect_to` BEZ `token_hash`. Nasza trasa app/auth/confirm/route.ts
      // czeka dokładnie na `token_hash` + `type` (woła verifyOtp), więc przy
      // ConfirmationURL dostawała pusty query i odbijała klienta na
      // /logowanie?error=invalid_link — mimo że konto zostało już aktywowane.
      // Sprawdzone na produkcji 2026-07-30 (konto testowe: email potwierdzony,
      // a przeglądarka pokazała {"error":"requested path is invalid"}).
      // Forma poniżej to wzorzec z dokumentacji Supabase dla SSR: link idzie
      // wprost do naszej trasy, a weryfikację robimy sami.
      confirmationUrl:
        "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/konto",
    }),
  },
  {
    name: "auth-reset-pl",
    el: PasswordReset({
      branding,
      locale: "pl",
      // `type=recovery` (nie `signup`) — ten sam token_hash, inny typ weryfikacji.
      // Trafia do app/auth/confirm/route.ts, które woła verifyOtp i tworzy sesję
      // recovery; bez niej /reset-hasla nie ma czym zapisać nowego hasła.
      resetUrl:
        "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-hasla",
    }),
  },
  {
    name: "sample-admin-new",
    el: AdminNewSampleOrder({
      order: sampleOrder,
      items: sampleItems,
      branding,
      adminUrl: "http://localhost:3000/admin/probki",
    }),
  },
  {
    // Ten sam mail dla zamówienia bez ani jednej złotówki — inna linia kwoty.
    name: "sample-admin-new-free",
    el: AdminNewSampleOrder({
      order: sampleOrderFree,
      items: sampleItemsFree,
      branding,
      adminUrl: "http://localhost:3000/admin/probki",
    }),
  },
  {
    name: "sample-confirmation-paid",
    el: SampleOrderConfirmation({
      order: sampleOrder,
      items: sampleItems,
      branding,
      orderUrl: SAMPLE_ORDER_URL,
    }),
  },
  {
    name: "sample-confirmation-free",
    el: SampleOrderConfirmation({
      order: sampleOrderFree,
      items: sampleItemsFree,
      branding,
      orderUrl: SAMPLE_ORDER_URL,
    }),
  },
  {
    name: "sample-sent-tracking",
    el: SampleOrderSent({
      order: { ...sampleOrder, status: "sent", tracking: "00259007730000123456" },
      items: sampleItems,
      branding,
      shopUrl: SAMPLE_SHOP_URL,
    }),
  },
  {
    // ⚠️ Wariant BEZ numeru nadania jest tym częstszym: próbki jadą zwykłą
    // kopertą listową. Musi się renderować bez pustej etykiety „Numer nadania".
    name: "sample-sent-no-tracking",
    el: SampleOrderSent({
      order: { ...sampleOrder, status: "sent", tracking: "" },
      items: sampleItems,
      branding,
      shopUrl: SAMPLE_SHOP_URL,
    }),
  },
  {
    name: "admin-new-review",
    el: AdminNewReview({
      opinia: review,
      branding,
      panelUrl: REVIEWS_ADMIN_URL,
    }),
  },
];

for (const c of cases) {
  let html = await render(c.el);
  // Supabase wymaga, żeby placeholdery {{ .Cokolwiek }} przeżyły render
  // dosłownie w atrybucie href — React/serializer HTML ma tendencję do
  // percent-encodowania nawiasów klamrowych i spacji w atrybutach URL.
  // Naprawiamy to generycznie (nie per nazwa placeholdera), żeby dodanie
  // kolejnego szablonu Auth nie wymagało pamiętania o tym miejscu.
  html = html.replaceAll("%7B%7B%20", "{{ ").replaceAll("%20%7D%7D", " }}");
  writeFileSync(`${OUT}/${c.name}.html`, html, "utf8");
  console.log(`OK ${OUT}/${c.name}.html`);
}
