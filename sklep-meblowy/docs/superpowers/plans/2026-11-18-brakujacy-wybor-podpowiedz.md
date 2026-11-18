# Podpowiedź brakującego wyboru — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przyciski „Dodaj do koszyka" i „Kup teraz" (produkt i zestaw) są zawsze aktywne, a przy niepełnym wyborze pokazują klientowi, których opcji brakuje.

**Architecture:** Czysta funkcja liczy brakujące opcje z nazwami wyświetlanymi. Wspólny komponent `MissingOptionsHint` pokazuje szarą podpowiedź albo czerwony komunikat. `VariantSelector` dostaje prop podświetlający brakujące opcje, a rodzice (`ProductActions`, `BundleConfigurator`) trzymają flagę „kliknięto" i przewijają do pierwszej brakującej.

**Tech Stack:** Next.js 16 (App Router, komponenty klienckie), React 19, Tailwind 4, Vitest (`environment: "node"`), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-brakujacy-wybor-podpowiedz-design.md`

## Global Constraints

- Przed pisaniem kodu Next.js przeczytaj właściwy przewodnik w `node_modules/next/dist/docs/` (`AGENTS.md`).
- Teksty: `Do wyboru:` (przed kliknięciem) i `Wybierz jeszcze:` (po kliknięciu); DE: `Zur Auswahl:` i `Bitte noch wählen:`. Nazwy opcji po przecinku i spacji.
- Napis przycisku nigdy nie zależy od kompletności wyboru. Przycisk jest `disabled` tylko w trakcie przejścia na `/koszyk` (`navigating`).
- Słowo `wybierz` w nagłówku niewybranej opcji selektora zostaje (testy e2e na nim polegają).
- `QuickAddButton` i klucz `product.selectVariant` zostają bez zmian.
- W repo nie ma testów komponentów (brak jsdom): logika czysta w Vitest, zachowanie UI w Playwright na buildzie (`npm run build` + `npm start`, nie `next dev`).
- Testy e2e nie zapisują w bazie; koszyk jest w `localStorage`. Bez `E2E_BASE_URL` Playwright celuje w produkcję — lokalnie ustaw `E2E_BASE_URL=http://localhost:3000` i `--no-deps`.
- Pliki mają CRLF, w repo nie ma prettiera — po commicie `git show --stat` bez zmian samych końców linii.
- Gałąź robocza `feat/brakujacy-wybor-podpowiedz`; push wymaga konta Woodecky10.

## Review Focus

1. Drugie kliknięcie przycisku po odjechaniu w dół strony znów przewija do brakującej opcji (test e2e w Zadaniu 3).
2. Produkt bez wariantów: brak podpowiedzi, przyciski działają jak dziś (istniejący test w `kup-teraz.spec.ts` zostaje zielony).
3. Podwójne kliknięcie „Kup teraz" przy pełnym wyborze dodaje jedną sztukę (istniejący test zostaje zielony).
4. Zestaw otwarty z karty produktu z już wybranymi opcjami tego produktu: komunikat wymienia tylko pozostałe meble; mebel bez wariantów nigdy się nie pojawia (test czysty w Zadaniu 1).
5. Nazwa opcji w komunikacie = nagłówek w selektorze, także z nadpisaniem admina i na DE (test czysty w Zadaniu 1).

---

### Task 1: Czysta logika brakujących opcji

**Files:**
- Create: `app/_lib/variant-missing.ts`
- Modify: `app/_components/ui/VariantSelector.tsx:41-45` (usuń lokalne `getOptionName`, używaj `localizedOptionName`)
- Test: `app/_lib/__tests__/variant-missing.test.ts`

**Interfaces:**
- Produces:

```ts
export type MissingOption = { name: string; label: string };   // name = surowa nazwa opcji
export function localizedOptionName(
  product: Pick<Product, "variants"> | undefined, optionName: string, locale: Locale
): string;
export function missingVariantOptions(
  product: Pick<Product, "variants">, selected: Record<string, string>, locale: Locale
): MissingOption[];   // w kolejności wyświetlania selektora (sortVariantOptions po label)
export type MissingGroup = { title?: string; labels: string[] };
export function missingBundleGroups(
  components: (Pick<Product, "id" | "name" | "variants">)[],
  selections: Record<string, Record<string, string>>, locale: Locale
): MissingGroup[];    // tylko meble, którym czegoś brakuje; title = name
```

- [ ] **Step 1: Napisz testy, które nie przechodzą**

```ts
const P = { variants: { options: [
  { name: "Tkanina", values: ["Sawana 21"] },
  { name: "Strona", values: ["Lewa", "Prawa"] },
] } };

describe("localizedOptionName", () => {
  it("bez nadpisania zwraca nazwę opcji", () => expect(localizedOptionName(P, "Tkanina", "pl")).toBe("Tkanina"));
  it("nadpisanie admina wygrywa", () =>
    expect(localizedOptionName({ variants: { ...P.variants, overrides: { option_names: { Strona: "Strona narożnika" } } } }, "Strona", "pl")).toBe("Strona narożnika"));
  it("na DE tłumaczy z mapy", () =>
    expect(localizedOptionName(P, "Tkanina", "de")).toBe(mapDe(VARIANT_OPTION_DE, "Tkanina") ?? "Tkanina"));
  it("bez produktu zwraca nazwę", () => expect(localizedOptionName(undefined, "Tkanina", "pl")).toBe("Tkanina"));
});

describe("missingVariantOptions", () => {
  it("nic nie wybrano → wszystkie opcje, w kolejności A-Z po etykiecie", () =>
    expect(missingVariantOptions(P, {}, "pl")).toEqual([{ name: "Strona", label: "Strona" }, { name: "Tkanina", label: "Tkanina" }]));
  it("wybrana opcja znika z listy", () =>
    expect(missingVariantOptions(P, { Strona: "Lewa" }, "pl")).toEqual([{ name: "Tkanina", label: "Tkanina" }]));
  it("pusty string to brak wyboru", () =>
    expect(missingVariantOptions(P, { Strona: "", Tkanina: "Sawana 21" }, "pl").map((m) => m.name)).toEqual(["Strona"]));
  it("komplet i produkt bez wariantów → []", () => {
    expect(missingVariantOptions(P, { Strona: "Lewa", Tkanina: "Sawana 21" }, "pl")).toEqual([]);
    expect(missingVariantOptions({ variants: null }, {}, "pl")).toEqual([]);
    expect(missingVariantOptions({ variants: { options: [] } }, {}, "pl")).toEqual([]);
  });
  it("etykieta bierze nadpisanie admina", () =>
    expect(missingVariantOptions({ variants: { ...P.variants, overrides: { option_names: { Strona: "Bok" } } } }, { Tkanina: "Sawana 21" }, "pl"))
      .toEqual([{ name: "Strona", label: "Bok" }]));
});

describe("missingBundleGroups", () => {
  const sofa = { id: "s", name: "Sofa Mio", ...P };
  const puf = { id: "p", name: "Pufa Mio", variants: null };
  const fotel = { id: "f", name: "Fotel Mio", variants: { options: [{ name: "Tkanina", values: ["Sawana 21"] }] } };
  it("wymienia tylko meble z brakami, w kolejności zestawu", () =>
    expect(missingBundleGroups([sofa, puf, fotel], { s: { Strona: "Lewa" } }, "pl")).toEqual([
      { title: "Sofa Mio", labels: ["Tkanina"] },
      { title: "Fotel Mio", labels: ["Tkanina"] },
    ]));
  it("komplet → []", () =>
    expect(missingBundleGroups([sofa, puf], { s: { Strona: "Lewa", Tkanina: "Sawana 21" } }, "pl")).toEqual([]));
  it("brak wpisu w selections = nic nie wybrano", () =>
    expect(missingBundleGroups([fotel], {}, "pl")).toEqual([{ title: "Fotel Mio", labels: ["Tkanina"] }]));
});
```

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npx vitest run app/_lib/__tests__/variant-missing.test.ts`
Expected: FAIL (brak modułu).

- [ ] **Step 3: Zaimplementuj `app/_lib/variant-missing.ts`**

Moduł czysty. `localizedOptionName` to dzisiejsze `getOptionName` z `VariantSelector.tsx:42-45` przeniesione bez zmiany zachowania. Kolejność z `sortVariantOptions` (`./variants`). „Wybrane" znaczy niepusty string, tak jak `isVariantSelectionComplete`.

- [ ] **Step 4: Podmień `getOptionName` w `VariantSelector.tsx` na import `localizedOptionName`** (usuń lokalną funkcję i nieużywane importy).

- [ ] **Step 5: Uruchom testy i typy**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/variant-missing.ts app/_lib/__tests__/variant-missing.test.ts app/_components/ui/VariantSelector.tsx
git commit -m "feat(warianty): lista brakujących opcji z nazwami wyświetlanymi"
```

---

### Task 2: Komunikat, podświetlenie w selektorze, przewijanie

**Files:**
- Create: `app/_components/ui/MissingOptionsHint.tsx`
- Create: `app/_lib/scroll-to-missing.ts`
- Modify: `app/_components/ui/VariantSelector.tsx` (prop `highlightMissing`, wrapper opcji w linii ~151)
- Modify: `app/_lib/dictionaries/pl.ts` (typ i wartości sekcji `product`), `app/_lib/dictionaries/de.ts`

**Interfaces:**
- Consumes: `MissingGroup` (Zadanie 1).
- Produces:

```ts
// słownik
product.toChoosePrefix: "Do wyboru:" / "Zur Auswahl:"
product.missingPrefix: "Wybierz jeszcze:" / "Bitte noch wählen:"

// app/_components/ui/MissingOptionsHint.tsx ("use client")
export default function MissingOptionsHint(props: {
  id: string; groups: MissingGroup[]; attempted: boolean;
}): JSX.Element | null;

// VariantSelector — nowy opcjonalny prop
highlightMissing?: boolean;

// app/_lib/scroll-to-missing.ts
export function scrollToFirstMissing(root: HTMLElement | null): void;
```

- [ ] **Step 1: Słownik** — dodaj oba klucze do typu i wartości PL oraz do DE.

- [ ] **Step 2: `MissingOptionsHint`**

- `groups` puste → `null`.
- Korzeń: `<div id={id} data-testid="missing-options" data-attempted={attempted ? "true" : "false"}>`; gdy `attempted`, dodatkowo `role="alert"`.
- Jedna grupa bez `title` → jedna linia: `<prefiks> <labels.join(", ")>`.
- W pozostałych przypadkach → linia z prefiksem i lista `<ul>`, po jednym `<li>` na grupę: `<title>: <labels.join(", ")>`.
- Prefiks: `attempted ? t.product.missingPrefix : t.product.toChoosePrefix` (locale z `useClientLocale`).
- Styl: przed kliknięciem `text-sm text-[var(--muted)]`; po kliknięciu `text-sm font-semibold text-red-600 dark:text-red-400`.

- [ ] **Step 3: `VariantSelector` — podświetlenie**

Wrapper każdej opcji (`<div key={option.name}>`) dostaje `data-variant-option={option.name}`. Gdy `highlightMissing && !current`: `data-missing="true"` oraz klasy `rounded-lg outline outline-2 outline-offset-4 outline-red-500/70`, a słowo `wybierz`/`wählen` w nagłówku dostaje `text-red-600 dark:text-red-400` zamiast `text-[var(--muted)]`. Bez `highlightMissing` render jest identyczny jak dziś.

- [ ] **Step 4: `scrollToFirstMissing`**

`root?.querySelector('[data-missing="true"]')?.scrollIntoView({ block: "center", behavior })`, gdzie `behavior` to `"auto"` przy `prefers-reduced-motion: reduce`, inaczej `"smooth"`.

- [ ] **Step 5: Typy i build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS (nic jeszcze nie używa nowych elementów).

- [ ] **Step 6: Commit**

```bash
git add app/_components/ui/MissingOptionsHint.tsx app/_lib/scroll-to-missing.ts app/_components/ui/VariantSelector.tsx app/_lib/dictionaries
git commit -m "feat(warianty): komunikat brakujących opcji i podświetlenie w selektorze"
```

---

### Task 3: Karta produktu

**Files:**
- Modify: `app/_components/ui/AddToCartButton.tsx`
- Modify: `app/_components/ui/ProductActions.tsx`
- Modify: `app/_components/ui/ProductMainSection.tsx:179` (usuń prop `selectVariantLabel`)
- Modify: `e2e/kup-teraz.spec.ts` (test „produkt z wariantami…", linie ~65–103)

**Interfaces:**
- Consumes: `missingVariantOptions`, `MissingOptionsHint`, `scrollToFirstMissing`, prop `highlightMissing`.
- Produces — nowe propsy `AddToCartButton` (zastępują `selectVariantLabel`):

```ts
needsVariant?: boolean;            // zostaje: wybór niepełny
onMissingVariant?: () => void;     // wołane zamiast dodania, gdy needsVariant
describedById?: string;            // aria-describedby na przycisku
```

- [ ] **Step 1: Przepisz test e2e, żeby opisywał nowe zachowanie (ma nie przechodzić na starym kodzie)**

Test „produkt z wariantami" w `kup-teraz.spec.ts` (tytuł: `produkt z wariantami — „Kup teraz” mówi, czego brakuje, i działa po wyborze`):

```ts
const hint = page.getByTestId("missing-options");
const missing = page.locator('[data-missing="true"]');
const addBtn = page.getByRole("button", { name: "Dodaj do koszyka" });

// Od wejścia: przyciski aktywne, stały napis, szara podpowiedź, nic nie podświetlone.
await expect(buyNow).toBeEnabled();
await expect(addBtn).toBeEnabled();
await expect(page.getByRole("button", { name: "Wybierz wariant" })).toHaveCount(0);
await expect(hint).toHaveAttribute("data-attempted", "false");
await expect(hint).toContainText("Do wyboru:");
await expect(missing).toHaveCount(0);

// Klik bez pełnego wyboru: zostajemy na karcie, komunikat i podświetlenie, nic w koszyku.
await buyNow.click();
await expect(page).toHaveURL(/\/produkt\//);
await expect(hint).toHaveAttribute("data-attempted", "true");
await expect(hint).toContainText("Wybierz jeszcze:");
await expect(missing.first()).toBeInViewport();
await page.waitForTimeout(500);
await expect(page.getByText("Dodano do koszyka")).toHaveCount(0);

// Drugi klik po odjechaniu na dół strony znów przewija do brakującej opcji.
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await addBtn.click();
await expect(missing.first()).toBeInViewport();
await expect(page.getByText("Dodano do koszyka")).toHaveCount(0);
```

Pętla wybierania opcji zostaje, ale bez `await expect(buyNow).toBeDisabled()`; w każdym obrocie liczba `missing` nie rośnie. Po pętli:

```ts
await expect(hint).toHaveCount(0);
await expect(missing).toHaveCount(0);
await buyNow.click();
await expect(page).toHaveURL(/\/koszyk$/);
```

Popraw komentarz nagłówkowy pliku (linie ~1–12), żeby opisywał nowe zachowanie. Selektor `a[aria-label="Wybierz wariant"]` do znajdowania produktu z wariantami na `/sklep` zostaje.

- [ ] **Step 2: `AddToCartButton`**

`disabled = navigating` (bez `needsVariant`). W `handleAdd`: gdy `needsVariant` → `onMissingVariant?.()` i `return`. Etykieta głównego przycisku zawsze `addLabel`. Usuń `selectVariantLabel`, `variantLabel` i komentarz o podmianie napisu. Oba warianty przycisku dostają `aria-describedby={describedById}`. Klasy `disabled:` zostają (dotyczą `navigating`).

- [ ] **Step 3: `ProductActions`**

Stan `attemptTick` (liczba, start 0); `attempted = attemptTick > 0`. `missing = missingVariantOptions(product, selected, locale)` (`useClientLocale`). `ref` na korzeniu; `useEffect` na `attemptTick` woła `scrollToFirstMissing(ref.current)` gdy `attemptTick > 0`. `VariantSelector` dostaje `highlightMissing={attempted}`. Między selektorem a przyciskami: `<MissingOptionsHint id={hintId} groups={missing.length ? [{ labels: missing.map((m) => m.label) }] : []} attempted={attempted} />` (`hintId` z `useId`). Oba `AddToCartButton` dostają `needsVariant={missing.length > 0}`, `onMissingVariant={() => setAttemptTick((n) => n + 1)}`, `describedById={missing.length ? hintId : undefined}`. Usuń prop `selectVariantLabel` (tu i w `ProductMainSection`).

- [ ] **Step 4: Uruchom testy jednostkowe, typy, build i e2e na buildzie**

Run: `npx vitest run && npx tsc --noEmit && npm run build`, potem `npm start` i
`E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/kup-teraz.spec.ts --no-deps`
Expected: wszystkie testy pliku PASS (w tym „bez wariantów" i „podwójne kliknięcie").

- [ ] **Step 5: Commit**

```bash
git add app/_components/ui/AddToCartButton.tsx app/_components/ui/ProductActions.tsx app/_components/ui/ProductMainSection.tsx e2e/kup-teraz.spec.ts
git commit -m "feat(produkt): przyciski zakupu mówią, której opcji brakuje"
```

---

### Task 4: Zestaw

**Files:**
- Modify: `app/_components/ui/BundleConfigurator.tsx`
- Modify: `app/_lib/dictionaries/pl.ts`, `app/_lib/dictionaries/de.ts` (usuń `bundle.chooseOptions` z typu i wartości)
- Modify: `e2e/zestaw-kup-teraz.spec.ts`

**Interfaces:**
- Consumes: `missingBundleGroups`, `MissingOptionsHint`, `scrollToFirstMissing`, prop `highlightMissing`.

- [ ] **Step 1: Przepisz test e2e (ma nie przechodzić na starym kodzie)**

W `zestaw-kup-teraz.spec.ts` (tytuł: `zestaw — „Kup teraz” mówi, czego brakuje, potem cały zestaw w koszyku`), przed pętlą wyboru:

```ts
const hint = page.getByTestId("missing-options");
const missing = page.locator('[data-missing="true"]');
await expect(buyNow).toBeEnabled();
await expect(page.getByRole("button", { name: "Dodaj zestaw do koszyka" })).toBeEnabled();
await expect(page.getByRole("button", { name: "Wybierz opcje dla każdego mebla" })).toHaveCount(0);
await expect(hint).toContainText("Do wyboru:");

await buyNow.click();
await expect(page).toHaveURL(/\/zestaw\//);
await expect(hint).toHaveAttribute("data-attempted", "true");
await expect(hint).toContainText("Wybierz jeszcze:");
await expect(missing.first()).toBeInViewport();
```

W pętli usuń `await expect(buyNow).toBeDisabled()`. Po pętli, przed kliknięciem: `await expect(hint).toHaveCount(0)`. Jeśli zestaw nie ma żadnej opcji do wyboru (podpowiedzi brak od wejścia), blok „klik bez wyboru" pomiń warunkiem `if (await hint.count())`. Reszta testu (zestaw w koszyku) bez zmian. Popraw komentarz nagłówkowy.

- [ ] **Step 2: `BundleConfigurator`**

`groups = missingBundleGroups(bundle.components, selections, locale)`; `allComplete = groups.length === 0`. Stan `attemptTick` i przewijanie jak w `ProductActions` (ref na korzeniu konfiguratora — `scrollIntoView` przewija też wnętrze okna). W `handleAdd`: gdy `navigating` → `return`; gdy `!allComplete` → `setAttemptTick((n) => n + 1)` i `return`. Każdy `VariantSelector` dostaje `highlightMissing={attempted}`. `MissingOptionsHint` tuż nad przyciskami, zawsze w formie listy mebli (grupy mają `title`). Oba przyciski: `disabled={navigating}`, `aria-describedby`; napis głównego zawsze `t.bundle.addToCart`.

- [ ] **Step 3: Usuń `bundle.chooseOptions` ze słowników**

Run: `grep -rn "chooseOptions" app` → Expected: brak wyników.

- [ ] **Step 4: Testy, typy, build, e2e na buildzie**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`, potem `npm start` i
`E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/zestaw-kup-teraz.spec.ts e2e/kup-teraz.spec.ts e2e/fabric-group-cards.spec.ts --no-deps`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_components/ui/BundleConfigurator.tsx app/_lib/dictionaries e2e/zestaw-kup-teraz.spec.ts
git commit -m "feat(zestaw): przyciski zakupu mówią, w którym meblu brakuje wyboru"
```

---

### Task 5: Zrzuty do akceptacji i wdrożenie

- [ ] **Step 1: Zrzuty ekranu z lokalnego buildu** (Playwright, bez zapisu): karta produktu z wariantami na szerokości 390 px i 1280 px, w stanach „przed kliknięciem" i „po kliknięciu"; okno „Kup w zestawie" po kliknięciu. Pokaż właścicielowi.
- [ ] **Step 2: Push gałęzi, PR do `main`, merge** (merge = wdrożenie na Vercelu). Przed merge: `git fetch origin <gałąź>` i `git log FETCH_HEAD..<gałąź>` puste.
- [ ] **Step 3: Po wdrożeniu** uruchom `e2e/kup-teraz.spec.ts` i `e2e/zestaw-kup-teraz.spec.ts` na produkcji (koszyk w `localStorage`, bez zapisu w bazie).

---

## STAN WYKONANIA

Nic nie rozpoczęto. Projekt zaakceptowany przez właściciela 2026-11-18 (makieta, wariant ze stałą podpowiedzią, razem z zestawami).
