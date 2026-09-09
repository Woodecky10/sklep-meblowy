import { describe, it, expect } from "vitest";
import {
  ACCEPTED_MAIL_MAX_LENGTH,
  buildAcceptedMailBody,
  type AcceptedMailItem,
  type AcceptedMailOrder,
} from "@/app/_lib/order-accepted-mail";
import { formatOrderAmount } from "@/app/_lib/money";

// Zamówienie zewnętrzne opłacone na marketplace: 1 × 5900 + 2 × 250 = 6400.
// `total` NIE zawiera dostawy (createExternalOrder liczy Σ cena × ilość,
// `delivery_cost` admin wpisuje osobno) — na tym stoi cały rachunek pobrania.
const ORDER: AcceptedMailOrder = {
  source: "Allegro",
  payment_method: "online",
  total: 6400,
  delivery_cost: null,
  currency: "pln",
};

// Pozycja z katalogu (nazwa z joina) + pozycja spoza katalogu (custom_name,
// migracja 82). Uwagi niosą wariant/kolor ustalony z klientem.
const ITEMS: AcceptedMailItem[] = [
  {
    product: { name: "Narożnik VEGAS L" },
    custom_name: "",
    quantity: 1,
    price: 5900,
    notes: "Vena 12, narożnik lewy",
  },
  {
    product: null,
    custom_name: "Pufa na zamówienie",
    quantity: 2,
    price: 250,
    notes: null,
  },
];

const zl = (n: number) => formatOrderAmount(n, "pln");

describe("buildAcceptedMailBody — propozycja treści maila „Dziękujemy za zamówienie”", () => {
  it("wita, dziękuje ze ŹRÓDŁEM, obiecuje czas realizacji i podpisuje", () => {
    const body = buildAcceptedMailBody(ORDER, ITEMS);

    expect(body).toContain("Dzień dobry");
    expect(body).toContain("Dziękujemy za zamówienie złożone przez Allegro");
    expect(body).toContain("Przewidywany czas realizacji: do 21 dni roboczych.");
    expect(body).toContain("Zespół Mollien");
  });

  it("źródło idzie 1:1 — nazwa z „Inne” też", () => {
    expect(buildAcceptedMailBody({ ...ORDER, source: "Vinted" }, ITEMS)).toContain(
      "Dziękujemy za zamówienie złożone przez Vinted"
    );
  });

  it("bez źródła (zamówienie ze sklepu) nie drukuje „przez null”", () => {
    const body = buildAcceptedMailBody({ ...ORDER, source: null }, ITEMS);
    expect(body).toContain("Dziękujemy za zamówienie");
    expect(body).not.toContain("null");
    expect(body).not.toContain("undefined");
    expect(body).not.toContain("złożone przez");
  });

  it("pozycja z katalogu i pozycja spoza katalogu — obie po nazwie, z ilością, ceną i sumą wiersza", () => {
    const body = buildAcceptedMailBody(ORDER, ITEMS);

    expect(body).toContain(
      `Narożnik VEGAS L (Vena 12, narożnik lewy) — 1 szt. × ${zl(5900)} = ${zl(5900)}`
    );
    // Bez orderItemDisplayName tu byłoby zastępcze „Produkt”: pozycja spoza
    // katalogu nie ma joina z `products`, nazwę niesie wyłącznie custom_name.
    expect(body).toContain(`Pufa na zamówienie — 2 szt. × ${zl(250)} = ${zl(500)}`);
    expect(body).not.toContain("Produkt —");
  });

  it("uwagi (wariant / kolor ustalony z klientem) idą przy nazwie pozycji", () => {
    const body = buildAcceptedMailBody(ORDER, ITEMS);
    expect(body).toContain("Narożnik VEGAS L (Vena 12, narożnik lewy)");
  });

  it("produkt usunięty z katalogu i bez własnej nazwy → tekst zastępczy, nie pusta linia", () => {
    const body = buildAcceptedMailBody(ORDER, [
      { product: null, custom_name: "", quantity: 1, price: 100, notes: null },
    ]);
    expect(body).toContain(`Produkt — 1 szt. × ${zl(100)} = ${zl(100)}`);
  });

  it("suma zamówienia to `total` z zamówienia, nie przeliczanka z pozycji", () => {
    expect(buildAcceptedMailBody(ORDER, ITEMS)).toContain(`Razem: ${zl(6400)}`);
  });
});

describe("buildAcceptedMailBody — kwota do zapłaty przy odbiorze", () => {
  const COD: AcceptedMailOrder = { ...ORDER, payment_method: "cod" };

  it("pobranie bez kosztu dostawy → do zapłaty sam total (bez linii o dostawie)", () => {
    const body = buildAcceptedMailBody(COD, ITEMS);

    expect(body).toContain(`Do zapłaty przy odbiorze: ${zl(6400)}`);
    expect(body).not.toContain("Dostawa:");
  });

  it("pobranie z kosztem dostawy → do zapłaty total + dostawa, obie kwoty widoczne", () => {
    const body = buildAcceptedMailBody({ ...COD, delivery_cost: 150 }, ITEMS);

    expect(body).toContain(`Razem: ${zl(6400)}`);
    expect(body).toContain(`Dostawa: ${zl(150)}`);
    expect(body).toContain(`Do zapłaty przy odbiorze: ${zl(6550)}`);
  });

  it("zamówienie opłacone w źródle NIE mówi nic o płatności u kuriera", () => {
    const body = buildAcceptedMailBody({ ...ORDER, delivery_cost: 150 }, ITEMS);

    expect(body).not.toContain("Do zapłaty przy odbiorze");
    expect(body).not.toContain("Dostawa:");
  });
});

describe("buildAcceptedMailBody — kształt tekstu", () => {
  it("to ZWYKŁY TEKST z akapitami rozdzielonymi pustą linią, bez HTML-a", () => {
    const body = buildAcceptedMailBody(ORDER, ITEMS);

    expect(body).not.toMatch(/<[a-z/]/i);
    expect(body).toContain("\n\n");
    expect(body.startsWith("Dzień dobry")).toBe(true);
    expect(body.trim()).toBe(body);
  });

  it("mieści się w limicie akcji nawet dla maksymalnego zamówienia (50 pozycji z długimi nazwami i uwagami)", () => {
    // Inaczej panel odrzucałby własną propozycję: MAX_ITEMS = 50,
    // CUSTOM_NAME_MAX_LENGTH = 200, NOTES_MAX_LENGTH = 500.
    const big: AcceptedMailItem[] = Array.from({ length: 50 }, () => ({
      product: null,
      custom_name: "N".repeat(200),
      quantity: 9,
      price: 12345.67,
      notes: "U".repeat(500),
    }));

    expect(buildAcceptedMailBody(ORDER, big).length).toBeLessThanOrEqual(
      ACCEPTED_MAIL_MAX_LENGTH
    );
  });
});
