# Opinie klientów — pokazywanie: slider na home + `/opinie` (plan wdrożenia 2/2)

> **Dla wykonawców agentowych:** WYMAGANY PODSKILL — użyj
> `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`, żeby wykonać ten plan zadanie po zadaniu.
> Kroki mają składnię `- [ ]` do odhaczania.

**Cel:** doprowadzić do stanu, w którym zatwierdzona opinia klienta pokazuje się
na stronie głównej w sliderze („Co mówią klienci") i na nowej stronie `/opinie`
ze wszystkimi opiniami — a gdy zatwierdzonych opinii nie ma, strona główna
wygląda dokładnie jak dziś.

**Architektura:** sekcja na home wchodzi jako **szósty blok systemowy**
(`customer_reviews`) do istniejącego systemu bloków z migracji 52 — nie jako
sekcja przybita na sztywno pod stopką logiki `renderBlock`. Dzięki temu Julia
może ją ukryć, przesunąć i zmienić nagłówek tym samym panelem, którym rusza
pozostałe pięć sekcji. Cała logika wyboru opinii („które trafiają na home")
idzie do czystego modułu `app/_lib/reviews-display.ts`, bo vitest chodzi
w `environment: "node"` i tylko takie moduły da się tu przetestować. Karuzela
to istniejący `ProductCarousel` (embla), karta opinii to nowy komponent
serwerowy — zero nowego JS na kliencie.

**Stos:** Next.js 16.2.4 (App Router, komponenty serwerowe), Supabase
(Postgres + RLS), Tailwind v4 (zmienne motywu `--fg`/`--card-bg`/`--border`),
embla-carousel-react, vitest (`environment: "node"`), Playwright.

**Spec:** `sklep-meblowy/docs/superpowers/specs/2026-08-18-opinie-klientow-design.md`
— punkt 7 kolejności wdrożenia („Pokazywanie") oraz sekcja „Co widać
publicznie". Plan 1/2 (zbieranie i moderacja) jest scalony:
`docs/superpowers/plans/2026-08-18-opinie-zbieranie-i-moderacja.md`.

## Global Constraints

- **Migracja 76 z planu 1/2 NIE JEST zaaplikowana** (sprawdzone na żywej bazie
  2026-08-18: brak kolumn `status`, `homepage_excluded`, brak tabeli
  `review_invites`, `select count(*) from product_reviews` = **0**). Każdy nowy
  odczyt musi być **fail-soft**: błąd zapytania → pusta tablica → sekcja się nie
  renderuje. Bez tego strona główna wywala się na produkcji do momentu
  aplikacji migracji.
- **Migracje NIE wjeżdżają same po merge'u** (potwierdzone na 57, 58, 75).
  Aplikacja ręczna przez MCP `apply_migration`, weryfikacja **po obiektach**,
  nie po rejestrze migracji.
- **Baza w developmencie = baza produkcyjna.** Żaden test automatyczny nie może
  zapisywać opinii.
- **Próg na home (verbatim ze speca):** `status = 'approved'`, `rating >= 4`,
  `homepage_excluded = false`, treść **dłuższa niż 30 znaków**, sortowanie od
  najnowszych, limit **12**. Brak pasujących opinii → **sekcja się nie
  renderuje**.
- **`/opinie` pokazuje WSZYSTKIE zatwierdzone opinie, łącznie z niskimi
  ocenami** — filtr `rating >= 4` obowiązuje wyłącznie na stronie głównej.
  To wymóg dyrektywy Omnibus, nie decyzja estetyczna: nie wolno publikować
  wyłącznie opinii pozytywnych.
- **Na `/opinie` musi stać zdanie o weryfikacji** — skąd opinie pochodzą i że
  obie ścieżki wymagają zakupu (drugi wymóg Omnibusa).
- **DE jest zamrożone** (`DE_ENABLED = false` w `app/_lib/i18n.ts`, `getLocale()`
  twardo zwraca `pl`), ale test parytetu słownika
  (`app/_lib/__tests__/dictionaries.test.ts`) wymaga niepustego tłumaczenia DE
  dla **każdego** nowego klucza w `pl.ts`. Nowe klucze dodajemy w obu plikach.
- **Home NIE MA `<h1>`** i nie zyskuje go w tym planie. Nagłówki sekcji to `h2`.
- **`products` NIE MA kolumny `slug`** (sprawdzone na produkcji) — produkt
  linkujemy po id: `/produkt/<id>`.
- Panel admina jest **PL-only** (metadane bloków, komunikaty toastów).

---

## Struktura plików

| Plik | Odpowiedzialność |
| --- | --- |
| `app/_lib/reviews-display.ts` (NOWY) | Czysta logika prezentacji: wybór opinii na home, anonimizacja podpisu, format daty. Zero importów `next/headers` i Supabase — musi dać się zaimportować w vitest. |
| `app/_lib/__tests__/reviews-display.test.ts` (NOWY) | Testy powyższego, w tym przypadki brzegowe ze speca. |
| `app/_lib/reviews.ts` (modyfikacja) | Dwa nowe odczyty serwerowe: `getHomepageReviews`, `getAllApprovedReviews` + wspólny helper dociągania imion autorów. |
| `app/_components/ui/ReviewCard.tsx` (NOWY) | Karta jednej opinii (cytat, gwiazdki, podpis, link do produktu). Komponent serwerowy. |
| `app/_components/ui/ReviewList.tsx` (modyfikacja) | Przechodzi na wspólne helpery z `reviews-display.ts` (koniec dwóch kopii `anonymize`). |
| `app/_components/ui/ProductCarousel.tsx` (modyfikacja) | Opcjonalne etykiety a11y strzałek (karuzela opinii nie może mówić „poprzednie produkty"). |
| `app/_lib/blocks.ts` (modyfikacja) | Nowy typ systemowy `customer_reviews` + wpis w `DEFAULT_HOME_BLOCKS`. |
| `app/page.tsx` (modyfikacja) | Odczyt opinii + `case "customer_reviews"` w `renderBlock`. |
| `app/admin/strona-glowna/BlocksEditor.tsx` (modyfikacja) | Wpis w `SYSTEM_META` (wymuszony typem `Record<SystemBlockType, …>`). |
| `app/opinie/page.tsx` (NOWY) | Strona ze wszystkimi zatwierdzonymi opiniami + zdanie o weryfikacji. |
| `app/sitemap.ts` (modyfikacja) | `/opinie` w trasach statycznych (PL-only, jak `/o-nas`). |
| `app/_lib/dictionaries/pl.ts`, `de.ts` (modyfikacja) | Nowe klucze `home.reviews*`, `a11y.*Reviews`, sekcja `reviewsPage`. Sekcja `meta` bez zmian. |
| `supabase/migrations/77_page_blocks_customer_reviews.sql` (NOWY) | Wiersz bloku systemowego w `page_blocks`, żeby sekcja była edytowalna z panelu. Idempotentny. |
| `e2e/opinie-widok.spec.ts` (NOWY) | Nieniszczące sprawdzenie: brak pustej sekcji na home, `/opinie` odpowiada 200. |

**Zero zmian w:** `app/api/reviews/route.ts`, `app/admin/opinie/*` (przełącznik
„nie na stronie głównej" powstał już w planie 1/2), `app/_lib/reviews-admin.ts`.

---

### Task 1: Czysta logika prezentacji opinii

**Files:**
- Create: `app/_lib/reviews-display.ts`
- Test: `app/_lib/__tests__/reviews-display.test.ts`
- Modify: `app/_components/ui/ReviewList.tsx` (usunięcie lokalnych kopii `anonymize` i `formatDate`)

**Interfaces:**
- Produces:
  - `HOMEPAGE_REVIEW_MIN_RATING = 4`, `HOMEPAGE_REVIEW_MIN_COMMENT_LENGTH = 30`, `HOMEPAGE_REVIEWS_LIMIT = 12`
  - `selectHomepageReviews<T extends HomepageSelectable>(rows: T[], limit?: number): T[]`
  - `anonymizeAuthor(name: string | null | undefined, locale: Locale): string`
  - `formatReviewDate(iso: string, locale: Locale): string`

- [ ] **Krok 1: Napisz test, który ma padać**

`app/_lib/__tests__/reviews-display.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  selectHomepageReviews,
  anonymizeAuthor,
  formatReviewDate,
  HOMEPAGE_REVIEWS_LIMIT,
} from "@/app/_lib/reviews-display";

// Fabryka wiersza opinii — domyślnie taka, która NA HOME WCHODZI.
// Każdy test psuje dokładnie jedno pole, więc widać, co go odrzuca.
//
// Typ jawny, NIE `Partial<Parameters<typeof selectHomepageReviews>[0][number]>`:
// tamten rozwija się do Partial<HomepageSelectable>, a więc odrzuca `id`,
// którego HomepageSelectable nie zawiera (a testy kolejności go używają).
type Row = {
  id: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  status: "pending" | "approved" | "rejected";
  homepage_excluded: boolean;
  created_at: string;
};

function opinia(over: Partial<Row> = {}): Row {
  return {
    id: "r1",
    rating: 5 as const,
    comment: "Sofa jest bardzo wygodna, tkanina trzyma się świetnie po miesiącu.",
    status: "approved" as const,
    homepage_excluded: false,
    created_at: "2026-08-10T10:00:00+00:00",
    ...over,
  };
}

describe("selectHomepageReviews", () => {
  it("przepuszcza opinię spełniającą wszystkie warunki", () => {
    expect(selectHomepageReviews([opinia()])).toHaveLength(1);
  });

  it("odrzuca opinię niezatwierdzoną", () => {
    expect(selectHomepageReviews([opinia({ status: "pending" })])).toEqual([]);
    expect(selectHomepageReviews([opinia({ status: "rejected" })])).toEqual([]);
  });

  it("odrzuca ocenę poniżej 4", () => {
    expect(selectHomepageReviews([opinia({ rating: 3 })])).toEqual([]);
  });

  it("przepuszcza ocenę dokładnie 4", () => {
    expect(selectHomepageReviews([opinia({ rating: 4 })])).toHaveLength(1);
  });

  it("odrzuca opinię wykluczoną z home, nawet z oceną 5", () => {
    expect(selectHomepageReviews([opinia({ homepage_excluded: true })])).toEqual([]);
  });

  it("odrzuca pustą treść i sam null", () => {
    expect(selectHomepageReviews([opinia({ comment: null })])).toEqual([]);
    expect(selectHomepageReviews([opinia({ comment: "   " })])).toEqual([]);
  });

  it("odrzuca treść o długości dokładnie 30 znaków (próg to WIĘCEJ niż 30)", () => {
    const c = "a".repeat(30);
    expect(selectHomepageReviews([opinia({ comment: c })])).toEqual([]);
    expect(selectHomepageReviews([opinia({ comment: c + "b" })])).toHaveLength(1);
  });

  it("liczy długość po obcięciu białych znaków", () => {
    expect(
      selectHomepageReviews([opinia({ comment: "   " + "a".repeat(31) + "   " })])
    ).toHaveLength(1);
    expect(
      selectHomepageReviews([opinia({ comment: "   " + "a".repeat(29) + "   " })])
    ).toEqual([]);
  });

  it("sortuje od najnowszych", () => {
    const wynik = selectHomepageReviews([
      opinia({ id: "stara", created_at: "2026-01-01T00:00:00+00:00" }),
      opinia({ id: "nowa", created_at: "2026-08-18T00:00:00+00:00" }),
      opinia({ id: "srednia", created_at: "2026-05-05T00:00:00+00:00" }),
    ]);
    expect(wynik.map((r) => r.id)).toEqual(["nowa", "srednia", "stara"]);
  });

  it("obcina do limitu 12", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      opinia({ id: `r${i}`, created_at: `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00+00:00` })
    );
    expect(selectHomepageReviews(rows)).toHaveLength(HOMEPAGE_REVIEWS_LIMIT);
    expect(selectHomepageReviews(rows, 3)).toHaveLength(3);
  });

  it("pusta lista wchodzi, pusta wychodzi", () => {
    expect(selectHomepageReviews([])).toEqual([]);
  });
});

describe("anonymizeAuthor", () => {
  it("skraca nazwisko do inicjału", () => {
    expect(anonymizeAuthor("Anna Kowalska", "pl")).toBe("Anna K.");
  });
  it("zostawia samo imię bez zmian", () => {
    expect(anonymizeAuthor("Anna", "pl")).toBe("Anna");
  });
  it("bierze ostatni człon przy trzech wyrazach", () => {
    expect(anonymizeAuthor("Anna Maria Kowalska", "pl")).toBe("Anna K.");
  });
  it("brak imienia → Klient / Kunde", () => {
    expect(anonymizeAuthor(null, "pl")).toBe("Klient");
    expect(anonymizeAuthor("", "pl")).toBe("Klient");
    expect(anonymizeAuthor("   ", "pl")).toBe("Klient");
    expect(anonymizeAuthor(null, "de")).toBe("Kunde");
  });
});

describe("formatReviewDate", () => {
  it("formatuje poprawną datę ISO (rok w wyniku)", () => {
    expect(formatReviewDate("2026-08-18T10:00:00+00:00", "pl")).toContain("2026");
  });
  it("śmieć zwraca bez zmian, nie wyjątek", () => {
    expect(formatReviewDate("nie-data", "pl")).toBe("nie-data");
  });
});
```

- [ ] **Krok 2: Odpal test i potwierdź, że pada**

Run: `npx vitest run app/_lib/__tests__/reviews-display.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_lib/reviews-display"`.

- [ ] **Krok 3: Napisz moduł**

`app/_lib/reviews-display.ts`:

```ts
// Czysta logika PREZENTACJI opinii — bez Supabase i bez next/headers, żeby
// dało się to zaimportować w vitest (environment: "node"). Odczyty z bazy
// siedzą w reviews.ts, komponenty w _components/ui.

import type { Locale } from "./i18n";
import type { ProductReview } from "./types";

// Próg oceny na stronie głównej. Filtr obowiązuje WYŁĄCZNIE tam: /opinie
// i karta produktu pokazują wszystkie zatwierdzone oceny, bo dyrektywa
// Omnibus zabrania publikowania samych opinii pozytywnych. Na home to wybór
// redakcyjny z ograniczonego miejsca (12 slotów), nie ukrywanie krytyki.
export const HOMEPAGE_REVIEW_MIN_RATING = 4;

// Krótsza treść nie przekonuje, a zajmuje slot opinii, która przekonuje.
// Próg jest OSTRY (> 30, nie >= 30) — patrz test na dokładnie 30 znaków.
export const HOMEPAGE_REVIEW_MIN_COMMENT_LENGTH = 30;

export const HOMEPAGE_REVIEWS_LIMIT = 12;

export type HomepageSelectable = Pick<
  ProductReview,
  "rating" | "comment" | "status" | "homepage_excluded" | "created_at"
>;

// Wybór opinii na stronę główną. Ostateczna bramka jest TUTAJ, nie w SQL:
// warunek długości treści nie da się wyrazić filtrem PostgREST, a rozbicie
// reguły na dwa miejsca kończy się rozjazdem. Zapytanie odsiewa zgrubnie,
// ten moduł rozstrzyga.
export function selectHomepageReviews<T extends HomepageSelectable>(
  rows: T[],
  limit = HOMEPAGE_REVIEWS_LIMIT
): T[] {
  return rows
    .filter(
      (r) =>
        r.status === "approved" &&
        r.homepage_excluded === false &&
        r.rating >= HOMEPAGE_REVIEW_MIN_RATING &&
        (r.comment ?? "").trim().length > HOMEPAGE_REVIEW_MIN_COMMENT_LENGTH
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, Math.max(0, limit));
}

// Podpis pod opinią w formie „Anna K." — RODO, minimalizacja danych.
// Przeniesione z ReviewList.tsx (zachowanie 1:1), bo karta opinii na home
// i strona /opinie potrzebują tego samego.
export function anonymizeAuthor(
  name: string | null | undefined,
  locale: Locale
): string {
  const fallback = locale === "de" ? "Kunde" : "Klient";
  if (!name || name.trim() === "") return fallback;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0] ?? "";
  return `${first} ${lastInitial}.`;
}

// Data wystawienia opinii. Śmieć na wejściu zwracamy bez zmian — data pod
// opinią nie jest warta wywalenia strony głównej.
export function formatReviewDate(iso: string, locale: Locale): string {
  try {
    return new Date(iso).toLocaleDateString(locale === "de" ? "de-DE" : "pl-PL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
```

- [ ] **Krok 4: Odpal test i potwierdź, że przechodzi**

Run: `npx vitest run app/_lib/__tests__/reviews-display.test.ts`
Expected: PASS (wszystkie przypadki).

Jeśli `formatReviewDate("nie-data")` NIE zwraca wejścia, znaczy że
`toLocaleDateString` na `Invalid Date` nie rzuca w tym Node — wtedy dodaj
jawny warunek `if (Number.isNaN(new Date(iso).getTime())) return iso;` przed
`try` i odpal test ponownie.

- [ ] **Krok 5: Przełącz `ReviewList` na wspólne helpery**

W `app/_components/ui/ReviewList.tsx`: usuń lokalne `formatDate` i `anonymize`,
dodaj import i podmień wywołania.

```tsx
import StarRating from "./StarRating";
import { getLocale } from "@/app/_lib/i18n-server";
import { anonymizeAuthor, formatReviewDate } from "@/app/_lib/reviews-display";
import type { ProductReview } from "@/app/_lib/types";
```

Wywołania w JSX: `anonymize(r.author_name, de)` → `anonymizeAuthor(r.author_name, locale)`,
`formatDate(r.created_at, de)` → `formatReviewDate(r.created_at, locale)`.
Zmienna `de` zostaje, jeśli używa jej jeszcze słownik komunikatów w tym pliku.

- [ ] **Krok 6: Sprawdź typy i cały zestaw testów**

Run: `npx tsc --noEmit`
Expected: brak błędów.
Run: `npm test`
Expected: PASS, liczba testów rośnie o testy z kroku 1, zero regresji.

- [ ] **Krok 7: Commit**

```bash
git add app/_lib/reviews-display.ts app/_lib/__tests__/reviews-display.test.ts app/_components/ui/ReviewList.tsx
git commit -m "feat(opinie): czysta logika wyboru opinii na strone glowna"
```

---

### Task 2: Odczyty z bazy — home i `/opinie`

**Files:**
- Modify: `app/_lib/reviews.ts` (dopisanie na końcu pliku)

**Interfaces:**
- Consumes: `selectHomepageReviews`, `HOMEPAGE_REVIEW_MIN_RATING`, `HOMEPAGE_REVIEWS_LIMIT` (Task 1)
- Produces:
  - `type PublicReview = ProductReview & { product_name: string | null }`
  - `getHomepageReviews(locale: Locale): Promise<PublicReview[]>`
  - `getAllApprovedReviews(locale: Locale): Promise<PublicReview[]>`
  - `REVIEWS_PAGE_LIMIT = 200`

- [ ] **Krok 1: Dopisz odczyty**

Na końcu `app/_lib/reviews.ts` (importy uzupełnij u góry pliku):

```ts
import {
  selectHomepageReviews,
  HOMEPAGE_REVIEW_MIN_RATING,
  HOMEPAGE_REVIEWS_LIMIT,
} from "./reviews-display";
```

```ts
// Opinia pokazywana publicznie poza kartą produktu (home, /opinie) — musi
// nieść nazwę ocenianego produktu, żeby dało się do niego wrócić.
// ⚠️ Bez `slug`: tabela products NIE MA takiej kolumny — link to /produkt/<id>.
export type PublicReview = ProductReview & { product_name: string | null };

// Ile opinii wchodzi na /opinie. Przy dzisiejszej skali (0 opinii, 10 zamówień)
// to sufit bezpieczeństwa, nie stronicowanie — stronicowanie dopiszemy, gdy
// będzie co stronicować.
export const REVIEWS_PAGE_LIMIT = 200;

// Dociąga imiona autorów i tłumaczy treść. Profile czytamy klientem
// administracyjnym: profiles ma RLS using(auth.uid() = id), więc zwykły klient
// widziałby WYŁĄCZNIE własny profil i każda cudza opinia gubiłaby podpis.
// Eksponujemy tylko full_name (autor zgadza się na podpis pod opinią).
async function withAuthorsAndProduct(
  rows: (ProductReview & { products?: { name: string | null } | null })[],
  locale: Locale
): Promise<PublicReview[]> {
  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((id): id is string => id !== null))
  );
  const nameMap = new Map<string, string | null>();
  if (userIds.length > 0) {
    const admin = await createAdminClient();
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) {
      nameMap.set(p.id, p.full_name);
    }
  }
  return rows.map((r) => ({
    ...localizeReview(r, locale),
    author_name: authorNameOf(r, nameMap.get(r.user_id ?? "")),
    product_name: r.products?.name ?? null,
  }));
}

// Opinie na slider strony głównej. Zapytanie odsiewa zgrubnie (status, ocena,
// wykluczenie), ostateczna bramka to selectHomepageReviews — długości treści
// nie da się wyrazić filtrem PostgREST.
//
// Nadpobranie ×3: zapytanie nie wie o progu 30 znaków, więc gdyby wzięło
// dokładnie 12 wierszy, każda krótka opinia zmniejszałaby slider poniżej
// limitu, mimo że w bazie stoją dobre opinie tuż za nią.
//
// ⚠️ FAIL-SOFT jest tu wymogiem, nie ostrożnością: dopóki migracja 76 nie jest
// zaaplikowana, kolumny `status` i `homepage_excluded` NIE ISTNIEJĄ i PostgREST
// zwraca błąd. Pusta tablica = sekcja się nie renderuje = strona główna
// wygląda jak dziś. Rzucenie stąd wyjątkiem wywala CAŁĄ stronę główną.
export async function getHomepageReviews(
  locale: Locale = DEFAULT_LOCALE
): Promise<PublicReview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_reviews")
    .select("*, products(name)")
    .eq("status", "approved")
    .eq("homepage_excluded", false)
    .gte("rating", HOMEPAGE_REVIEW_MIN_RATING)
    .order("created_at", { ascending: false })
    .limit(HOMEPAGE_REVIEWS_LIMIT * 3);
  if (error || !data) return [];

  const rows = data as unknown as (ProductReview & {
    products: { name: string | null } | null;
  })[];
  return withAuthorsAndProduct(selectHomepageReviews(rows), locale);
}

// Wszystkie zatwierdzone opinie na /opinie — BEZ filtra oceny i BEZ progu
// długości. Dyrektywa Omnibus zabrania publikowania wyłącznie opinii
// pozytywnych, więc jedyny filtr to moderacja (spam i obelgi).
export async function getAllApprovedReviews(
  locale: Locale = DEFAULT_LOCALE
): Promise<PublicReview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_reviews")
    .select("*, products(name)")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(REVIEWS_PAGE_LIMIT);
  if (error || !data) return [];

  const rows = data as unknown as (ProductReview & {
    products: { name: string | null } | null;
  })[];
  return withAuthorsAndProduct(rows, locale);
}
```

Uwaga do wykonawcy: `getReviewsForProduct` **zostaje bez zmian**. Ma własną
szybką ścieżkę dla opinii bez kont, nie ma testu (moduł dotyka bazy), a siedzi
na karcie produktu, która sprzedaje. Refaktor „przy okazji" tego planu byłby
zmianą nieobjętą żadnym testem na ścieżce krytycznej.

- [ ] **Krok 2: Sprawdź typy i testy**

Run: `npx tsc --noEmit`
Expected: brak błędów.
Run: `npm test`
Expected: PASS, zero regresji.

- [ ] **Krok 3: Commit**

```bash
git add app/_lib/reviews.ts
git commit -m "feat(opinie): odczyty opinii dla strony glownej i /opinie"
```

---

### Task 3: Karta opinii + sekcja na stronie głównej

**Files:**
- Create: `app/_components/ui/ReviewCard.tsx`
- Modify: `app/_components/ui/ProductCarousel.tsx` (etykiety a11y)
- Modify: `app/_lib/blocks.ts` (`SYSTEM_BLOCK_TYPES`, `DEFAULT_HOME_BLOCKS`)
- Modify: `app/admin/strona-glowna/BlocksEditor.tsx` (`SYSTEM_META`)
- Modify: `app/page.tsx` (odczyt + `case "customer_reviews"`)
- Modify: `app/_lib/dictionaries/pl.ts`, `app/_lib/dictionaries/de.ts`
- Test: `app/_lib/__tests__/blocks.test.ts` (jeśli istnieje — dopisz przypadek; jeśli nie, weryfikacja przez `npm test` + build)

**Interfaces:**
- Consumes: `PublicReview`, `getHomepageReviews` (Task 2), `anonymizeAuthor`, `formatReviewDate` (Task 1)
- Produces: `ReviewCard` (props: `{ review: PublicReview; locale: Locale }`), typ systemowy bloku `"customer_reviews"`

- [ ] **Krok 1: Dodaj klucze słownika (PL + DE)**

`app/_lib/dictionaries/pl.ts` — w typie `PlShape`, sekcja `home`, po
`featuredEmpty`:

```ts
    reviewsEyebrow: string;
    reviewsHeading: string;
    reviewsSeeAll: string;
```

W wartościach `export const pl`, sekcja `home`, po `featuredEmpty`:

```ts
    reviewsEyebrow: "Opinie klientów",
    reviewsHeading: "Co mówią klienci",
    reviewsSeeAll: "Zobacz wszystkie opinie",
```

`app/_lib/dictionaries/de.ts`, sekcja `home`:

```ts
    reviewsEyebrow: "Kundenmeinungen",
    reviewsHeading: "Was unsere Kunden sagen",
    reviewsSeeAll: "Alle Bewertungen ansehen",
```

Klucze dla samej strony `/opinie` dochodzą w Task 4 — tutaj tylko te trzy,
inaczej test parytetu padnie na kluczach bez użycia.

- [ ] **Krok 2: Napisz kartę opinii**

`app/_components/ui/ReviewCard.tsx`:

```tsx
import StarRating from "./StarRating";
import LocalizedLink from "./LocalizedLink";
import { anonymizeAuthor, formatReviewDate } from "@/app/_lib/reviews-display";
import type { Locale } from "@/app/_lib/i18n";
import type { PublicReview } from "@/app/_lib/reviews";

// Karta jednej opinii — komponent SERWEROWY (zero JS na kliencie). Renderuje
// się także wewnątrz ProductCarousel, który jest kliencki: serwerowe dzieci
// klienta to ten sam wzorzec, co ProductCard w karuzeli produktów.
//
// h-full + flex-col: embla nie wyrównuje wysokości slajdów, a cytaty mają
// różne długości. Bez tego karty w jednym rzędzie mają różne wysokości.
export default function ReviewCard({
  review,
  locale,
}: {
  review: PublicReview;
  locale: Locale;
}) {
  const author = anonymizeAuthor(review.author_name, locale);
  const de = locale === "de";
  return (
    <figure
      data-review-card
      className="h-full flex flex-col gap-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <StarRating value={review.rating} size={14} />
        <span className="text-xs text-[var(--muted)]">
          {formatReviewDate(review.created_at, locale)}
        </span>
      </div>

      <blockquote className="flex-1 whitespace-pre-wrap leading-relaxed text-[var(--fg)]">
        {review.comment}
      </blockquote>

      <figcaption className="text-sm text-[var(--muted)]">
        <span className="font-semibold text-[var(--fg)]">{author}</span>
        <span className="mx-1.5">·</span>
        <span>{de ? "Verifizierter Kauf" : "Zweryfikowany zakup"}</span>
      </figcaption>

      {review.product_name && (
        <LocalizedLink
          href={`/produkt/${review.product_id}`}
          className="text-sm font-sans text-[var(--color-gold-text)] hover:underline"
        >
          {review.product_name}
        </LocalizedLink>
      )}
    </figure>
  );
}
```

- [ ] **Krok 3: Etykiety a11y karuzeli**

`app/_components/ui/ProductCarousel.tsx` — podpis funkcji i `aria-label`
strzałek. Domyślne wartości zostają dzisiejsze, więc karuzela produktów
zachowuje się identycznie:

```tsx
export default function ProductCarousel({
  children,
  prevLabel,
  nextLabel,
}: {
  children: ReactNode;
  // Karuzela wozi też opinie (sekcja customer_reviews na home) — czytnik
  // ekranu nie może wtedy mówić „poprzednie produkty".
  prevLabel?: string;
  nextLabel?: string;
}) {
```

W obu `<button>`: `aria-label={prevLabel ?? t.a11y.prevProducts}` i
`aria-label={nextLabel ?? t.a11y.nextProducts}`.

- [ ] **Krok 4: Zarejestruj blok systemowy**

`app/_lib/blocks.ts` — `SYSTEM_BLOCK_TYPES`:

```ts
export const SYSTEM_BLOCK_TYPES = [
  "hero",
  "tiles",
  "featured",
  "trust_bar",
  "collections",
  "customer_reviews",
] as const;
```

`DEFAULT_HOME_BLOCKS` — nowy wpis na końcu tablicy (defaulty działają tylko
przy pustej/niedostępnej tabeli; na produkcji wiersz wstawia migracja 77):

```ts
  { id: "system:customer_reviews", page_id: null, block_type: "customer_reviews", sort_order: 5, visible: true, content: { heading: pl.home.reviewsHeading, heading_de: de.home?.reviewsHeading ?? pl.home.reviewsHeading, subheading: pl.home.reviewsEyebrow, subheading_de: de.home?.reviewsEyebrow ?? pl.home.reviewsEyebrow } },
```

`localizeBlock` NIE wymaga zmian — bloki systemowe obsługuje gałąź
`isSystemBlockType` (nagłówek + podnagłówek), a nowa sekcja innej treści nie ma.

- [ ] **Krok 5: Metadane sekcji w panelu**

`app/admin/strona-glowna/BlocksEditor.tsx`, `SYSTEM_META` (typ
`Record<SystemBlockType, …>` wymusi ten wpis — bez niego `tsc` padnie):

```ts
  customer_reviews: {
    name: "Opinie klientów",
    desc: "Slider z zatwierdzonymi opiniami (ocena 4-5, dłuższe wypowiedzi). Treść bierze się z opinii klientów — pojedynczą opinię wykluczasz w „Opinie”.",
    contentHref: "/admin/opinie",
    contentCta: "Przejdź do opinii",
    hasHeadings: true,
  },
```

- [ ] **Krok 6: Wepnij sekcję na stronę główną**

`app/page.tsx`:

1. Importy:

```tsx
import ReviewCard from "./_components/ui/ReviewCard";
import ProductCarousel from "./_components/ui/ProductCarousel";
import { getHomepageReviews } from "./_lib/reviews";
```

2. `Promise.all` — dopisz `getHomepageReviews(locale)` jako kolejną pozycję
   i `homepageReviews` do destrukturyzacji (kolejność w tablicy i w
   destrukturyzacji MUSI się zgadzać — dopisuj na końcu obu list).

3. Nowy `case` w `renderBlock` (przed `default`):

```tsx
      case "customer_reviews":
        // Brak pasujących opinii → NIC. Pusty slider z nagłówkiem „Co mówią
        // klienci" wygląda gorzej niż jego brak, a taki właśnie jest stan do
        // pierwszej zatwierdzonej opinii.
        if (homepageReviews.length === 0) return null;
        return (
          <section id="home-reviews" className="max-w-7xl mx-auto px-6 py-24">
            {sectionHeader(b)}
            <ProductCarousel prevLabel={t.a11y.prevReviews} nextLabel={t.a11y.nextReviews}>
              {homepageReviews.map((r) => (
                <ReviewCard key={r.id} review={r} locale={locale} />
              ))}
            </ProductCarousel>
            <div className="mt-12 text-center">
              <LocalizedLink
                href="/opinie"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-[var(--border)] font-sans text-sm uppercase tracking-widest text-[var(--fg)] hover:bg-[var(--color-gold)] hover:text-[var(--color-navy)] hover:border-transparent transition-colors"
              >
                {t.home.reviewsSeeAll}
              </LocalizedLink>
            </div>
          </section>
        );
```

4. Klucze `a11y.prevReviews` / `a11y.nextReviews` dopisz w `pl.ts` (typ +
   wartości: „Poprzednie opinie", „Następne opinie") i `de.ts` („Vorherige
   Bewertungen", „Nächste Bewertungen") — obok istniejących `prevProducts`.

- [ ] **Krok 7: Sprawdź typy, testy i build**

Run: `npx tsc --noEmit`
Expected: brak błędów. Jeśli `tsc` wskaże brakujący wpis w jakimś
`Record<SystemBlockType, …>` poza `BlocksEditor` — uzupełnij go tam analogicznie.
Run: `npm test`
Expected: PASS, w tym test parytetu słownika (nowe klucze mają DE).
Run: `npm run build`
Expected: build przechodzi.

- [ ] **Krok 8: Commit**

```bash
git add app/_components/ui/ReviewCard.tsx app/_components/ui/ProductCarousel.tsx app/_lib/blocks.ts app/admin/strona-glowna/BlocksEditor.tsx app/page.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts
git commit -m "feat(opinie): slider opinii jako sekcja strony glownej"
```

---

### Task 4: Strona `/opinie`

**Files:**
- Create: `app/opinie/page.tsx`
- Modify: `app/sitemap.ts`
- Modify: `app/_lib/dictionaries/pl.ts`, `app/_lib/dictionaries/de.ts`

**Interfaces:**
- Consumes: `getAllApprovedReviews` (Task 2), `ReviewCard` (Task 3)
- Produces: trasa `/opinie` (cel przycisku „Zobacz wszystkie opinie" z Task 3)

- [ ] **Krok 1: Klucze słownika**

`pl.ts` — nowa sekcja w `PlShape` (obok `home`):

```ts
  reviewsPage: {
    eyebrow: string;
    heading: string;
    intro: string;
    metaDescription: string;
    empty: string;
  };
```

Wzorzec metadanych bierzemy z `/tkaniny`: `title` i `description` idą z sekcji
słownika należącej DO TEJ STRONY, nie z `meta.*` (tam siedzą tylko `homeTitle`,
`shopTitle`, `wishlistTitle`). `metaDescription` jest osobnym, krótkim kluczem —
`intro` ma ~350 znaków i jako `<meta description>` zostałoby ucięte w wynikach
wyszukiwania.

Wartości w `export const pl`:

```ts
  reviewsPage: {
    eyebrow: "Opinie klientów",
    heading: "Co mówią o naszych meblach",
    // Wymóg dyrektywy Omnibus: sklep musi napisać, czy i JAK weryfikuje, że
    // opinie pochodzą od osób, które kupiły. To zdanie jest prawdziwe — obie
    // ścieżki wystawienia opinii wymagają zakupu (konto przez regułę bazy,
    // gość przez jednorazowy link przypisany do pozycji zamówienia).
    intro:
      "Publikujemy tylko opinie osób, które kupiły u nas mebel — zaproszenie do wystawienia opinii wysyłamy po dostawie, na adres z zamówienia. Każda opinia przechodzi moderację, która odsiewa spam i wypowiedzi obraźliwe; nie usuwamy opinii krytycznych i nie zmieniamy ich treści.",
    metaDescription:
      "Opinie klientów o meblach Mollien — wystawiane po dostawie przez osoby, które kupiły mebel. Publikujemy także oceny krytyczne.",
    empty: "Nie mamy jeszcze opinii do pokazania. Pojawią się tutaj, gdy pierwsi klienci ocenią swoje meble.",
  },
```

`de.ts`:

```ts
  reviewsPage: {
    eyebrow: "Kundenmeinungen",
    heading: "Was Kunden über unsere Möbel sagen",
    intro:
      "Wir veröffentlichen ausschließlich Bewertungen von Personen, die bei uns ein Möbelstück gekauft haben — die Einladung zur Bewertung senden wir nach der Lieferung an die E-Mail-Adresse aus der Bestellung. Jede Bewertung wird moderiert, um Spam und beleidigende Inhalte auszusortieren; kritische Bewertungen löschen wir nicht und ihren Inhalt ändern wir nicht.",
    metaDescription:
      "Kundenbewertungen zu Mollien-Möbeln — abgegeben nach der Lieferung von Personen, die ein Möbelstück gekauft haben. Auch kritische Bewertungen veröffentlichen wir.",
    empty: "Wir haben noch keine Bewertungen. Sie erscheinen hier, sobald die ersten Kunden ihre Möbel bewerten.",
  },
```

Sekcja `meta` w słowniku **zostaje bez zmian** — nie dodawaj tam `reviewsTitle`
ani `reviewsDescription`.

- [ ] **Krok 2: Napisz stronę**

`app/opinie/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getAllApprovedReviews } from "../_lib/reviews";
import { getLocale } from "../_lib/i18n-server";
import { getDictionary } from "../_lib/dictionaries";
import { localizePath } from "../_lib/i18n";
import { alternatesFor } from "../_lib/sitemap-i18n";
import { baseOpenGraph } from "../_lib/seo-og";
import ReviewCard from "../_components/ui/ReviewCard";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return {
    title: t.reviewsPage.heading,
    description: t.reviewsPage.metaDescription,
    alternates: {
      canonical: localizePath("/opinie", locale),
      languages: alternatesFor("/opinie", { hasDe: true }).languages,
    },
    // openGraph nadpisuje się W CAŁOŚCI — sam `locale` gubi og:image
    // i og:site_name z layoutu. Patrz seo-og.ts.
    openGraph: baseOpenGraph(locale),
  };
}

// Wszystkie zatwierdzone opinie, najnowsze pierwsze — także niskie oceny.
// Filtr `rating >= 4` obowiązuje WYŁĄCZNIE na stronie głównej (12 slotów);
// tutaj ukrywanie krytyki byłoby złamaniem wymogu z dyrektywy Omnibus.
export default async function OpiniePage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const reviews = await getAllApprovedReviews(locale);

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="max-w-3xl mb-12">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
          {t.reviewsPage.eyebrow}
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)] mb-4">
          {t.reviewsPage.heading}
        </h1>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          {t.reviewsPage.intro}
        </p>
      </div>

      {reviews.length === 0 ? (
        <p className="text-sm text-[var(--muted)] italic">{t.reviewsPage.empty}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
```

Uwaga: `/opinie` MA `<h1>` — to osobna podstrona, a zakaz `<h1>` dotyczy
wyłącznie strony głównej (patrz komentarz przy `case "hero"` w `app/page.tsx`).

Sprawdź w `app/o-nas` (albo `app/(legal)`), czy podstrony nie mają wspólnego
wrappera/tła, którego trzeba tu użyć — jeśli mają, zastosuj ten sam układ.

- [ ] **Krok 3: Sitemap**

`app/sitemap.ts`, w `staticRoutes`, po wpisie `/kontakt`:

```ts
    { url: `${BASE}/opinie`,      lastModified: now, changeFrequency: "weekly",  priority: 0.5 },
```

Bez wariantu `/de` — jak `/o-nas` i `/kontakt` (DE zamrożone, patrz
`DE_ENABLED`).

- [ ] **Krok 4: Sprawdź typy, testy i build**

Run: `npx tsc --noEmit`
Expected: brak błędów.
Run: `npm test`
Expected: PASS (parytet słownika obejmuje nową sekcję `reviewsPage`).
Run: `npm run build`
Expected: build przechodzi, `/opinie` na liście tras.

- [ ] **Krok 5: Commit**

```bash
git add app/opinie/page.tsx app/sitemap.ts app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts
git commit -m "feat(opinie): strona /opinie ze wszystkimi zatwierdzonymi opiniami"
```

---

### Task 5: Guard e2e — brak pustej sekcji na home

**Files:**
- Create: `e2e/opinie-widok.spec.ts`

- [ ] **Krok 1: Napisz spec**

```ts
import { test, expect } from "@playwright/test";

// ⚠️ Baza jest wspólna z produkcją — ten spec NIC nie zapisuje. Sprawdza
// niezmienniki, które trzymają się niezależnie od tego, ile opinii jest
// zatwierdzonych, więc nie zgaśnie po pierwszej prawdziwej opinii.
//
// URUCHAMIANIE: ustaw E2E_BASE_URL na localhost i dodaj --no-deps. Bez
// E2E_BASE_URL playwright.config.ts celuje w PRODUKCJE (www.mollien.pl).

test("strona główna nie renderuje pustej sekcji opinii", async ({ page }) => {
  await page.goto("/");
  const sekcja = page.locator("#home-reviews");
  // Niezmiennik: sekcja albo nie istnieje, albo ma co najmniej jedną kartę.
  // Pusty slider z nagłówkiem „Co mówią klienci" to defekt, nie stan przejściowy.
  if ((await sekcja.count()) > 0) {
    await expect(sekcja.locator("[data-review-card]").first()).toBeVisible();
  }
});

test("/opinie odpowiada i wyjaśnia, skąd pochodzą opinie", async ({ page }) => {
  const res = await page.goto("/opinie");
  expect(res?.status()).toBe(200);
  // Zdanie o weryfikacji zakupu to wymóg Omnibusa — musi stać na stronie
  // także wtedy, gdy nie ma jeszcze ani jednej opinii.
  await expect(page.getByText(/kupiły u nas mebel/i)).toBeVisible();
});
```

- [ ] **Krok 2: Odpal na buildzie (nie na `next dev`)**

```bash
npm run build
npm start &
E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/opinie-widok.spec.ts --no-deps
```

Expected: 2 passed. Ubij `npm start` po testach.

- [ ] **Krok 3: Commit**

```bash
git add e2e/opinie-widok.spec.ts
git commit -m "test(opinie): guard e2e na pusta sekcje opinii i strone /opinie"
```

---

### Task 6: Migracja 77 — wiersz sekcji w `page_blocks`

**Files:**
- Create: `supabase/migrations/77_page_blocks_customer_reviews.sql`

**Dlaczego to osobne zadanie:** sekcja renderuje się na home BEZ tej migracji
(`mergeHomeBlocks` dokłada brakujące bloki systemowe z defaultów w kodzie), ale
panel admina zapisuje po **UUID** wiersza — dla bloku bez wiersza
`updateSystemBlockHeadings` zwraca „Sekcja nie ma jeszcze wpisu w bazie".
Bez migracji Julia nie ukryje sekcji, nie przesunie jej i nie zmieni nagłówka.

- [ ] **Krok 1: Napisz migrację**

```sql
-- Migracja 77: sekcja „Opinie klientów" jako blok systemowy strony głównej.
--
-- Bloki systemowe z migracji 52 są wierszami page_blocks — panel zapisuje je
-- po UUID (updateSystemBlockHeadings / toggle widoczności / reorder_page_blocks).
-- Nowy typ `customer_reviews` renderuje się bez wiersza (mergeHomeBlocks
-- dokłada default z kodu), ale dopóki wiersza nie ma, panel odmawia zapisu
-- komunikatem „Sekcja nie ma jeszcze wpisu w bazie".
--
-- Na koniec listy, bo slider opinii ma stać POD dotychczasowymi sekcjami
-- (spec 2026-08-18, „Strona główna — slider"). Kolejność Julia zmieni
-- przeciąganiem w /admin/strona-glowna.
--
-- Idempotentne: NOT EXISTS na (page_id is null, block_type). Projekt aplikuje
-- migracje ręcznie i ma niepełny rejestr, więc plik bywa odpalany drugi raz —
-- drugie odpalenie nie może zdublować sekcji ani nadpisać nagłówka zmienionego
-- w panelu.
insert into public.page_blocks (page_id, block_type, sort_order, visible, content)
select
  null,
  'customer_reviews',
  coalesce((select max(sort_order) + 1 from public.page_blocks where page_id is null), 0),
  true,
  jsonb_build_object(
    'heading',       'Co mówią klienci',
    'heading_de',    'Was unsere Kunden sagen',
    'subheading',    'Opinie klientów',
    'subheading_de', 'Kundenmeinungen'
  )
where not exists (
  select 1 from public.page_blocks
   where page_id is null and block_type = 'customer_reviews'
);
```

- [ ] **Krok 2: Commit (BEZ aplikowania — aplikacja w Task 7)**

```bash
git add supabase/migrations/77_page_blocks_customer_reviews.sql
git commit -m "feat(opinie): migracja 77 - sekcja opinii jako blok systemowy home"
```

---

### Task 7: Aplikacja migracji i domknięcie na produkcji

**Files:** brak zmian w kodzie — to zadanie operacyjne. Wyniki dopisz do
`docs/superpowers/plans/2026-08-18-opinie-slider-i-strona.md` (sekcja „Stan
wykonania" na końcu).

- [ ] **Krok 1: Policz opinie PRZED migracją 76**

```sql
select count(*) as ile, count(*) filter (where comment is not null) as z_trescia
  from public.product_reviews;
```

Sprawdzone 2026-08-18: **0**. Jeśli wynik > 0 — najpierw zaaplikuj 76, potem
NATYCHMIAST `update public.product_reviews set status = 'approved' where created_at < now()`,
bo `status` ma default `pending` **bez backfillu** i schowałby istniejące opinie
z widoku publicznego.

- [ ] **Krok 2: Zaaplikuj migrację 76 (plan 1/2) przez MCP `apply_migration`**

Treść: `supabase/migrations/76_reviews_goscie_i_moderacja.sql` — w całości,
bez zmian. Nazwa migracji: `reviews_goscie_i_moderacja`.

- [ ] **Krok 3: Zaaplikuj migrację 77 przez MCP `apply_migration`**

Treść: `supabase/migrations/77_page_blocks_customer_reviews.sql`.
Nazwa: `page_blocks_customer_reviews`.

- [ ] **Krok 4: Zweryfikuj PO OBIEKTACH, nie po rejestrze migracji**

```sql
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='product_reviews' and column_name='status') as ma_status,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='product_reviews' and column_name='homepage_excluded') as ma_wykluczenie,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='review_invites') as ma_zaproszenia,
  (select count(*) from pg_policies
    where schemaname='public' and tablename='product_reviews') as ile_polityk,
  (select count(*) from public.page_blocks
    where page_id is null and block_type='customer_reviews') as ma_sekcje_home;
```

Expected: `ma_status=1`, `ma_wykluczenie=1`, `ma_zaproszenia=1`,
`ile_polityk>=4`, `ma_sekcje_home=1`.

- [ ] **Krok 5: Odpal e2e opinii ponownie — teraz cokolwiek dowodzą**

Przed migracją `e2e/opinia-token.spec.ts` przechodził z **niewłaściwego
powodu**: brak tabeli `review_invites` daje ten sam 404 co nieznany token.

```bash
npm run build
npm start &
E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/opinia-token.spec.ts e2e/opinie-widok.spec.ts --no-deps
```

Expected: 3 passed.

- [ ] **Krok 6: Sprawdź `CRON_SECRET` w Vercelu (Production)**

Bez zmiennej trasa `/api/cron/przypomnienia-opinie` zwraca 500 i przypomnienia
po cichu nie wychodzą. Cron promocji jej używa, więc powinna już być — to
sprawdzenie, nie założenie.

- [ ] **Krok 7: Przejdź ręcznie pełną ścieżkę na prawdziwym zamówieniu**

„Dostarczone" → mail z zaproszeniem → wystaw opinię z linku → zatwierdź
w `/admin/opinie` → sprawdź, że opinia jest **na karcie produktu**, **na
`/opinie`** i (jeśli ocena ≥ 4 i treść > 30 znaków) **w sliderze na home**.
Tego nie zastąpi test automatyczny, bo baza jest wspólna z produkcją.
**Usuń opinię testową po sprawdzeniu.**

- [ ] **Krok 8: Sprawdź panel: sekcja „Opinie klientów" w /admin/strona-glowna**

Ukryj → home bez sekcji; pokaż → sekcja wraca; zmień nagłówek → widać na home;
przeciągnij wyżej → kolejność się zmienia. To ta część, którą właściciel
faktycznie WIDZI.

---

## Self-review (wykonany przy pisaniu planu)

**Pokrycie speca (sekcja „Co widać publicznie"):**

| Wymóg ze speca | Zadanie |
| --- | --- |
| slider na home: `approved`, `rating>=4`, `homepage_excluded=false`, treść > 30 znaków, najnowsze, limit 12 | Task 1 (logika + testy), Task 2 (odczyt) |
| wspólny `ProductCarousel` | Task 3 |
| przycisk „Zobacz wszystkie opinie" → `/opinie` | Task 3 |
| brak pasujących opinii → sekcja się nie renderuje | Task 3 (krok 6), Task 5 (guard e2e) |
| `/opinie`: wszystkie zatwierdzone, także niskie oceny, najnowsze pierwsze | Task 2, Task 4 |
| `/opinie`: nazwa produktu + odnośnik | Task 3 (karta), Task 4 |
| `/opinie`: zdanie o weryfikacji (Omnibus) | Task 4, Task 5 (guard e2e) |
| karta produktu bez zmian poza filtrem statusu | brak zadania — zrobione w planie 1/2 |
| testy: próg oceny, próg długości, wykluczenie, limit, kolejność, treść pusta, treść 30 znaków | Task 1 |
| Playwright tylko nieniszczący | Task 5 |

**Poza specem, świadomie dołożone:** blok systemowy zamiast sekcji na sztywno
(migracja 77) — spec mówi „nowa sekcja pod istniejącymi", a wszystkie sekcje
home w tym repo są blokami; bez wiersza w `page_blocks` Julia nie może sekcji
ukryć ani przesunąć. Oraz etykiety a11y karuzeli (Task 3, krok 3) — czytnik
ekranu nie może mówić „poprzednie produkty" o opiniach.

**Świadomie POZA zakresem:** link do `/opinie` w stopce lub menu (menu jest
w bazie — Julia doda go sama, jeśli zechce), `AggregateRating` w JSON-LD
produktu, stronicowanie `/opinie` (dziś sufit 200), usunięcie nieużywanego
ręcznego bloku cytatów `reviews` (spec wprost tego nie chce).

## Stan wykonania

**Wszystkie 7 zadań zamknięte 2026-08-18** na gałęzi `feat/opinie-slider-home`
(9 commitów kodu + 2 dokumentacyjne). Każde zadanie przeszło recenzję; szeroki
przegląd całej gałęzi wypadł na TAK, bez findingów Critical i bez
nierozwiązanych Important.

| Zadanie | Commit | Wynik |
| --- | --- | --- |
| 1. Czysta logika prezentacji | `7181c700` | 17 testów, refaktor `ReviewList` na wspólne helpery |
| 2. Odczyty z bazy | `b1c22dad` + `a0b35aed` | recenzja wymusiła usunięcie `guest_email` z `PublicReview` |
| 3. Karta + sekcja na home | `9e775ef0` + `800ba221` | blok systemowy `customer_reviews`, uchwyty e2e |
| 4. Strona `/opinie` | `abb341c6` | + `RESERVED_SLUGS`, + sitemap |
| 5. Guard e2e | `f362d16b` | 2 testy nieniszczące |
| 6. Migracja 77 | `6e3cf26c` | idempotentna, jeden `insert` |
| 7. Aplikacja migracji | — | 76 i 77 NA PRODUKCJI, zweryfikowane po obiektach |

**Stan produkcyjnej bazy po migracjach** (sprawdzone po obiektach, nie po
rejestrze migracji): `status` ✅, `homepage_excluded` ✅, `guest_name` +
`guest_email` ✅, `user_id` nullable ✅, `review_invites` ✅ z **zerem polityk**
(dostęp wyłącznie serwerowy), 5 polityk na `product_reviews`, 3 nowe indeksy,
warunek `product_reviews_autor_jeden` ✅. Wiersz sekcji na home:
`sort_order = 7`, `visible = true`, nagłówek „Co mówią klienci".
Opinii w bazie: **0** — policzone dwa razy, drugi raz tuż przed DDL, więc
backfill `status` był zbędny.

**Weryfikacja po migracjach:** `npm run build` przechodzi (63/63 strony
statyczne), Playwright `opinia-token` + `opinie-widok` = **3 passed** na
lokalnym buildzie. `e2e/opinia-token.spec.ts` dowodzi wreszcie czegokolwiek:
do migracji 76 jego 404 brał się z braku tabeli `review_invites`, nie z
odrzucenia tokenu. `CRON_SECRET` jest ustawiony w Production — trasa
przypomnień odpowiada 401 (brak autoryzacji), nie 500 (brak sekretu).

**Produkcja w trakcie tego okna pozostała nietknięta:** `main` nie zna typu
`customer_reviews`, więc `mergeHomeBlocks` po cichu odsiewa wstawiony wiersz
(fail-open na nieznany typ). Home odpowiada 200 z wszystkimi dotychczasowymi
sekcjami; `/opinie` daje 404, bo kod tej gałęzi nie jest jeszcze wdrożony.

### Co ZOSTAŁO — wymaga człowieka

1. **Merge gałęzi = deploy na produkcję.** Dopiero wtedy `/opinie` odpowiada
   i sekcja na home ma prawo się pokazać.
2. **Sekcja na home NIE POKAŻE SIĘ, dopóki nie ma ani jednej zatwierdzonej
   opinii** z oceną ≥ 4 i treścią dłuższą niż 30 znaków. To zachowanie ze
   specyfikacji, nie usterka — ale łatwo je pomylić z „nie zadziałało".
3. **Pełna ścieżka na prawdziwym zamówieniu:** „Dostarczone" → mail →
   wystaw opinię z linku → zatwierdź w `/admin/opinie` → sprawdź kartę
   produktu, `/opinie` i slider na home. **Usuń opinię testową po
   sprawdzeniu.** Żaden test automatyczny tego nie zastąpi, bo baza jest
   wspólna z produkcją.
4. **Klik-test panelu:** w `/admin/strona-glowna` sekcja „Opinie klientów
   (automatyczne)" — ukryj/pokaż, zmień nagłówek, przeciągnij wyżej.
5. **17 findingów Minor** odłożonych świadomie — pełna lista z rozstrzygnięciami
   była w ledgerze wykonania; przegląd całej gałęzi zakwalifikował wszystkie
   jako „może zostać". Najbardziej warte uwagi na przyszłość: brak logu przy
   fail-soft odczytów (dziś `[]` z awarii RLS jest w logach nieodróżnialne od
   `[]` z braku danych) i zduplikowany literał „Zweryfikowany zakup"
   w `ReviewCard` oraz `ReviewList`.
6. **Uwaga na okno przed deployem:** w `/admin/strona-glowna` na starym kodzie
   sekcji nie ma; po deployu jest już sterowalna, bo wiersz w `page_blocks`
   istnieje. Komunikat „Sekcja nie ma jeszcze wpisu w bazie (migracja 52…)"
   nie ma prawa się już pojawić dla tej sekcji — a gdyby się pojawił, wskazuje
   mylną migrację (pre-existing tekst w `app/admin/strona-glowna/actions.ts`).
