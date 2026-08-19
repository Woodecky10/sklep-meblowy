# Zdjęcia w opiniach klientów — plan wdrożenia (część 2/2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klient (zalogowany i gość z linku z maila) może dołączyć do opinii maksymalnie 3 zdjęcia, które pokazują się razem z opinią na stronie głównej, na `/opinie`, na karcie produktu i w panelu Julii.

**Architecture:** Kolumna `photos text[]` w `product_reviews` (wzorzec 1:1 z `order_issues.photos`), przeglądarka przekodowuje plik do JPEG (usuwa EXIF i konwertuje HEIC), serwerowa akcja wgrywa JEDEN plik do bucketa `products` pod prefiksem `opinie/` i zwraca publiczny URL, formularz trzyma listę URL-i i wysyła ją przy zapisie, zapis waliduje liczbę i prefiks. Wyświetlanie: `next/image` w istniejących komponentach opinii.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase Postgres + Storage, `browser-image-compression`, Tailwind v4, vitest (`environment: "node"`), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-19-opinie-zdjecia-i-publikacja-natychmiastowa-design.md` — sekcja 4 (część 2), 5 (testy), 6 (kolejność wdrożenia), 7 (ryzyka).

## Global Constraints

- **Baza Supabase jest WSPÓLNA z produkcją.** Żaden test, spec Playwrighta ani skrypt pomocniczy nie może do niej pisać. Weryfikacja wizualna idzie przez tymczasową flagę z danymi podglądowymi, nie przez wstawienie wiersza.
- **Migracji NIE aplikuje implementer.** W tym projekcie auto-apply nie działa (57, 58, 75, 76, 77) — migracje idą ręcznie przez MCP `apply_migration` i robi to kontroler po decyzji właściciela. Zadaniem implementera jest wyłącznie plik `.sql`.
- **Kolejność wdrożenia jest jednokierunkowa:** migracja → potwierdzenie kolumny zapytaniem do `information_schema` → dopiero potem merge. Nigdy odwrotnie.
- **Kod MUSI działać przed migracją** (fail-soft): dopóki kolumna `photos` nie istnieje, `select("*")` nie zwraca jej wcale, więc każde miejsce czytające `review.photos` dostaje `undefined`. Normalizacja do `[]` siedzi w warstwie danych — patrz Zadanie 6. Wyjątek z odczytu opinii wywala stronę główną.
- **`environment: "node"`, zero jsdom, zero `.test.tsx`.** Testy jednostkowe wyłącznie dla czystych modułów. Nie zakładaj nowej infrastruktury testów komponentów.
- **Playwright wyłącznie na buildzie** (`npm run build` + `npm start`), nigdy `next dev` — `next dev` umiera po pierwszym teście.
- **`MAX_REVIEW_PHOTOS = 3` to JEDNA stała i TRZY bramki**: widżet (nie pozwala wybrać czwartego), zapis (odrzuca payload), baza (`check`). Nie zaszywaj liczby 3 w żadnym z tych miejsc — importuj stałą (w SQL wpisz ją w `check` i zostaw komentarz, że jest odbiciem `MAX_REVIEW_PHOTOS`).
- **Prefiks w Storage to `opinie/`**, bucket `products`. Reklamacje mają `order-issues/` — te dwa prefiksy MUSZĄ zostać rozdzielne, inaczej zdjęcie z reklamacji da się wstawić do publicznej opinii samym przepisaniem URL-a.
- **Nazwa pliku NIGDY nie pochodzi od klienta**: `${Date.now()}-${randomUUID()}.${ext}`, gdzie `ext` bierze się z allowlistowanego mime (`validateImageUpload`), nie z nazwy pliku.
- **Adres `m.wlodarczyk@ggpf.pl` nie może pojawić się nigdzie** — ani w kodzie, ani w testach, ani w danych podglądowych.
- **Przed pisaniem kodu Next.js przeczytaj `node_modules/next/dist/docs/`** (wymóg `AGENTS.md` w repo).
- **Komentarze i teksty dla klienta po polsku**, zgodnie z resztą repo; teksty klienckie w wariancie PL i DE wszędzie, gdzie komponent ma już parę PL/DE.
- **Ta gałąź stoi na `feat/opinie-publikacja-natychmiastowa`** (część 1/2), która NIE jest jeszcze scalona i której migracja 78 NIE jest zaaplikowana. Nie „naprawiaj" niczego z części 1.

---

## Struktura plików

**Nowe:**

- `supabase/migrations/79_opinie_zdjecia.sql` — kolumna `photos` + `check` na 3 zdjęcia.
- `app/_lib/reviews-photos.ts` — czysta logika: stała limitu, prefiks Storage, `isOwnReviewPhotoUrl`, `validateReviewPhotos`, `parseReviewPhotos`. Bez `server-only`, bo importuje go też komponent w drzewie klienckim.
- `app/_lib/__tests__/reviews-photos.test.ts` — testy powyższego.
- `app/_components/ui/ReviewPhotoPicker.tsx` — wspólny widżet wyboru zdjęć dla obu formularzy opinii.

**Modyfikowane:**

- `app/_lib/types.ts` — `photos: string[]` w `ProductReview`.
- `app/_lib/image-compress.ts` — `prepareReviewPhoto` obok `compressIfNeeded`.
- `app/produkt/actions.ts` — `uploadReviewPhoto` (zalogowany).
- `app/opinia/[token]/actions.ts` — `uploadGuestReviewPhoto` (gość) + zapis `photos`.
- `app/api/reviews/route.ts` — walidacja i zapis `photos`.
- `app/_components/ui/ReviewForm.tsx` — widżet + wysyłka listy.
- `app/opinia/[token]/GuestReviewForm.tsx` — widżet + wysyłka listy.
- `app/_lib/reviews.ts` — normalizacja `photos` w warstwie danych.
- `app/_components/ui/ReviewCard.tsx` — miniatury + wariant „pełna treść".
- `app/opinie/page.tsx` — wariant „pełna treść".
- `app/_components/ui/ReviewList.tsx` — siatka zdjęć na karcie produktu.
- `app/produkt/[id]/page.tsx` — przekazanie nazwy produktu do `ReviewList`.
- `app/_lib/reviews-admin.ts` — normalizacja `photos`, liczba zdjęć w `ReviewForMail`.
- `app/_lib/mail/review-notify.ts`, `app/_lib/mail/templates/AdminNewReview.tsx` — wzmianka o zdjęciach.
- `app/_lib/mail/__tests__/mail-review-notify.test.ts` — pokrycie powyższego.
- `app/admin/opinie/OpinieList.tsx` — podgląd zdjęć w panelu.

---

### Zadanie 1: Migracja 79, typ i czysty moduł walidacji

**Files:**
- Create: `supabase/migrations/79_opinie_zdjecia.sql`
- Create: `app/_lib/reviews-photos.ts`
- Create: `app/_lib/__tests__/reviews-photos.test.ts`
- Modify: `app/_lib/types.ts` (typ `ProductReview`, ok. linia 337–359)

**Interfaces:**
- Consumes: nic z wcześniejszych zadań.
- Produces:
  - `MAX_REVIEW_PHOTOS: number` (= 3)
  - `REVIEW_PHOTO_DIR: string` (= `"opinie"`)
  - `reviewPhotoPrefix(supabaseUrl: string): string`
  - `isOwnReviewPhotoUrl(url: unknown, supabaseUrl: string): boolean`
  - `type ReviewPhotosValidation = { ok: true; value: string[] } | { ok: false; error: "count" | "url" }`
  - `validateReviewPhotos(photos: unknown, supabaseUrl: string): ReviewPhotosValidation`
  - `parseReviewPhotos(raw: unknown): unknown`
  - `ProductReview.photos: string[]`

- [ ] **Krok 1: Napisz test (najpierw czerwony)**

Utwórz `app/_lib/__tests__/reviews-photos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MAX_REVIEW_PHOTOS,
  REVIEW_PHOTO_DIR,
  reviewPhotoPrefix,
  isOwnReviewPhotoUrl,
  validateReviewPhotos,
  parseReviewPhotos,
} from "@/app/_lib/reviews-photos";

const SB = "https://tlvgsddpiikolgdwuwmc.supabase.co";
const OK = (n: string) => `${reviewPhotoPrefix(SB)}${n}`;

describe("reviewPhotoPrefix", () => {
  it("składa ścieżkę publiczną bucketa products i katalogu opinie", () => {
    expect(reviewPhotoPrefix(SB)).toBe(
      `${SB}/storage/v1/object/public/products/${REVIEW_PHOTO_DIR}/`
    );
  });

  it("znosi końcowy ukośnik z adresu Supabase (podwójny // psuje porównanie)", () => {
    expect(reviewPhotoPrefix(`${SB}/`)).toBe(reviewPhotoPrefix(SB));
  });
});

describe("isOwnReviewPhotoUrl — anti-injection", () => {
  it("przepuszcza URL z naszego prefiksu", () => {
    expect(isOwnReviewPhotoUrl(OK("1-a.jpg"), SB)).toBe(true);
  });

  it("odrzuca obcy host", () => {
    expect(
      isOwnReviewPhotoUrl("https://evil.example.com/storage/v1/object/public/products/opinie/x.jpg", SB)
    ).toBe(false);
  });

  it("odrzuca inny bucket", () => {
    expect(
      isOwnReviewPhotoUrl(`${SB}/storage/v1/object/public/inne/opinie/x.jpg`, SB)
    ).toBe(false);
  });

  it("odrzuca prefiks reklamacji — zdjęcie z order-issues nie jest zdjęciem do opinii", () => {
    expect(
      isOwnReviewPhotoUrl(`${SB}/storage/v1/object/public/products/order-issues/x.jpg`, SB)
    ).toBe(false);
  });

  it("odrzuca cokolwiek, co nie jest stringiem", () => {
    expect(isOwnReviewPhotoUrl(null, SB)).toBe(false);
    expect(isOwnReviewPhotoUrl(42, SB)).toBe(false);
  });

  it("odrzuca wszystko, gdy adres Supabase jest pusty (brak zmiennej != otwarta bramka)", () => {
    expect(isOwnReviewPhotoUrl(OK("1-a.jpg"), "")).toBe(false);
  });
});
```

```ts
describe("validateReviewPhotos", () => {
  it("brak pola to brak zdjęć, nie błąd", () => {
    expect(validateReviewPhotos(undefined, SB)).toEqual({ ok: true, value: [] });
  });

  it("pusta lista przechodzi", () => {
    expect(validateReviewPhotos([], SB)).toEqual({ ok: true, value: [] });
  });

  it("przepuszcza dokładnie MAX_REVIEW_PHOTOS zdjęć", () => {
    const lista = Array.from({ length: MAX_REVIEW_PHOTOS }, (_, i) => OK(`${i}.jpg`));
    expect(validateReviewPhotos(lista, SB)).toEqual({ ok: true, value: lista });
  });

  it("odrzuca o jedno za dużo", () => {
    const lista = Array.from({ length: MAX_REVIEW_PHOTOS + 1 }, (_, i) => OK(`${i}.jpg`));
    expect(validateReviewPhotos(lista, SB)).toEqual({ ok: false, error: "count" });
  });

  it("odrzuca listę z jednym obcym URL-em", () => {
    expect(
      validateReviewPhotos([OK("1.jpg"), "https://evil.example.com/x.jpg"], SB)
    ).toEqual({ ok: false, error: "url" });
  });

  it("odrzuca wartość, która nie jest tablicą (zepsuty JSON z formularza)", () => {
    expect(validateReviewPhotos(null, SB)).toEqual({ ok: false, error: "url" });
    expect(validateReviewPhotos("[]", SB)).toEqual({ ok: false, error: "url" });
  });

  it("sprawdza limit PRZED prefiksem — cztery obce URL-e to nadal 'count'", () => {
    const lista = Array.from({ length: MAX_REVIEW_PHOTOS + 1 }, () => "https://evil.example.com/x.jpg");
    expect(validateReviewPhotos(lista, SB)).toEqual({ ok: false, error: "count" });
  });
});

describe("parseReviewPhotos", () => {
  it("brak pola i pusty string dają pustą listę", () => {
    expect(parseReviewPhotos(undefined)).toEqual([]);
    expect(parseReviewPhotos(null)).toEqual([]);
    expect(parseReviewPhotos("")).toEqual([]);
  });

  it("parsuje listę URL-i", () => {
    expect(parseReviewPhotos('["a","b"]')).toEqual(["a", "b"]);
  });

  it("zepsuty JSON zwraca null, a nie pustą listę — walidacja ma to odrzucić, nie przemilczeć", () => {
    expect(parseReviewPhotos("{")).toBeNull();
    expect(validateReviewPhotos(parseReviewPhotos("{"), SB)).toEqual({ ok: false, error: "url" });
  });
});
```

- [ ] **Krok 2: Uruchom test i potwierdź, że pada**

Run: `npx vitest run app/_lib/__tests__/reviews-photos.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_lib/reviews-photos"`.

- [ ] **Krok 3: Napisz moduł**

Utwórz `app/_lib/reviews-photos.ts`:

```ts
// Czysta logika zdjęć w opiniach — BEZ `server-only` i bez importów serwerowych.
// Ten moduł czyta zarówno akcja serwerowa, jak i ReviewCard, który renderuje się
// wewnątrz klienckiej karuzeli na stronie głównej. Wciągnięcie tu czegokolwiek
// z ./supabase/server wsysałoby next/headers do drzewa klienta.
//
// Wzorzec przepisany z order-issues.ts (isOwnIssuePhotoUrl + validateOrderIssueInput).
// Osobny moduł, a nie rozbudowa tamtego, bo różnią się dwie rzeczy, które MUSZĄ
// się różnić: prefiks w Storage (`opinie/` vs `order-issues/`) i limit (3 vs 5).

// Limit zdjęć na jedną opinię. Ta sama liczba stoi w trzech bramkach: widżet nie
// pozwala wybrać czwartego, zapis odrzuca payload, a `check` w migracji 79
// odrzuca wiersz. Zmiana limitu to zmiana we WSZYSTKICH trzech.
export const MAX_REVIEW_PHOTOS = 3;

// Katalog w buckecie `products`. Reklamacje siedzą pod `order-issues/` i te
// prefiksy muszą zostać rozdzielne: gdyby opinie przyjmowały `order-issues/`,
// dowolne zdjęcie z reklamacji dałoby się wstawić do PUBLICZNEJ opinii samym
// przepisaniem URL-a w payloadzie.
export const REVIEW_PHOTO_DIR = "opinie";

export function reviewPhotoPrefix(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/products/${REVIEW_PHOTO_DIR}/`;
}

// Czy URL pochodzi z NASZEGO Storage i z katalogu opinii. Bez tego ktoś wstawi
// do opinii dowolny obrazek z internetu — a opinia ląduje na stronie głównej.
// supabaseUrl = NEXT_PUBLIC_SUPABASE_URL, przekazywane przez wołającego.
export function isOwnReviewPhotoUrl(url: unknown, supabaseUrl: string): boolean {
  if (!supabaseUrl) return false;
  return typeof url === "string" && url.startsWith(reviewPhotoPrefix(supabaseUrl));
}

export type ReviewPhotosValidation =
  | { ok: true; value: string[] }
  | { ok: false; error: "count" | "url" };

// Bramka na zapis opinii — woła ją i ścieżka zalogowanego (/api/reviews),
// i ścieżka gościa (app/opinia/[token]/actions.ts).
//
// `undefined` znaczy „klient nie przysłał pola" i jest poprawnym brakiem zdjęć.
// Każda inna wartość, która nie jest tablicą (w tym `null` z zepsutego JSON-a),
// jest BŁĘDEM, nie brakiem — inaczej uszkodzony payload cicho gubiłby zdjęcia
// przy edycji istniejącej opinii.
export function validateReviewPhotos(
  photos: unknown,
  supabaseUrl: string
): ReviewPhotosValidation {
  if (photos === undefined) return { ok: true, value: [] };
  if (!Array.isArray(photos)) return { ok: false, error: "url" };
  // Limit PRZED prefiksem: komunikat „maksymalnie 3 zdjęcia" jest dla klienta
  // czytelniejszy niż „nieprawidłowe zdjęcie", gdy zawiniły oba warunki naraz.
  if (photos.length > MAX_REVIEW_PHOTOS) return { ok: false, error: "count" };
  if (!photos.every((p) => isOwnReviewPhotoUrl(p, supabaseUrl))) {
    return { ok: false, error: "url" };
  }
  return { ok: true, value: photos as string[] };
}

// Formularz gościa jedzie FormData, więc listę URL-i niesie JSON w jednym polu
// (ten sam wzorzec, co `photos` w submitOrderIssue). Zwraca `unknown`, bo
// rozstrzyganie należy do validateReviewPhotos — tu tylko odpakowujemy.
export function parseReviewPhotos(raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") return [];
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    // NIE `[]`: zepsuty JSON to błąd payloadu. Zwrócenie pustej listy
    // zapisałoby opinię BEZ zdjęć i klient nie dowiedziałby się dlaczego.
    return null;
  }
}
```

- [ ] **Krok 4: Uruchom test i potwierdź, że przechodzi**

Run: `npx vitest run app/_lib/__tests__/reviews-photos.test.ts`
Expected: PASS, wszystkie przypadki.

- [ ] **Krok 5: Dopisz `photos` do typu `ProductReview`**

W `app/_lib/types.ts`, w typie `ProductReview`, POD polem `moderated_at` (pola z migracji stoją w kolejności migracji) dopisz:

```ts
  // Publiczne URL-e zdjęć dołączonych przez klienta (migracja 79), do trzech.
  // Warstwa danych normalizuje brak kolumny do [] (patrz reviews.ts), więc
  // komponenty mogą mapować bez sprawdzania. NIE jest opcjonalne w typie,
  // bo kolumna ma `not null default '{}'`.
  photos: string[];
```

- [ ] **Krok 6: Napisz migrację**

Utwórz `supabase/migrations/79_opinie_zdjecia.sql`:

```sql
-- ============================================================
-- Migracja 79: zdjęcia w opiniach klientów
-- ============================================================
-- Tablica publicznych URL-i w wierszu opinii, dokładnie jak order_issues.photos.
-- Osobna tabela review_photos miałaby sens tylko przy moderacji pojedynczych
-- zdjęć, której właściciel NIE chce — dokładałaby join do każdego odczytu
-- opinii (strona główna, /opinie, karta produktu, panel) i nic nie dawała.
--
-- ⚠️ WSTECZNA ZGODNOŚĆ: kolumna ma default '{}', więc stary kod na produkcji
-- (nieznający pola) zapisuje opinie dalej. Odwrotna kolejność NIE jest
-- bezpieczna: nowy kod wysyła `photos` w każdym zapisie, a PostgREST odrzuca
-- CAŁY payload z nieznaną kolumną (PGRST204). Migracja przed mergem.
alter table public.product_reviews
  add column if not exists photos text[] not null default '{}';

-- Trzecia (ostatnia) bramka limitu — odbicie MAX_REVIEW_PHOTOS
-- z app/_lib/reviews-photos.ts. Widżet i walidacja zapisu stoją wcześniej,
-- ale klucz anon jest jawny w paczce przeglądarki, a sesja siedzi
-- w ciasteczku, więc zapis da się wywołać bezpośrednim REST-em z pominięciem
-- obu wcześniejszych bramek.
--
-- `array_length(photos, 1) is null` to PUSTA tablica: array_length pustej
-- tablicy zwraca NULL, nie 0, a NULL w warunku checka nie jest prawdą — bez
-- tego członu constraint odrzucałby każdą opinię BEZ zdjęć.
alter table public.product_reviews
  drop constraint if exists product_reviews_max_3_zdjecia;

alter table public.product_reviews
  add constraint product_reviews_max_3_zdjecia
  check (array_length(photos, 1) is null or array_length(photos, 1) <= 3);
```

⚠️ **Nie aplikuj tej migracji.** Twoim wynikiem jest plik. Aplikuje kontroler, ręcznie, po decyzji właściciela.

- [ ] **Krok 7: Pełny zestaw testów i typy**

Run: `npm test`
Expected: wszystkie zielone (poprzednio 1640 + nowe z tego zadania).

Run: `npx tsc --noEmit`
Expected: exit 0. Jeśli `photos: string[]` wywoła błędy tam, gdzie `ProductReview` powstaje z literału — NIE rób pola opcjonalnym; dopisz `photos: []` w tych miejscach i wymień je w raporcie.

- [ ] **Krok 8: Commit**

```bash
git add supabase/migrations/79_opinie_zdjecia.sql app/_lib/reviews-photos.ts app/_lib/__tests__/reviews-photos.test.ts app/_lib/types.ts
git commit -m "feat(opinie): migracja 79 i czysta walidacja zdjęć w opiniach"
```

---

### Zadanie 2: Serwerowe akcje wgrywania zdjęcia (zalogowany i gość)

Storage nie zna polityk RLS z tabeli `product_reviews`, więc uprawnienie do
wgrania pliku sprawdza akcja. Bez tego każdy zalogowany dostaje darmowy hosting
obrazków na naszej domenie Supabase.

**Files:**
- Modify: `app/produkt/actions.ts` (dopisz na końcu pliku)
- Modify: `app/opinia/[token]/actions.ts` (dopisz PRZED `submitGuestReview`)

**Interfaces:**
- Consumes: `REVIEW_PHOTO_DIR` z `app/_lib/reviews-photos.ts` (Zadanie 1).
- Produces:
  - `uploadReviewPhoto(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }>` — pola FormData: `photo` (File), `product_id` (string)
  - `uploadGuestReviewPhoto(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }>` — pola FormData: `photo` (File), `token` (string)
  - typ `UploadReviewPhotoResult` eksportowany z `app/produkt/actions.ts`

- [ ] **Krok 1: Akcja dla zalogowanego**

W `app/produkt/actions.ts` dopisz importy, których brakuje (`randomUUID` z `node:crypto`, `validateImageUpload` z `@/app/_lib/image-upload`, `REVIEW_PHOTO_DIR` z `@/app/_lib/reviews-photos`, `getReviewStatus` z `@/app/_lib/reviews`) i na końcu pliku:

```ts
export type UploadReviewPhotoResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

// Wgranie JEDNEGO zdjęcia do opinii — ścieżka ZALOGOWANEGO. Wzorzec 1:1
// z uploadIssuePhoto (app/konto/zamowienia/actions.ts): walidacja wspólnym
// validateImageUpload (bez SVG), upload service-rolem do bucketa `products`,
// zwrot publicznego URL-a. Trzy świadome różnice wobec reklamacji:
//
// 1. Prefiks `opinie/`, nie `order-issues/` — patrz komentarz przy
//    REVIEW_PHOTO_DIR. Rozdzielność tych katalogów jest bramką, nie porządkiem.
// 2. Bramka to nie „ktokolwiek zalogowany", tylko warunek zakupu — ten sam,
//    który przepuszcza opinię (migracja 78, bramka COD z 46). Wołamy
//    getReviewStatus zamiast przepisywać warunek trzeci raz: gdyby reguła
//    „zweryfikowanego zakupu" kiedyś się zmieniła, ma się zmienić w jednym
//    miejscu, a nie w tabeli, w API i tutaj.
// 3. Plik przychodzi już przekodowany do JPEG przez prepareReviewPhoto
//    w przeglądarce (EXIF/GPS i HEIC — patrz image-compress.ts). Serwer tego
//    NIE zakłada: `ext` bierze się z allowlistowanego mime, nie ze stałej.
export async function uploadReviewPhoto(
  formData: FormData
): Promise<UploadReviewPhotoResult> {
  const de = (await getLocale()) === "de";
  const tr = (pl: string, deTxt: string) => (de ? deTxt : pl);

  const productId = sanitize(formData.get("product_id"), 64);
  if (!productId) {
    return { ok: false, error: tr("Nieprawidłowy produkt", "Ungültiges Produkt") };
  }

  const { canReview } = await getReviewStatus(productId);
  if (!canReview) {
    return {
      ok: false,
      error: tr(
        "Nie możesz dodać zdjęcia — weryfikujemy zakupy klientów.",
        "Sie können kein Foto hinzufügen — wir prüfen die Käufe der Kunden."
      ),
    };
  }

  const valid = validateImageUpload(formData.get("photo"));
  if (!valid.ok) return { ok: false, error: valid.error };

  const path = `${REVIEW_PHOTO_DIR}/${Date.now()}-${randomUUID()}.${valid.ext}`;
  const admin = await createAdminClient();
  const { error } = await admin.storage
    .from("products")
    .upload(path, valid.file, {
      contentType: valid.contentType,
      cacheControl: "3600",
      upsert: false,
    });
  if (error) {
    // Treść błędu ze Storage nie idzie do klienta (ujawnia ścieżki i bucket).
    console.error("[opinie] upload zdjęcia nieudany:", error.message);
    return {
      ok: false,
      error: tr(
        "Nie udało się wysłać zdjęcia — spróbuj ponownie",
        "Das Foto konnte nicht gesendet werden — bitte erneut versuchen"
      ),
    };
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("products").getPublicUrl(path);
  return { ok: true, url: publicUrl };
}
```

- [ ] **Krok 2: Akcja dla gościa**

W `app/opinia/[token]/actions.ts` dopisz brakujące importy (`randomUUID` z `node:crypto`, `validateImageUpload` z `@/app/_lib/image-upload`, `REVIEW_PHOTO_DIR` z `@/app/_lib/reviews-photos`) i PRZED `submitGuestReview`:

```ts
export type UploadGuestReviewPhotoResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

// Wgranie JEDNEGO zdjęcia do opinii — ścieżka GOŚCIA. Uprawnieniem jest ważny
// token z zaproszenia, dokładnie jak przy zapisie opinii niżej.
//
// Token zużywa się (markInviteUsed) DOPIERO po udanym zapisie opinii, więc trzy
// uploady na jednym tokenie działają, a po wysłaniu opinii link przestaje
// otwierać cokolwiek — także tę akcję.
//
// Ten sam komunikat dla „nie ma takiego" i „nieważny": nie podpowiadamy
// zgadującemu, czy trafił w istniejący token.
export async function uploadGuestReviewPhoto(
  formData: FormData
): Promise<UploadGuestReviewPhotoResult> {
  const token = String(formData.get("token") ?? "");
  const invite = await findInviteByToken(token);
  if (!invite || inviteState(invite, new Date()) !== "ok") {
    return { ok: false, error: "Link jest nieprawidłowy lub stracił ważność" };
  }

  const valid = validateImageUpload(formData.get("photo"));
  if (!valid.ok) return { ok: false, error: valid.error };

  const path = `${REVIEW_PHOTO_DIR}/${Date.now()}-${randomUUID()}.${valid.ext}`;
  const admin = await createAdminClient();
  const { error } = await admin.storage
    .from("products")
    .upload(path, valid.file, {
      contentType: valid.contentType,
      cacheControl: "3600",
      upsert: false,
    });
  if (error) {
    console.error("[opinie] upload zdjęcia gościa nieudany:", error.message);
    return { ok: false, error: "Nie udało się wysłać zdjęcia — spróbuj ponownie" };
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("products").getPublicUrl(path);
  return { ok: true, url: publicUrl };
}
```

⚠️ Strona gościa jest po polsku (bez wariantu DE) — patrz `GuestReviewForm.tsx`.
Nie dokładaj tu `getLocale`/`tr`.

- [ ] **Krok 3: Typy i build**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run lint`
Expected: exit 0.

- [ ] **Krok 4: Commit**

```bash
git add app/produkt/actions.ts "app/opinia/[token]/actions.ts"
git commit -m "feat(opinie): serwerowe wgrywanie zdjęcia do opinii (konto i gość)"
```

---

### Zadanie 3: Przekodowanie w przeglądarce i wspólny widżet wyboru zdjęć

**Files:**
- Modify: `app/_lib/image-compress.ts` (dopisz obok `compressIfNeeded`)
- Create: `app/_components/ui/ReviewPhotoPicker.tsx`

**Interfaces:**
- Consumes: `MAX_REVIEW_PHOTOS` z `app/_lib/reviews-photos.ts` (Zadanie 1).
- Produces:
  - `prepareReviewPhoto(file: File): Promise<File>` — RZUCA przy nieudanym przekodowaniu
  - `type ReviewPhotoPickerTeksty = { label; hint; add; uploading; alt; remove; prepareFailed }` (wszystkie `string`)
  - domyślny eksport `ReviewPhotoPicker` z propsami `{ photos: string[]; onChange: React.Dispatch<React.SetStateAction<string[]>>; upload: (fd: FormData) => Promise<{ ok: true; url: string } | { ok: false; error: string }>; teksty: ReviewPhotoPickerTeksty; disabled?: boolean }`

- [ ] **Krok 1: `prepareReviewPhoto`**

W `app/_lib/image-compress.ts` dopisz pod `compressIfNeeded`:

```ts
// Zdjęcie do PUBLICZNEJ opinii. Inaczej niż compressIfNeeded, przekodowanie
// jest BEZWARUNKOWE i nie ma fallbacku „zwróć oryginał" — z dwóch powodów,
// z których żaden nie dotyczy rozmiaru pliku:
//
// 1. EXIF z GPS-em. Zdjęcie z telefonu niesie współrzędne. W reklamacji ląduje
//    w panelu Julii; w opinii ląduje na STRONIE GŁÓWNEJ sklepu, czyli
//    opublikowalibyśmy adres domowy klientki. Przerysowanie przez canvas
//    metadane gubi, ale tylko wtedy, gdy faktycznie następuje — a
//    compressIfNeeded przepuszcza plik poniżej 800 KB nietknięty.
// 2. HEIC z iPhone'a. validateImageUpload przyjmuje wyłącznie JPG/PNG/WebP/AVIF,
//    więc bez konwersji klientka z iPhonem dostaje „nieprawidłowy format"
//    i nie doda nic (ten sam problem, co „zdjęcia się nie dodają" w panelu).
//
// Dlatego przy błędzie RZUCAMY zamiast zwracać oryginał: fallback przepuściłby
// jedno i drugie. Wołający ma pokazać komunikat, co zrobić.
export async function prepareReviewPhoto(file: File): Promise<File> {
  const imageCompression = (await import("browser-image-compression")).default;
  return await imageCompression(file, {
    maxSizeMB: 1,
    // 1600 px wystarcza na miniaturę na home, siatkę na /opinie i podgląd
    // w panelu; 2400 px z compressIfNeeded jest dla zdjęć produktowych admina.
    maxWidthOrHeight: 1600,
    // useWebWorker: false — worker ładowałby kod przez importScripts, co blokuje
    // CSP (script-src 'strict-dynamic'). Tak samo jak w compressIfNeeded.
    useWebWorker: false,
    fileType: "image/jpeg",
    initialQuality: 0.82,
  });
}
```

⚠️ Nie dopisuj tu `try/catch`. Brak fallbacku JEST wymaganiem.

- [ ] **Krok 2: Widżet**

Utwórz `app/_components/ui/ReviewPhotoPicker.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { prepareReviewPhoto } from "@/app/_lib/image-compress";
import { MAX_REVIEW_PHOTOS } from "@/app/_lib/reviews-photos";

// Wspólny widżet zdjęć dla OBU formularzy opinii — zalogowanego (ReviewForm)
// i gościa (GuestReviewForm). Te formularze różnią się wszystkim poza tym
// fragmentem: jeden jest dwujęzyczny i strzela fetchem do /api/reviews, drugi
// jest polski i woła akcję serwerową.
//
// Dlatego widżet nie zna ani języka, ani sposobu wysyłki: teksty przychodzą
// propem (każdy formularz ma własne źródło tekstów), a `upload` to domknięcie
// od rodzica, które dokłada do FormData swoje pole uprawnienia — `product_id`
// dla zalogowanego, `token` dla gościa. Widżet ustawia wyłącznie `photo`.

export type ReviewPhotoPickerTeksty = {
  label: string;
  hint: string;
  add: string;
  uploading: string;
  alt: string;
  remove: string;
  prepareFailed: string;
};

export default function ReviewPhotoPicker({
  photos,
  onChange,
  upload,
  teksty,
  disabled = false,
}: {
  photos: string[];
  onChange: React.Dispatch<React.SetStateAction<string[]>>;
  upload: (
    fd: FormData
  ) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  teksty: ReviewPhotoPickerTeksty;
  disabled?: boolean;
}) {
  const [wysylanie, setWysylanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset PRZED await: bez tego wybranie DRUGI RAZ tego samego pliku nie
    // odpala zdarzenia change (wzorzec z OrderIssueModal).
    e.target.value = "";
    if (!file || photos.length >= MAX_REVIEW_PHOTOS) return;
    setBlad(null);
    setWysylanie(true);
    try {
      let doWyslania: File;
      try {
        doWyslania = await prepareReviewPhoto(file);
      } catch {
        // Świadomie NIE wysyłamy oryginału: nieudane przekodowanie znaczy albo
        // HEIC, którego serwer i tak odrzuci, albo plik, z którego nie zdjęto
        // EXIF-u — a ten poszedłby na stronę główną. Patrz prepareReviewPhoto.
        setBlad(teksty.prepareFailed);
        return;
      }
      const fd = new FormData();
      fd.set("photo", doWyslania, doWyslania.name);
      const res = await upload(fd);
      if (res.ok)
        // Funkcjonalnie, bo między pick a upload może wylądować usunięcie.
        // Snapshot przepuściłby zmieniony plik. Re-check limitu w append.
        onChange((prev) =>
          prev.length >= MAX_REVIEW_PHOTOS ? prev : [...prev, res.url]
        );
      else setBlad(res.error);
    } finally {
      setWysylanie(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        {teksty.label}
      </span>

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 max-w-[240px]">
          {photos.map((url, i) => (
            <li
              key={url}
              className="relative aspect-square rounded-lg overflow-hidden border border-[var(--border)]"
            >
              <Image src={url} alt={`${teksty.alt} ${i + 1}`} fill sizes="80px" className="object-cover" />
              <button
                type="button"
                onClick={() => onChange((prev) => prev.filter((u) => u !== url))}
                aria-label={teksty.remove}
                className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white text-xs"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {photos.length < MAX_REVIEW_PHOTOS && (
        <label className="self-start px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors cursor-pointer">
          {wysylanie ? teksty.uploading : teksty.add}
          <input
            type="file"
            accept="image/*"
            disabled={disabled || wysylanie}
            onChange={onPick}
            className="hidden"
          />
        </label>
      )}

      <span className="text-[11px] text-[var(--muted)]">{teksty.hint}</span>

      {blad && <span className="text-xs text-red-600 dark:text-red-400">{blad}</span>}
    </div>
  );
}
```

⚠️ `accept="image/*"` (nie lista rozszerzeń): telefon musi móc podać HEIC, bo to
`prepareReviewPhoto` zamienia go na JPEG. Zawężenie `accept` do JPG/PNG ukryłoby
zdjęcia z iPhone'a w oknie wyboru pliku.

- [ ] **Krok 3: Typy, lint, build**

Run: `npx tsc --noEmit` — exit 0.
Run: `npm run lint` — exit 0.
Run: `npm run build` — exit 0. (Widżet nie jest jeszcze nigdzie użyty; build ma potwierdzić, że `MAX_REVIEW_PHOTOS` da się zaimportować do drzewa klienckiego.)

- [ ] **Krok 4: Commit**

```bash
git add app/_lib/image-compress.ts app/_components/ui/ReviewPhotoPicker.tsx
git commit -m "feat(opinie): widżet zdjęć i bezwarunkowe przekodowanie do JPEG"
```

---

### Zadanie 4: Ścieżka zalogowanego — formularz i zapis w `/api/reviews`

**Files:**
- Modify: `app/_components/ui/ReviewForm.tsx`
- Modify: `app/api/reviews/route.ts`

**Interfaces:**
- Consumes: `ReviewPhotoPicker` + `ReviewPhotoPickerTeksty` (Zadanie 3), `uploadReviewPhoto` z `app/produkt/actions.ts` (Zadanie 2), `validateReviewPhotos` i `MAX_REVIEW_PHOTOS` (Zadanie 1).
- Produces: `/api/reviews` POST przyjmuje pole `photos: string[]` w body JSON.

- [ ] **Krok 1: Teksty w formularzu**

W `app/_components/ui/ReviewForm.tsx` dopisz do obu obiektów `c` (DE i PL) nowe klucze.

DE:

```ts
        photosLabel: "Fotos (optional)",
        photosHint: "Bis zu 3 Fotos. Wir zeigen sie öffentlich zusammen mit Ihrer Bewertung.",
        addPhoto: "Foto hinzufügen",
        uploadingPhoto: "Wird gesendet...",
        photoAlt: "Foto zur Bewertung",
        removePhoto: "Foto entfernen",
        photoPrepareFailed:
          "Das Foto konnte nicht vorbereitet werden. Wenn es eine HEIC-Datei vom iPhone ist, senden Sie es direkt vom Telefon oder speichern Sie es als JPG.",
```

PL:

```ts
        photosLabel: "Zdjęcia (opcjonalnie)",
        photosHint: "Do 3 zdjęć. Pokażemy je publicznie razem z opinią.",
        addPhoto: "Dodaj zdjęcie",
        uploadingPhoto: "Wysyłam...",
        photoAlt: "Zdjęcie do opinii",
        removePhoto: "Usuń zdjęcie",
        photoPrepareFailed:
          "Nie udało się przygotować zdjęcia. Jeśli to plik HEIC z iPhone'a, wyślij zdjęcie prosto z telefonu albo zapisz je jako JPG.",
```

⚠️ „Pokażemy je publicznie razem z opinią" to nie jest ozdobnik — od części 1/2
opinia publikuje się natychmiast, więc klient MUSI wiedzieć przed wysłaniem,
że jego zdjęcie od razu trafia na witrynę.

- [ ] **Krok 2: Stan i widżet**

Dopisz import `ReviewPhotoPicker` i `uploadReviewPhoto`, oraz stan:

```tsx
  // Prefill z istniejącej opinii: edycja wysyła PEŁNĄ listę zdjęć, więc bez
  // tego pierwsza edycja skasowałaby zdjęcia dodane przy pierwszym zapisie.
  const [photos, setPhotos] = useState<string[]>(existingReview?.photos ?? []);
```

Pod blokiem `<textarea>` (a NAD blokiem `{error && ...}`) wstaw:

```tsx
      <ReviewPhotoPicker
        photos={photos}
        onChange={setPhotos}
        disabled={loading}
        upload={async (fd) => {
          fd.set("product_id", productId);
          return uploadReviewPhoto(fd);
        }}
        teksty={{
          label: c.photosLabel,
          hint: c.photosHint,
          add: c.addPhoto,
          uploading: c.uploadingPhoto,
          alt: c.photoAlt,
          remove: c.removePhoto,
          prepareFailed: c.photoPrepareFailed,
        }}
      />
```

W `onSubmit` zmień ciało żądania na:

```tsx
        body: JSON.stringify({ productId, rating, comment, photos }),
```

W `onDelete`, obok `setRating(0)` i `setComment("")`, dopisz `setPhotos([])` —
inaczej po usunięciu opinii formularz nadal pokazuje jej zdjęcia.

- [ ] **Krok 3: Walidacja i zapis w `/api/reviews`**

W `app/api/reviews/route.ts`:

Rozszerz typ `Body`:

```ts
type Body = {
  productId: string;
  rating: number;
  comment?: string;
  // `unknown`, nie `string[]` — to jest payload z internetu, a nie obietnica.
  // Rozstrzyga validateReviewPhotos.
  photos?: unknown;
};
```

Dopisz import `validateReviewPhotos` z `@/app/_lib/reviews-photos` i wstaw
walidację ZARAZ POD blokiem sprawdzającym zakres oceny (przed
`const trimmedComment`):

```ts
  // Bramka druga z trzech (widżet, tutaj, `check` w migracji 79). Ta jest
  // jedyną, której nie da się ominąć z konsoli przeglądarki mając ważną sesję.
  // Prefiks pilnuje, żeby do opinii nie wjechał dowolny obrazek z internetu —
  // opinia ląduje na stronie głównej sklepu.
  const zdjecia = validateReviewPhotos(
    body.photos,
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  );
  if (!zdjecia.ok) {
    return NextResponse.json(
      {
        error:
          zdjecia.error === "count"
            ? tr("Maksymalnie 3 zdjęcia", "Maximal 3 Fotos")
            : tr("Nieprawidłowe zdjęcie", "Ungültiges Foto"),
      },
      { status: 400 }
    );
  }
```

W obiekcie przekazywanym do `.upsert(...)` dopisz, pod `comment`:

```ts
        // Zapisujemy PEŁNĄ listę, także pustą — edycja opinii jest wymianą
        // stanu, nie doklejaniem. Formularz prefillowuje listę z istniejącej
        // opinii, więc pusta lista tutaj znaczy „klient skasował zdjęcia",
        // a nie „klient nic nie przysłał" (ten drugi przypadek odsiewa
        // validateReviewPhotos, zwracając [] wyłącznie dla braku pola).
        photos: zdjecia.value,
```

⚠️ NIE dodawaj sprzątania plików w Storage przy `DELETE` ani przy skróceniu
listy. Osierocone pliki są świadomym długiem (specyfikacja, sekcja 7) — ten sam,
co mają dziś reklamacje.

- [ ] **Krok 4: Testy, typy, build**

Run: `npm test` — zielone.
Run: `npx tsc --noEmit` — exit 0.
Run: `npm run build` — exit 0.

- [ ] **Krok 5: Commit**

```bash
git add app/_components/ui/ReviewForm.tsx app/api/reviews/route.ts
git commit -m "feat(opinie): zdjęcia w formularzu i zapisie opinii z konta"
```

---

### Zadanie 5: Ścieżka gościa — formularz z linku z maila i zapis

**Files:**
- Modify: `app/opinia/[token]/GuestReviewForm.tsx`
- Modify: `app/opinia/[token]/actions.ts` (funkcja `submitGuestReview`)

**Interfaces:**
- Consumes: `ReviewPhotoPicker` (Zadanie 3), `uploadGuestReviewPhoto` (Zadanie 2), `validateReviewPhotos` + `parseReviewPhotos` (Zadanie 1).
- Produces: nic dla dalszych zadań.

- [ ] **Krok 1: Widżet w formularzu gościa**

W `GuestReviewForm.tsx` dopisz importy `ReviewPhotoPicker` i `uploadGuestReviewPhoto`, stan `const [zdjecia, setZdjecia] = useState<string[]>([]);` (gość nigdy nie edytuje istniejącej opinii — link jest jednorazowy — więc bez prefillu),
a w `onSubmit`, tuż po `formData.set("rating", ...)`:

```tsx
    // Widżet trzyma listę URL-i w stanie Reacta, nie w polu formularza —
    // tak samo jak StarInput trzyma ocenę.
    formData.set("photos", JSON.stringify(zdjecia));
```

Pod blokiem `<textarea>` (nad `{blad && ...}`) wstaw widżet z polskimi tekstami —
ta strona nie ma wariantu DE:

```tsx
        <ReviewPhotoPicker
          photos={zdjecia}
          onChange={setZdjecia}
          disabled={pending}
          upload={async (fd) => {
            fd.set("token", token);
            return uploadGuestReviewPhoto(fd);
          }}
          teksty={{
            label: "Zdjęcia (opcjonalnie)",
            hint: "Do 3 zdjęć. Pokażemy je publicznie razem z opinią.",
            add: "Dodaj zdjęcie",
            uploading: "Wysyłam...",
            alt: "Zdjęcie do opinii",
            remove: "Usuń zdjęcie",
            prepareFailed:
              "Nie udało się przygotować zdjęcia. Jeśli to plik HEIC z iPhone'a, wyślij zdjęcie prosto z telefonu albo zapisz je jako JPG.",
          }}
        />
```

⚠️ `token` jest w propsach komponentu i w ukrytym polu formularza. Efekt
`replaceState` czyści go WYŁĄCZNIE z paska adresu — prop zostaje i to jego
używa upload.

- [ ] **Krok 2: Walidacja i zapis w akcji gościa**

W `app/opinia/[token]/actions.ts`, w `submitGuestReview`, dopisz import
`{ parseReviewPhotos, validateReviewPhotos }` z `@/app/_lib/reviews-photos`
i wstaw ZARAZ POD linią z `const tresc = ...`:

```ts
  const zdjecia = validateReviewPhotos(
    parseReviewPhotos(formData.get("photos")),
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  );
  if (!zdjecia.ok) {
    return {
      ok: false,
      error:
        zdjecia.error === "count"
          ? "Maksymalnie 3 zdjęcia"
          : "Nie udało się dołączyć zdjęcia — spróbuj dodać je jeszcze raz",
    };
  }
```

W obiekcie `.insert({...})` dopisz pod `comment`:

```ts
      photos: zdjecia.value,
```

⚠️ Kolejność ma znaczenie: walidacja zdjęć stoi PO walidacji oceny, imienia
i adresu, a PRZED zapisem — tak jak reszta. Nie przesuwaj jej przed sprawdzenie
tokenu, bo wtedy komunikat o zdjęciach potwierdzałby ważność cudzego tokenu.

- [ ] **Krok 3: Testy, typy, build**

Run: `npm test` — zielone.
Run: `npx tsc --noEmit` — exit 0.
Run: `npm run build` — exit 0.

- [ ] **Krok 4: Commit**

```bash
git add "app/opinia/[token]/GuestReviewForm.tsx" "app/opinia/[token]/actions.ts"
git commit -m "feat(opinie): zdjęcia w opinii gościa z linku z maila"
```

---

### Zadanie 6: Wyświetlanie zdjęć — home, /opinie, karta produktu

**Files:**
- Modify: `app/_lib/reviews.ts` (`getReviewsForProduct` i `withAuthorsAndProduct`)
- Modify: `app/_components/ui/ReviewCard.tsx`
- Modify: `app/opinie/page.tsx`
- Modify: `app/_components/ui/ReviewList.tsx`
- Modify: `app/produkt/[id]/page.tsx` (ok. linia 504, użycie `<ReviewList>`)

**Interfaces:**
- Consumes: `ProductReview.photos` (Zadanie 1), `MAX_REVIEW_PHOTOS` (Zadanie 1).
- Produces:
  - `ReviewCard` przyjmuje opcjonalny prop `wariant?: "slider" | "pelna"` (domyślnie `"slider"`)
  - `ReviewList` przyjmuje wymagany prop `productName: string`

- [ ] **Krok 1: Normalizacja w warstwie danych (fail-soft przed migracją)**

W `app/_lib/reviews.ts`, w KAŻDYM z trzech miejsc budujących wynik
(dwa `return` w `getReviewsForProduct` i jeden w `withAuthorsAndProduct`),
dopisz do zwracanego obiektu:

```ts
    // Dopóki migracja 79 nie jest zaaplikowana, `select("*")` NIE zwraca
    // kolumny `photos` i pole jest `undefined` — a komponenty na niej mapują.
    // Normalizacja siedzi w warstwie danych, bo to jedyne miejsce, które wie,
    // że wiersz przyszedł z bazy. To ta sama zasada, co fail-soft przy
    // migracji 76 (patrz komentarz nad getHomepageReviews).
    photos: Array.isArray(r.photos) ? r.photos : [],
```

(w `withAuthorsAndProduct` wiersz nazywa się `rest`, nie `r` — użyj właściwej nazwy).

- [ ] **Krok 2: Miniatury i wariant w `ReviewCard`**

W `app/_components/ui/ReviewCard.tsx`:

Dopisz importy `Image` z `next/image` i `MAX_REVIEW_PHOTOS` z `@/app/_lib/reviews-photos`.

Rozszerz sygnaturę:

```tsx
export default function ReviewCard({
  review,
  locale,
  wariant = "slider",
}: {
  review: PublicReview;
  locale: Locale;
  // "slider" — kafelek na stronie głównej: cytat obcięty do 6 linii, miniatury
  //   72 px. "pelna" — siatka na /opinie: cała treść i większe zdjęcia.
  // Bez tego wariantu obietnica z komentarza niżej („pełna treść jest zawsze
  // dostępna na /opinie") była nieprawdziwa: /opinie renderuje TEN SAM
  // komponent, więc obcinało też tam i przycisk pod sliderem prowadził do
  // strony z dokładnie tak samo przyciętymi opiniami.
  wariant?: "slider" | "pelna";
}) {
  const author = anonymizeAuthor(review.author_name, locale);
  const de = locale === "de";
  const pelna = wariant === "pelna";
  const zdjecia = review.photos ?? [];
  const altBazowy = de
    ? `Kundenfoto zur Bewertung von ${review.product_name ?? "dem Produkt"}`
    : `Zdjęcie od klienta do opinii o ${review.product_name ?? "produkcie"}`;
```

W `<blockquote>` zamień stałą klasę `line-clamp-6` na warunkową:

```tsx
        <blockquote
          className={`whitespace-pre-wrap leading-relaxed text-[var(--fg)] ${pelna ? "" : "line-clamp-6"}`}
        >
```

ZARAZ POD zamknięciem `</div>` opakowującego `blockquote` (czyli POZA opakowaniem
z `flex-1`, przed `<figcaption>`) wstaw:

```tsx
      {/* Miniatury stoją POD cytatem jako osobny rząd, a nie w opakowaniu
          z `flex-1`. To opakowanie ma rosnąć do wysokości najwyższej karty
          w rzędzie — wrzucenie do niego zdjęć zabrałoby cytatowi wysokość
          i przywróciło usterkę obcinania, którą naprawił commit 33cf0cc.
          Bez lightboxa i bez linku: cała karta w sliderze prowadzi do produktu,
          a druga akcja w tym samym kafelku to pułapka na dotyku. */}
      {zdjecia.length > 0 && (
        <ul className={pelna ? "grid grid-cols-3 gap-2" : "flex gap-2"}>
          {zdjecia.slice(0, MAX_REVIEW_PHOTOS).map((url, i) => (
            <li
              key={url}
              className={`relative aspect-square rounded-lg overflow-hidden border border-[var(--border)] ${pelna ? "" : "w-[72px] shrink-0"}`}
            >
              <Image
                src={url}
                alt={`${altBazowy} (${i + 1})`}
                fill
                sizes={pelna ? "200px" : "72px"}
                className="object-cover"
              />
            </li>
          ))}
        </ul>
      )}
```

⚠️ `slice(0, MAX_REVIEW_PHOTOS)` nie jest paranoją: `check` w bazie wchodzi
razem z migracją 79, a wiersze zapisane w oknie między migracją a deployem
kodu (albo przez przyszłą zmianę limitu) mogą mieć więcej. Karta ma wtedy
wyglądać znośnie, a nie rozjechać slider.

- [ ] **Krok 3: `/opinie` bierze wariant pełny**

W `app/opinie/page.tsx`, w mapowaniu:

```tsx
            <ReviewCard key={r.id} review={r} locale={locale} wariant="pelna" />
```

Popraw też komentarz nad `ReviewCard` w `ReviewCard.tsx` w miejscu, gdzie mówi
o „pełnej treści dostępnej na /opinie" — teraz jest to prawdą dzięki wariantowi,
więc zdanie ma się do niego odwoływać, a nie zostawiać czytelnika z założeniem.

- [ ] **Krok 4: Zdjęcia na karcie produktu**

W `app/_components/ui/ReviewList.tsx` dopisz import `Image` z `next/image`
i `MAX_REVIEW_PHOTOS`, rozszerz sygnaturę o `productName: string`:

```tsx
export default async function ReviewList({
  reviews,
  productName,
}: {
  reviews: ProductReview[];
  // Do treści `alt` przy zdjęciach. Karta produktu zna nazwę, a opinia
  // (ProductReview) — w odróżnieniu od PublicReview — jej nie niesie.
  productName: string;
}) {
```

W obu obiektach `c` dopisz klucz `photoAlt`:

- DE: `photoAlt: \`Kundenfoto zur Bewertung von ${productName}\``
- PL: `photoAlt: \`Zdjęcie od klienta do opinii o ${productName}\``

(uwaga: `c` jest budowane przed tym, więc użyj interpolacji z propsa — prop jest
dostępny w ciele funkcji).

Pod blokiem `{r.comment && (...)}` wstaw:

```tsx
          {(r.photos ?? []).length > 0 && (
            <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3 max-w-md">
              {(r.photos ?? []).slice(0, MAX_REVIEW_PHOTOS).map((url, i) => (
                <li
                  key={url}
                  className="relative aspect-square rounded-lg overflow-hidden border border-[var(--border)]"
                >
                  <Image
                    src={url}
                    alt={`${c.photoAlt} (${i + 1})`}
                    fill
                    sizes="160px"
                    className="object-cover"
                  />
                </li>
              ))}
            </ul>
          )}
```

W `app/produkt/[id]/page.tsx` (ok. linia 504) przekaż nazwę:

```tsx
          <ReviewList reviews={reviews} productName={product.name} />
```

- [ ] **Krok 5: Testy, typy, build**

Run: `npm test` — zielone.
Run: `npx tsc --noEmit` — exit 0.
Run: `npm run build` — exit 0.

- [ ] **Krok 6: Commit**

```bash
git add app/_lib/reviews.ts app/_components/ui/ReviewCard.tsx app/_components/ui/ReviewList.tsx app/opinie/page.tsx "app/produkt/[id]/page.tsx"
git commit -m "feat(opinie): zdjęcia na stronie głównej, /opinie i karcie produktu"
```

---

### Zadanie 7: Panel Julii i mail — zdjęcie musi być widoczne przed decyzją

Zdjęcie publikuje się bez sprawdzenia (wariant A z części 1/2), więc panel jest
JEDYNYM miejscem, w którym właścicielka może je zobaczyć i zdjąć opinię ze
strony. Panel ślepy na zdjęcia unieważniałby cały ten model.

**Files:**
- Modify: `app/_lib/reviews-admin.ts` (`getReviewsForBucket`, `ReviewForMail`, `getReviewForMail`)
- Modify: `app/admin/opinie/OpinieList.tsx` (komponent `Wiersz`, ok. linia 179)
- Modify: `app/_lib/mail/templates/AdminNewReview.tsx`
- Modify: `app/_lib/mail/__tests__/mail-review-notify.test.ts`

**Interfaces:**
- Consumes: `ProductReview.photos` (Zadanie 1), `MAX_REVIEW_PHOTOS` (Zadanie 1).
- Produces: `ReviewForMail.photos_count: number`.

- [ ] **Krok 1: Normalizacja i liczba zdjęć w warstwie panelu**

W `getReviewsForBucket`, w końcowym `rows.map(...)`, dopisz `photos: Array.isArray(r.photos) ? r.photos : [],` — z tym samym uzasadnieniem, co w `reviews.ts` (przed migracją 79 kolumny nie ma).

W typie `ReviewForMail` dopisz:

```ts
  // Liczba zdjęć, nie same URL-e: mail ma powiedzieć Julii, że jest CO obejrzeć,
  // a oglądanie odbywa się w panelu. Wklejanie publicznych URL-i do maila
  // rozsyłałoby zdjęcia klientów poza witrynę.
  photos_count: number;
```

W `getReviewForMail` dopisz `photos` do `.select(...)`, do typu lokalnego `r`
oraz do zwracanego obiektu:

```ts
    photos_count: Array.isArray(r.photos) ? r.photos.length : 0,
```

- [ ] **Krok 2: Wzmianka o zdjęciach w mailu**

W `app/_lib/mail/templates/AdminNewReview.tsx` dopisz `"photos_count"` do `Pick<...>`
w typie propsa `opinia` i wstaw POD akapitem z treścią opinii (a NAD `MailButton`):

```tsx
      {/* Sama liczba, nie zdjęcia. Osadzenie zdjęć klienta w mailu wysłałoby je
          poza witrynę (i poza kontrolę nad tym, gdzie wylądują), a decyzja
          o zdjęciu opinii ze strony i tak zapada w panelu — mail ma tylko
          powiedzieć, że jest CO obejrzeć. */}
      {opinia.photos_count > 0 && (
        <Text style={{ color: c.muted, fontSize: "13px", margin: "0 0 24px" }}>
          {opinia.photos_count === 1
            ? "Klient dołączył 1 zdjęcie — jest już widoczne na stronie."
            : `Klient dołączył ${opinia.photos_count} zdjęcia — są już widoczne na stronie.`}
        </Text>
      )}
```

⚠️ Polska odmiana: 2 i 3 to „zdjęcia", więc przy limicie 3 warianty „1" i „N"
wystarczają. Gdyby limit kiedyś urósł powyżej 4, trzeba dodać „zdjęć".

- [ ] **Krok 3: Testy maila**

W `app/_lib/__tests__/mail-review-notify.test.ts` dopisz `photos_count: 0` do
stałej `OPINIA` (inaczej typ się rozjedzie) i dodaj dwa przypadki:

```ts
  it("nie wspomina o zdjęciach, gdy opinia ich nie ma", async () => {
    await notifyAdminNewReview(OPINIA.id);
    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.html).not.toContain("zdjęcie");
    expect(payload.html).not.toContain("zdjęcia");
  });

  it("mówi, ile zdjęć dołączył klient, ale NIE osadza ich w mailu", async () => {
    getReviewMock.mockResolvedValue({ ...OPINIA, photos_count: 2 });
    await notifyAdminNewReview(OPINIA.id);
    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.html).toContain("2 zdjęcia");
    // Kontrakt: liczba, nie zawartość. Gdyby ktoś kiedyś wstawił <img> ze
    // zdjęciem klienta, ten test ma o tym powiedzieć.
    expect(payload.html).not.toContain("/storage/v1/object/public/products/opinie/");
  });
```

- [ ] **Krok 4: Podgląd zdjęć w panelu**

W `app/admin/opinie/OpinieList.tsx`, w komponencie `Wiersz`, ZARAZ POD blokiem
`{opinia.comment && (...)}` wstaw:

```tsx
      {(opinia.photos ?? []).length > 0 && (
        <ul className="flex flex-wrap gap-2 mt-3">
          {(opinia.photos ?? []).map((url, i) => (
            <li
              key={url}
              className="relative w-20 h-20 rounded-lg overflow-hidden border border-[var(--border)]"
            >
              {/* Zwykły <a target="_blank">, nie lightbox: właścicielka musi móc
                  obejrzeć zdjęcie w pełnym rozmiarze, zanim zdecyduje o zdjęciu
                  opinii ze strony. Na karcie klienta tego linku CELOWO nie ma
                  (druga akcja w kafelku slidera to pułapka na dotyku) — tu jest
                  odwrotnie: to narzędzie pracy, nie witryna. */}
              <a href={url} target="_blank" rel="noopener noreferrer">
                <Image
                  src={url}
                  alt={`Zdjęcie ${i + 1} dołączone do opinii`}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
```

Dopisz import `Image` z `next/image` na górze pliku. Tu NIE ma `slice` —
w panelu właścicielka ma zobaczyć WSZYSTKO, co klient wysłał, także gdyby
wierszy z nadmiarem kiedykolwiek przybyło.

- [ ] **Krok 5: Testy, typy, build**

Run: `npm test` — zielone, w tym nowe przypadki maila.
Run: `npx tsc --noEmit` — exit 0.
Run: `npm run build` — exit 0.

- [ ] **Krok 6: Commit**

```bash
git add app/_lib/reviews-admin.ts app/admin/opinie/OpinieList.tsx app/_lib/mail/templates/AdminNewReview.tsx app/_lib/__tests__/mail-review-notify.test.ts
git commit -m "feat(opinie): zdjęcia w panelu moderacji i wzmianka w mailu do właścicielki"
```

---

### Zadanie 8: Weryfikacja — podgląd maila, spec Playwrighta i dowód wizualny

**Files:**
- Modify: `scripts/preview-mail.mjs` (fikstura `AdminNewReview`, ok. linia 144)
- Create: `e2e/opinie-zdjecia.spec.ts`

**Interfaces:**
- Consumes: całość z zadań 1–7.
- Produces: nic dla dalszych zadań.

- [ ] **Krok 1: Fikstura podglądu maila**

W `scripts/preview-mail.mjs`, w fiksturze opinii dla `AdminNewReview`, dopisz
`photos_count: 2` i popraw komentarz mówiący o „czterech polach" na pięć.
Bez tego podgląd pokazuje wariant bez zdjęć i nikt nie zobaczy nowego zdania,
zanim wyjdzie do właścicielki.

Run: `node scripts/preview-mail.mjs`
Expected: exit 0, w `mail-preview/` plik `AdminNewReview.html` zawiera
„Klient dołączył 2 zdjęcia".

Sprawdź to poleceniem, nie okiem:

```bash
grep -c "Klient dołączył 2 zdjęcia" mail-preview/AdminNewReview.html
```
Expected: `1`.

- [ ] **Krok 2: Spec Playwrighta — NIEZAPISUJĄCY**

Utwórz `e2e/opinie-zdjecia.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// ⚠️ Baza jest WSPÓLNA z produkcją — ten spec NICZEGO nie zapisuje.
// Sprawdza wyłącznie to, co da się sprawdzić odczytem: że strony renderujące
// opinie nie wywalają się na kodzie czytającym `photos`. To jest test na
// FAIL-SOFT przed migracją 79 (kolumny nie ma → pole jest undefined),
// czyli dokładnie na scenariusz, który wystąpi na produkcji między
// deployem a migracją, gdyby ktoś odwrócił kolejność.
test.describe("opinie ze zdjęciami — odczyt", () => {
  test("strona główna renderuje się mimo braku kolumny photos", async ({ page }) => {
    const bledy: string[] = [];
    page.on("pageerror", (e) => bledy.push(e.message));
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("footer")).toBeVisible();
    expect(bledy).toEqual([]);
  });

  test("/opinie renderuje się i nie zgłasza błędów", async ({ page }) => {
    const bledy: string[] = [];
    page.on("pageerror", (e) => bledy.push(e.message));
    const res = await page.goto("/opinie");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    expect(bledy).toEqual([]);
  });
});
```

Run: `npm run build && npm start` w tle, potem `npx playwright test e2e/opinie-zdjecia.spec.ts`
Expected: 2 passed.

⚠️ NIGDY `next dev` — umiera po pierwszym teście (port słucha, nawigacja
ERR_ABORTED). Zawsze `npm run build` + `npm start`.
⚠️ Bez `E2E_BASE_URL` testy lecą w PRODUKCJĘ. Ustaw go na `http://localhost:3000`.

- [ ] **Krok 3: Dowód wizualny karty ze zdjęciami**

W bazie jest zero opinii, więc karta ze zdjęciami nie pojawi się sama.
Zrób TYMCZASOWĄ łatkę (wzorzec sprawdzony 2026-08-19), która NIE wchodzi
do commita:

W `app/_lib/reviews.ts`, na początku `getHomepageReviews`, wstaw:

```ts
  if (process.env.PODGLAD_OPINII === "1") return PODGLAD;
```

i zdefiniuj nad funkcją tablicę `PODGLAD: PublicReview[]` z czterema opiniami:
jedną bez zdjęć, jedną z jednym, jedną z dwoma i jedną z trzema. Jako URL-e
zdjęć weź adres istniejącego zdjęcia produktu — wyciągniesz go z bazy przez
publiczny odczyt strony:

```bash
curl -sL https://www.mollien.pl/sklep | grep -o 'https://tlvgsddpiikolgdwuwmc\.supabase\.co/storage/v1/object/public/products/[^"&]*' | head -3
```

(nie musi być z prefiksu `opinie/` — to tylko render, a plik i tak nie jest
zapisywany). Odpytuj produkcję OSZCZĘDNIE: ciasne pętle curl-a wywołują
per-IP 403 z Vercela na kilka minut.

Zbuduj i zrób zrzuty:

```bash
PODGLAD_OPINII=1 npm run build && PODGLAD_OPINII=1 npm start
```

Zrzuty do `zdjecia-w-opiniach-home.png` (strona główna, slider) i
`zdjecia-w-opiniach-opinie.png` (`/opinie`, wariant pełny).

Sprawdź w zrzutach TRZY rzeczy i napisz w raporcie, co widać:
1. miniatury stoją POD cytatem, w jednym rzędzie, i nie rozjeżdżają kart;
2. cytat na stronie głównej NADAL obcina się na sześciu liniach (regresja
   z commita 33cf0cc — to jest ta karta, którą właśnie ruszasz);
3. na `/opinie` cytat NIE jest obcięty.

- [ ] **Krok 4: Wycofaj łatkę podglądu**

```bash
git checkout app/_lib/reviews.ts
git status --short
```
Expected: `app/_lib/reviews.ts` NIE występuje na liście zmian.

⚠️ Łatka podglądu nie może trafić do commita. Zwraca dane z powietrza
w miejscu, w którym reszta serwisu spodziewa się bazy.

- [ ] **Krok 5: Pełna weryfikacja**

Run: `npm test` — zielone (podaj liczbę).
Run: `npm run lint` — exit 0.
Run: `npm run build` — exit 0.

- [ ] **Krok 6: Commit**

```bash
git add scripts/preview-mail.mjs e2e/opinie-zdjecia.spec.ts
git commit -m "test(opinie): podgląd maila ze zdjęciami i spec odczytu stron z opiniami"
```

---

## Po zadaniach — należy do kontrolera, nie do implementera

1. **Zaaplikować migrację 79** przez MCP `apply_migration` (i migrację 78 z części 1/2, jeśli jeszcze nie weszła — 78 PRZED 79).
2. **Potwierdzić zapytaniem** do `information_schema.columns`, że `product_reviews` ma `photos` (i `moderated_at`).
3. **Odczekać** na odświeżenie cache'u schematu PostgREST — potwierdzenie w `information_schema` dowodzi istnienia kolumny w bazie, nie tego, że PostgREST ją widzi.
4. **Dopiero teraz** scalić gałąź.
5. Sprawdzić `MAIL_ADMIN_TO` w Vercelu (Production) — bez tej zmiennej powiadomienia po cichu nie wychodzą.
6. Powiedzieć właścicielowi wprost: zdjęcie klienta trafia na stronę główną BEZ sprawdzenia (wariant A), a osierocone pliki w Storage nie są sprzątane.
