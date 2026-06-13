# i18n PL/DE — rezygnacja z DeepL, tłumaczenia ręczne (design)

**Data:** 2026-06-13
**Status:** zaakceptowany (brainstorming)
**Kontekst:** korekta etapu ① i18n (gałąź `feat/i18n-pl-de`). Rezygnujemy z automatycznego tłumaczenia DeepL. Treść DE wpisywana ręcznie; jednorazowe tłumaczenie istniejącej treści robi Claude.

## Cel

Dwujęzyczność PL/DE bez żadnej zewnętrznej usługi tłumaczeń. Model:
- **UI** — przetłumaczone w kodzie (słownik), kompletnie, raz.
- **Treść produktów (i etykiety kategorii)** — jednorazowo przetłumaczona przez Claude do kolumn `_de`; nowe/zmienione produkty admin tłumaczy ręcznie w panelu.
- **Recenzje** — zostają w oryginale (PL) na /de (treść userów, nie tłumaczymy).

## Decyzje (z brainstormingu)

| Temat | Decyzja |
|---|---|
| Silnik tłumaczeń | BRAK (usuwamy DeepL całkowicie) |
| Treść istniejąca | Claude tłumaczy jednorazowo (21 produktów / 19 aktywnych + 13 kategorii) i zapisuje do `_de` |
| Treść nowa | Admin ręcznie w panelu (edytor DE) |
| Zakres ręcznego edytora | Pełny: nazwa, opis, kolor, materiał ORAZ sekcje opisu (tytuł+treść każdej) |
| Recenzje | NIE tłumaczone (fallback PL) |
| `needs_translation` | Zostaje jako STATUS „DE brakuje/nieaktualne" (sync BL ustawia przy zmianie PL; gaśnie po ręcznym zapisie DE) |

## Co USUWAMY (martwy kod w modelu ręcznym)

- `app/_lib/translate.ts` (klient DeepL)
- `app/_lib/translate-entities.ts` (auto-tłumacze encji)
- `app/_lib/translation-sweep.ts` (orkiestrator sweepa)
- `app/_lib/translation-service.ts` (translateProductRow/translatePendingProducts) — w całości
- `app/api/cron/translate/route.ts` + wpis cron w `vercel.json`
- `DEEPL_API_KEY` z `.env.example`
- testy: `translate.test.ts`, `translate-entities.test.ts`, `translation-sweep.test.ts`
- inline auto-tłumaczenie w `app/admin/produkty/actions.ts` (best-effort bloki w `updateProductBasics`/`updateProductDescriptionSections`)
- inline auto-tłumaczenie `comment_de` w `app/api/reviews/route.ts`
- akcje `retranslateProduct` + `translatePendingBatch`; przyciski „Przetłumacz ponownie (DeepL)" i „Przetłumacz zaległe (DE)" w panelu

## Co ZOSTAJE / dochodzi

- Kolumny `_de` + `needs_translation` (migracja 29) — bez zmian. Odczyt z fallbackiem (`pickLocalized`, warstwa danych) — bez zmian.
- Routing, switcher, LocalizedLink, formatPrice, hreflang/sitemap — bez zmian.
- `saveProductDe(id, fields)` (ręczny zapis DE) — zostaje, **rozszerzony o sekcje opisu** (`description_sections_de`). To główny mechanizm dla admina.
- Edytor DE w panelu produktu — rozszerzony o ręczną edycję sekcji DE (tytuł+treść per sekcja, wzorzec jak `DescriptionSectionsEditor`).
- Pole `label_de` w edytorze kategorii — zostaje.
- Panel BL: licznik „do przetłumaczenia (DE): N" jako status (bez przycisku batcha).
- BL sync: nadal flaguje `needs_translation=true` przy zmianie pól PL (name/color/material) lub nowym — sygnał dla admina, że DE wymaga uzupełnienia.

## Pełne UI DE (kod, bez bazy)

Rozszerzyć słownik `app/_lib/dictionaries/{pl,de}.ts` o wszystkie statyczne stringi storefrontu i podpiąć `getDictionary(locale)` w: stronie głównej (nagłówki sekcji, „Odkryj", „Wszystkie"), Navbarze (etykiety stałe), nagłówkach sekcji opisu produktu, breadcrumbach, pozostałych etykietach koszyka (Produkty/Zniżka/Dostawa/Wyczyść/promo), TopBar (slogan), pustych stanach. Klienckie komponenty dostają stringi/locale propsem (lub `useClientLocale`).

## Jednorazowe tłumaczenie treści (operacyjne)

1. **WYMAGA: admin (Mikołaj) uruchamia migrację 29 w Supabase SQL Editorze** — Claude NIE ma dostępu DDL (tylko `SUPABASE_SERVICE_ROLE_KEY` → PostgREST, bez `ALTER TABLE`). Plik: `supabase/migrations/29_i18n_de_columns.sql`.
2. Claude czyta treść PL (service role), tłumaczy na niemiecki (domena: meble tapicerowane/kontynentalne), zapisuje do `_de` przez seed-skrypt (service role UPDATE). `needs_translation=false` + `translated_at` po zapisie.
3. Zakres: 19 aktywnych produktów (name/description/description_sections/color/material) + 13 kategorii (label). Sekcje to jsonb — tłumaczyć title/body sekcji `text`, alt/caption sekcji `image`; url/flagi bez zmian.

## Testy

- Usunąć testy DeepL. Reszta testów i18n (i18n helpery, localize, dictionaries, search-filter, sitemap-i18n) bez zmian — muszą pozostać zielone.
- Brak nowych testów jednostkowych dla usuwania; weryfikacja: tsc + lint + pełny suite + smoke runtime /de.

## Poza zakresem

- Recenzje DE. Kolumna `comment_de` może zostać w migracji (nieużywana) — bez czyszczenia.
- EUR/ceny (etap ②), strony prawne DE (etap ③).
- Tłumaczenie kolekcji (`collections` nie mają `label_de`).
