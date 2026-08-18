# Opinie klientów — zbieranie i moderacja (plan wdrożenia 1/2)

> **Dla wykonawców agentowych:** WYMAGANY PODSKILL — użyj
> `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`, żeby wykonać ten plan zadanie po zadaniu.
> Kroki mają składnię `- [ ]` do odhaczania.

**Cel:** doprowadzić do stanu, w którym klient — z kontem i bez konta — dostaje
po dostawie zaproszenie do wystawienia opinii, może ją napisać, a Julia
zatwierdza ją w panelu, zanim stanie się publiczna.

**Architektura:** wariant B ze specyfikacji — dwie osobne ścieżki zapisu
(istniejący formularz dla zalogowanych, nowa strona z tokenem dla gości), ale
**jedna tabela** `product_reviews`. Moderacja jako kolumna `status`, egzekwowana
regułą RLS, nie tylko warstwą aplikacji. Zaproszenia w nowej tabeli
`review_invites`, token wyłącznie jako skrót. Cała logika decyzyjna trafia do
czystych modułów w `app/_lib/`, bo vitest chodzi w `environment: "node"` i tylko
to da się przetestować.

**Stos:** Next.js 16.2.4 (App Router, Server Actions, `after` z `next/server`),
Supabase (Postgres + RLS), Resend + `@react-email/components`, vitest,
Playwright.

**Specyfikacja:** `sklep-meblowy/docs/superpowers/specs/2026-08-18-opinie-klientow-design.md`
(zatwierdzona, na `main` jako `cb2bce6`).

**Zakres:** ten plan obejmuje punkty 1–6 kolejności wdrożenia ze specyfikacji.
Punkt 7 — slider na stronie głównej i `/opinie` — to **plan 2/2**, pisany
osobno, po scaleniu tego.

## STAN WYKONANIA

`.superpowers/sdd/` jest gitignorowany, więc dziennik wykonania nie przechodzi
między komputerami — **ta sekcja jest jedynym nośnikiem stanu w repo.**
Aktualizowana po każdym zadaniu.

- Gałąź: `feat/opinie-zbieranie-i-moderacja`, start `0675c6f`.
- **Skan przedwykonawczy znalazł jedną usterkę planu:** kod zadania 3 pytał
  o `products(name, slug)`, a tabela `products` **nie ma kolumny `slug`**
  (ma `id`, `name`, `images`). Zapytanie zostałoby odrzucone, funkcja połknęłaby
  błąd i zwróciła pustą listę — panel moderacji byłby pusty bez śladu przyczyny.
  Poprawione przed rozpoczęciem: linkujemy po `id`.
- **Migracja 76 celowo NIE jest aplikowana w trakcie** (zmiana schematu żywej
  bazy to decyzja właściciela). Skutek uboczny do zapamiętania: spec e2e
  z zadania 5 przechodzi przed migracją **z niewłaściwego powodu** — brak tabeli
  daje ten sam 404 co zły token. **Po zaaplikowaniu migracji odpal go ponownie.**
- Zadania: ✅ 1 · ✅ 2 · ✅ 3 · ⬜ 4 · ⬜ 5 · ⬜ 6

## Ograniczenia globalne

Dotyczą **każdego** zadania, nie powtarzam ich przy każdym:

- **To nie jest Next.js z treningu.** Wersja 16.2.4 ma zmiany łamiące zgodność.
  Przed kodem Server Component/Action zajrzyj do `node_modules/next/dist/docs/`.
  Potwierdzone dla tego planu: `params` w trasach dynamicznych to **`Promise`**
  (`01-app/03-api-reference/03-file-conventions/dynamic-routes.md`), a `after`
  importuje się z **`next/server`** i wolno go użyć w Server Functions
  (`01-app/03-api-reference/04-functions/after.md`).
- **Baza jest WSPÓLNA Z PRODUKCJĄ**, także w developmencie i na preview. Żaden
  test ani żaden ręczny eksperyment nie może zapisywać do `product_reviews`
  ani `orders`.
- **Migracje NIE wjeżdżają same po merge'u** (potwierdzone na 57, 58 i 75). Po
  scaleniu trzeba zaaplikować ręcznie przez Supabase MCP i sprawdzić po
  obiektach, nie po rejestrze migracji.
- **Panel admina jest PL-only**, bez i18n. Strony publiczne są dwujęzyczne
  (PL + `/de`), ale **`/de` jest zamrożone flagą `DE_ENABLED`** — teksty
  niemieckie dodawaj, bo builder ich wymaga, ale nie testuj tej ścieżki.
- **Server Actions:** `"use server"`, `requireAdmin()` w akcjach panelu,
  `createAdminClient()`, `revalidatePath`, zwracają `ActionResult`
  (`{ ok: true; message?: string } | { ok: false; error: string }`), updaty
  castowane `as never`.
- **Bramki przed każdym commitem:** `npx tsc --noEmit` (0), `npm run lint`
  (0 błędów), `npm test` (wszystko zielone). Uruchamiać z `sklep-meblowy/`.
- **Nie odpalaj `npm run build`, gdy w tle chodzi `next dev`** — zepsuje
  `.next` dev-serwera.
- Testy jednostkowe idą do `app/_lib/__tests__/`, nazwa `<moduł>.test.ts`.

---

## Struktura plików

**Nowe moduły czyste (logika, testowalne bez bazy):**

| plik | odpowiedzialność |
|---|---|
| `app/_lib/review-tokens.ts` | generowanie i skrót tokenu, orzekanie o ważności zaproszenia |
| `app/_lib/review-reminders.ts` | warunek „czy wysłać przypomnienie" |

**Nowe moduły serwerowe (dostęp do bazy, bez logiki decyzyjnej):**

| plik | odpowiedzialność |
|---|---|
| `app/_lib/review-invites-server.ts` | odczyt/zapis `review_invites` |
| `app/_lib/reviews-admin.ts` | odczyt opinii dla panelu, licznik oczekujących |
| `app/_lib/mail/review-request.ts` | `requestReviews`, `sendReviewReminders` |
| `app/_lib/mail/templates/ReviewRequest.tsx` | szablon maila (prośba i przypomnienie) |

**Nowe ekrany:**

| plik | odpowiedzialność |
|---|---|
| `app/admin/opinie/page.tsx` + `OpinieList.tsx` + `actions.ts` | moderacja |
| `app/opinia/[token]/page.tsx` + `GuestReviewForm.tsx` + `actions.ts` | ścieżka gościa |
| `app/api/cron/przypomnienia-opinie/route.ts` | wyzwalacz przypomnień |

**Modyfikowane:**

| plik | zmiana |
|---|---|
| `supabase/migrations/76_reviews_goscie_i_moderacja.sql` | nowy |
| `app/_lib/types.ts` | `ProductReview` — nowe pola |
| `app/_lib/reviews.ts` | filtr `approved`, imię gościa |
| `app/api/reviews/route.ts` | zapis jako `pending` |
| `app/_components/ui/ReviewForm.tsx` | komunikat o moderacji |
| `app/admin/zamowienia/actions.ts` | wywołanie `requestReviews` |
| `app/admin/layout.tsx` + `AdminShell.tsx` | licznik oczekujących |
| `vercel.json` | drugi wpis cron |

---

## Zadanie 1: Migracja bazy

**Pliki:**
- Utwórz: `supabase/migrations/76_reviews_goscie_i_moderacja.sql`
- Zmodyfikuj: `app/_lib/types.ts` (typ `ProductReview`, linie 335–345)

**Interfejsy:**
- Produkuje: kolumny `product_reviews.status`, `.homepage_excluded`,
  `.guest_name`, `.guest_email`, `user_id` nullowalne; tabela `review_invites`;
  typ `ProductReview` z polami `user_id: string | null`,
  `guest_name: string | null`, `guest_email: string | null`,
  `status: ReviewStatus`, `homepage_excluded: boolean`; typ
  `ReviewStatus = "pending" | "approved" | "rejected"`; typ `ReviewInvite`.

- [ ] **Krok 1: Napisz migrację**

```sql
-- ============================================================
-- Migracja 76: opinie gości + moderacja
-- ============================================================
-- Do 2026-08-18 opinię mógł wystawić WYŁĄCZNIE zalogowany klient
-- (user_id not null + FK do auth.users). Sprawdzone na produkcji: 6 z 10
-- zamówień jest bez konta, więc większość kupujących nie miała fizycznej
-- możliwości nic napisać — stąd zero opinii przy dziesięciu zamówieniach.
--
-- Ta migracja: (a) wpuszcza gościa, (b) wprowadza moderację przed publikacją,
-- (c) zakłada rejestr zaproszeń do wystawienia opinii.

-- --- (a) autor: konto ALBO gość -----------------------------------------
alter table public.product_reviews alter column user_id drop not null;

alter table public.product_reviews
  add column if not exists guest_name  text,
  add column if not exists guest_email text;

-- Dokładnie jeden autor: nie „niczyja", nie podwójna.
alter table public.product_reviews
  drop constraint if exists product_reviews_autor_jeden;
alter table public.product_reviews
  add constraint product_reviews_autor_jeden check (
    (user_id is not null and guest_email is null and guest_name is null)
    or
    (user_id is null and guest_email is not null and guest_name is not null)
  );

-- Stare unique (product_id, user_id) przestaje chronić, gdy user_id bywa
-- null — Postgres traktuje każdy null jako różny, więc gość mógłby wystawić
-- dowolnie wiele opinii temu samemu produktowi. Dwa indeksy częściowe.
alter table public.product_reviews
  drop constraint if exists product_reviews_product_id_user_id_key;

create unique index if not exists uniq_review_user
  on public.product_reviews (product_id, user_id) where user_id is not null;
-- lower(): Jan@x.pl i jan@x.pl to ten sam człowiek.
create unique index if not exists uniq_review_guest
  on public.product_reviews (product_id, lower(guest_email))
  where guest_email is not null;

-- --- (b) moderacja -------------------------------------------------------
alter table public.product_reviews
  add column if not exists status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  add column if not exists homepage_excluded boolean not null default false;

create index if not exists idx_product_reviews_status
  on public.product_reviews (status, created_at desc);

-- Dotychczasowa reguła odczytu to `using (true)` — po wprowadzeniu moderacji
-- opinie oczekujące i ODRZUCONE byłyby publicznie czytelne przez API, mimo że
-- nigdzie ich nie pokazujemy. To jest jedyny powód, dla którego ta zmiana
-- musi wejść razem z kolumną status, a nie później.
drop policy if exists "reviews: publiczny odczyt" on public.product_reviews;

create policy "reviews: publiczny odczyt zatwierdzonych"
  on public.product_reviews for select to anon, authenticated
  using (status = 'approved');

-- Autor musi widzieć własną opinię także w oczekiwaniu — inaczej
-- getReviewStatus nie miałby czego podstawić do edycji.
drop policy if exists "reviews: autor widzi swoje" on public.product_reviews;
create policy "reviews: autor widzi swoje"
  on public.product_reviews for select to authenticated
  using (user_id = auth.uid());

-- --- (c) zaproszenia -----------------------------------------------------
-- Jedno zaproszenie = jedna para (zamówienie, produkt). Token trzymamy
-- WYŁĄCZNIE jako skrót SHA-256; wartość jawna istnieje tylko w wysłanym
-- mailu. Wyciek kopii bazy nie może oddawać prawa do pisania opinii w cudzym
-- imieniu — ta sama zasada co przy resecie hasła.
create table if not exists public.review_invites (
  id          uuid primary key default uuid_generate_v4(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  email       text not null,
  token_hash  text not null unique,
  sent_at     timestamptz not null default now(),
  reminded_at timestamptz,
  used_at     timestamptz,
  expires_at  timestamptz not null,
  unique (order_id, product_id)
);

create index if not exists idx_review_invites_do_przypomnienia
  on public.review_invites (sent_at) where reminded_at is null and used_at is null;

-- Tabela jest dostępna WYŁĄCZNIE przez klienta administracyjnego po stronie
-- serwera. Włączamy RLS i świadomie nie dodajemy żadnej polityki: brak
-- polityki = brak dostępu dla anon i authenticated.
alter table public.review_invites enable row level security;
```

- [ ] **Krok 2: Rozszerz typy**

W `app/_lib/types.ts` zastąp typ `ProductReview` i dopisz dwa nowe:

```ts
export type ReviewStatus = "pending" | "approved" | "rejected";

export type ProductReview = {
  id: string;
  product_id: string;
  // null dla opinii gościa — patrz migracja 76 i warunek
  // product_reviews_autor_jeden: wypełnione jest ALBO user_id, ALBO para
  // guest_name+guest_email.
  user_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  status: ReviewStatus;
  homepage_excluded: boolean;
  created_at: string;
  updated_at: string;
  // Dołączane przez getReviewsForProduct: dla konta z profiles.full_name,
  // dla gościa wprost z guest_name.
  author_name?: string | null;
};

export type ReviewInvite = {
  id: string;
  order_id: string;
  product_id: string;
  email: string;
  token_hash: string;
  sent_at: string;
  reminded_at: string | null;
  used_at: string | null;
  expires_at: string;
};
```

- [ ] **Krok 3: Sprawdź, że nic się nie rozjechało typowo**

Run: `npx tsc --noEmit`
Oczekiwane: **błędy** w `app/_lib/reviews.ts` i `app/api/reviews/route.ts` —
`user_id` przestało być `string`. To jest spodziewane i naprawia to zadanie 2.
Zanotuj listę plików; jeśli pojawi się plik spoza tej dwójki, przeczytaj go,
zanim ruszysz dalej.

- [ ] **Krok 4: Commit**

```bash
git add supabase/migrations/76_reviews_goscie_i_moderacja.sql app/_lib/types.ts
git commit -m "feat(opinie): schemat pod opinie gosci i moderacje (migracja 76)"
```

> ⚠️ **Migracji NIE aplikuj teraz na produkcję.** Aplikuje się ją po scaleniu
> całego planu, jednym ruchem, żeby produkcja nie stała z kolumną `status`
> i kodem, który jej jeszcze nie ustawia. Do momentu scalenia pracujesz na
> kodzie, którego zapytania i tak nie trafią na te kolumny.

---

## Zadanie 2: Odczyty tylko zatwierdzone, zapis jako oczekujący

**Pliki:**
- Zmodyfikuj: `app/_lib/reviews.ts`
- Zmodyfikuj: `app/api/reviews/route.ts`
- Zmodyfikuj: `app/_components/ui/ReviewForm.tsx`
- Test: `app/_lib/__tests__/review-author.test.ts` (nowy)

**Interfejsy:**
- Konsumuje: `ProductReview`, `ReviewStatus` z zadania 1.
- Produkuje: `authorNameOf(review, profileName)` w `app/_lib/reviews.ts` —
  `(review: Pick<ProductReview,"user_id"|"guest_name">, profileName: string | null | undefined) => string | null`.

- [ ] **Krok 1: Napisz test na wyznaczanie imienia autora**

To jedyny kawałek tego zadania, który da się przetestować bez bazy — i jedyny,
w którym da się popełnić cichy błąd (gość dostający `null` zamiast imienia).

`app/_lib/__tests__/review-author.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { authorNameOf } from "@/app/_lib/reviews";

describe("authorNameOf", () => {
  it("dla konta bierze imię z profilu", () => {
    expect(authorNameOf({ user_id: "u1", guest_name: null }, "Julia K.")).toBe("Julia K.");
  });

  it("dla gościa bierze imię wpisane w formularzu", () => {
    expect(authorNameOf({ user_id: null, guest_name: "Anna" }, null)).toBe("Anna");
  });

  // Profil bez wypełnionego full_name istnieje w bazie — wtedy podpisu nie ma
  // i widok ma pokazać własny zastępnik, a nie pusty ciąg.
  it("zwraca null, gdy konto nie ma imienia w profilu", () => {
    expect(authorNameOf({ user_id: "u1", guest_name: null }, null)).toBeNull();
  });

  // Gość nigdy nie powinien mieć profilu, ale gdyby mapa coś zwróciła,
  // imię z formularza jest źródłem prawdy dla tej opinii.
  it("dla gościa ignoruje przypadkowe imię z profilu", () => {
    expect(authorNameOf({ user_id: null, guest_name: "Anna" }, "Ktoś Inny")).toBe("Anna");
  });
});
```

- [ ] **Krok 2: Uruchom test i potwierdź, że pada**

Run: `npm test -- review-author`
Oczekiwane: FAIL — `authorNameOf is not a function`.

- [ ] **Krok 3: Dodaj funkcję i przestaw odczyty**

W `app/_lib/reviews.ts` dopisz na górze pliku (pod importami):

```ts
// Imię pod opinią. Dla konta pochodzi z profiles.full_name, dla gościa
// z pola, które sam wpisał — te dwa źródła nigdy nie występują naraz
// (warunek product_reviews_autor_jeden w migracji 76).
export function authorNameOf(
  review: Pick<ProductReview, "user_id" | "guest_name">,
  profileName: string | null | undefined
): string | null {
  if (review.user_id === null) return review.guest_name ?? null;
  return profileName ?? null;
}
```

W tym samym pliku, w **`getReviewsForProduct`**, `getProductRating`
i `getRatingsForProducts` dołóż do każdego zapytania filtr statusu:

```ts
    .eq("status", "approved")
```

W `getReviewsForProduct` zamień budowanie `userIds` i mapowanie na wersję
odporną na `null` (gość nie ma `user_id`, więc nie trafia do zapytania
o profile) i użyj `authorNameOf`:

```ts
  const userIds = Array.from(
    new Set(
      (data as ProductReview[])
        .map((r) => r.user_id)
        .filter((id): id is string => id !== null)
    )
  );
```

```ts
  return (data as ProductReview[]).map((r) => ({
    ...localizeReview(r, locale),
    author_name: authorNameOf(r, nameMap.get(r.user_id ?? "")),
  }));
```

Gdy `userIds` jest puste (same opinie gości), pomiń zapytanie o profile, ale
**nadal przepuść wynik przez `authorNameOf`** — inaczej opinie gości stracą
podpis:

```ts
  if (userIds.length === 0) {
    return (data as ProductReview[]).map((r) => ({
      ...localizeReview(r, locale),
      author_name: authorNameOf(r, null),
    }));
  }
```

- [ ] **Krok 4: Uruchom test i potwierdź, że przechodzi**

Run: `npm test -- review-author`
Oczekiwane: PASS, 4 testy.

- [ ] **Krok 5: Zapis jako oczekujący**

W `app/api/reviews/route.ts`, w obiekcie przekazywanym do `.upsert(...)`,
dopisz status — **edycja też wraca do moderacji**, inaczej zatwierdzenie dałoby
się obejść jedną poprawką treści:

```ts
      {
        product_id: productId,
        user_id: user.id,
        rating: ratingInt,
        comment: trimmedComment || null,
        // Każdy zapis (nowa opinia I edycja) wraca do moderacji. Bez tego
        // wystarczyłoby napisać coś neutralnego, doczekać zatwierdzenia
        // i podmienić treść.
        status: "pending",
      } as never,
```

- [ ] **Krok 6: Komunikat dla autora**

W `app/_components/ui/ReviewForm.tsx` dopisz do obu słowników (`de` i `pl`)
klucz:

```ts
        moderacja: "Dziękujemy. Opinia pojawi się po sprawdzeniu przez obsługę sklepu.",
```

(w wariancie DE: `"Vielen Dank. Die Bewertung erscheint nach der Prüfung durch den Shop."`)

Dodaj stan `const [sent, setSent] = useState(false);`, ustaw `setSent(true)`
w `onSubmit` po udanym zapisie (obok `router.refresh()`), a nad przyciskami
wyświetl komunikat, gdy `sent`:

```tsx
      {sent && (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] text-[var(--fg)] rounded-xl px-4 py-3 text-sm">
          {c.moderacja}
        </div>
      )}
```

- [ ] **Krok 7: Bramki i commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Oczekiwane: 0 błędów, 0 błędów lintu, wszystkie testy zielone.

```bash
git add app/_lib/reviews.ts app/api/reviews/route.ts app/_components/ui/ReviewForm.tsx app/_lib/__tests__/review-author.test.ts
git commit -m "feat(opinie): publiczne sa tylko zatwierdzone, zapis idzie do moderacji"
```

---

## Zadanie 3: Panel moderacji

**Pliki:**
- Utwórz: `app/_lib/reviews-admin.ts`
- Utwórz: `app/admin/opinie/page.tsx`
- Utwórz: `app/admin/opinie/OpinieList.tsx`
- Utwórz: `app/admin/opinie/actions.ts`
- Zmodyfikuj: `app/admin/layout.tsx`, `app/admin/AdminShell.tsx`

**Interfejsy:**
- Konsumuje: `ProductReview`, `ReviewStatus`, `authorNameOf`.
- Produkuje: `getReviewsForModeration(status)`, `getPendingReviewsCount()`,
  akcje `setReviewStatus(reviewId, status)` i
  `setReviewHomepageExcluded(reviewId, excluded)` — obie zwracają
  `ActionResult`.

- [ ] **Krok 1: Moduł odczytu dla panelu**

`app/_lib/reviews-admin.ts`:

```ts
import { createAdminClient } from "./supabase/server";
import { authorNameOf } from "./reviews";
import type { ProductReview, ReviewStatus } from "./types";

// ⚠️ Bez `slug` — tabela `products` NIE MA takiej kolumny (sprawdzone na
// produkcji 2026-08-18). Produkty linkuje się po id: /produkt/<id>.
export type ReviewForModeration = ProductReview & {
  product_name: string | null;
};

// Panel czyta klientem administracyjnym, bo reguła publicznego odczytu
// przepuszcza wyłącznie `approved` — a moderacja z definicji ogląda to,
// czego publiczność jeszcze nie widzi.
export async function getReviewsForModeration(
  status: ReviewStatus
): Promise<ReviewForModeration[]> {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("product_reviews")
    .select("*, products(name)")
    // Najstarsze pierwsze: kolejka moderacji, nie tablica ogłoszeń —
    // najdłużej czekający klient ma być obsłużony pierwszy.
    .order("created_at", { ascending: true })
    .eq("status", status);
  if (error || !data) return [];

  const rows = data as unknown as (ProductReview & {
    products: { name: string | null } | null;
  })[];

  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((id): id is string => id !== null))
  );
  const nameMap = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) {
      nameMap.set(p.id, p.full_name);
    }
  }

  return rows.map((r) => ({
    ...r,
    author_name: authorNameOf(r, nameMap.get(r.user_id ?? "")),
    product_name: r.products?.name ?? null,
  }));
}

export async function getPendingReviewsCount(): Promise<number> {
  const admin = await createAdminClient();
  const { count, error } = await admin
    .from("product_reviews")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}
```

- [ ] **Krok 2: Akcje panelu**

`app/admin/opinie/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import type { ReviewStatus } from "@/app/_lib/types";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const DOZWOLONE: ReviewStatus[] = ["pending", "approved", "rejected"];

export async function setReviewStatus(
  reviewId: string,
  status: string
): Promise<ActionResult> {
  await requireAdmin();
  if (!reviewId) return { ok: false, error: "Brak id opinii" };
  if (!DOZWOLONE.includes(status as ReviewStatus)) {
    return { ok: false, error: "Nieprawidłowy status" };
  }

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("product_reviews")
    .update({ status } as never)
    .eq("id", reviewId)
    .select("product_id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Opinia nie znaleziona" };

  const productId = (data[0] as { product_id: string }).product_id;
  revalidatePath("/admin/opinie");
  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");
  // Zatwierdzenie zmienia średnią ocen widoczną na kafelkach strony głównej.
  revalidatePath("/");
  return { ok: true, message: status === "approved" ? "Opinia opublikowana" : "Zapisano" };
}

export async function setReviewHomepageExcluded(
  reviewId: string,
  excluded: boolean
): Promise<ActionResult> {
  await requireAdmin();
  if (!reviewId) return { ok: false, error: "Brak id opinii" };

  const admin = await createAdminClient();
  const { error } = await admin
    .from("product_reviews")
    .update({ homepage_excluded: excluded } as never)
    .eq("id", reviewId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/opinie");
  revalidatePath("/");
  return { ok: true, message: excluded ? "Ukryto na stronie głównej" : "Wróciło na stronę główną" };
}
```

- [ ] **Krok 3: Ekran moderacji**

`app/admin/opinie/page.tsx`:

```tsx
import { getReviewsForModeration } from "@/app/_lib/reviews-admin";
import OpinieList from "./OpinieList";

export const metadata = { title: "Opinie — panel" };

export default async function OpiniePage() {
  const [oczekujace, zatwierdzone, odrzucone] = await Promise.all([
    getReviewsForModeration("pending"),
    getReviewsForModeration("approved"),
    getReviewsForModeration("rejected"),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-3xl font-bold mb-1">Opinie</h1>
        <p className="text-sm text-[var(--muted)]">
          Opinia staje się publiczna dopiero po zatwierdzeniu.
        </p>
      </div>
      <OpinieList
        oczekujace={oczekujace}
        zatwierdzone={zatwierdzone}
        odrzucone={odrzucone}
      />
    </div>
  );
}
```

`app/admin/opinie/OpinieList.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setReviewStatus, setReviewHomepageExcluded } from "./actions";
import type { ReviewForModeration } from "@/app/_lib/reviews-admin";

export default function OpinieList({
  oczekujace,
  zatwierdzone,
  odrzucone,
}: {
  oczekujace: ReviewForModeration[];
  zatwierdzone: ReviewForModeration[];
  odrzucone: ReviewForModeration[];
}) {
  const [blad, setBlad] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-12">
      {blad && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
          {blad}
        </div>
      )}

      <Sekcja tytul={`Oczekujące (${oczekujace.length})`}>
        {/* ⚠️ Wymóg ze specyfikacji, sekcja „Zgodność z przepisami": to
            ostrzeżenie ma stać tam, gdzie Julia klika, a nie w dokumentacji,
            której nikt nie czyta. NIE parafrazować, NIE przenosić. */}
        <p className="text-xs text-[var(--muted)] mb-4 max-w-2xl">
          Odrzucaj spam, obelgi i treści niezwiązane z produktem.{" "}
          <strong className="text-[var(--fg)]">
            Nie odrzucaj opinii tylko dlatego, że ocena jest niska
          </strong>{" "}
          — pokazywanie wyłącznie pochwał przy ukrywaniu krytyki jest niezgodne
          z przepisami o opiniach konsumenckich.
        </p>
        {oczekujace.length === 0 ? (
          <Pusto tekst="Nic nie czeka na sprawdzenie." />
        ) : (
          oczekujace.map((o) => (
            <Wiersz key={o.id} opinia={o} onBlad={setBlad} pokazDecyzje />
          ))
        )}
      </Sekcja>

      <Sekcja tytul={`Opublikowane (${zatwierdzone.length})`}>
        {zatwierdzone.length === 0 ? (
          <Pusto tekst="Nie ma jeszcze żadnej opublikowanej opinii." />
        ) : (
          zatwierdzone.map((o) => (
            <Wiersz key={o.id} opinia={o} onBlad={setBlad} pokazWykluczenie />
          ))
        )}
      </Sekcja>

      <Sekcja tytul={`Odrzucone (${odrzucone.length})`}>
        {odrzucone.length === 0 ? (
          <Pusto tekst="Nic nie zostało odrzucone." />
        ) : (
          odrzucone.map((o) => <Wiersz key={o.id} opinia={o} onBlad={setBlad} pokazPrzywroc />)
        )}
      </Sekcja>
    </div>
  );
}

function Sekcja({ tytul, children }: { tytul: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-bold text-[var(--fg)] mb-3">{tytul}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Pusto({ tekst }: { tekst: string }) {
  return <p className="text-sm text-[var(--muted)]">{tekst}</p>;
}

function Wiersz({
  opinia,
  onBlad,
  pokazDecyzje = false,
  pokazWykluczenie = false,
  pokazPrzywroc = false,
}: {
  opinia: ReviewForModeration;
  onBlad: (b: string | null) => void;
  pokazDecyzje?: boolean;
  pokazWykluczenie?: boolean;
  pokazPrzywroc?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function zmien(status: "approved" | "rejected" | "pending") {
    onBlad(null);
    startTransition(async () => {
      const wynik = await setReviewStatus(opinia.id, status);
      if (!wynik.ok) onBlad(wynik.error);
      else router.refresh();
    });
  }

  function przelaczWykluczenie(nowe: boolean) {
    onBlad(null);
    startTransition(async () => {
      const wynik = await setReviewHomepageExcluded(opinia.id, nowe);
      if (!wynik.ok) onBlad(wynik.error);
      else router.refresh();
    });
  }

  // user_id === null znaczy „gość" — patrz warunek product_reviews_autor_jeden.
  const odGoscia = opinia.user_id === null;

  return (
    <article className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="font-semibold text-[var(--fg)]">
            {"★".repeat(opinia.rating)}
            <span className="text-[var(--muted)]">{"★".repeat(5 - opinia.rating)}</span>
            <span className="ml-3 font-normal text-sm">
              {opinia.author_name ?? "Klient"}
            </span>
          </p>
          <p className="text-xs text-[var(--muted)] mt-1">
            {opinia.product_name ?? "produkt usunięty"} ·{" "}
            {new Date(opinia.created_at).toLocaleDateString("pl-PL")}
          </p>
        </div>
        <span
          className={
            odGoscia
              ? "text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              : "text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-[var(--border)] text-[var(--muted)]"
          }
        >
          {odGoscia ? "gość" : "konto"}
        </span>
      </div>

      {opinia.comment && (
        <p className="whitespace-pre-wrap text-sm text-[var(--fg)] leading-relaxed">
          {opinia.comment}
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {pokazDecyzje && (
          <>
            <button
              type="button"
              onClick={() => zmien("approved")}
              disabled={pending}
              className="px-4 py-2 bg-[var(--color-navy)] text-white text-xs font-semibold uppercase tracking-widest rounded-full disabled:opacity-40"
            >
              Zatwierdź
            </button>
            <button
              type="button"
              onClick={() => zmien("rejected")}
              disabled={pending}
              className="text-xs font-semibold uppercase tracking-widest text-red-600 hover:text-red-700 disabled:opacity-40"
            >
              Odrzuć
            </button>
          </>
        )}
        {pokazPrzywroc && (
          <button
            type="button"
            onClick={() => zmien("pending")}
            disabled={pending}
            className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-40"
          >
            Przywróć do sprawdzenia
          </button>
        )}
        {pokazWykluczenie && (
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={opinia.homepage_excluded}
              disabled={pending}
              onChange={(e) => przelaczWykluczenie(e.target.checked)}
            />
            nie pokazuj na stronie głównej
          </label>
        )}
      </div>
    </article>
  );
}
```

⚠️ **Uwaga na pułapkę `<label>` z PR #151:** tutaj `<label>` owija pole wyboru
i jest to poprawne — pierwszym elementem sterującym w środku jest właśnie ten
`input`. Nie zamieniaj tego na `<div>`; problem dotyczył etykiet owijających
**widżety złożone**, gdzie pierwszym elementem był przycisk paska narzędzi.

- [ ] **Krok 4: Licznik oczekujących**

W `app/admin/layout.tsx` dołóż czwarty licznik do istniejącego `Promise.all`:

```tsx
import { getPendingReviewsCount } from "@/app/_lib/reviews-admin";
```

```tsx
  const [newIssues, newOrders, newSamples, newReviews] = await Promise.all([
    getNewOrderIssuesCount(),
    getNewOrdersCount(),
    getNewSampleOrdersCount(),
    getPendingReviewsCount(),
  ]);
```

```tsx
    <AdminShell
      userEmail={user.email ?? null}
      newIssues={newIssues}
      newOrders={newOrders}
      newSamples={newSamples}
      newReviews={newReviews}
    >
```

W `app/admin/AdminShell.tsx` cztery zmiany. Plik ma tablicę `NAV_ITEMS`
(linia ~9), pomocnika `navBadge` (linia ~29) i lokalne funkcje ikon.

**(1)** Do `NAV_ITEMS`, po pozycji `/admin/reklamacje`:

```tsx
  { href: "/admin/opinie", label: "Opinie", icon: ReviewsIcon },
```

**(2)** Rozszerz sygnaturę i treść `navBadge` — plakietka ma znaczyć pracę do
zrobienia, a opinia oczekująca dokładnie nią jest:

```tsx
function navBadge(
  href: string,
  counts: { newIssues: number; newOrders: number; newSamples: number; newReviews: number }
) {
```

i dopisz w jej ciele, obok pozostałych warunków:

```tsx
  if (href === "/admin/opinie" && counts.newReviews > 0) {
    return { count: counts.newReviews, label: "opinie do sprawdzenia" };
  }
```

**(3)** Dodaj prop do komponentu — w destrukturyzacji (linia ~56) i w typie
(linia ~62) `newReviews: number`, a w wywołaniu `navBadge` (linia ~140):

```tsx
            const badge = navBadge(item.href, { newIssues, newOrders, newSamples, newReviews });
```

**(4)** Dopisz ikonę obok pozostałych (wzorzec skopiowany z `SwatchIcon`,
linia ~304 — te same wymiary, `fill="none"`, `strokeWidth="2"`):

```tsx
function ReviewsIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-5.5A8 8 0 0 1 13 4a8 8 0 0 1 8 8z" />
      <path d="M12 8.5l1.2 2.4 2.6.4-1.9 1.8.4 2.6-2.3-1.2-2.3 1.2.4-2.6-1.9-1.8 2.6-.4z" />
    </svg>
  );
}
```

- [ ] **Krok 5: Bramki i commit**

Run: `npx tsc --noEmit && npm run lint && npm test`

```bash
git add app/_lib/reviews-admin.ts app/admin/opinie app/admin/layout.tsx app/admin/AdminShell.tsx
git commit -m "feat(opinie): panel moderacji z licznikiem oczekujacych"
```

---

## Zadanie 4: Zaproszenia i mail po „Dostarczone"

**Pliki:**
- Utwórz: `app/_lib/review-tokens.ts`
- Utwórz: `app/_lib/__tests__/review-tokens.test.ts`
- Utwórz: `app/_lib/review-invites-server.ts`
- Utwórz: `app/_lib/mail/templates/ReviewRequest.tsx`
- Utwórz: `app/_lib/mail/review-request.ts`
- Zmodyfikuj: `app/admin/zamowienia/actions.ts` (przy `after(...)`, linia ~84)

**Interfejsy:**
- Konsumuje: `ReviewInvite` z zadania 1.
- Produkuje: `generateInviteToken(): string`, `hashInviteToken(token: string): string`,
  `inviteState(invite, now): "ok" | "used" | "expired"`, `INVITE_TTL_DNI = 90`,
  `reviewUrlFor(opts): string`, `createInvite(...)`, `findInviteByToken(token)`,
  `markInviteUsed(id)`, `requestReviews(orderId: string): Promise<void>`.

> **O idempotencji `requestReviews`:** specyfikacja wymienia ją wśród rzeczy do
> sprawdzenia, ale **nie da się jej uczciwie pokryć testem jednostkowym** —
> pilnuje jej ograniczenie `unique (order_id, product_id)` w bazie, a test bez
> bazy sprawdzałby wyłącznie zachowanie atrapy, czyli nic. Dowodem jest
> istnienie ograniczenia (weryfikowane zapytaniem w sekcji „Domknięcie") oraz
> gałąź `if (!utworzone) continue;` w kroku 7. Nie pisz testu, który udaje, że
> to sprawdza.

- [ ] **Krok 1: Napisz testy tokenów**

`app/_lib/__tests__/review-tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  generateInviteToken,
  hashInviteToken,
  inviteState,
  reviewUrlFor,
  INVITE_TTL_DNI,
} from "@/app/_lib/review-tokens";

const TERAZ = new Date("2026-08-18T10:00:00Z");

describe("token zaproszenia", () => {
  it("generuje token o stałej długości i różny za każdym razem", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
  });

  it("skrót jest powtarzalny i nie jest samym tokenem", () => {
    const t = generateInviteToken();
    expect(hashInviteToken(t)).toBe(hashInviteToken(t));
    expect(hashInviteToken(t)).not.toBe(t);
  });

  it("ważność liczona jest w dniach", () => {
    expect(INVITE_TTL_DNI).toBe(90);
  });
});

describe("inviteState", () => {
  const bazowe = {
    used_at: null as string | null,
    expires_at: "2026-11-16T10:00:00Z",
  };

  it("świeże zaproszenie jest w porządku", () => {
    expect(inviteState(bazowe, TERAZ)).toBe("ok");
  });

  it("zużyte zaproszenie jest zużyte — nawet jeśli jeszcze ważne", () => {
    expect(inviteState({ ...bazowe, used_at: "2026-08-19T10:00:00Z" }, TERAZ)).toBe("used");
  });

  it("wygasłe zaproszenie jest wygasłe", () => {
    expect(inviteState({ ...bazowe, expires_at: "2026-08-17T10:00:00Z" }, TERAZ)).toBe("expired");
  });

  // Kolejność sprawdzeń ma znaczenie dla komunikatu: ktoś, kto już napisał,
  // ma zobaczyć „już dziękujemy", a nie „link wygasł".
  it("zużycie bije wygaśnięcie", () => {
    expect(
      inviteState(
        { used_at: "2026-08-16T10:00:00Z", expires_at: "2026-08-17T10:00:00Z" },
        TERAZ
      )
    ).toBe("used");
  });
});

// Wymóg ze specyfikacji: „właściwy adres w linku" dla gościa i dla konta.
// To jedyny fragment budowania maila, w którym da się popełnić cichy błąd —
// gość dostający link do karty produktu nie ma jak napisać opinii, bo nie jest
// zalogowany, a mail wygląda na poprawny.
describe("reviewUrlFor", () => {
  const base = "https://www.mollien.pl";

  it("gość dostaje link z tokenem", () => {
    expect(
      reviewUrlFor({ base, locale: "pl", maKonto: false, productId: "p1", token: "abc" })
    ).toBe("https://www.mollien.pl/opinia/abc");
  });

  it("posiadacz konta dostaje link na kartę produktu do sekcji opinii", () => {
    expect(
      reviewUrlFor({ base, locale: "pl", maKonto: true, productId: "p1", token: "abc" })
    ).toBe("https://www.mollien.pl/produkt/p1#opinie");
  });

  it("wersja niemiecka niesie prefiks /de", () => {
    expect(
      reviewUrlFor({ base, locale: "de", maKonto: false, productId: "p1", token: "abc" })
    ).toBe("https://www.mollien.pl/de/opinia/abc");
  });

  // Gdyby ktoś kiedyś zawołał to bez tokenu dla gościa, link prowadziłby
  // do /opinia/undefined. Lepiej rzucić w testach niż wysłać taki mail.
  it("rzuca, gdy gość nie ma tokenu", () => {
    expect(() =>
      reviewUrlFor({ base, locale: "pl", maKonto: false, productId: "p1", token: null })
    ).toThrow();
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź, że pada**

Run: `npm test -- review-tokens`
Oczekiwane: FAIL — nie ma modułu `@/app/_lib/review-tokens`.

- [ ] **Krok 3: Napisz moduł tokenów**

`app/_lib/review-tokens.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

// Ile token żyje. Wartość arbitralna, ale MUSI być skończona: token
// bezterminowy w cudzej skrzynce to trwałe uprawnienie do pisania opinii
// w imieniu kupującego.
export const INVITE_TTL_DNI = 90;

// 32 bajty losowości → 64 znaki hex. Tyle samo, co token resetu hasła.
export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

// W bazie leży WYŁĄCZNIE skrót. Wyciek kopii bazy nie oddaje wtedy prawa do
// pisania opinii — dokładnie ta sama zasada co przy resecie hasła.
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function expiresAtFrom(sentAt: Date): Date {
  return new Date(sentAt.getTime() + INVITE_TTL_DNI * 24 * 60 * 60 * 1000);
}

// Kolejność sprawdzeń jest częścią zachowania, nie stylem: „zużyte" bije
// „wygasłe", żeby ktoś, kto opinię już napisał, zobaczył podziękowanie,
// a nie komunikat o wygasłym linku.
export function inviteState(
  invite: { used_at: string | null; expires_at: string },
  now: Date
): "ok" | "used" | "expired" {
  if (invite.used_at !== null) return "used";
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return "expired";
  return "ok";
}

// Dokąd prowadzi przycisk w mailu. Wydzielone z budowania maila, bo to jedyny
// jego fragment, w którym da się popełnić cichy błąd: gość, który dostanie
// link do karty produktu, nie ma jak napisać opinii (nie jest zalogowany),
// a mail wygląda poprawnie.
export function reviewUrlFor(opts: {
  base: string;
  locale: "pl" | "de";
  maKonto: boolean;
  productId: string;
  token: string | null;
}): string {
  const prefix = opts.locale === "de" ? "/de" : "";
  if (opts.maKonto) return `${opts.base}${prefix}/produkt/${opts.productId}#opinie`;
  if (!opts.token) {
    // Głośno zamiast /opinia/undefined w wysłanym mailu.
    throw new Error("reviewUrlFor: gość bez tokenu");
  }
  return `${opts.base}${prefix}/opinia/${opts.token}`;
}
```

- [ ] **Krok 4: Uruchom i potwierdź, że przechodzi**

Run: `npm test -- review-tokens`
Oczekiwane: PASS, 11 testów.

- [ ] **Krok 5: Dostęp do bazy zaproszeń**

`app/_lib/review-invites-server.ts`:

```ts
import { createAdminClient } from "./supabase/server";
import { expiresAtFrom, generateInviteToken, hashInviteToken } from "./review-tokens";
import type { ReviewInvite } from "./types";

// Zakłada zaproszenie i zwraca JAWNY token do wstawienia w link w mailu.
// Zwraca null, gdy zaproszenie dla tej pary już istnieje (unique
// order_id+product_id) — to jest właśnie zabezpieczenie idempotencji:
// ponowne przestawienie statusu nie wyśle drugiego maila.
export async function createInvite(
  orderId: string,
  productId: string,
  email: string
): Promise<{ invite: ReviewInvite; token: string } | null> {
  const token = generateInviteToken();
  const teraz = new Date();
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("review_invites")
    .insert({
      order_id: orderId,
      product_id: productId,
      email,
      token_hash: hashInviteToken(token),
      sent_at: teraz.toISOString(),
      expires_at: expiresAtFrom(teraz).toISOString(),
    } as never)
    .select()
    .maybeSingle();
  if (error || !data) return null;
  return { invite: data as ReviewInvite, token };
}

export async function findInviteByToken(token: string): Promise<ReviewInvite | null> {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("review_invites")
    .select("*")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();
  return (data as ReviewInvite | null) ?? null;
}

export async function markInviteUsed(inviteId: string): Promise<void> {
  const admin = await createAdminClient();
  await admin
    .from("review_invites")
    .update({ used_at: new Date().toISOString() } as never)
    .eq("id", inviteId);
}
```

- [ ] **Krok 6: Szablon maila**

`app/_lib/mail/templates/ReviewRequest.tsx` — struktura 1:1 z `OrderShipped.tsx`
(słownik `COPY` na górze, `MailLayout` + `MailButton` z `_Layout.tsx`):

```tsx
import { Text } from "@react-email/components";
import type { MailBranding } from "../branding";
import { MailButton, MailLayout } from "./_Layout";

const COPY = {
  pl: {
    preview: (p: string) => `Jak sprawdza się ${p}?`,
    heading: "Jak sprawdza się Twój nowy mebel?",
    headingPrzypomnienie: "Przypominamy o opinii",
    intro: (p: string, nr: number) =>
      `Jakiś czas temu odebrałeś zamówienie #${nr} — ${p}. Jeśli znajdziesz chwilę, napisz kilka zdań o tym, jak się sprawdza.`,
    pomoc:
      "Twoja opinia pomaga innym osobom wybrać mebel, którego nie mogą wcześniej zobaczyć na żywo. Zajmie to minutę.",
    cta: "Wystaw opinię",
    moderacja: "Opinia pojawi się na stronie po sprawdzeniu przez obsługę sklepu.",
  },
  de: {
    preview: (p: string) => `Wie gefällt Ihnen ${p}?`,
    heading: "Wie bewährt sich Ihr neues Möbelstück?",
    headingPrzypomnienie: "Erinnerung an Ihre Bewertung",
    intro: (p: string, nr: number) =>
      `Vor einiger Zeit haben Sie die Bestellung #${nr} erhalten — ${p}. Wenn Sie einen Moment Zeit finden, schreiben Sie ein paar Sätze dazu.`,
    pomoc:
      "Ihre Bewertung hilft anderen, ein Möbelstück auszuwählen, das sie vorher nicht in echt sehen können. Es dauert eine Minute.",
    cta: "Bewertung schreiben",
    moderacja: "Die Bewertung erscheint nach der Prüfung durch den Shop.",
  },
} as const;

export function ReviewRequest({
  branding,
  locale,
  productName,
  reviewUrl,
  orderNumber,
  przypomnienie,
}: {
  branding: MailBranding;
  locale: "pl" | "de";
  productName: string;
  reviewUrl: string;
  orderNumber: number;
  // Ten sam szablon obsługuje pierwszą prośbę i ponaglenie — różnią się
  // wyłącznie nagłówkiem. Dwa osobne pliki rozjechałyby się przy pierwszej
  // zmianie treści.
  przypomnienie: boolean;
}) {
  const t = COPY[locale];
  const c = branding.colors;

  return (
    <MailLayout
      branding={branding}
      locale={locale}
      preview={t.preview(productName)}
      heading={przypomnienie ? t.headingPrzypomnienie : t.heading}
    >
      <Text style={{ color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 16px" }}>
        {t.intro(productName, orderNumber)}
      </Text>
      <Text style={{ color: c.muted, fontSize: "13px", lineHeight: "1.6", margin: "0 0 24px" }}>
        {t.pomoc}
      </Text>

      <MailButton branding={branding} href={reviewUrl}>
        {t.cta}
      </MailButton>

      <Text style={{ color: c.muted, fontSize: "12px", lineHeight: "1.6", margin: "24px 0 0" }}>
        {t.moderacja}
      </Text>
    </MailLayout>
  );
}
```

⚠️ Wariant DE piszemy, bo builder wymaga obu gałęzi słownika, ale **nie testuj
tej ścieżki** — `/de` jest zamrożone flagą `DE_ENABLED`.

- [ ] **Krok 7: `requestReviews`**

`app/_lib/mail/review-request.ts`:

```ts
import { render } from "@react-email/components";
import { getOrderById, getProfilesByIds } from "../orders";
import { createInvite } from "../review-invites-server";
import { reviewUrlFor } from "../review-tokens";
import { createAdminClient } from "../supabase/server";
import { getMailBranding } from "./branding-server";
import { mailLocale } from "./locale";
import { sendMail } from "./send";
import { ReviewRequest } from "./templates/ReviewRequest";

// Adres klienta — ta sama zasada, co w notify-order.ts.
async function customerEmailOf(order: {
  guest_email: string | null;
  user_id: string | null;
}): Promise<string | null> {
  if (order.guest_email) return order.guest_email;
  if (!order.user_id) return null;
  const profiles = await getProfilesByIds([order.user_id]);
  return profiles[order.user_id]?.email ?? null;
}

// Prośba o opinię po oznaczeniu zamówienia jako dostarczone.
//
// ⚠️ ŚWIADOMIE NIE dopisujemy `delivered` do NOTIFY_STATUSES w status-notify.ts.
// Tamten komentarz tłumaczy, czemu `delivered` nie wysyła powiadomienia
// o statusie („przy meblach klient kwituje odbiór u kierowcy") i ta decyzja
// zostaje w mocy — to jest osobna wiadomość o innym celu. Zmieszanie ich
// zepsułoby testy semantyki statusów i zatarło przemyślaną regułę.
//
// NIGDY nie rzuca: wołane z akcji admina przez after(), więc wyjątek zamieniłby
// udaną zmianę statusu w błąd w panelu.
export async function requestReviews(orderId: string): Promise<void> {
  try {
    const order = await getOrderById(orderId);
    const to = await customerEmailOf(order);
    if (!to) {
      console.error(`[mail] zamówienie ${orderId} bez adresu — pomijam prośbę o opinię`);
      return;
    }

    const branding = await getMailBranding();
    const locale = mailLocale(order.currency);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://mollien.pl";
    const maKonto = order.user_id !== null;

    // Bez duplikatów: zamówienie może mieć dwa wiersze tego samego produktu.
    const productIds = Array.from(
      new Set((order.items ?? []).map((i) => i.product_id).filter(Boolean))
    );

    const admin = await createAdminClient();

    for (const productId of productIds) {
      // Zaproszenie zakładamy ZAWSZE — także dla kont, mimo że wtedy token
      // nie trafia do maila (wariant B). Tabela pełni wtedy rolę rejestru
      // „komu i kiedy wysłano prośbę", bez którego przypomnienie po 7 dniach
      // nie miałoby skąd wziąć terminu. Liczenie go z orders.status_updated_at
      // rozjeżdża się przy każdej kolejnej zmianie statusu.
      const utworzone = await createInvite(orderId, productId, to);
      // null = zaproszenie już istniało (unique order_id+product_id).
      // Ponowne przestawienie statusu nie wysyła drugiego maila.
      if (!utworzone) continue;

      const { data: produkt } = await admin
        .from("products")
        .select("name")
        .eq("id", productId)
        .maybeSingle();
      const productName = (produkt as { name: string } | null)?.name ?? "Twój zakup";

      const reviewUrl = reviewUrlFor({
        base,
        locale,
        maKonto,
        productId,
        token: utworzone.token,
      });

      const html = await render(
        ReviewRequest({
          branding,
          locale,
          productName,
          reviewUrl,
          orderNumber: order.order_number,
          przypomnienie: false,
        })
      );
      await sendMail({
        to,
        subject:
          locale === "de"
            ? `Wie gefällt Ihnen ${productName}?`
            : `Jak sprawdza się ${productName}?`,
        html,
      });
    }
  } catch (err) {
    console.error("[mail] requestReviews nieudane:", err);
  }
}
```

- [ ] **Krok 8: Wepnij w zmianę statusu**

W `app/admin/zamowienia/actions.ts` dopisz import:

```ts
import { requestReviews } from "@/app/_lib/mail/review-request";
```

i **obok** istniejącego `after(() => notifyStatusChange(orderId, to, from));`:

```ts
  // Prośba o opinię to osobna wiadomość, nie powiadomienie o statusie —
  // dlatego stoi obok, a nie w NOTIFY_STATUSES. Też przez after(): wysyłka
  // nie może opóźnić ani zepsuć akcji admina.
  if (to === "delivered") {
    after(() => requestReviews(orderId));
  }
```

- [ ] **Krok 9: Bramki i commit**

Run: `npx tsc --noEmit && npm run lint && npm test`

```bash
git add app/_lib/review-tokens.ts app/_lib/review-invites-server.ts app/_lib/mail/review-request.ts app/_lib/mail/templates/ReviewRequest.tsx app/admin/zamowienia/actions.ts app/_lib/__tests__/review-tokens.test.ts
git commit -m "feat(opinie): prosba o opinie po oznaczeniu zamowienia jako dostarczone"
```

---

## Zadanie 5: Ścieżka gościa

**Pliki:**
- Utwórz: `app/opinia/[token]/page.tsx`
- Utwórz: `app/opinia/[token]/GuestReviewForm.tsx`
- Utwórz: `app/opinia/[token]/actions.ts`
- Test: `e2e/opinia-token.spec.ts`

**Interfejsy:**
- Konsumuje: `findInviteByToken`, `markInviteUsed`, `inviteState`.
- Produkuje: Server Action `submitGuestReview(formData: FormData): Promise<ActionResult>`.

- [ ] **Krok 1: Strona z tokenem**

`app/opinia/[token]/page.tsx`. **`params` to `Promise`** — potwierdzone
w `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`.

```tsx
import { notFound } from "next/navigation";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { findInviteByToken } from "@/app/_lib/review-invites-server";
import { inviteState } from "@/app/_lib/review-tokens";
import GuestReviewForm from "./GuestReviewForm";

export const metadata = { title: "Wystaw opinię", robots: { index: false, follow: false } };

export default async function OpiniaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await findInviteByToken(token);
  if (!invite) notFound();

  const stan = inviteState(invite, new Date());
  if (stan === "used") {
    return <Komunikat tytul="Opinia już wysłana" tresc="Dziękujemy — Twoja opinia czeka na sprawdzenie przez obsługę sklepu." />;
  }
  if (stan === "expired") {
    return <Komunikat tytul="Link wygasł" tresc="Ten link do wystawienia opinii stracił ważność. Jeśli nadal chcesz podzielić się wrażeniami, napisz do nas." />;
  }

  const admin = await createAdminClient();
  const [{ data: produkt }, { data: zamowienie }] = await Promise.all([
    admin.from("products").select("name, images").eq("id", invite.product_id).maybeSingle(),
    admin.from("orders").select("shipping_address").eq("id", invite.order_id).maybeSingle(),
  ]);

  const adres = (zamowienie as { shipping_address: { fullname?: string } } | null)?.shipping_address;

  return (
    <GuestReviewForm
      token={token}
      productName={(produkt as { name: string } | null)?.name ?? "Twój zakup"}
      domyslneImie={adres?.fullname ?? ""}
      domyslnyEmail={invite.email}
    />
  );
}

function Komunikat({ tytul, tresc }: { tytul: string; tresc: string }) {
  return (
    <section className="max-w-2xl mx-auto px-6 py-24 text-center">
      <h1 className="font-display text-3xl font-bold text-[var(--fg)] mb-3">{tytul}</h1>
      <p className="text-[var(--muted)]">{tresc}</p>
    </section>
  );
}
```

⚠️ **Imię jest podpowiedzią, nie wartością narzuconą.** Sprawdzone na
produkcji: klucz `fullname` ma **8 zamówień z 10**, więc przy dwóch pole
zostanie puste i trzeba o nie poprosić. Poza tym `fullname` to imię
i nazwisko, a pod opinią publikuje się to, co w polu zostanie — autor musi móc
skrócić „Jan Kowalski" do „Jan".

- [ ] **Krok 2: Akcja zapisu**

`app/opinia/[token]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { findInviteByToken, markInviteUsed } from "@/app/_lib/review-invites-server";
import { inviteState } from "@/app/_lib/review-tokens";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export async function submitGuestReview(formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "");
  const invite = await findInviteByToken(token);
  // Ten sam komunikat dla „nie ma takiego" i „nieważny": nie podpowiadamy
  // zgadującemu, czy trafił w istniejący token.
  if (!invite || inviteState(invite, new Date()) !== "ok") {
    return { ok: false, error: "Link jest nieprawidłowy lub stracił ważność" };
  }

  const rating = Math.round(Number(formData.get("rating")));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Wybierz ocenę od 1 do 5 gwiazdek" };
  }
  const imie = String(formData.get("imie") ?? "").trim().slice(0, 80);
  if (imie.length < 2) return { ok: false, error: "Podaj imię" };
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  if (!email.includes("@")) return { ok: false, error: "Podaj poprawny adres e-mail" };
  const tresc = String(formData.get("tresc") ?? "").trim().slice(0, 2000);

  const admin = await createAdminClient();
  const { error } = await admin.from("product_reviews").insert({
    product_id: invite.product_id,
    user_id: null,
    guest_name: imie,
    guest_email: email,
    rating,
    comment: tresc || null,
    status: "pending",
  } as never);

  if (error) {
    // Najczęstszy przypadek: uniq_review_guest — ten adres już ocenił ten
    // produkt. Treść błędu z bazy nie idzie do klienta (wyciek schematu).
    console.error("[opinie] zapis opinii gościa nieudany:", error);
    return { ok: false, error: "Nie udało się zapisać opinii. Możliwe, że już ją wystawiłeś." };
  }

  // Token jednorazowy — zużywamy DOPIERO po udanym zapisie, żeby błąd
  // walidacji nie spalił linku.
  await markInviteUsed(invite.id);
  revalidatePath("/admin/opinie");
  return { ok: true, message: "Dziękujemy! Opinia pojawi się po sprawdzeniu." };
}
```

- [ ] **Krok 3: Formularz**

`app/opinia/[token]/GuestReviewForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import StarInput from "@/app/_components/ui/StarInput";
import { submitGuestReview } from "./actions";

export default function GuestReviewForm({
  token,
  productName,
  domyslneImie,
  domyslnyEmail,
}: {
  token: string;
  productName: string;
  domyslneImie: string;
  domyslnyEmail: string;
}) {
  const [rating, setRating] = useState(0);
  const [tresc, setTresc] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const [wyslane, setWyslane] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBlad(null);
    const formData = new FormData(e.currentTarget);
    // StarInput trzyma ocenę w stanie Reacta, nie w polu formularza.
    formData.set("rating", String(rating));
    startTransition(async () => {
      const wynik = await submitGuestReview(formData);
      if (!wynik.ok) setBlad(wynik.error);
      else setWyslane(true);
    });
  }

  if (wyslane) {
    return (
      <section className="max-w-2xl mx-auto px-6 py-24 text-center">
        <h1 className="font-display text-3xl font-bold text-[var(--fg)] mb-3">Dziękujemy!</h1>
        <p className="text-[var(--muted)]">
          Opinia pojawi się na stronie po sprawdzeniu przez obsługę sklepu.
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="font-display text-3xl font-bold text-[var(--fg)] mb-2">
        Jak sprawdza się {productName}?
      </h1>
      <p className="text-sm text-[var(--muted)] mb-8">
        Twoja opinia pomaga innym wybrać mebel, którego nie mogą wcześniej zobaczyć na żywo.
      </p>

      <form
        onSubmit={onSubmit}
        className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5"
      >
        <input type="hidden" name="token" value={token} />

        <div>
          <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
            Ocena
          </p>
          <StarInput value={rating} onChange={setRating} />
        </div>

        <div>
          <label
            htmlFor="opinia-imie"
            className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2 block"
          >
            Imię
          </label>
          <input
            id="opinia-imie"
            name="imie"
            defaultValue={domyslneImie}
            required
            maxLength={80}
            className="w-full px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
          />
        </div>

        <div>
          <label
            htmlFor="opinia-email"
            className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2 block"
          >
            Adres e-mail
          </label>
          <input
            id="opinia-email"
            name="email"
            type="email"
            defaultValue={domyslnyEmail}
            required
            maxLength={200}
            className="w-full px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
          />
        </div>

        <div>
          <label
            htmlFor="opinia-tresc"
            className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2 block"
          >
            Opinia
          </label>
          <textarea
            id="opinia-tresc"
            name="tresc"
            value={tresc}
            onChange={(e) => setTresc(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="Jak mebel sprawdza się w codziennym użytkowaniu?"
            className="w-full px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] resize-y"
          />
          <p className="text-xs text-[var(--muted)] mt-1 text-right">{tresc.length}/2000</p>
        </div>

        {blad && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
            {blad}
          </div>
        )}

        <button
          type="submit"
          disabled={pending || rating < 1}
          className="ml-auto px-6 py-3 bg-[var(--color-navy)] text-white font-sans text-xs font-semibold uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? "Wysyłam..." : "Wyślij opinię"}
        </button>

        <p className="text-xs text-[var(--muted)]">
          Twój adres e-mail nie będzie publikowany — służy wyłącznie potwierdzeniu, że opinia
          pochodzi od osoby, która kupiła ten produkt. Pod opinią pokażemy tylko imię.
        </p>
      </form>
    </section>
  );
}
```

⚠️ Etykiety `<label htmlFor=...>` są tu wskazane **wprost przez `htmlFor`**,
a nie przez owinięcie zawartości — to świadome, po usterce z PR #151, gdzie
`<label>` owijający widżet złożony aktywował pierwszy przycisk w środku.

- [ ] **Krok 4: Test e2e — wyłącznie nieniszczący**

`e2e/opinia-token.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// ⚠️ Ten spec CELOWO nie wysyła formularza. Baza jest wspólna z produkcją,
// więc udany zapis zostawiłby śmieć wśród prawdziwych opinii. Sprawdzamy
// wyłącznie odmowę — pełną ścieżkę zapisu przechodzi człowiek na prawdziwym
// zamówieniu.
test("nieznany token nie otwiera formularza opinii", async ({ page }) => {
  const res = await page.goto("/opinia/000000000000000000000000000000000000000000000000000000000000dead");
  expect(res?.status()).toBe(404);
});
```

- [ ] **Krok 5: Uruchom e2e na buildzie**

Run: `npm run build && npm start` w tle, potem
`npx playwright test opinia-token`
Oczekiwane: PASS. **Nie odpalaj na `next dev`** — umiera po pierwszym teście.

- [ ] **Krok 6: Bramki i commit**

Run: `npx tsc --noEmit && npm run lint && npm test`

```bash
git add app/opinia e2e/opinia-token.spec.ts
git commit -m "feat(opinie): strona wystawiania opinii z linku dla klienta bez konta"
```

---

## Zadanie 6: Przypomnienie po 7 dniach

**Pliki:**
- Utwórz: `app/_lib/review-reminders.ts`
- Utwórz: `app/_lib/__tests__/review-reminders.test.ts`
- Utwórz: `app/api/cron/przypomnienia-opinie/route.ts`
- Zmodyfikuj: `app/_lib/mail/review-request.ts` (dopisz `sendReviewReminders`)
- Zmodyfikuj: `vercel.json`

**Interfejsy:**
- Konsumuje: `ReviewInvite`, `ReviewRequest`, `sendMail`.
- Produkuje: `shouldRemind(invite, maOpinie, now): boolean`, `DNI_DO_PRZYPOMNIENIA = 7`,
  `sendReviewReminders(): Promise<{ wyslane: number }>`.

- [ ] **Krok 1: Napisz testy warunku**

`app/_lib/__tests__/review-reminders.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldRemind, DNI_DO_PRZYPOMNIENIA } from "@/app/_lib/review-reminders";

const TERAZ = new Date("2026-08-18T10:00:00Z");
const OSIEM_DNI_TEMU = "2026-08-10T10:00:00Z";
const TRZY_DNI_TEMU = "2026-08-15T10:00:00Z";

const swieze = { sent_at: OSIEM_DNI_TEMU, reminded_at: null, used_at: null };

describe("shouldRemind", () => {
  it("przypomina po ośmiu dniach, gdy opinii nie ma", () => {
    expect(shouldRemind(swieze, false, TERAZ)).toBe(true);
  });

  it("nie przypomina przed upływem terminu", () => {
    expect(shouldRemind({ ...swieze, sent_at: TRZY_DNI_TEMU }, false, TERAZ)).toBe(false);
  });

  it("przypomina dokładnie RAZ", () => {
    expect(shouldRemind({ ...swieze, reminded_at: "2026-08-17T10:00:00Z" }, false, TERAZ)).toBe(false);
  });

  it("nie przypomina, gdy gość już skorzystał z linku", () => {
    expect(shouldRemind({ ...swieze, used_at: "2026-08-12T10:00:00Z" }, false, TERAZ)).toBe(false);
  });

  // Najważniejszy przypadek: opinia CZEKA na moderację. Ponaglanie kogoś,
  // kto już napisał, jest gorsze niż brak przypomnienia.
  it("nie przypomina, gdy opinia istnieje w jakimkolwiek statusie", () => {
    expect(shouldRemind(swieze, true, TERAZ)).toBe(false);
  });

  it("termin wynosi 7 dni", () => {
    expect(DNI_DO_PRZYPOMNIENIA).toBe(7);
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź, że pada**

Run: `npm test -- review-reminders`
Oczekiwane: FAIL — brak modułu.

- [ ] **Krok 3: Napisz moduł**

`app/_lib/review-reminders.ts`:

```ts
export const DNI_DO_PRZYPOMNIENIA = 7;

// Czy wysłać przypomnienie o opinii. Wszystkie warunki muszą zachodzić naraz.
//
// `maOpinie` sprawdza istnienie opinii w JAKIMKOLWIEK statusie — także
// `pending` i `rejected`. Ktoś, kto napisał i czeka na moderację, nie może
// dostać ponaglenia; komu odrzucono spam, też nie.
export function shouldRemind(
  invite: { sent_at: string; reminded_at: string | null; used_at: string | null },
  maOpinie: boolean,
  now: Date
): boolean {
  if (invite.reminded_at !== null) return false; // przypominamy dokładnie raz
  if (invite.used_at !== null) return false;
  if (maOpinie) return false;
  const minelo = now.getTime() - new Date(invite.sent_at).getTime();
  return minelo >= DNI_DO_PRZYPOMNIENIA * 24 * 60 * 60 * 1000;
}
```

- [ ] **Krok 4: Uruchom i potwierdź, że przechodzi**

Run: `npm test -- review-reminders`
Oczekiwane: PASS, 6 testów.

- [ ] **Krok 5: Wysyłka przypomnień**

Dopisz na końcu `app/_lib/mail/review-request.ts`:

```ts
import { shouldRemind } from "../review-reminders";
import { hashInviteToken } from "../review-tokens";
import type { ReviewInvite } from "../types";

// Przemiatanie przypomnień — wołane z crona. Idempotentne: `reminded_at`
// ustawiane po wysłaniu sprawia, że powtórne odpalenie nic nie wysyła.
export async function sendReviewReminders(): Promise<{ wyslane: number }> {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("review_invites")
    .select("*")
    .is("reminded_at", null)
    .is("used_at", null);

  const zaproszenia = (data ?? []) as ReviewInvite[];
  const teraz = new Date();
  let wyslane = 0;

  for (const invite of zaproszenia) {
    // Czy dla tej pary istnieje JAKAKOLWIEK opinia — po koncie właściciela
    // zamówienia albo po adresie gościa.
    const { data: zamowienie } = await admin
      .from("orders")
      .select("user_id, currency, order_number")
      .eq("id", invite.order_id)
      .maybeSingle();
    const o = zamowienie as
      | { user_id: string | null; currency: string; order_number: number }
      | null;
    if (!o) continue;

    let zapytanie = admin
      .from("product_reviews")
      .select("id", { count: "exact", head: true })
      .eq("product_id", invite.product_id);
    zapytanie = o.user_id
      ? zapytanie.eq("user_id", o.user_id)
      : zapytanie.ilike("guest_email", invite.email);
    const { count } = await zapytanie;

    if (!shouldRemind(invite, (count ?? 0) > 0, teraz)) continue;

    const branding = await getMailBranding();
    const locale = mailLocale(o.currency);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://mollien.pl";
    const { data: produkt } = await admin
      .from("products")
      .select("name")
      .eq("id", invite.product_id)
      .maybeSingle();
    const productName = (produkt as { name: string } | null)?.name ?? "Twój zakup";

    // ⚠️ Jawnego tokenu NIE MA w bazie (leży tylko skrót), więc przypomnienie
    // dla gościa nie może odtworzyć starego linku. Wystawiamy NOWY token
    // i podmieniamy skrót w tym samym wierszu — stary link przestaje działać,
    // co jest pożądane: w obiegu ma być jeden ważny link.
    let nowyToken: string | null = null;
    if (!o.user_id) {
      nowyToken = generateInviteToken();
      const { error: errToken } = await admin
        .from("review_invites")
        .update({ token_hash: hashInviteToken(nowyToken) } as never)
        .eq("id", invite.id);
      if (errToken) continue;
    }
    const reviewUrl = reviewUrlFor({
      base,
      locale,
      maKonto: o.user_id !== null,
      productId: invite.product_id,
      token: nowyToken,
    });

    const html = await render(
      ReviewRequest({
        branding,
        locale,
        productName,
        reviewUrl,
        orderNumber: o.order_number,
        przypomnienie: true,
      })
    );
    const ok = await sendMail({
      to: invite.email,
      subject:
        locale === "de"
          ? `Erinnerung: Wie gefällt Ihnen ${productName}?`
          : `Przypomnienie: jak sprawdza się ${productName}?`,
      html,
    });
    // reminded_at ustawiamy nawet przy nieudanej wysyłce — inaczej trwała
    // awaria adresu oznaczałaby ponawianie w nieskończoność, raz na dobę.
    await admin
      .from("review_invites")
      .update({ reminded_at: new Date().toISOString() } as never)
      .eq("id", invite.id);
    if (ok) wyslane++;
  }

  return { wyslane };
}
```

Uzupełnij import w nagłówku pliku — `reviewUrlFor` jest tam już z zadania 4,
dochodzą dwa pozostałe:

```ts
import { createInvite } from "../review-invites-server";
import { generateInviteToken, hashInviteToken, reviewUrlFor } from "../review-tokens";
```

- [ ] **Krok 6: Trasa crona**

`app/api/cron/przypomnienia-opinie/route.ts` — wzorzec 1:1 z
`app/api/cron/promocje/route.ts`:

```ts
// Przypomnienia o opinii: raz na dobę przemiata zaproszenia starsze niż
// 7 dni, dla których nie ma jeszcze opinii. Funkcja jest idempotentna
// (`reminded_at`), więc częstsze odpalenie niczego nie dubluje.
//
// Limit Vercela sprawdzony 2026-08-18: 100 zadań na projekt na KAŻDYM planie,
// a Hobby ogranicza wyłącznie częstotliwość do raz na dobę — co tej trasie
// wystarcza. Drugi wpis obok /api/cron/promocje mieści się bez zmiany planu.
import { sendReviewReminders } from "@/app/_lib/mail/review-request";
import { safeCompareSecret } from "@/app/_lib/secure-compare";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET nie ustawiony" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (!safeCompareSecret(authHeader, `Bearer ${secret}`)) {
    return Response.json({ error: "Brak autoryzacji" }, { status: 401 });
  }

  try {
    const { wyslane } = await sendReviewReminders();
    return Response.json({ wyslane });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Nieznany błąd";
    console.error("Cron przypomnień o opinie — błąd:", e);
    return Response.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Krok 7: Harmonogram**

`vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/promocje", "schedule": "5 23 * * *" },
    { "path": "/api/cron/przypomnienia-opinie", "schedule": "0 8 * * *" }
  ]
}
```

`0 8 * * *` to 8:00 UTC, czyli 9:00 lub 10:00 czasu lokalnego — pora, o której
mail nie wygląda na wysłany w środku nocy. Na planie Hobby precyzja to ±59
minut i to jest w porządku dla prośby o opinię.

- [ ] **Krok 8: Bramki i commit**

Run: `npx tsc --noEmit && npm run lint && npm test`

```bash
git add app/_lib/review-reminders.ts app/_lib/__tests__/review-reminders.test.ts app/api/cron/przypomnienia-opinie app/_lib/mail/review-request.ts vercel.json
git commit -m "feat(opinie): przypomnienie po 7 dniach, gdy opinii nadal nie ma"
```

---

## Domknięcie

- [ ] **Bramka całościowa**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Oczekiwane: 0, 0, wszystko zielone, build przechodzi.

- [ ] **PR i scalenie** — opis ma zawierać wynik bramek i wyraźne zdanie, że
  migracja 76 **nie jest jeszcze zaaplikowana**.

- [ ] ⚠️ **TUŻ PRZED aplikacją migracji policz istniejące opinie:**

```sql
select count(*) as opinie, count(*) filter (where status is null) as bez_statusu
from product_reviews;
```

  Kolumna `status` dostaje `default 'pending'` **bez backfillu**. Jest to
  bezpieczne wyłącznie dlatego, że tabela jest dziś pusta (sprawdzone
  2026-08-18: 0 wierszy). **Gdyby w międzyczasie ktoś wystawił opinię, ta
  migracja schowa ją z widoku publicznego** do czasu ręcznego zatwierdzenia
  w panelu — wtedy dopisz `update product_reviews set status = 'approved'`
  dla wierszy sprzed migracji, ZANIM ją zastosujesz.

- [ ] **Zaaplikuj migrację 76 ręcznie** przez Supabase MCP (`apply_migration`),
  bo auto-apply nie działa (57, 58, 75). Potem **sprawdź po obiektach, nie po
  rejestrze**:

```sql
select column_name from information_schema.columns
where table_name = 'product_reviews' and column_name in
  ('status','homepage_excluded','guest_name','guest_email');
select tablename from pg_tables where tablename = 'review_invites';
select polname from pg_policies where tablename = 'product_reviews';
```

- [ ] **Ustaw zmienną, jeśli jej nie ma:** `CRON_SECRET` musi istnieć
  w Vercelu (Production). Sprawdź — cron promocji jej używa, więc powinna być.

- [ ] **Przejdź ręcznie pełną ścieżkę gościa** na jednym prawdziwym
  zamówieniu: oznacz jako „Dostarczone", odbierz maila, wystaw opinię,
  zatwierdź ją w panelu, sprawdź, że pojawiła się na karcie produktu.
  **Usuń tę opinię po teście**, jeśli była wystawiona na potrzeby sprawdzenia.

- [ ] **Plan 2/2** — slider na stronie głównej i `/opinie`. Pisany dopiero po
  scaleniu tego, żeby argumentować z działającego stanu, a nie z założeń.
