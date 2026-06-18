# Klient widzi przewoźnika i nr śledzenia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pokazać zalogowanemu klientowi przewoźnika (`carrier`) i numer śledzenia (`tracking_number`) w szczegółach jego zamówienia `/konto/zamowienia/[id]`.

**Architecture:** Wydzielamy czystą funkcję `deliveryView()` do `app/_lib/delivery.ts` (normalizacja + decyzja o widoczności) i pokrywamy ją testami jednostkowymi (zgodnie z jedynym wzorcem testów w repo — pure logic w `app/_lib/__tests__/`). Następnie wpinamy ją prezentacyjnie w istniejący server component `app/konto/zamowienia/[id]/page.tsx` jako nową kartę „Dostawa". Dane są już pobierane (`select('*')`), więc zmiana jest addytywna i nie dotyka zapytania, migracji ani checkoutu.

**Tech Stack:** Next.js 16 (App Router, async server components), TypeScript, vitest (env node), Tailwind (zmienne CSS `var(--...)`).

## Global Constraints

- **Next.js 16** — to NIE jest Next.js z treningu; `params`/`searchParams` to Promise. Przed kodem server-component sprawdź `node_modules/next/dist/docs/` (patrz `AGENTS.md`). Ta zmiana nie zmienia sygnatur Next — strona już jest poprawnym async server componentem.
- **i18n PL + DE** — strona `/konto/zamowienia/[id]` jest dwujęzyczna; każdy nowy tekst MUSI mieć wariant PL i DE w obiekcie `c`.
- **Bez migracji, bez zmian zapytania, bez zmian checkoutu/admina.** Zmiana czysto prezentacyjna w jednym pliku + nowy helper + test.
- **Testy = pure logic** w `app/**/__tests__/**/*.test.ts` (vitest `environment: node`, brak render-testów/RTL). JSX weryfikujemy manualnie.
- **Bramki jakości** (uruchamiać z katalogu `sklep-meblowy/`): `npx tsc --noEmit` (0 błędów) · `npm run lint` (0) · `npm test` (zielony) · `npm run build` (przechodzi).
- **Zakres:** TYLKO `carrier` + `tracking_number`. `delivery_cost`/`delivery_paid`, termin dostawy, dane dla transportu, linki śledzenia — POZA zakresem.
- Wszystkie polecenia uruchamiać z katalogu `sklep-meblowy/` (tam jest `package.json`).

---

### Task 1: Czysty helper `deliveryView()` + testy

**Files:**
- Create: `app/_lib/delivery.ts`
- Test: `app/_lib/__tests__/delivery.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DeliveryView = {
    carrier: string | null;        // przycięty, null gdy puste
    trackingNumber: string | null; // przycięty, null gdy puste
    hasInfo: boolean;              // true gdy carrier lub trackingNumber niepuste
  };
  export function deliveryView(order: {
    carrier: string | null;
    tracking_number: string | null;
  }): DeliveryView;
  ```
  (Typ `Order` z `app/_lib/types.ts` ma `carrier: string | null` i `tracking_number: string | null`, więc spełnia ten kształt strukturalnie — helper nie importuje `Order`.)

- [ ] **Step 1: Napisz failujący test**

Plik: `app/_lib/__tests__/delivery.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { deliveryView } from "@/app/_lib/delivery";

describe("deliveryView", () => {
  it("carrier + tracking obecne → oba zwrócone, hasInfo=true", () => {
    expect(
      deliveryView({ carrier: "Transport Kowalski", tracking_number: "TK-2026-001" })
    ).toEqual({
      carrier: "Transport Kowalski",
      trackingNumber: "TK-2026-001",
      hasInfo: true,
    });
  });

  it("tylko carrier → trackingNumber=null, hasInfo=true", () => {
    expect(deliveryView({ carrier: "DPD", tracking_number: null })).toEqual({
      carrier: "DPD",
      trackingNumber: null,
      hasInfo: true,
    });
  });

  it("tylko tracking → carrier=null, hasInfo=true", () => {
    expect(deliveryView({ carrier: null, tracking_number: "123ABC" })).toEqual({
      carrier: null,
      trackingNumber: "123ABC",
      hasInfo: true,
    });
  });

  it("oba null → hasInfo=false", () => {
    expect(deliveryView({ carrier: null, tracking_number: null })).toEqual({
      carrier: null,
      trackingNumber: null,
      hasInfo: false,
    });
  });

  it("puste / whitespace stringi traktowane jak brak", () => {
    expect(deliveryView({ carrier: "   ", tracking_number: "" })).toEqual({
      carrier: null,
      trackingNumber: null,
      hasInfo: false,
    });
  });

  it("przycina białe znaki wokół wartości", () => {
    expect(deliveryView({ carrier: "  DPD  ", tracking_number: " 42 " })).toEqual({
      carrier: "DPD",
      trackingNumber: "42",
      hasInfo: true,
    });
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

Run (z `sklep-meblowy/`): `npx vitest run app/_lib/__tests__/delivery.test.ts`
Expected: FAIL — nie da się rozwiązać importu `@/app/_lib/delivery` (moduł nie istnieje).

- [ ] **Step 3: Zaimplementuj helper**

Plik: `app/_lib/delivery.ts`
```ts
export type DeliveryView = {
  carrier: string | null;
  trackingNumber: string | null;
  hasInfo: boolean;
};

function normalize(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function deliveryView(order: {
  carrier: string | null;
  tracking_number: string | null;
}): DeliveryView {
  const carrier = normalize(order.carrier);
  const trackingNumber = normalize(order.tracking_number);
  return {
    carrier,
    trackingNumber,
    hasInfo: carrier !== null || trackingNumber !== null,
  };
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run (z `sklep-meblowy/`): `npx vitest run app/_lib/__tests__/delivery.test.ts`
Expected: PASS (6 testów zielonych).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/delivery.ts app/_lib/__tests__/delivery.test.ts
git commit -m "feat(konto): helper deliveryView (carrier/tracking + widocznosc) + testy"
```

---

### Task 2: Wpięcie karty „Dostawa" w stronę zamówienia klienta

**Files:**
- Modify: `app/konto/zamowienia/[id]/page.tsx`

**Interfaces:**
- Consumes: `deliveryView` z `app/_lib/delivery.ts` (Task 1).

Brak testu jednostkowego — to czysty JSX server-componentu, a repo nie ma infrastruktury render-testów. „Test cycle" tej taski = bramki jakości (tsc/lint/test/build) + weryfikacja wizualna.

- [ ] **Step 1: Dodaj import helpera**

W `app/konto/zamowienia/[id]/page.tsx`, w bloku importów (po linii `import CancelOrderButton from "../CancelOrderButton";`):
```tsx
import { deliveryView } from "@/app/_lib/delivery";
```

- [ ] **Step 2: Dodaj etykiety i18n do obiektu `c`**

W gałęzi **DE** (obiekt po `? {`), dopisz po istniejącym `shippingAddress: "Lieferadresse",`:
```tsx
        delivery: "Versand",
        carrier: "Spediteur",
        trackingNumber: "Sendungsnummer",
```

W gałęzi **PL** (obiekt po `: {`), dopisz po istniejącym `shippingAddress: "Adres dostawy",`:
```tsx
        delivery: "Dostawa",
        carrier: "Przewoźnik",
        trackingNumber: "Numer śledzenia",
```

- [ ] **Step 3: Policz `delivery` obok pozostałych wartości**

Po linii `const shipping = Number(order.total) - subtotal + promoDiscount;` dodaj:
```tsx
  const delivery = deliveryView(order);
```

- [ ] **Step 4: Dodaj kartę „Dostawa" po karcie adresu**

Wstaw poniższy blok bezpośrednio **po** bloku `{order.shipping_address && ( ... )}` (kończy się na `)}` przy karcie „Adres dostawy") i **przed** blokiem `{order.status === "pending" && ( ... )}`:
```tsx
      {delivery.hasInfo && (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
          <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">
            {c.delivery}
          </h3>
          <dl className="flex flex-col gap-3 text-sm">
            {delivery.carrier && (
              <div className="flex flex-col gap-0.5">
                <dt className="font-sans uppercase tracking-widest text-[10px] text-[var(--color-gold)]">
                  {c.carrier}
                </dt>
                <dd className="text-[var(--fg)]">{delivery.carrier}</dd>
              </div>
            )}
            {delivery.trackingNumber && (
              <div className="flex flex-col gap-0.5">
                <dt className="font-sans uppercase tracking-widest text-[10px] text-[var(--color-gold)]">
                  {c.trackingNumber}
                </dt>
                <dd className="font-mono text-[var(--fg)]">{delivery.trackingNumber}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
```

- [ ] **Step 5: Uruchom bramki jakości**

Run (z `sklep-meblowy/`):
```
npx tsc --noEmit
npm run lint
npm test
npm run build
```
Expected: `tsc` 0 błędów; `lint` 0; `npm test` wszystkie zielone (w tym 6 nowych z Task 1); `build` przechodzi.

- [ ] **Step 6: Weryfikacja wizualna (manualna)**

Uruchom aplikację (skill `run` lub `npm run dev` z `sklep-meblowy/`). Zaloguj się jako klient i otwórz zamówienie:
- gdy zamówienie ma ustawiony `carrier`/`tracking_number` (np. status „Wysłane") → karta „Dostawa" widoczna, pokazuje przewoźnika i nr śledzenia (tracking monospace, bez linku);
- gdy oba pola puste → karty nie ma;
- przełącz `?lang=de`/locale DE → etykiety „Versand / Spediteur / Sendungsnummer".

Jeśli nie da się szybko spreparować zamówienia z danymi dostawy, odnotuj to i oprzyj weryfikację na bramkach + logice helpera (pokryta testami).

- [ ] **Step 7: Commit**

```bash
git add app/konto/zamowienia/[id]/page.tsx
git commit -m "feat(konto): karta Dostawa — klient widzi przewoznika i nr sledzenia (PL/DE)"
```

---

## Self-Review

**Spec coverage:**
- Pokazać `carrier` + `tracking_number` klientowi → Task 2 Step 4. ✓
- Czysto prezentacyjne, bez migracji/zapytania/checkoutu → żadna taska ich nie dotyka. ✓
- Karta po „Adres dostawy", styl jak istniejące karty → Task 2 Step 4. ✓
- Widoczność tylko gdy `carrier` lub `tracking_number` niepuste (po trim) → `deliveryView.hasInfo`, Task 1. ✓
- Tracking jako tekst monospace bez linku → Task 2 Step 4 (`font-mono`, brak `<a>`). ✓
- i18n PL+DE (`delivery`/`carrier`/`trackingNumber`) → Task 2 Step 2. ✓
- Poza zakresem (`delivery_cost`/`delivery_paid`, termin, dane transportu) → nie dodawane. ✓
- Testy = pure logic w `app/_lib/__tests__/` → Task 1. ✓

**Placeholder scan:** Brak TBD/TODO; każdy krok ma pełny kod/komendę i oczekiwany wynik.

**Type consistency:** `deliveryView(order: { carrier, tracking_number })` → `{ carrier, trackingNumber, hasInfo }` użyte spójnie w Task 1 (definicja + testy) i Task 2 (`delivery.hasInfo`, `delivery.carrier`, `delivery.trackingNumber`). Klucze i18n `c.delivery`/`c.carrier`/`c.trackingNumber` zdefiniowane w Step 2 i użyte w Step 4. ✓
