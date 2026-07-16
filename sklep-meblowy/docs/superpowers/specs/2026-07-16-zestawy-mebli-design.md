# Zestawy mebli (bundle) — spec

**Data:** 2026-07-16
**Status:** zatwierdzony projekt (brainstorming z użytkownikiem)

## Cel

Admin łączy 2+ produktów (np. fotel + narożnik w tym samym stylu) w
„zestaw" z rabatem — bo komplet ma wychodzić taniej. Klient widzi na
karcie produktu **od razu** (above the fold), że mebel można kupić w
zestawie, ile oszczędza, i może dodać cały zestaw do koszyka bez
opuszczania karty. Zestaw ma też własną prostą stronę do linkowania.
UX admina jak zawsze: zero HTML, zwykłe pola, wszystko po polsku.

## Zakres (decyzje użytkownika)

1. Rabat zestawu: **% ALBO kwota — wybór per zestaw** w edytorze.
2. UX zakupu: **hybryda** — modal „Kup w zestawie" na karcie produktu
   (szybki zakup) + prosta strona zestawu `/zestaw/[slug]`.
3. Tkanina/opcje: **osobno per mebel** — każdy składnik konfigurowany
   niezależnie (bez wymuszania wspólnej tkaniny).
4. Kody rabatowe: **kod NIE obejmuje pozycji z zestawu** — liczy się
   (wraz z progiem `min_order_value`) wyłącznie od pozycji spoza
   zestawów; rabat kodu przycinany do tej podstawy.
5. Architektura koszyka: **podejście A — grupa pozycji** (składniki to
   zwykłe pozycje ze znacznikiem zestawu; odrzucone: wirtualny produkt
   — za głęboka przebudowa order_items; auto-rabat — niejednoznaczny
   i kłóci się z pkt 4).

## Model danych (migracja 55)

### Nowe tabele

```sql
create table public.bundles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  name_de text,
  description text,
  description_de text,
  discount_type text not null check (discount_type in ('percent','amount')),
  discount_value numeric not null check (discount_value > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.bundle_items (
  bundle_id uuid not null references public.bundles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  position int not null default 0,
  primary key (bundle_id, product_id)
);
```

- Dodatkowy check w walidacji akcji (nie w DB): `percent` w zakresie
  1–90.
- Produkt może należeć do **wielu** zestawów (M2M przez `bundle_items`).
- Usunięcie produktu → CASCADE usuwa wpis z zestawu; zestaw, któremu
  zostało < 2 składników, przestaje być widoczny (warunek w zapytaniach
  frontu), analogicznie gdy dowolny składnik ma `is_active = false`.

### Rozszerzenia istniejących tabel

```sql
alter table public.order_items add column bundle_id uuid references public.bundles(id) on delete set null;
alter table public.order_items add column bundle_label text;
alter table public.orders      add column bundle_discount numeric not null default 0;
```

- `bundle_label` = zdenormalizowana nazwa zestawu w chwili zakupu —
  widok zamówienia w adminie i koncie klienta pokazuje „(zestaw: X)"
  nawet po usunięciu zestawu.
- `orders.bundle_discount` = suma rabatów zestawów zamówienia
  (analogicznie do `promo_discount`).

### RLS

Wzorzec „publiczny odczyt + write tylko service role" (jak `pages` /
`menu_items`): `bundles` SELECT `using (is_active)`, `bundle_items`
SELECT `using (true)` (nieaktywne zestawy i tak odfiltrowane na
poziomie `bundles`); INSERT/UPDATE/DELETE revoke dla anon/authenticated
— mutacje wyłącznie przez server actions z `createAdminClient()`.

## Cena zestawu

- **Baza rabatu** = suma cen **efektywnych** składników — tj.
  `effectivePrice(price, sale_price)` + `sumValueSurcharges(...)` za
  wybrane opcje/tkaniny — pomnożona przez ilość. Liczona zawsze w PLN.
- `percent`: `rabat = round(baza * value / 100, 2)`.
- `amount`: `rabat = min(value, baza)` (nigdy poniżej zera).
- Rabat liczony **per grupa zestawu w koszyku** (ilość zestawu mnoży
  bazę, więc mnoży też rabat procentowy i kwotowy — kwota jest „per
  sztuka zestawu").
- Prezentacja: „Razem osobno: X zł → W zestawie: Y zł — oszczędzasz
  Z zł". Na kartach produktów, gdzie nie znamy jeszcze wybranych
  dopłat: „oszczędzasz **od** Z zł" (min. rabat od cen bez dopłat).
- **Omnibus:** zestaw to oferta wiązana (rabat warunkowany zakupem
  kompletu), NIE jednostronna obniżka ceny produktu — nie pokazujemy
  „najniższej ceny z 30 dni" dla zestawu; składniki na swoich kartach
  zachowują własne przeceny/Omnibus bez zmian. Liczenie bazy od cen
  efektywnych gwarantuje uczciwe „oszczędzasz". (Do pokazania
  prawnikowi przy najbliższym przeglądzie.)
- **EUR (/de):** wszystko w PLN aż do wyświetlenia/checkoutu —
  istniejące `formatMoney` / `convertToEur` (ceil do pełnych euro).

## Koszyk (CartContext)

- `CartItem` dostaje opcjonalne pole
  `bundle?: { id: string; name: string; unitKey: string }`.
  `unitKey` = deterministyczny klucz grupy: `bundleId` + posortowane
  klucze wariantów wszystkich składników — identyczna konfiguracja
  dodana drugi raz zwiększa ilość istniejącej grupy, inna konfiguracja
  tworzy nową grupę.
- `itemKey` (deduplikacja) uwzględnia `bundle.unitKey` — ten sam
  produkt solo i w zestawie to OSOBNE pozycje.
- Reducer: `ADD_BUNDLE` (dodaje wszystkie składniki grupy atomowo),
  `REMOVE_BUNDLE(unitKey)`, `UPDATE_BUNDLE_QTY(unitKey, qty)` —
  ilości składników grupy zawsze zsynchronizowane; qty 1–99.
- UI koszyka: grupa renderowana jako JEDNA karta „Zestaw: nazwa" —
  miniatury i wybrane opcje składników, uwagi per mebel (istniejący
  mechanizm notes), jeden stepper ilości, jeden przycisk usunięcia
  (całej grupy). Bez rozgrupowywania.
- Podsumowanie koszyka: linia „Rabat za zestaw(y): −Z zł"; suma po
  rabacie. Pole kodu rabatowego bez zmian wizualnych, ale walidacja
  kodu dostaje podstawę = suma pozycji SPOZA zestawów (komunikat po
  polsku, gdy podstawa 0 lub poniżej `min_order_value`).
- localStorage: istniejący klucz `mollien-cart-items` — stare wpisy
  bez `bundle` działają bez migracji (pole opcjonalne).

## Checkout (server, `app/api/checkout/route.ts`)

- Payload pozycji rozszerzony o opcjonalne
  `bundle: { id, unitKey }` — klient NIE przysyła żadnych kwot rabatu.
- Nowy czysty moduł **`app/_lib/bundles.ts`** (+ testy):
  - `groupBundleUnits(items)` — grupuje pozycje po `(bundle.id, unitKey)`;
  - `verifyBundleGroup(group, bundleFromDb)` — zestaw istnieje,
    `is_active`, zbiór `product_id` grupy == zbiór `bundle_items`
    (dokładnie, bez braków i nadmiarów), ilości w grupie równe;
  - `computeBundleDiscount(base, qty, type, value)` — czysta
    matematyka z clampem; `base` to suma grupy (już z ilością),
    `percent` → `round(base * value / 100, 2)`, `amount` →
    `min(value * qty, base)`.
  Błędna grupa → 400 z komunikatem po polsku (jak istniejące walidacje).
- Serwer liczy ceny pozycji jak dotąd (z DB, anti-tamper), potem:
  `bundleDiscounts` (suma per grupa) → `eligibleBase = itemsTotal −
  suma pozycji zestawowych` → `promoDiscount` walidowany od
  `eligibleBase` (w tym `min_order_value`; clamp do `eligibleBase`) →
  `finalTotal = itemsTotal − bundleDiscounts − promoDiscount`.
- `createOrder`: pozycje zestawowe dostają `bundle_id` + `bundle_label`;
  zamówienie dostaje `bundle_discount`.
- Stripe (dzisiejszy main): jeden dynamiczny Coupon
  `amount_off = bundleDiscounts + promoDiscount` (mechanizm już
  istnieje dla promo — tylko suma się zmienia). COD: bez zmian poza
  totalem. **Styk z PR #48 (P24):** cała logika w `bundles.ts`,
  wpięcie w route minimalne — po merge P24 rabat to po prostu składnik
  kwoty rejestracji; kolejność merge'ów do ustalenia, konflikt
  spodziewanie mały.

## Karta produktu — moduł „Kup w zestawie"

- Odczyt: `getBundlesForProduct(productId)` w `app/_lib/bundles-server.ts`
  — `unstable_cache` z tagiem `bundles` (⚠️ bare anon client, zero
  `cookies()`), zwraca aktywne zestawy zawierające produkt wraz ze
  składnikami (zlokalizowanymi `_de`).
- UI: box w prawej kolumnie karty produktu, bezpośrednio pod
  `ProductActions` (above the fold): miniatury pozostałych składników,
  „W zestawie taniej — oszczędzasz od Z zł", przycisk **„Kup w
  zestawie"** + link „Zobacz zestaw →" do `/zestaw/[slug]`. Produkt
  w wielu zestawach → osobny box per zestaw, max 3 (kolejność wg
  najnowszego), nadmiar pomijany.
- Modal (client): bieżący produkt z pre-wypełnionymi aktualnie
  wybranymi opcjami + konfigurator(y) pozostałych składników (reuse
  `VariantSelector` + mini-galeria), walidacja kompletności wyboru
  każdego składnika (`isVariantSelectionComplete`), suma/rabat na
  żywo, „Dodaj zestaw do koszyka" → `ADD_BUNDLE` + toast.
- JSON-LD produktu bez zmian.

## Strona zestawu `/zestaw/[slug]`

- Server page: nazwa + opis (PL/DE przez wzorzec `localize*`),
  składniki (zdjęcia, ceny, linki do kart), konfiguratory opcji,
  podsumowanie ceny na żywo, „Dodaj zestaw do koszyka". Zdjęcia =
  zdjęcia składników (bez własnej galerii zestawu w v1). Metadata
  title/description; bez JSON-LD w v1.
- Trasa statyczna `/zestaw/...` — nie koliduje z `app/[slug]`
  (podstrony), bo segment literalny wygrywa z dynamicznym.
- `sitemap.ts`: aktywne zestawy (PL i /de).
- 404 gdy zestaw nieaktywny/niekompletny.

## Admin `/admin/zestawy`

- Wpis w `NAV_ITEMS` (`AdminShell.tsx`) + karta na dashboardzie.
- Układ jak `kolekcje`/`kody-rabatowe`: `page.tsx` (server) +
  `actions.ts` (server actions) + `BundlesEditor.tsx` (client).
- Edytor: nazwa PL/DE, opis PL/DE (textarea), slug auto ze slugify
  (edytowalny), wyszukiwarka produktów (wzorzec szukajki z
  `/admin/produkty`, `normalizeSearchText`; tylko aktywne produkty;
  min 2 składniki), rabat: przełącznik `%`/`zł` + wartość, **podgląd
  na żywo**: suma cen bazowych składników → cena zestawu → oszczędność,
  toggle „Aktywny", link do strony zestawu.
- Walidacje (po polsku): min 2 produkty, percent 1–90, amount > 0
  (ostrzeżenie, nie błąd, gdy amount ≥ suma bazowa — bo suma jest
  ruchoma), slug unikalny (`23505` → „taki slug już istnieje").
- Actions: `requireAdmin()` + `createAdminClient()`, `ActionResult`,
  po mutacji `revalidateTag('bundles')` + `revalidatePath` kart
  produktów-składników i `/zestaw/[slug]` (+ odpowiedniki /de).

## Testy

- Unit (vitest, wzorzec `app/_lib/__tests__/`):
  `computeBundleDiscount` (percent/amount/clamp/qty), `groupBundleUnits`
  + `verifyBundleGroup` (skład niepełny, nadmiarowy, nieaktywny zestaw,
  nierówne ilości), podstawa kodu rabatowego z wyłączeniem zestawów
  (w tym `min_order_value` i clamp), reducer koszyka (ADD_BUNDLE /
  REMOVE_BUNDLE / UPDATE_BUNDLE_QTY / dedup po `unitKey` / hydratacja
  starych wpisów bez `bundle`).
- Rytuał: `tsc --noEmit` + `npm test` + `next build`.
- Na koniec: lista klik-testów dla Mikołaja (admin tworzy zestaw, modal
  z karty, strona zestawu, koszyk, checkout COD, kod rabatowy przy
  zestawie, /de).

## Podział na kroki (osobne taski w planie, jeden branch/PR)

| Krok | Zakres |
|---|---|
| 1 | Migracja 55 + typy + `bundles.ts` (czysta logika) + testy |
| 2 | Admin `/admin/zestawy` (CRUD + picker + podgląd) |
| 3 | Koszyk: grupy zestawów w CartContext + UI koszyka + testy |
| 4 | Checkout: weryfikacja + rabat + promo-wyłączenie + order_items |
| 5 | Karta produktu: box + modal „Kup w zestawie" |
| 6 | Strona `/zestaw/[slug]` + sitemap + DE |
| 7 | Rytuał weryfikacji + lista klik-testów |

Migracja 55 zapuszczana na prod przez Supabase MCP **za potwierdzeniem**
(model: pokaż SQL → potwierdź → wykonaj), na końcu kroku 1 lub przy
wdrożeniu. Numeracja: 47/48 zarezerwowane przez PR #48 (P24).

## Poza zakresem (świadomie)

- Blok „zestawy" na home / w blokach podstron (system bloków gotowy na
  rozszerzenie — osobny temat).
- Wspólna tkanina wymuszana na cały zestaw (decyzja: osobno per mebel).
- Zdjęcia własne zestawu, listing `/zestawy`, JSON-LD zestawu.
- Zestawy w wyszukiwarce i filtrach `/sklep`.
- Omnibus dla ceny zestawu (oferta wiązana — nie dotyczy; patrz wyżej).
