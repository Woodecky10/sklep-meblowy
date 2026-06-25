# P24 compliance (klauzula PayPro, logotypy płatności, koszt dostawy) — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Domknąć 3 luki blokujące pozytywną weryfikację Przelewy24: klauzula operatora PayPro w regulaminie (#12), pasek logotypów metod płatności w stopce (#13), jasna informacja o indywidualnym koszcie dostawy w punkcie zamówienia (#8).

**Architecture:** Same zmiany treści + UI, bez nowej logiki/migracji. Regulamin i CheckoutForm trzymają treść w lokalnych obiektach `c` (gałąź PL/DE); koszyk/karta produktu/stopka korzystają ze wspólnego słownika `t.*` (PlShape + pl + de). Logotypy = statyczne pliki w `public/payments/` (placeholder w tym planie, oficjalne wrzuca właścicielka na go-live).

**Tech Stack:** Next.js 16.2.4 (App Router), React 19, TypeScript 5, vitest 4, next/image.

## Global Constraints

- Wszystkie `npm`/`npx` z katalogu `sklep-meblowy/`. Bramki przed commitem: `npx tsc --noEmit` 0, `npm run lint` 0; przy zmianie słownika `npm test` zielony; dla tasków UI/route także `npm run build`.
- UI storefront PL+DE. Słownik: typ `PlShape` (pl.ts) + wartości `pl` (pl.ts) + `de` (de.ts). `de.ts` to `DeepPartial<PlShape>` (klucz pominięty → fallback PL), ale dodajemy pełne tłumaczenia.
- Bez nowej tabeli/migracji. Bez zmiany ceny dostawy na stałą (świadomie zmienna — art. 12 ust. 1 pkt 5).
- Linki w komponentach klienckich: `LocalizedLink` (zachowuje prefiks /de).
- Klauzula PayPro — dokładne dane: PayPro SA Agent Rozliczeniowy, ul. Pastelowa 8, 60‑198 Poznań, KRS 0000347935, NIP 7792369887, REGON 301345068.
- Logotypy #13: zestaw Przelewy24 + Visa + Mastercard + BLIK (bez Apple/Google Pay).
- **OPS:** jedyna instancja Supabase = produkcyjna; nie uruchamiać testów mutujących. Branch `feat/p24-compliance` (utworzony, zawiera spec).

---

### Task 1: #12 + regulamin (klauzula PayPro, spójność §4/§5)

**Files:**
- Modify: `app/(legal)/regulamin/page.tsx`

**Interfaces:** brak (samodzielna zmiana treści).

- [ ] **Step 1: Dodaj klauzulę PayPro i popraw teksty dostawy — gałąź DE obiektu `c`**

W `app/(legal)/regulamin/page.tsx`, w gałęzi DE (`de ? { ... }`):
- Zmień `s4_2` na:
```ts
        s4_2:
          "Der Produktpreis enthält keine Lieferkosten. Aufgrund des sperrigen Charakters der Möbel werden die Lieferkosten individuell nach Aufgabe der Bestellung festgelegt (siehe § 5) und bedürfen der Zustimmung des Kunden.",
```
- Dodaj zaraz po `s4_4` nowe pole `s4_5`:
```ts
        s4_5:
          "Zahlungsdienstleister im Shop ist Przelewy24 (PayPro SA). Betreiber der Kartenzahlungen ist PayPro SA Agent Rozliczeniowy, ul. Pastelowa 8, 60-198 Poznań, eingetragen im Unternehmerregister des Landesgerichtsregisters (KRS) unter der Nummer KRS 0000347935, NIP 7792369887, REGON 301345068.",
```
- Zmień `s5_3Mid` (rozszerz o akceptację + rezygnację):
```ts
        s5_3Mid:
          " nach Aufgabe der Bestellung festgelegt – sie hängen vom Gewicht, den Abmessungen des Produkts und dem Lieferort ab. Der Verkäufer kontaktiert den Kunden vor dem Versand telefonisch oder per E-Mail mit einem Kostenvoranschlag für die Lieferung. Der Kostenvoranschlag bedarf der Zustimmung des Kunden; verweigert er diese, kann er die Bestellung kostenfrei stornieren. Einzelheiten finden Sie im Bereich ",
```

- [ ] **Step 2: To samo — gałąź PL obiektu `c`**

W gałęzi PL (`: { ... }`):
- Zmień `s4_2` na:
```ts
        s4_2:
          "Cena Produktu nie zawiera kosztów dostawy. Z uwagi na wielkogabarytowy charakter mebli koszt dostawy ustalany jest indywidualnie po złożeniu zamówienia (zob. § 5) i wymaga akceptacji Klienta.",
```
- Dodaj po `s4_4`:
```ts
        s4_5:
          "Operatorem płatności w Sklepie jest Przelewy24 (PayPro SA). Operatorem kart płatniczych jest PayPro SA Agent Rozliczeniowy, ul. Pastelowa 8, 60-198 Poznań, wpisany do Rejestru Przedsiębiorców Krajowego Rejestru Sądowego prowadzonego przez Sąd Rejonowy Poznań – Nowe Miasto i Wilda w Poznaniu, VIII Wydział Gospodarczy Krajowego Rejestru Sądowego pod numerem KRS 0000347935, NIP 7792369887, REGON 301345068.",
```
- Zmień `s5_3Mid` na:
```ts
        s5_3Mid:
          " po złożeniu zamówienia – zależy od wagi, gabarytów Produktu oraz miejsca dostawy. Sprzedawca skontaktuje się z Klientem telefonicznie lub mailowo z wyceną dostawy przed wysyłką. Wycena wymaga akceptacji Klienta; w razie jej braku Klient może bezpłatnie zrezygnować z zamówienia. Szczegóły dostępne są w zakładce ",
```

- [ ] **Step 3: Wyrenderuj klauzulę w §4**

W JSX sekcji §4 (`<h2>{c.s4}</h2><ol>...`), po `<li>{c.s4_4}</li>` dodaj:
```tsx
        <li>{c.s4_5}</li>
```

- [ ] **Step 4: Bramki**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 0 błędów; build przechodzi (trasa `/regulamin`).

- [ ] **Step 5: Commit**

```bash
git add app/(legal)/regulamin/page.tsx
git commit -m "feat(p24): klauzula operatora PayPro w regulaminie + spojnosc kosztu dostawy (par.4/5)"
```

---

### Task 2: #8 — informacja o koszcie dostawy w punkcie zamówienia

**Files:**
- Modify: `app/_lib/dictionaries/pl.ts` (typ `PlShape` + obiekt `pl`)
- Modify: `app/_lib/dictionaries/de.ts` (obiekt `de`)
- Modify: `app/koszyk/page.tsx`
- Modify: `app/checkout/CheckoutForm.tsx`
- Modify: `app/_components/ui/ProductMainSection.tsx`

**Interfaces:**
- Produces (słownik): `t.cart.deliveryNotice`, `t.cart.deliveryNoticeLink`, `t.product.deliveryCostNote`, `t.product.deliveryCostLink`.

- [ ] **Step 1: Dodaj klucze do typu `PlShape` (pl.ts)**

W `app/_lib/dictionaries/pl.ts`, w typie `PlShape`:
- W bloku `cart: { ... }` dodaj:
```ts
    deliveryNotice: string;
    deliveryNoticeLink: string;
```
- W bloku `product: { ... }` dodaj:
```ts
    deliveryCostNote: string;
    deliveryCostLink: string;
```

- [ ] **Step 2: Dodaj wartości PL (obiekt `pl`, pl.ts)**

W obiekcie `pl`, w `cart`:
```ts
    deliveryNotice:
      "Podana kwota nie zawiera kosztu dostawy. Meble wysyłamy firmą transportową — koszt ustalamy indywidualnie po złożeniu zamówienia i wymaga Twojej akceptacji (możesz bezpłatnie zrezygnować).",
    deliveryNoticeLink: "Jak liczymy koszt dostawy",
```
W `product`:
```ts
    deliveryCostNote: "Koszt dostawy ustalany indywidualnie (transport meblowy)",
    deliveryCostLink: "Szczegóły dostawy",
```

- [ ] **Step 3: Dodaj wartości DE (obiekt `de`, de.ts)**

W obiekcie `de`, w `cart`:
```ts
    deliveryNotice:
      "Der angezeigte Betrag enthält keine Versandkosten. Möbel versenden wir per Spedition — die Kosten legen wir nach der Bestellung individuell fest; sie bedürfen Ihrer Zustimmung (kostenfreier Rücktritt möglich).",
    deliveryNoticeLink: "Wie wir die Versandkosten berechnen",
```
W `product`:
```ts
    deliveryCostNote: "Versandkosten individuell festgelegt (Möbeltransport)",
    deliveryCostLink: "Versanddetails",
```

- [ ] **Step 4: Koszyk — wyrenderuj notkę + link**

W `app/koszyk/page.tsx`, w podsumowaniu dostawy znajdź wiersz dostawy — `<div className="flex justify-between items-start text-[var(--muted)] gap-3">` zawierający `t.cart.delivery` + `t.cart.deliveryFrom`/`t.cart.deliveryHint` (zamyka się ok. linii 282). NIE zmieniaj jego zawartości. Bezpośrednio po zamykającym `</div>` tego wiersza dodaj osobny akapit z notką i linkiem:
```tsx
              <p className="text-xs text-[var(--muted)] leading-snug">
                {t.cart.deliveryNotice}{" "}
                <LocalizedLink href="/dostawa" className="text-[var(--color-gold)] hover:underline">
                  {t.cart.deliveryNoticeLink}
                </LocalizedLink>
              </p>
```
Jeśli `LocalizedLink` nie jest jeszcze zaimportowany w pliku, dodaj: `import LocalizedLink from "@/app/_components/ui/LocalizedLink";`.

- [ ] **Step 5: Checkout — notka w lokalnym `c` + render**

W `app/checkout/CheckoutForm.tsx`, w lokalnym obiekcie `c`:
- gałąź DE (obok `shippingFrom`/`shippingNote`):
```ts
        shippingNotice:
          "Der angezeigte Betrag enthält keine Versandkosten. Wir legen sie nach der Bestellung individuell fest; sie bedürfen Ihrer Zustimmung (kostenfreier Rücktritt möglich).",
        shippingNoticeLink: "Wie wir die Versandkosten berechnen",
```
- gałąź PL:
```ts
        shippingNotice:
          "Podana kwota nie zawiera kosztu dostawy. Ustalamy go indywidualnie po zamówieniu i wymaga Twojej akceptacji (możesz bezpłatnie zrezygnować).",
        shippingNoticeLink: "Jak liczymy koszt dostawy",
```
Render: bezpośrednio nad linią `{c.total}` / total (ok. linia 389), dodaj:
```tsx
            <p className="text-xs text-[var(--muted)] leading-snug pt-1">
              {c.shippingNotice}{" "}
              <LocalizedLink href="/dostawa" className="text-[var(--color-gold)] hover:underline">
                {c.shippingNoticeLink}
              </LocalizedLink>
            </p>
```
Dodaj import `LocalizedLink` jeśli go nie ma: `import LocalizedLink from "@/app/_components/ui/LocalizedLink";`.

- [ ] **Step 6: Karta produktu — jednozdaniowa notka**

W `app/_components/ui/ProductMainSection.tsx`, w bloku informacyjnym pod CTA (gdzie są zwroty/gwarancja/czas dostawy — `t.product.returns`/`warranty`/`deliveryTimeLabel`, ok. linie 156-165), dodaj kolejny wiersz:
```tsx
          <p>
            ✓ {t.product.deliveryCostNote}{" "}
            <LocalizedLink href="/dostawa" className="text-[var(--color-gold)] hover:underline">
              {t.product.deliveryCostLink}
            </LocalizedLink>
          </p>
```
Dodaj import `LocalizedLink` jeśli go nie ma: `import LocalizedLink from "./LocalizedLink";`.

- [ ] **Step 7: Bramki**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: 0 błędów tsc/lint; testy zielone (de.ts zgodne z PlShape); build przechodzi.

- [ ] **Step 8: Commit**

```bash
git add app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts app/koszyk/page.tsx app/checkout/CheckoutForm.tsx app/_components/ui/ProductMainSection.tsx
git commit -m "feat(p24): informacja o indywidualnym koszcie dostawy w koszyku/checkout/karcie produktu"
```

---

### Task 3: #13 — pasek logotypów płatności w stopce

**Files:**
- Create: `public/payments/przelewy24.svg`, `public/payments/visa.svg`, `public/payments/mastercard.svg`, `public/payments/blik.svg` (placeholder — właścicielka zastąpi oficjalnymi z paczki P24)
- Modify: `app/_lib/dictionaries/pl.ts` (typ `PlShape` + obiekt `pl`, blok `footer`)
- Modify: `app/_lib/dictionaries/de.ts` (obiekt `de`, blok `footer`)
- Modify: `app/_components/layout/Footer.tsx`

**Interfaces:**
- Produces (słownik): `t.footer.securePayments`.

- [ ] **Step 1: Utwórz placeholdery logotypów**

Utwórz 4 pliki (proste, neutralne placeholdery — właścicielka podmieni na oficjalne pod tymi samymi nazwami). Przykład `public/payments/visa.svg` (analogicznie pozostałe, zmień tekst na „Przelewy24"/„Mastercard"/„BLIK"):
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="24" viewBox="0 0 60 24"><rect width="60" height="24" rx="4" fill="#f4f4f5"/><text x="30" y="16" font-family="Arial, sans-serif" font-size="10" font-weight="700" text-anchor="middle" fill="#1a1a2e">Visa</text></svg>
```
`public/payments/przelewy24.svg` — `width="84"` i `font-size="9"`, tekst „Przelewy24" (dłuższa nazwa). `public/payments/mastercard.svg` — `width="84"`, tekst „Mastercard". `public/payments/blik.svg` — tekst „BLIK".

- [ ] **Step 2: Dodaj `securePayments` do `PlShape` (pl.ts) + wartości PL/DE**

W `PlShape`, blok `footer`, dodaj:
```ts
    securePayments: string;
```
W obiekcie `pl`, blok `footer`:
```ts
    securePayments: "Bezpieczne płatności",
```
W obiekcie `de`, blok `footer`:
```ts
    securePayments: "Sichere Zahlungen",
```

- [ ] **Step 3: Wstaw pasek logotypów w `Footer.tsx`**

W `app/_components/layout/Footer.tsx` zamień dolny pasek (obecnie `<div className="border-t border-white/10 py-6 text-center text-xs text-white/70 px-6">© ... | NIP: ...</div>`, linie ~95-103) na:
```tsx
      <div className="border-t border-white/10 py-6 px-6 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2.5 flex-wrap justify-center">
          <span className="text-[10px] uppercase tracking-widest text-white/50">
            {t.footer.securePayments}
          </span>
          {([
            ["przelewy24", "Przelewy24", 84],
            ["visa", "Visa", 60],
            ["mastercard", "Mastercard", 84],
            ["blik", "BLIK", 60],
          ] as const).map(([file, label, w]) => (
            <span key={file} className="bg-white rounded px-1.5 py-1 inline-flex items-center">
              <Image
                src={`/payments/${file}.svg`}
                alt={label}
                width={w}
                height={24}
                className="h-5 w-auto"
              />
            </span>
          ))}
        </div>
        <p className="text-center text-xs text-white/70">
          © {new Date().getFullYear()} {COMPANY.brandName}. {t.footer.rightsReserved}
          {isFilled(COMPANY.nip) && (
            <>
              {" "}
              | NIP: {COMPANY.nip}
            </>
          )}
        </p>
      </div>
```
(`Image`, `COMPANY`, `isFilled`, `t` są już zaimportowane/dostępne w pliku.)

- [ ] **Step 4: Bramki + build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: 0 błędów; testy zielone; build przechodzi. Stopka renderuje 4 logotypy (placeholdery) na każdej podstronie.

- [ ] **Step 5: Commit**

```bash
git add public/payments app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts app/_components/layout/Footer.tsx
git commit -m "feat(p24): pasek metod platnosci w stopce (placeholdery do podmiany na oficjalne P24)"
```

---

## Po wdrożeniu (poza planem kodu)

- **Właścicielka:** zastąpić placeholdery `public/payments/{przelewy24,visa,mastercard,blik}.svg` OFICJALNYMI plikami z paczki graficznej Przelewy24 (te same nazwy/ścieżki) — przed deployem.
- **Właścicielka (panel):** dezaktywować 3 testowe produkty („test", 2× „testowe łóżko") i 6 pustych aktywnych kategorii (`materace-piankowe`, `materace-sprezynowe`, `materace`, `narozniki`, `sofy`, `lozka`) — wymóg #5 „pełny asortyment".
- Push przez konto Woodecky10 (pamięć `git-push-woodecky10`). Bez migracji.
- Po deployu: w panelu P24 „Przekaż do weryfikacji".

## Mapowanie wymagań spec → taski

- #12 (klauzula PayPro w regulaminie) + spójność §4_2/§5_3: Task 1.
- #8 (koszt dostawy w koszyku/checkout/karcie produktu, słownik): Task 2.
- #13 (logotypy płatności w stopce + securePayments): Task 3.
- #5 (puste kategorie / testowe produkty): poza kodem — panel admina (go-live).
