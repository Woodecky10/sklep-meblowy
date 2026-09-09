// Propozycja treści maila „Dziękujemy za zamówienie" dla zamówienia spoza
// sklepu (Allegro, OLX, telefon…). Moduł CZYSTY — bez server-only, bez bazy
// i bez Reacta (ten sam wzorzec co order-items.ts) — bo liczą go i strona
// serwerowa karty zamówienia, i testy, i skrypt podglądu maili.
//
// Zgłoszenie pracownicy obsługującej panel (2026-09-09): treść była wpisana na
// sztywno w szablonie i wychodziła automatem, więc nie dało się jej dopasować
// (choćby czasu realizacji). Decyzja właściciela: wysyłka wyłącznie z
// przycisku, a to, co tu powstaje, jest tylko PROPOZYCJĄ — pracownica widzi ją
// w polu tekstowym na karcie zamówienia i może zmienić każde słowo przed
// kliknięciem „Wyślij do klienta".
//
// Wynik to ZWYKŁY TEKST (akapity rozdzielone pustą linią). Szablon
// ExternalOrderAccepted opakowuje go w firmową ramkę (logo, przycisk do
// sklepu, stopka) i escapuje — nikt nie wstawi tędy HTML-a do maila.
import { formatOrderAmount } from "./money";
import { orderItemDisplayName, type NamedOrderItem } from "./order-items";
import type { PaymentMethod } from "./types";

// Górna granica długości treści — pilnuje jej akcja serwerowa
// (sendExternalOrderMail) i pole tekstowe na karcie zamówienia.
//
// Wysoko, i to celowo: najgorszy przypadek TEJ propozycji to zamówienie na
// granicy walidacji formularza — 50 pozycji (MAX_ITEMS) po 200 znaków nazwy
// (CUSTOM_NAME_MAX_LENGTH) i 500 znaków uwag (NOTES_MAX_LENGTH), czyli grubo
// ponad 35 tys. znaków. Limit niższy niż to odrzucałby tekst, który panel sam
// wygenerował. 50 tys. znaków to wciąż zapora przed wklejeniem pliku do pola.
export const ACCEPTED_MAIL_MAX_LENGTH = 50_000;

// Zamówienie — tylko pola, których treść realnie dotyka. Węższy typ niż
// `Order`, żeby dało się wywołać z fikstury (test, podgląd maili) bez
// wypełniania trzydziestu pól bez znaczenia.
export type AcceptedMailOrder = {
  // Nazwa źródła („Allegro"). null nie powinno tu trafić (akcja i karta
  // zamówienia przepuszczają wyłącznie zamówienia zewnętrzne), ale gdyby
  // trafiło, zdanie ma się obejść bez źródła zamiast wypisać „przez null".
  source: string | null;
  payment_method: PaymentMethod;
  // Σ cena × ilość pozycji. NIE zawiera dostawy — `delivery_cost` jest osobną
  // kolumną, którą admin wpisuje w karcie „Dostawa" już po zapisie zamówienia
  // (createExternalOrder liczy sam total pozycji). Dlatego kwota do zapłaty
  // przy odbiorze to suma obu, a nie samo `total`.
  total: number;
  delivery_cost: number | null;
  currency: "pln" | "eur";
};

export type AcceptedMailItem = NamedOrderItem & {
  quantity: number;
  price: number;
  // Wariant / kolor ustalony z klientem — przy zamówieniu zewnętrznym to
  // JEDYNE miejsce, gdzie taka informacja siedzi (opcji strukturalnych te
  // zamówienia nie mają), więc klient musi ją w mailu zobaczyć.
  notes?: string | null;
};

export function buildAcceptedMailBody(
  order: AcceptedMailOrder,
  items: AcceptedMailItem[]
): string {
  const money = (amount: number) => formatOrderAmount(amount, order.currency);
  const source = order.source?.trim();

  const itemLines = items.map((item) => {
    const name = orderItemDisplayName(item, "Produkt");
    const notes = item.notes?.trim();
    const label = notes ? `${name} (${notes})` : name;
    const price = Number(item.price);
    return `- ${label} — ${item.quantity} szt. × ${money(price)} = ${money(price * item.quantity)}`;
  });

  const total = Number(order.total);
  const delivery = Number(order.delivery_cost ?? 0);
  const amountLines = [`Razem: ${money(total)}`];
  if (order.payment_method === "cod") {
    // Dostawa tylko wtedy, gdy jest niezerowa — inaczej „Dostawa: 0 zł"
    // podpowiadałoby klientowi pytanie, którego nikt nie zadał.
    if (delivery > 0) amountLines.push(`Dostawa: ${money(delivery)}`);
    amountLines.push(`Do zapłaty przy odbiorze: ${money(total + delivery)}`);
  }

  // Akapity. Puste (np. lista pozycji pustego zamówienia) wypadają, żeby
  // w treści nie zostawała dziura po trzech pustych liniach.
  const paragraphs = [
    "Dzień dobry,",
    source
      ? `Dziękujemy za zamówienie złożone przez ${source}. Potwierdzamy, że zostało przyjęte i przekazane do realizacji.`
      : "Dziękujemy za zamówienie. Potwierdzamy, że zostało przyjęte i przekazane do realizacji.",
    ["Zamówienie obejmuje:", ...itemLines].join("\n"),
    amountLines.join("\n"),
    "Przewidywany czas realizacji: do 21 dni roboczych.",
    "O kolejnych etapach realizacji będziemy informować na bieżąco.",
    "Dziękujemy za zaufanie i wybór Mollien!",
    "Pozdrawiamy,\nZespół Mollien",
  ];

  return paragraphs.filter((p) => p.trim() !== "").join("\n\n");
}
