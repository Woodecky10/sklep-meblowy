# Natywne tworzenie/zarządzanie produktami + wygaszenie syncu BL (design)

**Data:** 2026-06-17
**Status:** zaakceptowany (brainstorming)
**Kontekst:** rezygnacja z BaseLinkera — **podprojekt 2 z 4** (po panelu zamówień, [[2026-06-17-panel-zamowien-admin-design]]). Dziś produkty powstają wyłącznie przez sync z BL (`baselinker_id` = klucz upsertu); admin może je tylko edytować/usuwać/ukrywać, nie tworzyć. Po rezygnacji z BL sklep musi tworzyć produkty natywnie, a sync produktów trzeba wyłączyć (żeby nie nadpisywał świeżych danych starymi z BL).

## Cel

Admin tworzy nowy produkt w panelu sklepu (bez BaseLinkera) i wygaszamy wykonywanie syncu produktów z BL. Cała edycja (pola, zdjęcia, warianty, sekcje opisu, DE) zostaje na istniejącym edytorze `/admin/produkty/[id]` — nie ruszamy go. Nowy produkt = minimalny szkic (nazwa/cena/kategoria) → redirect do edytora, gdzie admin uzupełnia resztę.

## Decyzje (z brainstormingu)

| Temat | Decyzja |
|---|---|
| Tworzenie produktu | Minimalny formularz (nazwa/cena/kategoria) → redirect do istniejącego edytora `/admin/produkty/[id]`. Maks. reuse, brak duplikacji edytora. |
| Wygaszenie syncu BL | Wyłączyć **wykonywanie**: `syncProductsAction` i `POST /api/baselinker/sync-products` odmawiają; panel `/admin/baselinker` read-only (bez przycisku syncu). Kod i kolumny BL legacy. |
| Domyślne nowego produktu | `needs_translation=true`, `stock=0` (meble na zamówienie), `baselinker_id=null`, `is_active=true`, `images=[]`, `features=[]`, `description_sections=[]`, `variants=null`, `description=''`, `collection_id=null`. |
| DE przy tworzeniu | Brak edycji DE w formularzu tworzenia — nowy produkt dostaje `needs_translation=true` i admin tłumaczy w istniejącym `TranslationEditor`. |
| Założenie operacyjne | Obecny zsyncowany katalog jest kompletny — NIE robimy ostatniego pulla z BL. |

## Architektura

Wszystko natywne dokłada się do istniejącej sekcji `app/admin/produkty/`:
- `app/admin/produkty/nowy/page.tsx` — strona tworzenia (server component).
- `app/admin/produkty/nowy/NewProductForm.tsx` — kliencki formularz (prop-driven: dostaje listę kategorii).
- `createProduct` — nowa server action w `app/admin/produkty/actions.ts`.
- czysta logika walidacji/payloadu w osobnym, testowanym module.

Wygaszenie syncu dotyka istniejących plików BL (short-circuit, bez usuwania kodu).

Wzorce do naśladowania (istniejące): tworzenie kategorii/kolekcji (`createCategory`/`createCollection` — FormData + insert + `ActionResult`), klienckie edytory (`useTransition` + `ActionResult` + toast), guard `requireAdmin`, klient `admin` Supabase, `revalidatePath`, casty `as never`.

## Tworzenie produktu (flow)

1. **Lista `/admin/produkty`** (`page.tsx`): przycisk „**+ Nowy produkt**" linkujący do `/admin/produkty/nowy`. Aktualizacja nieaktualnego tekstu instrukcji („Dodaj je w BaseLinkerze i zsynchronizuj" → komunikat o natywnym tworzeniu).
2. **Strona `/admin/produkty/nowy`** (server): `await requireAdmin()`; `getAllCategories()` do dropdownu; render `NewProductForm` z propsem kategorii.
3. **`NewProductForm`** (client, `"use client"`): pola **nazwa** (text, wymagane, max 300), **cena** (number ≥0, wymagane), **kategoria** (select ze sluga, wymagane). Wywołuje `createProduct(formData)`; na `ok` → `router.push('/admin/produkty/{productId}')`; na błąd → toast (wzorzec `useTransition` + `_shared` `ToastView`). Gdy brak kategorii → komunikat „najpierw dodaj kategorię w /admin/kategorie" zamiast formularza.
4. **Akcja `createProduct(formData): Promise<{ ok: true; productId: string } | { ok: false; error: string }>`** w `app/admin/produkty/actions.ts`:
   - `await requireAdmin()`.
   - Złóż payload przez `buildNewProductPayload` (poniżej); na błąd walidacji → `{ ok:false, error }`.
   - `createAdminClient().from("products").insert(payload).select("id").single()`.
   - `revalidatePath("/admin/produkty")` + `revalidatePath("/sklep")`.
   - Zwróć `{ ok:true, productId }`.

## Czysta logika walidacji/payloadu (TDD)

Moduł `app/_lib/new-product.ts` (pure, bez importu supabase):
- `buildNewProductPayload(input: { name: unknown; price: unknown; category: unknown }): { ok: true; payload: NewProductPayload } | { ok: false; error: string }`
  - walidacja: nazwa po `trim` niepusta (≤300), cena = liczba ≥0 (normalizacja przecinka→kropka), kategoria niepusta.
  - payload z domyślnymi: `{ name, price, category, description:'', images:[], stock:0, features:[], description_sections:[], variants:null, color:null, material:null, dimensions:null, weight:null, construction:null, delivery_time:null, warranty:null, collection_id:null, baselinker_id:null, is_active:true, needs_translation:true }`.
- Testy `app/_lib/__tests__/new-product.test.ts`: pusta/whitespace nazwa → błąd; cena ujemna/NaN/pusta → błąd; przecinek w cenie → liczba; brak kategorii → błąd; happy path → payload z `needs_translation=true`, `baselinker_id=null`, `stock=0`, `is_active=true`.

## Wygaszenie syncu BL

- `app/admin/baselinker/actions.ts` — `syncProductsAction()`: na początku (po `requireAdmin`) zwróć wynik „wyłączone" w istniejącym kształcie `SyncActionResult` (`{ ok:false, error:"Synchronizacja z BaseLinker została wyłączona" }` lub odpowiednik zgodny z typem), bez wołania `syncProductsFromBaseLinker`. Funkcja `syncProductsFromBaseLinker` zostaje (legacy).
- `app/api/baselinker/sync-products/route.ts` — wczesny zwrot `410` (np. `{ error: "sync wyłączony" }`) bez uruchamiania syncu (po dotychczasowej walidacji sekretu lub przed nią — wystarczy przed wywołaniem syncu).
- `app/admin/baselinker/BaseLinkerSyncPanel.tsx` — usunąć przycisk wyzwalający sync; zostawić podgląd historii (read-only). Reszta panelu (historia, liczniki) bez zmian.

## Testy

- TDD: `buildNewProductPayload` (vitest, wzorce z `app/_lib/__tests__`).
- Reszta (formularz, insert DB, wyłączenie syncu, panel read-only) — weryfikacja `npx tsc --noEmit` = 0, `npm run lint` = 0, `npm test` zielony, `npm run build` przechodzi + smoke (utworzenie produktu → redirect do edytora → produkt widoczny w `/sklep`).

## Uwaga implementacyjna (Next.js w tym repo)

`AGENTS.md`: Next 16 różni się od wiedzy z treningu — przed kodem Server Component/Action sprawdzić `node_modules/next/dist/docs/`. Server action zwracająca dane do redirectu po stronie klienta (nie `redirect()` w akcji, bo formularz musi pokazać błędy walidacji).

## Poza zakresem (świadomie)

- Zmiany w istniejącym edytorze `/admin/produkty/[id]` i jego pod-edytorach.
- Bulk-import, „duplikuj produkt", ostatni pull z BL.
- Usunięcie kodu/kolumn BL (`baselinker_id`, `baselinker-sync.ts`, `app/admin/baselinker/*`, `app/api/baselinker/*`) — osobny cleanup.
- Edycja DE w formularzu tworzenia (robi się w `TranslationEditor`).
- Walidacja unikalności nazwy/EAN, magazyn (meble na zamówienie — `stock=0`).
