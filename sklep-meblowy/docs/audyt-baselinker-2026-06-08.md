# Audyt integracji BaseLinker ↔ sklep — 2026-06-08

**Zakres:** co możemy zintegrować z BaseLinkerem i czy wszystko jest dobrze zmapowane (produkt BL → sklep oraz zamówienie sklep → BL).
**Metoda:** wieloagentowy audyt (workflow `baselinker-integration-audit`, 81 agentów) zakotwiczony w **żywych danych** z konta BL tego sklepu (getInventoryProductsData, 2026-06-08), z adwersarską weryfikacją każdego zgłoszenia.
**Wynik weryfikacji:** 74 zgłoszenia → **42 potwierdzone**, **32 odrzucone** (43% odpadło przy weryfikacji — warstwa sceptyczna działała). Z 42 potwierdzonych: 35 realnych problemów mapowania + 7 „opportunity". Dodatkowo **18 nieużywanych możliwości BL**.

> Integracja jest jednokierunkowa: produkty ciągnięte BL → sklep (BL = źródło prawdy), zamówienia pushowane sklep → BL. Meble „na zamówienie" → `stock` umowny.

## Kontekst danych z konta BL (stan na 2026-06-08)
- 1 magazyn `inventory_id=100046` „Domyślny"; `default_price_group=88309`; `warehouses=["bl_137121"]`.
- 7 kategorii (drzewo: Narożniki → L/U; Łóżka → kontynentalne/dziecięce/tapicerowane).
- 15 produktów; ≥1 z ceną 0 (BL `580712397` „Narożnik…MIKSON") → pomijany przez sync.
- `images` = OBIEKT `{"1":url,...}`; `variants` = obiekt kluczowany id, `variant.name` = pełna nazwa + dopisek (NIE format „Kolor: X"); `features` realnie pod `text_fields.features`; `text_fields` zawiera `description_extra1..4` + liczne `extra_field_NNNNN` (mix opisów i krótkich nazw tkanin „TILIA 62", „MANILA 09"); `tax_rate` per-produkt.

---

## 🔴 KRYTYCZNE (3) — produkty/zamówienia po cichu się psują

### K1. Rabat nigdy nie trafia do BaseLinkera
- **Gdzie:** `app/_lib/baselinker-orders.ts:30-122` (push), `app/api/checkout/route.ts:189` (rabat zapisany)
- **Problem:** `orders.promo_discount` (zniżka w zł) jest poprawnie zbierany w checkout, ale `pushOrderToBaseLinker` go **ignoruje**. W BL zamówienie pokazuje **pełną cenę**.
- **Skutek:** pracownik BL nie wie o rabacie → błędne faktury/zwroty. **Dodatkowo psuje koszt dostawy**: `delivery_price = total − itemsTotal` (linia ~118-122) schodzi na minus/zero, gdy rabat obniżył `total`.
- **Fix:** dodać do `addOrder` linię o ujemnej cenie (`name:"Rabat", price_brutto:-promo_discount`) **lub** jawnie przesłać `delivery_price` z checkout zamiast wyliczać z `total`.
- **Priorytet:** krytyczny skutek, **niski nakład** → najszybsza wygrana.

### K2. Niezmapowana kategoria = produkt znika
- **Gdzie:** `app/_lib/baselinker-sync.ts:793-799` (zwraca `{ok:false}` bez fallbacku), `:927-936` (pętla pomija `continue`)
- **Problem:** gdy `product.category_id` z BL nie ma mapowania na kategorię sklepu, sync zwraca `reason="kategoria BL X nie zmapowana"` i **nie wstawia produktu**. Brak fallbacku „bez kategorii".
- **Skutek:** koleżanka dodaje produkt w nowej/niezmapowanej kategorii BL → produkt **nie pojawia się w sklepie**, cicha utrata.
- **Fix:** fallback na kategorię „inne"/„bez kategorii" dla niezmapowanych ID **lub** wyraźny alert w panelu admina z listą niezmapowanych kategorii BL i auto-sugestią.

### K3. Heurystyka „Informacje dla klienta" myli pola
- **Gdzie:** `app/_lib/baselinker-sync.ts:359-377` (heurystyka), `:330-334` (`INFO_SECTION_PATTERNS`), `:322-324` (`CONSUMED_FIELDS`)
- **Problem:** kod szuka frazy `/^informacje\s+dla\s+klienta/i` w **dowolnym** `text_field` i bierze **pierwszy** trafiony (`break`), a `Object.entries` nie gwarantuje kolejności (optymalizacja V8). `extra_field_NNN` miesza długie opisy i krótkie nazwy tkanin.
- **Skutek:** sekcja może zniknąć albo złapać złą treść — **niedeterministycznie** (różny wynik przy tych samych danych).
- **Fix:** (1) `Object.entries(fields).sort()` dla determinizmu; (2) jawna konwencja w BL które `extra_field` to które sekcje (zamiast zgadywania po treści); (3) log gdy >1 kandydat na sekcję.

---

## 🟠 WYSOKIE (9)

| # | Problem | Gdzie | Skutek / Fix |
|---|---|---|---|
| W1 | **Status zamówienia nie wraca z BL** | `baselinker-orders.ts:145`; `baselinker.ts:185-188` | Klient widzi tylko status Stripe (paid). Brak `getOrders`/`setOrderStatus` → operacyjne statusy (Wysłane itp.) niewidoczne. Fix: cron/endpoint `sync-order-status` + kolumna `orders.baselinker_status`. |
| W2 | **Typ `BLInventoryProduct` niekompletny** | `baselinker.ts:91-119` | Deklaruje ~13 z 30+ pól które BL realnie zwraca → łatwo zgubić dane przy zmianach. Fix: dopisać `tax_rate?`, `is_bundle?`, `tags?`, `reservations?`, `thresholds?`, `incoming?`, `asin?`, `parent_id?`, koszty, `videos?`. |
| W3 | **`tax_rate` (VAT) całkowicie gubiony** | `baselinker.ts:91-119`; `baselinker-sync.ts:779-853`; `schema.sql` (brak kolumny) | VAT z BL nie jest pobierany ani zapisywany → patrz też W9 (sztywne 23%). Fix: typ + kolumna `products.tax_rate NUMERIC(5,2)` + mapowanie. |
| W4 | **Rezerwacje nie mapowane → ryzyko oversell** | `baselinker.ts:73`; `types.ts:22-27` | `BLInventory.reservations` istnieje, sklep nie odejmuje zarezerwowanych od `stock`. Fix: jeśli rezerwacje BL włączone — `stock = total − reserved`, inaczej udokumentować że ignorujemy. |
| W5 | **`defaultPriceGroup` spada na `0`** | `baselinker-sync.ts:888-892` (+ fallback `:496-505`) | Gdy magazyn nie zwróci grupy → szuka `prices['0']`, może wziąć złą/zerową cenę. Fix: ustaw z `inventory.price_group_id`; gdy 0 → warning + skip. |
| W6 | **„Informacje dla klienta" niedeterministyczna** | `baselinker-sync.ts:363-376` | Patrz K3 — ten sam rdzeń, tu jako robustness (kolejność + strip HTML). Fix: sort + testy strip regex na realnym HTML z BL. |
| W7 | **Wariant duplikowany w `attributes`** | `baselinker-orders.ts:98-109` | Wariant ląduje i w `name`, i w `attributes` → BL widzi 2×. Fix: wariant TYLKO w `name`, `attributes` tylko na notatki (lub odwrotnie). |
| W8 | **Brak adresu do faktury (`invoice_*`)** | `baselinker-orders.ts:124-143`; `types.ts:140-150` | `BLAddOrderInput` wspiera `invoice_*`, nie wypełniamy. W checkout zbieramy tylko adres dostawy. Fix: zbierać dane do faktury (NIP/firma/adres) lub `invoice_* = delivery_*`. |
| W9 | **Podatek sztywno 23%** | `baselinker-orders.ts:21,111` | `DEFAULT_TAX_RATE=23` dla każdej pozycji niezależnie od produktu. Fix: użyć `tax_rate` z produktu BL (zależne od W3). |

---

## 🟡 ŚREDNIE (12)

| Problem | Gdzie | Notatka |
|---|---|---|
| Brak retry na błędy przejściowe BL | `baselinker.ts:25-59` | Jeden blip sieci wywala cały sync. Exponential backoff (0.5/1/2 s), retry tylko 5xx/timeout. *(jest w specie utwardzenia)* |
| Brak rate-limiting (limit 100 req/min) | `baselinker.ts:25-59`; `sync:880,898` | Dziś w limicie, ale brak throttlingu — ryzyko 429 przy skali. |
| SKU/EAN produktu nieprzechowywane | `baselinker.ts:94-95`; `sync:819-845` | BL zwraca, kolumn brak. Fix: `products.sku/ean` + mapowanie. |
| `manufacturer_id` wyciągany, nieużywany | `baselinker.ts:111`; `sync:819-845` | Brak kolumny i logiki. Patrz N1 (resolve do nazwy). |
| `is_bundle` (zestawy) ignorowany | `baselinker.ts`; `sync:779-853` | Zestawy synced jak zwykłe produkty. |
| Warianty tracą SKU/EAN | `baselinker.ts:121-128`; `types.ts:22-27`; `sync:720-724` | `ProductVariant` bez `sku/ean/asin`. |
| `description_extra5-10` poza mapowaniem | `sync:309-318,322-324,363-377` | `DESCRIPTION_SECTION_LABELS` pokrywa tylko 1-4. Komentarz obiecuje skan 5-10. |
| Sofa 2/3-os., Zestawy bez `baselinker_category_id` | `migrations/09_categories_db.sql:66-67,72`; `sync:790-799` | Jeśli w BL istnieją jako kategorie z ID — nie zmapują się. **Do potwierdzenia z koleżanką.** |
| `country_code` bez walidacji ISO | `baselinker-orders.ts:139` | „Polska"→"PL", inaczej surowy string → BL może odrzucić. Fix: mapa nazw→ISO-2. |
| Brak `user_login`/`admin_comments`/`user_comments` | `baselinker.ts:213,216-217`; `orders:124-143` | Brak miejsca na notatki admina przed pushem. |
| Brak walidacji `BASELINKER_DEFAULT_STATUS_ID` w runtime | `orders:34-47,145`; `webhook:66-79` | Gdy status usunięty w BL → push pada best-effort, order „utknie" bez `baselinker_order_id`. |
| Koszt dostawy wyliczany retrospektywnie | `checkout:174`; `orders.ts:37`; `baselinker-orders.ts:118-122` | `delivery_price = total − itemsTotal` myli się przy rabacie (powiązane z K1). |

---

## 🟢 NISKIE (11)
- `manufacturer_id` → `getInventoryManufacturers` (resolve do nazwy producenta) — `baselinker.ts:111`.
- Brak jawnego mapowania opcji wariantów (fallback „Wariant: …" przy nietypowych nazwach) — `sync:645-777,612-626`. *(ograniczenie BL, mitygacja: editor override w panelu)*
- `tags` produktu gubione — `baselinker.ts`; `sync:779-853`.
- Kolejność `images` z obiektu `{1,2,3}` może się zmienić (`Object.values` bez sortu) — `sync:200-206`.
- `locations` (magazyny per-wariant) ignorowane — `baselinker.ts:121-128`; `sync:664-669`.
- `averageCost`/`averageLandedCost` (koszt) nie mapowane — `sync:779-852`.
- `thresholds` (progi magazynowe) ignorowane — `sync:779-852`.
- Typ `images` dopuszcza array, choć BL zawsze zwraca object — `baselinker.ts:112`.
- Merge wariantów case-insensitive — edge case przy zmianie nazwy wartości — `sync:84-95`.
- Fallback `fullname="Klient (dane do uzupełnienia)"` może zaśmiecać BL — `orders:88-91,135`.
- `addOrder` cast `as unknown as Record<string,unknown>` — brak runtime-walidacji payloadu — `baselinker.ts:246-254`.

---

## ✅ Co działa dobrze / jest świadomą decyzją
Weryfikacja **odrzuciła 32 zgłoszenia** — m.in. potwierdziła, że poniższe jest OK:
- **`images` jako obiekt `{1,2,3}` → tablica** — obsłużone poprawnie.
- **Merge wariantów zachowuje ręczne edycje admina** (case-insensitive) — OK.
- **Idempotencja pushu** (guard `baselinker_order_id`) — działa.
- **Sanityzacja HTML z BL** — whitelist tagów, **brak XSS**; obsługa mieszanki HTML + plain text.
- **Świadomie poza zakresem** (zgodne z designem made-to-order, BL = źródło prawdy): brak sync stanów, brak sync cen z powrotem, brak inkrementalnego sync (`getJournalList`), płaska hierarchia kategorii, `stock=0`. To **decyzje, nie błędy**.
- Pominięcie `asin`, `parent_id`, `star`, `videos`, `incoming` — uznane za poprawne (niepotrzebne sklepowi).

### ⚠️ Punkt sporny — do ręcznego potwierdzenia
Zarzut **„`features` czytane ze złego miejsca"** (kod czyta `bl.features` top-level, a BL realnie zwraca `text_fields.features`) zgłosiły 2 wymiary, ale **2 niezależnych weryfikatorów oznaczyło go jako false-positive** — sugeruje, że `extractAllFeatures()` czyta poprawnie. Dowody sprzeczne → **2-min ręczna weryfikacja** w `baselinker-sync.ts` (`extractAllFeatures`/`getFeature`) zanim uznamy temat za zamknięty.

---

## 🔌 Co jeszcze możemy zintegrować (ranking)

| Priorytet | Integracja | Metody BL | Po co |
|---|---|---|---|
| **HIGH** | Status zamówienia BL → sklep | `getOrders`, `setOrderStatus`, `setOrderStatuses` | Klient widzi „Wysłane/W realizacji", mniej maili do obsługi. |
| **HIGH** | Faktury | `addInvoice`, `getInvoices`, `getInvoiceFile` | Meble za kilka tys. zł — faktura automatyczna z pushu. |
| **HIGH** | Etykiety/paczki kurierskie | `createPackage`, `getCouriersList`, `getLabel`, `getProtocol` | Automatyzacja wysyłek zamiast ręcznej roboty w BL. |
| MEDIUM | Retry + backoff, rate-limit | (w `blRequest`) | Robustness sync — **już w specie utwardzenia**. |
| MEDIUM | SKU/EAN (przechowywanie + push) | `bl.sku/ean`, `BLVariant.sku/ean` | Logistyka, matching, etykiety. |
| MEDIUM | Zwroty | `addOrderReturn`, `getOrderReturns`, `setOrderReturnStatus` | Workflow zwrotów zamiast papierologii. |
| MEDIUM | Magazyny/lokalizacje + rezerwacje | `getInventoryWarehouses`, `locations`, `reservations` | Multi-warehouse, anty-oversell (W4). |
| LOW | Producenci | `getInventoryManufacturers` | Filtr/SEO po producencie. |

Pozostałe nieużywane (niski priorytet dla tego biznesu): dokumenty magazynowe, zamówienia zakupu (do dostawców), external storages, dedykowane `getInventoryProductsPrices`/`getInventoryProductsStock`, wiele grup cenowych.

---

## Powiązanie z istniejącym specem
Część rekomendacji (retry, rate-limit, sync statusów) pokrywa się z `docs/superpowers/specs/2026-06-07-utwardzenie-sync-baselinker-design.md` — audyt **potwierdza** te priorytety i **dorzuca 3 krytyczne, których spec nie obejmuje**: rabat (K1), fallback kategorii (K2), heurystyka opisu (K3).

## Sugerowana kolejność prac
1. **K1 rabat** — krytyczny skutek, niski nakład.
2. **K2 fallback kategorii** — anty-utrata produktów.
3. **K3 / W6 heurystyka opisu** — determinizm sekcji.
4. **W3+W9 VAT** (typ + kolumna + mapowanie + push) — razem.
5. **W8 adres faktury**, **W7 duplikacja wariantu**, **W4 rezerwacje**, **W5 price_group**.
6. Utwardzenie wg specu: retry + rate-limit.
7. Integracje HIGH: status zamówień → faktury → etykiety.

---
*Wygenerowano automatycznie (workflow `baselinker-integration-audit`, 81 agentów, ~11 min). Każde finding ma cytowanie `plik:linia` i przeszło adwersarską weryfikację. Część zgłoszeń o niskiej pewności mogła zostać błędnie odrzucona/przyjęta — przed implementacją potwierdź `plik:linia`.*
