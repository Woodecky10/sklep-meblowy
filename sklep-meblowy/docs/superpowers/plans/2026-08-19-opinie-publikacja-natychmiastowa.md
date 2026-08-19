# Opinie: publikacja natychmiastowa (plan wdrożenia 1/2)

> **Dla wykonawców agentowych:** WYMAGANY PODSKILL — użyj
> `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`, żeby wykonać ten plan zadanie po zadaniu.
> Kroki mają składnię `- [ ]` do odhaczania.

**Cel:** opinia klienta pokazuje się na stronie natychmiast po wystawieniu, a Julia
usuwa ją z panelu po fakcie — z plakietką i mailem, które mówią jej, że coś przyszło.

**Architektura:** stan opinii przestaje być kolejką, a staje się parą
(`status`, `moderated_at`): `approved` + puste `moderated_at` znaczy „opublikowana,
nikt jeszcze nie przejrzał". Cała reguła „w którym kubełku panelu stoi ta opinia"
idzie do czystego modułu `app/_lib/reviews-moderation.ts`, bo vitest chodzi tu
w `environment: "node"` i tylko takie moduły da się przetestować. Obie ścieżki
zapisu (upsert zalogowanego i insert gościa) biorą pola statusu z JEDNEJ funkcji
tego modułu, żeby nie rozjechały się przy następnej zmianie. Mail do właścicielki
idzie wzorcem `AdminNewSampleOrder` (szablon react-email + funkcja, która NIE rzuca).

**Stos:** Next.js 16.2.4 (App Router, Server Actions, `after()`), Supabase
(Postgres + RLS), Resend + `@react-email/components`, vitest (`environment: "node"`),
Playwright, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-19-opinie-zdjecia-i-publikacja-natychmiastowa-design.md`
(sekcje 1–3 i 5–7; zdjęcia z sekcji 4 to plan 2/2, NIE ten plan).

## Global Constraints

- **Next.js 16 to nie jest Next, który znasz.** Przed pisaniem kodu przeczytaj
  odpowiedni plik w `node_modules/next/dist/docs/` — dla tego planu w szczególności
  `after.md` (wysyłka maili po odpowiedzi).
- **Baza jest wspólna z produkcją.** Żaden test ani skrypt nie może pisać do bazy.
  Playwright bez `E2E_BASE_URL` celuje w `https://www.mollien.pl` — ustaw go na
  `http://localhost:3000` i dodaj `--no-deps`.
- **Migracje aplikuje się RĘCZNIE** przez MCP `apply_migration`. Auto-apply w tym
  projekcie nie działa (57, 58, 75, 76, 77).
- **Playwright tylko na buildzie:** `npm run build` + `npm start`. `next dev` pada
  po pierwszym teście.
- Komentarze, komunikaty i nazwy w kodzie po polsku, zgodnie z resztą projektu.
- Każdy tekst widoczny dla klienta ma wersję **PL i DE** (`app/_lib/dictionaries/`).
- Nazwa `Opinia`/`review` w kodzie: tabela to `product_reviews`, typ `ProductReview`.
- Formatowanie i lint: `npx eslint <plik>` po każdej zmianie.

## Mapa plików

| Plik | Odpowiedzialność |
|---|---|
| `supabase/migrations/78_opinie_publikacja_natychmiastowa.sql` | **nowy** — default statusu, `moderated_at`, przepisane polityki zapisu |
| `app/_lib/reviews-moderation.ts` | **nowy** — czysta logika: kubełek opinii, dozwolone akcje, pola statusu dla nowego zapisu |
| `app/_lib/__tests__/reviews-moderation.test.ts` | **nowy** — testy powyższego |
| `app/_lib/types.ts` | `ProductReview` dostaje `moderated_at` |
| `app/_lib/reviews-admin.ts` | odczyty panelu per kubełek + licznik plakietki |
| `app/admin/opinie/actions.ts` | akcje: przejrzane / usuń z witryny / przywróć |
| `app/admin/opinie/page.tsx`, `OpinieList.tsx` | trzy sekcje o nowym znaczeniu |
| `app/admin/layout.tsx`, `app/admin/AdminShell.tsx` | plakietka liczy nieprzejrzane |
| `app/api/reviews/route.ts` | zapis zalogowanego publikuje od razu |
| `app/opinia/[token]/actions.ts` | zapis gościa publikuje od razu + mail |
| `app/_lib/mail/templates/AdminNewReview.tsx` | **nowy** — szablon maila do właścicielki |
| `app/_lib/mail/review-notify.ts` | **nowy** — `notifyAdminNewReview`, nie rzuca |
| `app/_lib/__tests__/mail-review-notify.test.ts` | **nowy** — kontrakt maila |
| `app/_lib/dictionaries/pl.ts`, `de.ts` | teksty, które przestały być prawdziwe |
| `app/_components/ui/ReviewForm.tsx` | komunikat po zapisie |

---

### Task 1: Migracja 78

**Files:**
- Create: `supabase/migrations/78_opinie_publikacja_natychmiastowa.sql`

**Interfaces:**
- Produces: kolumna `product_reviews.moderated_at timestamptz`, default `status = 'approved'`,
  polityki `reviews: insert po zakupie` i `reviews: update własne` dopuszczające
  `status in ('pending','approved')`.

- [ ] **Krok 1: Napisz plik migracji**

```sql
-- ============================================================
-- Migracja 78: opinie publikują się natychmiast
-- ============================================================
-- Decyzja właściciela z 2026-08-19: opinię może wystawić wyłącznie osoba,
-- która kupiła produkt (bramka z migracji 46/76), więc czekanie na
-- zatwierdzenie tylko opóźnia publikację. Moderacja przenosi się PRZED -> PO:
-- opinia jest widoczna od razu, a panel służy do jej usunięcia.
--
-- „Nieprzejrzana" to NIE jest osobny status, tylko puste moderated_at przy
-- statusie approved. Ten sam wzorzec, co „nowe zamówienie" w orders
-- (status_updated_at is null, patrz getNewOrdersCount).

alter table public.product_reviews alter column status set default 'approved';

alter table public.product_reviews
  add column if not exists moderated_at timestamptz;

-- Plakietka panelu pyta wyłącznie o nieprzejrzane — indeks częściowy trzyma
-- ten odczyt tani niezależnie od tego, ile opinii uzbiera się z czasem.
create index if not exists idx_product_reviews_do_przejrzenia
  on public.product_reviews (created_at desc)
  where moderated_at is null;

-- Polityki z migracji 76 WYMUSZAJĄ status = 'pending' — po tej zmianie
-- odrzucałyby każdy zapis. Dopuszczamy 'pending' I 'approved', a NIE samo
-- 'approved', bo migracja i kod trafiają na produkcję osobno (migracje idą
-- ręcznie): przy samym 'approved' powstałoby okno, w którym stary kod nie
-- może zapisać ANI JEDNEJ opinii. Dopuszczenie 'pending' niczego nie otwiera —
-- pod nowym modelem samodzielna publikacja własnej opinii jest zamierzona,
-- a 'pending' oznacza „niewidoczna", czyli stan gorszy dla piszącego.
-- 'rejected' świadomie POZA listą: to stan, którego znaczenie należy do panelu.
-- Warunek zakupu przepisany DOSŁOWNIE z migracji 76 (bramka COD z 46).
drop policy if exists "reviews: insert po zakupie" on public.product_reviews;

create policy "reviews: insert po zakupie"
  on public.product_reviews for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status in ('pending','approved')
    and exists (
      select 1
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.user_id = auth.uid()
        and oi.product_id = product_reviews.product_id
        and (
          (o.payment_method = 'online' and o.status in ('paid','processing','shipped','delivered'))
          or (o.payment_method = 'cod' and o.status in ('shipped','delivered'))
        )
    )
  );

drop policy if exists "reviews: update własne" on public.product_reviews;

-- Recenzja CAŁEJ gałęzi (2026-08-19) znalazła dwa problemy:
-- 1) `using` bez warunku na statusie pozwalał zedytować nawet `rejected` —
--    przy publikacji natychmiastowej autor mógł przywrócić zdjętą opinię.
-- 2) `with check` nie miał warunku zakupu — editor z bezpośrednim REST-em
--    mógłby zmienić treść opinii bez weryfikacji, że ma prawo (ten sam klucz
--    anon, co insert).
create policy "reviews: update własne"
  on public.product_reviews for update
  to authenticated
  using (auth.uid() = user_id and status <> 'rejected')
  with check (
    auth.uid() = user_id
    and status in ('pending','approved')
    and exists (
      select 1
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.user_id = auth.uid()
        and oi.product_id = product_reviews.product_id
        and (
          (o.payment_method = 'online' and o.status in ('paid','processing','shipped','delivered'))
          or (o.payment_method = 'cod' and o.status in ('shipped','delivered'))
        )
    )
  );
```

- [ ] **Krok 2: Sprawdź idempotencję czytaniem**

Migracja musi znieść drugie uruchomienie — projekt aplikuje ręcznie i ma niepełny
rejestr. Przejrzyj plik: każdy `create` ma `if not exists`, każda polityka ma
`drop policy if exists` przed sobą, `alter column ... set default` i
`add column if not exists` są z natury powtarzalne. Napraw, jeśli coś wypadło.

- [ ] **Krok 3: Commit**

```bash
git add supabase/migrations/78_opinie_publikacja_natychmiastowa.sql
git commit -m "feat(opinie): migracja 78 - publikacja natychmiastowa"
```

**⚠️ NIE aplikuj migracji w tym zadaniu.** Spec §6 dopuszcza aplikację przed kodem
(migracja jest wstecznie zgodna) — świadomie z tego nie korzystamy. Aplikacja jest w Zadaniu 9, po
przejrzeniu całej gałęzi — tak samo jak przy migracji 76, gdzie recenzja całości
wyłapała dwie usterki krytyczne, zanim schemat wszedł na żywą bazę.

---

### Task 2: Czysta logika moderacji

**Files:**
- Create: `app/_lib/reviews-moderation.ts`
- Create: `app/_lib/__tests__/reviews-moderation.test.ts`
- Modify: `app/_lib/types.ts` (typ `ProductReview`)

**Interfaces:**
- Produces:
  - `type ReviewBucket = "nowe" | "opublikowane" | "usuniete"`
  - `reviewBucket(r: { status: ReviewStatus; moderated_at: string | null }): ReviewBucket`
  - `poluDlaNowegoZapisu(): { status: "approved"; moderated_at: null }`
  - `poluDlaPrzejrzenia(teraz: Date): { status: "approved"; moderated_at: string }`
  - `poluDlaUsuniecia(teraz: Date): { status: "rejected"; moderated_at: string }`
  - `poluDlaPrzywrocenia(): { status: "approved"; moderated_at: null }`

- [ ] **Krok 1: Dopisz `moderated_at` do typu**

W `app/_lib/types.ts`, w `ProductReview`, pod `homepage_excluded`:

```ts
  // Kiedy Julia ostatnio przejrzała tę opinię. null = nieprzejrzana (plakietka
  // w panelu liczy właśnie te). Opinia jest publiczna niezależnie od tego pola —
  // o widoczności decyduje wyłącznie status. Migracja 78.
  moderated_at: string | null;
```

- [ ] **Krok 2: Napisz testy (mają NIE przechodzić)**

`app/_lib/__tests__/reviews-moderation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  reviewBucket,
  poluDlaNowegoZapisu,
  poluDlaPrzejrzenia,
  poluDlaUsuniecia,
  poluDlaPrzywrocenia,
} from "../reviews-moderation";

describe("reviewBucket", () => {
  it("opublikowana i nieprzejrzana trafia do 'nowe'", () => {
    expect(reviewBucket({ status: "approved", moderated_at: null })).toBe("nowe");
  });

  it("opublikowana i przejrzana trafia do 'opublikowane'", () => {
    expect(
      reviewBucket({ status: "approved", moderated_at: "2026-08-19T10:00:00.000Z" })
    ).toBe("opublikowane");
  });

  it("odrzucona trafia do 'usuniete' niezależnie od moderated_at", () => {
    expect(reviewBucket({ status: "rejected", moderated_at: null })).toBe("usuniete");
    expect(
      reviewBucket({ status: "rejected", moderated_at: "2026-08-19T10:00:00.000Z" })
    ).toBe("usuniete");
  });

  // Wiersze sprzed migracji 78 albo zapisane starym kodem w oknie wdrożenia.
  // Nie są publiczne (RLS przepuszcza tylko approved), więc panel MUSI je
  // pokazać w „nowe", inaczej znikną z oczu i nikt ich nie opublikuje.
  it("pending trafia do 'nowe'", () => {
    expect(reviewBucket({ status: "pending", moderated_at: null })).toBe("nowe");
  });
});

describe("pola zapisu", () => {
  it("nowy zapis jest opublikowany i nieprzejrzany", () => {
    expect(poluDlaNowegoZapisu()).toEqual({ status: "approved", moderated_at: null });
  });

  it("przejrzenie ustawia status i stempluje czas", () => {
    const teraz = new Date("2026-08-19T12:34:56.000Z");
    expect(poluDlaPrzejrzenia(teraz)).toEqual({
      status: "approved",
      moderated_at: "2026-08-19T12:34:56.000Z",
    });
  });

  it("usunięcie z witryny odrzuca I stempluje — inaczej wisi w 'nowe'", () => {
    const teraz = new Date("2026-08-19T12:34:56.000Z");
    expect(poluDlaUsuniecia(teraz)).toEqual({
      status: "rejected",
      moderated_at: "2026-08-19T12:34:56.000Z",
    });
  });

  // Przywrócenie zeruje stempel celowo: opinia wraca na witrynę i ma jeszcze
  // raz przejść przed oczami, zamiast wracać od razu jako „załatwiona".
  it("przywrócenie publikuje i kasuje stempel", () => {
    expect(poluDlaPrzywrocenia()).toEqual({ status: "approved", moderated_at: null });
  });
});
```

- [ ] **Krok 3: Uruchom testy i potwierdź, że padają**

Run: `npx vitest run app/_lib/__tests__/reviews-moderation.test.ts`
Expected: FAIL — `Failed to resolve import "../reviews-moderation"`.

- [ ] **Krok 4: Napisz moduł**

`app/_lib/reviews-moderation.ts`:

```ts
// Czysta logika moderacji opinii — bez Supabase i bez next/headers, żeby dało
// się to zaimportować w vitest (environment: "node"). Odczyty siedzą
// w reviews-admin.ts, akcje w app/admin/opinie/actions.ts.
//
// Od migracji 78 opinia publikuje się natychmiast, a „nieprzejrzana" to NIE
// osobny status, tylko puste moderated_at. Dzięki temu usunięcie z witryny
// (rejected) i przejrzenie (stempel) są rozłączne i żadne z nich nie musi
// zgadywać, co znaczy drugie.

import type { ReviewStatus } from "./types";

export type ReviewBucket = "nowe" | "opublikowane" | "usuniete";

export function reviewBucket(r: {
  status: ReviewStatus;
  moderated_at: string | null;
}): ReviewBucket {
  if (r.status === "rejected") return "usuniete";
  // pending nie powinno już powstawać, ale wiersze sprzed migracji 78 (albo
  // z okna wdrożenia, gdy migracja była, a kod jeszcze nie) NIE są publiczne.
  // Muszą więc wylądować tam, gdzie Julia patrzy, a nie zniknąć.
  if (r.moderated_at === null || r.status === "pending") return "nowe";
  return "opublikowane";
}

export function poluDlaNowegoZapisu(): { status: "approved"; moderated_at: null } {
  return { status: "approved", moderated_at: null };
}

// Zwraca też status, nie tylko stempel — celowo. W oknie między aplikacją
// migracji 78 a wdrożeniem kodu stary kod nadal zapisywał `status: "pending"`.
// Taki wiersz trafia do kubełka „nowe" (patrz reviewBucket — pending zawsze
// ląduje tam, niezależnie od moderated_at), ale gdyby „Przejrzane" stemplowało
// WYŁĄCZNIE moderated_at, wiersz zniknąłby z „nowe" (moderated_at przestaje być
// puste) i NIE trafiłby do „opublikowane" (tam warunek to `status = 'approved'`)
// — zostałby niewidoczny na zawsze. Wymuszenie 'approved' jest tu bezpieczne,
// bo w kubełku „nowe" NIGDY nie ma wierszy `rejected` — reviewBucket i
// getReviewsForBucket odsiewają je jawnie.
export function poluDlaPrzejrzenia(teraz: Date): {
  status: "approved";
  moderated_at: string;
} {
  return { status: "approved", moderated_at: teraz.toISOString() };
}

export function poluDlaUsuniecia(teraz: Date): {
  status: "rejected";
  moderated_at: string;
} {
  return { status: "rejected", moderated_at: teraz.toISOString() };
}

export function poluDlaPrzywrocenia(): { status: "approved"; moderated_at: null } {
  return { status: "approved", moderated_at: null };
}
```

- [ ] **Krok 5: Uruchom testy — mają przejść**

Run: `npx vitest run app/_lib/__tests__/reviews-moderation.test.ts`
Expected: PASS, 8 testów.

- [ ] **Krok 6: Commit**

```bash
git add app/_lib/reviews-moderation.ts app/_lib/__tests__/reviews-moderation.test.ts app/_lib/types.ts
git commit -m "feat(opinie): czysta logika kubelkow moderacji"
```

---

### Task 3: Odczyty panelu i licznik plakietki

**Files:**
- Modify: `app/_lib/reviews-admin.ts`
- Modify: `app/admin/layout.tsx:22-35`
- Modify: `app/admin/AdminShell.tsx:51-52`

**Interfaces:**
- Consumes: typ `ReviewBucket` (Task 2). Sama funkcja `reviewBucket` NIE jest tu
  używana — panel filtruje w zapytaniu, a `reviewBucket` służy widokom, które mają
  wiersz w ręku (np. przyszłe testy i plan 2/2).
- Produces:
  - `getReviewsForBucket(bucket: ReviewBucket): Promise<ReviewForModeration[]>`
  - `getUnreviewedReviewsCount(): Promise<number>`

- [ ] **Krok 1: Przepisz odczyt w `reviews-admin.ts`**

Zamień `getReviewsForModeration(status)` na `getReviewsForBucket(bucket)`. Ciało
zostaje (te same `select`, dociąganie `profiles`, `authorNameOf`), zmienia się
wyłącznie filtr i sortowanie:

```ts
export async function getReviewsForBucket(
  bucket: ReviewBucket
): Promise<ReviewForModeration[]> {
  const admin = await createAdminClient();
  let q = admin.from("product_reviews").select("*, products(name)");

  if (bucket === "usuniete") {
    q = q.eq("status", "rejected");
  } else if (bucket === "nowe") {
    // „nowe" = wszystko, czego Julia nie dotknęła: świeże approved ORAZ
    // resztki pending sprzed migracji 78. Filtr po samym moderated_at łapie
    // oba, a odrzucone odsiewamy jawnie.
    q = q.is("moderated_at", null).neq("status", "rejected");
  } else {
    q = q.eq("status", "approved").not("moderated_at", "is", null);
  }

  // Nowe: najstarsze pierwsze (najdłużej czekający klient wisi bez spojrzenia).
  // Pozostałe: najnowsze pierwsze — to już archiwum, nie kolejka.
  const { data, error } = await q.order("created_at", { ascending: bucket === "nowe" });
  if (error || !data) return [];
  // ...dalej bez zmian: mapowanie rows -> ReviewForModeration
}
```

- [ ] **Krok 2: Przemianuj licznik plakietki**

```ts
// Plakietka „do przejrzenia": opinia JEST już publiczna, więc to nie jest
// kolejka blokująca klienta — to lista rzeczy, na które nikt jeszcze nie
// spojrzał. Ten sam wzorzec, co getNewOrdersCount (orders.status_updated_at).
export async function getUnreviewedReviewsCount(): Promise<number> {
  const admin = await createAdminClient();
  const { count, error } = await admin
    .from("product_reviews")
    .select("id", { count: "exact", head: true })
    .is("moderated_at", null)
    .neq("status", "rejected");
  if (error) {
    // Plakietka nie może wywalić panelu — layout renderuje się na każdej
    // podstronie. Spójne z getNewOrdersCount.
    console.error("[admin] odczyt licznika opinii nieudany:", error.message);
    return 0;
  }
  return count ?? 0;
}
```

- [ ] **Krok 3: Podepnij w layoucie i zmień opis plakietki**

`app/admin/layout.tsx`: `getPendingReviewsCount()` → `getUnreviewedReviewsCount()`.
`app/admin/AdminShell.tsx:52`: etykieta `"opinie do sprawdzenia"` →
`"nowe opinie do przejrzenia"` (opinia jest już na stronie — „do sprawdzenia"
sugerowałoby, że coś czeka na publikację).

- [ ] **Krok 4: Sprawdź, że nic nie zostało po starych nazwach**

Run: `grep -rn "getPendingReviewsCount\|getReviewsForModeration" app`
Expected: brak wyników.

- [ ] **Krok 5: Build i lint**

Run: `npm run build` → exit 0. `npx eslint app/_lib/reviews-admin.ts app/admin/layout.tsx app/admin/AdminShell.tsx` → czysto.

- [ ] **Krok 6: Commit**

```bash
git add app/_lib/reviews-admin.ts app/admin/layout.tsx app/admin/AdminShell.tsx
git commit -m "feat(opinie): panel czyta kubelkami, plakietka liczy nieprzejrzane"
```

---

### Task 4: Akcje panelu

**Files:**
- Modify: `app/admin/opinie/actions.ts`

**Interfaces:**
- Consumes: `poluDlaPrzejrzenia`, `poluDlaUsuniecia`, `poluDlaPrzywrocenia` (Task 2)
- Produces: `oznaczPrzejrzana(reviewId)`, `usunZWitryny(reviewId)`,
  `przywrocNaWitryne(reviewId)` — każda zwraca `ActionResult`.
  `setReviewHomepageExcluded` zostaje bez zmian.

- [ ] **Krok 1: Zastąp `setReviewStatus` trzema akcjami**

Stara akcja przyjmowała dowolny status z klienta — teraz każda akcja niesie jedną
intencję, a pola bierze z modułu z Zadania 2:

```ts
import {
  poluDlaPrzejrzenia,
  poluDlaUsuniecia,
  poluDlaPrzywrocenia,
} from "@/app/_lib/reviews-moderation";

// Wspólny zapis + odświeżenia. revalidatePath("/") jest tu konieczne, bo
// slider opinii stoi na stronie głównej, a /sklep i karta produktu niosą
// średnią ocen.
async function zapisz(
  reviewId: string,
  pola: Record<string, unknown>,
  komunikat: string
): Promise<ActionResult> {
  await requireAdmin();
  if (!reviewId) return { ok: false, error: "Brak id opinii" };

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("product_reviews")
    .update(pola as never)
    .eq("id", reviewId)
    .select("product_id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Opinia nie znaleziona" };

  const productId = (data[0] as { product_id: string }).product_id;
  revalidatePath("/admin/opinie");
  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");
  revalidatePath("/opinie");
  revalidatePath("/");
  return { ok: true, message: komunikat };
}

export async function oznaczPrzejrzana(reviewId: string): Promise<ActionResult> {
  return zapisz(reviewId, poluDlaPrzejrzenia(new Date()), "Oznaczono jako przejrzaną");
}

export async function usunZWitryny(reviewId: string): Promise<ActionResult> {
  return zapisz(reviewId, poluDlaUsuniecia(new Date()), "Opinia zdjęta ze strony");
}

export async function przywrocNaWitryne(reviewId: string): Promise<ActionResult> {
  return zapisz(reviewId, poluDlaPrzywrocenia(), "Opinia wróciła na stronę");
}
```

- [ ] **Krok 2: Build i lint**

Run: `npm run build` (padnie na `OpinieList.tsx`, który woła starą akcję — to
oczekiwane, naprawia je Zadanie 5). `npx eslint app/admin/opinie/actions.ts`.

- [ ] **Krok 3: Commit**

```bash
git add app/admin/opinie/actions.ts
git commit -m "feat(opinie): akcje panelu - przejrzane, usun z witryny, przywroc"
```

---

### Task 5: Panel — trzy sekcje o nowym znaczeniu

**Files:**
- Modify: `app/admin/opinie/page.tsx`
- Modify: `app/admin/opinie/OpinieList.tsx`

**Interfaces:**
- Consumes: `getReviewsForBucket` (Task 3), akcje (Task 4)

- [ ] **Krok 1: Przepisz `page.tsx`**

```tsx
const [nowe, opublikowane, usuniete] = await Promise.all([
  getReviewsForBucket("nowe"),
  getReviewsForBucket("opublikowane"),
  getReviewsForBucket("usuniete"),
]);
```

Podtytuł strony zmienia sens — zamiast „Opinia staje się publiczna dopiero po
zatwierdzeniu." wpisz: „Opinie klientów publikują się od razu. Tutaj je
przeglądasz i zdejmujesz ze strony, jeśli coś jest nie tak."

- [ ] **Krok 2: Przepisz sekcje i przyciski w `OpinieList.tsx`**

- „Nowe — do przejrzenia" (`nowe`): przyciski **Przejrzane** (`oznaczPrzejrzana`)
  i **Zdejmij ze strony** (`usunZWitryny`); pokazuj też przełącznik wykluczenia
  z home, bo opinia JEST już publiczna. Pusto: „Nic nowego."
- „Opublikowane" (`opublikowane`): przełącznik wykluczenia + **Zdejmij ze strony**.
  Pusto: „Nie ma jeszcze żadnej opublikowanej opinii."
- „Zdjęte ze strony" (`usuniete`): **Przywróć** (`przywrocNaWitryne`).
  Pusto: „Nic nie zostało zdjęte."

Wiersz dostaje widoczne oznaczenie, że opinia jest na żywo — obok plakietki
„gość/konto" dopisz przy kubełku `nowe` tekst „widoczna na stronie", żeby Julia
wiedziała, że przycisk „Zdejmij" nie jest teoretyczny.

Ostrzeżenie nad sekcją nową zostaje co do treści (Omnibus: nie odrzucaj opinii za
niską ocenę), ale zmień „Nie odrzucaj" na „Nie zdejmuj".

- [ ] **Krok 3: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Krok 4: Zrzut panelu (bez zapisu do bazy)**

```bash
npm start &
```
Playwright: wejdź na `http://localhost:3000/admin/opinie` z sesją
`e2e/.auth/admin.json` i zrób zrzut. Sprawdź wzrokiem: trzy sekcje, nowe nazwy,
żadna akcja nie została kliknięta. **Nie klikaj przycisków — to żywa baza.**

- [ ] **Krok 5: Commit**

```bash
git add app/admin/opinie/page.tsx app/admin/opinie/OpinieList.tsx
git commit -m "feat(opinie): panel pokazuje nowe, opublikowane i zdjete"
```

---

### Task 6: Ścieżki zapisu publikują od razu

**Files:**
- Modify: `app/api/reviews/route.ts:74-90`
- Modify: `app/opinia/[token]/actions.ts:33-45`

**Interfaces:**
- Consumes: `poluDlaNowegoZapisu` (Task 2)

- [ ] **Krok 1: Upsert zalogowanego**

W `app/api/reviews/route.ts` zamień `status: "pending"` na rozwinięcie
`...poluDlaNowegoZapisu()`. **Wymień też komentarz nad tym polem** — dziś tłumaczy,
czemu edycja wraca do kolejki, a to przestaje być prawdą:

```ts
        // Każdy zapis (nowa opinia I edycja) publikuje się od razu i wraca
        // Julii przed oczy: moderated_at znów jest puste, więc opinia ląduje
        // w „nowe — do przejrzenia". Bez zerowania stempla podmiana treści po
        // przejrzeniu przechodziłaby niezauważona.
        ...poluDlaNowegoZapisu(),
```

- [ ] **Krok 2: Insert gościa**

W `app/opinia/[token]/actions.ts` to samo: `status: "pending"` →
`...poluDlaNowegoZapisu()`.

- [ ] **Krok 3: Sprawdź, że nigdzie nie został twardy `pending`**

Run: `grep -rn "\"pending\"\|'pending'" app --include="*.ts" --include="*.tsx"`
Expected: wyłącznie `reviews-moderation.ts` (obsługa starych wierszy) i typ
`ReviewStatus` w `types.ts`. Żadnego w ścieżkach zapisu.

- [ ] **Krok 4: Testy i build**

Run: `npm test` → 1627+ zielonych. `npm run build` → exit 0.

- [ ] **Krok 5: Commit**

```bash
git add app/api/reviews/route.ts app/opinia/\[token\]/actions.ts
git commit -m "feat(opinie): oba zapisy publikuja opinie natychmiast"
```

---

### Task 7: Teksty, które przestały być prawdziwe

**Files:**
- Modify: `app/_lib/dictionaries/pl.ts:479` (`reviewsPage.intro`)
- Modify: `app/_lib/dictionaries/de.ts:68`
- Modify: `app/_components/ui/ReviewForm.tsx` (klucz `moderacja`, obie wersje językowe)
- Modify: `app/opinia/[token]/actions.ts` (komunikat zwrotny)

- [ ] **Krok 1: `/opinie` — PL**

```
"Publikujemy tylko opinie osób, które kupiły u nas mebel — zaproszenie do wystawienia opinii wysyłamy po dostawie, na adres z zamówienia. Opinia pojawia się od razu; sprawdzamy je po publikacji i usuwamy wyłącznie spam oraz treści obraźliwe. Nie usuwamy opinii krytycznych i nie zmieniamy ich treści."
```

Komentarz nad kluczem (o wymogu Omnibusa) ZOSTAJE — zdanie o weryfikacji zakupu
jest nadal prawdziwe i nadal wymagane.

- [ ] **Krok 2: `/opinie` — DE**

```
"Wir veröffentlichen ausschließlich Bewertungen von Personen, die bei uns ein Möbelstück gekauft haben — die Einladung zur Bewertung senden wir nach der Lieferung an die E-Mail-Adresse aus der Bestellung. Die Bewertung erscheint sofort; wir prüfen sie nach der Veröffentlichung und entfernen ausschließlich Spam und beleidigende Inhalte. Kritische Bewertungen löschen wir nicht und ihren Inhalt ändern wir nicht."
```

- [ ] **Krok 3: Komunikaty po zapisie**

`ReviewForm.tsx`, klucz `moderacja`:
- PL: „Dziękujemy! Twoja opinia jest już na stronie."
- DE: „Vielen Dank! Ihre Bewertung ist bereits auf der Seite."

`app/opinia/[token]/actions.ts`, `message` po udanym zapisie:
„Dziękujemy! Twoja opinia jest już na stronie."

- [ ] **Krok 4: Testy słowników**

Run: `npx vitest run app/_lib/__tests__/dictionaries.test.ts`
Expected: PASS (parzystość kluczy PL/DE nienaruszona).

- [ ] **Krok 5: Commit**

```bash
git add app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts app/_components/ui/ReviewForm.tsx app/opinia/\[token\]/actions.ts
git commit -m "fix(opinie): teksty mowia prawde o momencie publikacji"
```

---

### Task 8: Mail do właścicielki

**Files:**
- Create: `app/_lib/mail/templates/AdminNewReview.tsx`
- Create: `app/_lib/mail/review-notify.ts`
- Create: `app/_lib/__tests__/mail-review-notify.test.ts`
- Modify: `app/api/reviews/route.ts`, `app/opinia/[token]/actions.ts` (wpięcie)

**Interfaces:**
- Produces: `notifyAdminNewReview(reviewId: string): Promise<void>` — NIE rzuca.

- [ ] **Krok 1: Napisz testy (mają padać)**

`app/_lib/__tests__/mail-review-notify.test.ts` — wzorzec 1:1 z
`mail-sample-notify.test.ts` (te same atrapy `sendMail` i `getMailBranding`;
bez atrapy branding test odpytuje ŻYWĄ bazę, bo vitest wczytuje `.env*`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getReviewMock = vi.fn();
const sendMailMock = vi.fn();

vi.mock("../reviews-admin", () => ({
  getReviewForMail: (...a: unknown[]) => getReviewMock(...a),
}));
vi.mock("../mail/send", () => ({ sendMail: (...a: unknown[]) => sendMailMock(...a) }));
vi.mock("../mail/branding-server", async () => {
  const { brandingFromRaw } = await import("../mail/branding");
  return { getMailBranding: vi.fn(async () => brandingFromRaw(null)) };
});

import { notifyAdminNewReview } from "../mail/review-notify";

const OPINIA = {
  id: "11111111-2222-3333-4444-555555555555",
  rating: 5 as const,
  comment: "Narożnik stoi u nas od miesiąca i nadal wygląda jak nowy.",
  author_name: "Anna Kowalska",
  product_name: "Element prosty Nube",
  created_at: "2026-08-19T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MAIL_ADMIN_TO = "wlascicielka@example.com";
  getReviewMock.mockResolvedValue(OPINIA);
});

describe("notifyAdminNewReview", () => {
  it("wysyła na adres z MAIL_ADMIN_TO, z ocena i produktem w temacie", async () => {
    await notifyAdminNewReview(OPINIA.id);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.to).toBe("wlascicielka@example.com");
    expect(payload.subject).toContain("5");
    expect(payload.subject).toContain("Element prosty Nube");
  });

  it("nie rzuca i nie wysyła, gdy brak MAIL_ADMIN_TO", async () => {
    delete process.env.MAIL_ADMIN_TO;
    await expect(notifyAdminNewReview(OPINIA.id)).resolves.toBeUndefined();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  // Kontrakt: wołane z after() po zapisie opinii. Wyjątek nie może wrócić do
  // klienta, który opinię ZAPISAŁ poprawnie.
  it("nie rzuca, gdy odczyt opinii pada", async () => {
    getReviewMock.mockRejectedValue(new Error("baza padła"));
    await expect(notifyAdminNewReview(OPINIA.id)).resolves.toBeUndefined();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("nie rzuca, gdy opinii nie ma", async () => {
    getReviewMock.mockResolvedValue(null);
    await expect(notifyAdminNewReview(OPINIA.id)).resolves.toBeUndefined();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Krok 2: Uruchom — mają paść**

Run: `npx vitest run app/_lib/__tests__/mail-review-notify.test.ts`
Expected: FAIL — brak modułu `../mail/review-notify`.

- [ ] **Krok 3: Dopisz odczyt `getReviewForMail` w `reviews-admin.ts`**

```ts
// Snapshot opinii na potrzeby maila — osobny odczyt, żeby miejsce wpięcia
// wołało jedną linijkę zamiast samo zbierać dane (wzorzec loadOrder
// z sample-notify.ts). Bez guest_email: mail do właścicielki nie potrzebuje
// adresu klienta, a PublicReview celowo go nie niesie.
export type ReviewForMail = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  author_name: string | null;
  product_name: string | null;
};

export async function getReviewForMail(reviewId: string): Promise<ReviewForMail | null> {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("product_reviews")
    .select("id, rating, comment, created_at, user_id, guest_name, products(name)")
    .eq("id", reviewId)
    .maybeSingle();
  if (!data) return null;

  const r = data as unknown as {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    user_id: string | null;
    guest_name: string | null;
    products: { name: string | null } | null;
  };

  // Dla konta imię leży w profiles (RLS: using(auth.uid() = id)), więc czyta je
  // klient administracyjny — dokładnie jak getReviewsForBucket. Dla gościa
  // guest_name jest wprost w wierszu. Rozstrzyga authorNameOf, żeby podpis
  // w mailu i podpis na stronie brały się z jednej reguły.
  let fullName: string | null = null;
  if (r.user_id) {
    const { data: profil } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", r.user_id)
      .maybeSingle();
    fullName = (profil as { full_name: string | null } | null)?.full_name ?? null;
  }

  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    created_at: r.created_at,
    author_name: authorNameOf(r, fullName),
    product_name: r.products?.name ?? null,
  };
}
```

- [ ] **Krok 4: Szablon `AdminNewReview.tsx`**

Skopiuj układ z `templates/AdminNewSampleOrder.tsx` (te same komponenty
`@react-email/components` i te same propsy brandingu). Treść: ocena gwiazdkami,
autor, nazwa produktu, pełny tekst opinii, przycisk „Otwórz panel opinii"
prowadzący na `${base}/admin/opinie`.

- [ ] **Krok 5: Moduł `review-notify.ts`**

```ts
import "server-only";

import { render } from "@react-email/components";
import { getReviewForMail } from "../reviews-admin";
import { getMailBranding } from "./branding-server";
import { sendMail } from "./send";
import { AdminNewReview } from "./templates/AdminNewReview";

// ⚠️ KONTRAKT: ta funkcja NIE rzuca. Wołają ją obie ścieżki zapisu opinii przez
// after() — wyjątek oznaczałby, że klient widzi błąd przy opinii, która została
// zapisana i JEST już na stronie. Gwarancja to najwyżej-raz, jak w notify-order.
export async function notifyAdminNewReview(reviewId: string): Promise<void> {
  try {
    const adminTo = process.env.MAIL_ADMIN_TO;
    if (!adminTo) {
      console.info("[mail] brak MAIL_ADMIN_TO — pomijam powiadomienie o opinii");
      return;
    }
    const opinia = await getReviewForMail(reviewId);
    if (!opinia) return;
    const branding = await getMailBranding();
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://mollien.pl";
    const html = await render(
      AdminNewReview({ opinia, branding, panelUrl: `${base}/admin/opinie` })
    );
    await sendMail({
      to: adminTo,
      subject: `Nowa opinia: ${opinia.rating}/5 — ${opinia.product_name ?? "produkt"}`,
      html,
    });
  } catch (err) {
    console.error("[mail] powiadomienie o nowej opinii nieudane:", err);
  }
}
```

- [ ] **Krok 6: Uruchom testy — mają przejść**

Run: `npx vitest run app/_lib/__tests__/mail-review-notify.test.ts`
Expected: PASS, 4 testy.

- [ ] **Krok 7: Wepnij w obie ścieżki zapisu**

W `app/api/reviews/route.ts` i `app/opinia/[token]/actions.ts`, PO udanym zapisie:

```ts
import { after } from "next/server";
// ...
after(() => notifyAdminNewReview(zapisana.id));
```

`after()` — bo wysyłka nie może opóźnić ani zepsuć odpowiedzi dla klienta.
Wzorzec i uzasadnienie: `app/admin/zamowienia/actions.ts:79-85`. Przed pisaniem
przeczytaj `node_modules/next/dist/docs/**/after.md`.

- [ ] **Krok 8: Pełne testy i build**

Run: `npm test` → wszystko zielone. `npm run build` → exit 0.

- [ ] **Krok 9: Commit**

```bash
git add app/_lib/mail/review-notify.ts app/_lib/mail/templates/AdminNewReview.tsx app/_lib/__tests__/mail-review-notify.test.ts app/_lib/reviews-admin.ts app/api/reviews/route.ts app/opinia/\[token\]/actions.ts
git commit -m "feat(opinie): mail do wlascicielki o nowej opinii"
```

---

### Task 9: Recenzja gałęzi, migracja i weryfikacja

**Files:** brak zmian w kodzie poza poprawkami z recenzji.

- [ ] **Krok 1: Recenzja CAŁEJ gałęzi przed migracją**

Przy migracji 76 dwie usterki krytyczne pochodziły ze specyfikacji, nie z
wykonania, i żadna recenzja pojedynczego zadania nie mogła ich zobaczyć. Przejrzyj
`git diff main...HEAD` w całości, ze szczególną uwagą na: czy polityka RLS i kod
zgadzają się co do dozwolonych statusów, czy panel pokazuje wiersze `pending`,
czy `after()` nie stoi przed zapisem.

- [ ] **Krok 2: Zastosuj migrację 78**

MCP `apply_migration`, nazwa `opinie_publikacja_natychmiastowa`, treść z pliku.
Potem `list_migrations` — wersja musi się pojawić.

- [ ] **Krok 3: Sprawdź schemat zapytaniem (odczyt, nie zapis)**

```sql
select column_name, column_default, is_nullable
from information_schema.columns
where table_name = 'product_reviews' and column_name in ('status','moderated_at');
```
Expected: `status` z defaultem `'approved'::text`, `moderated_at` nullable.

**⚠️ WYMÓG kolejności wdrożenia (K1 z recenzji gałęzi, 2026-08-19) — to jest
wymóg, nie sugestia:** scalenie tego PR-a, czyli deploy kodu na Vercelu, może
nastąpić WYŁĄCZNIE PO (a) zaaplikowaniu migracji 78 przez `apply_migration`
**i** (b) potwierdzeniu Kroku 3 powyżej zapytaniem do `information_schema`.
Obie ścieżki zapisu opinii (`app/api/reviews/route.ts`,
`app/opinia/[token]/actions.ts`) wysyłają `moderated_at` w KAŻDYM zapisie —
dopóki kolumny nie ma w bazie, PostgREST odrzuca cały payload i żaden klient
(ani zalogowany, ani gość) nie zapisze opinii, widząc komunikat, który nie
mówi prawdy o przyczynie. Kolejność jest jednokierunkowa: **migracja →
potwierdzenie w `information_schema` → dopiero wtedy merge PR-a.** Nigdy
odwrotnie.

**Cache schematu PostgREST:** potwierdzenie Kroku 3 dowodzi, że kolumna
ISTNIEJE W BAZIE — nie dowodzi, że PostgREST już ją widzi. PostgREST trzyma
podręczną kopię schematu i bywa, że potrzebuje chwili na odświeżenie po
migracji zastosowanej poza jego standardową ścieżką migracji. Nie scalaj PR-a
„sekundę po" pomyślnym Kroku 3 — odczekaj, zanim uruchomisz deploy.

- [ ] **Krok 4: Guard e2e**

Run: `E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/opinie-widok.spec.ts --no-deps`
Expected: PASS — `/opinie` odpowiada 200, strona główna nie renderuje pustej sekcji.

- [ ] **Krok 5: Ręczna ścieżka na prawdziwym zamówieniu**

Po wdrożeniu: oznacz zamówienie jako „Dostarczone", odbierz maila z zaproszeniem,
wystaw opinię z linku i sprawdź, że (a) jest widoczna od razu, (b) plakietka
w panelu urosła, (c) mail do właścicielki dotarł.

---

## Czego ten plan NIE robi

Zdjęć w opiniach — to plan 2/2 z sekcji 4 specyfikacji (kolumna `photos`,
wgrywanie z kompresją w przeglądarce, walidacja własnego prefiksu, wyświetlanie
na home, `/opinie` i karcie produktu). Zaczyna się po wdrożeniu i sprawdzeniu tego.
