# P24 compliance: klauzula operatora, logotypy płatności, koszt dostawy — design

**Data:** 2026-06-25
**Status:** zaakceptowany (brainstorming), czeka na plan implementacji

## Problem

Audyt sklepu pod weryfikację Przelewy24 (wymagania ze strony pomocy P24) wykrył 3 luki:
- **#12** Regulamin nie zawiera klauzuli operatora płatności (PayPro SA) z danymi rejestrowymi (jest tylko w polityce prywatności; P24 wymaga w regulaminie).
- **#13** Brak flag/logotypów metod płatności w stopce (na każdej podstronie); wymóg P24, przy kartach znaki Visa/Mastercard.
- **#8** W punkcie zamówienia brak jasnej informacji o koszcie dostawy zgodnej z obowiązkiem informacyjnym (ustawa o prawach konsumenta).

Pozostałe wymagania P24 sklep spełnia (NIP w stopce, regulamin z sekcjami, polityka prywatności RODO, checkbox akceptacji w checkout, wzór odstąpienia na /zwroty, 14 dni). Osobno (poza tym specem) właścicielka w panelu dezaktywuje 3 testowe produkty i 6 pustych aktywnych kategorii (wymóg #5 „pełny asortyment").

## Decyzje z brainstormingu

- **#13 zestaw logotypów:** Przelewy24 + Visa + Mastercard + BLIK (metody realnie oferowane w checkout: `["card","blik","p24"]`). BEZ Apple/Google Pay (nie oferowane wprost — pokazywanie nieoferowanych metod jest mylące; łatwo dodać później).
- **#13 assety:** oficjalne pliki z paczki graficznej P24, wrzucane ręcznie do `public/payments/` (właścicielka). Kod referuje stałe ścieżki.
- **#8 podejście:** wysyłka pozostaje ZMIENNA (meble wielkogabarytowe, firma transportowa, nie kurier). Zgodność: art. 12 ust. 1 pkt 5 ustawy o prawach konsumenta — gdy opłaty nie da się obliczyć z góry, podaje się SPOSÓB jej obliczenia. Pełny opis sposobu już jest na `/dostawa`. Dociągamy tę informację do punktu zamówienia (koszyk, checkout, karta produktu) + jedno zdanie w regulaminie. NIE wprowadzamy ceny stałej.

## Non-goals (YAGNI)

- Brak stałej/wyliczanej automatycznie ceny dostawy (świadomie — nie da się z góry obliczyć).
- Brak Apple/Google Pay w logotypach (nieoferowane).
- Dezaktywacja testowych produktów / pustych kategorii (#5) — robi człowiek w panelu, poza kodem.
- Brak nowej tabeli/migracji — to wyłącznie treść + UI.

## #12 — Klauzula operatora płatności w regulaminie

Plik: `app/(legal)/regulamin/page.tsx` — w obiekcie `c` (gałąź PL i DE), w sekcji o płatnościach (§4 / „Formy płatności"), dodać nowe pole(a) z tekstem klauzuli i wyrenderować je w tej sekcji.

**Tekst PL (dokładny — z wytycznych P24):**
> Operatorem płatności w sklepie jest Przelewy24 (PayPro SA). Operatorem kart płatniczych jest PayPro SA Agent Rozliczeniowy, ul. Pastelowa 8, 60‑198 Poznań, wpisany do Rejestru Przedsiębiorców Krajowego Rejestru Sądowego prowadzonego przez Sąd Rejonowy Poznań – Nowe Miasto i Wilda w Poznaniu, VIII Wydział Gospodarczy Krajowego Rejestru Sądowego pod numerem KRS 0000347935, NIP 7792369887, REGON 301345068.

**Tekst DE (tłumaczenie zdania wiodącego; dane rejestrowe bez zmian):**
> Zahlungsdienstleister im Shop ist Przelewy24 (PayPro SA). Betreiber der Kartenzahlungen ist PayPro SA Agent Rozliczeniowy, ul. Pastelowa 8, 60‑198 Poznań, eingetragen im Unternehmerregister des Landesgerichtsregisters (KRS) unter der Nummer KRS 0000347935, NIP 7792369887, REGON 301345068.

Umieścić w sekcji dotyczącej metod płatności / zasad realizacji transakcji (zgodnie z zaleceniem P24).

## #13 — Pasek metod płatności w stopce

Plik: `app/_components/layout/Footer.tsx` — w dolnym pasku (obok © / NIP) dodać rząd logotypów + krótki podpis.

- Assety (właścicielka wrzuca z paczki P24): `public/payments/przelewy24.svg`, `public/payments/visa.svg`, `public/payments/mastercard.svg`, `public/payments/blik.svg`. (Jeśli format inny niż SVG — dostosować rozszerzenia; domyślnie `.svg`.)
- Render: rząd `next/image` (wys. ~24 px, `width`/`height` proporcjonalne, np. 38×24), na białym/jasnym tle-chipie żeby logotypy były czytelne na granatowej stopce (logotypy marek bywają kolorowe). Podpis z `t.footer.securePayments` („Bezpieczne płatności" / „Sichere Zahlungen").
- `alt` = nazwa marki (stałe stringi: „Przelewy24", „Visa", „Mastercard", „BLIK").
- Zestaw stały (4 pozycje). Stopka jest w root layout → logotypy na KAŻDEJ podstronie.

## #8 — Koszt dostawy w punkcie zamówienia

Komunikat (treść w słowniku, PL+DE), pokazywany przy linii „Dostawa":

**PL:** „Podana kwota nie zawiera kosztu dostawy. Meble wysyłamy firmą transportową, więc koszt zależy od gabarytu, miejsca dostawy i usług dodatkowych — ustalamy go indywidualnie po złożeniu zamówienia (telefonicznie lub mailowo, zwykle w 1 dzień roboczy). Wycena wymaga Twojej akceptacji; jeśli jej nie zaakceptujesz, możesz bezpłatnie zrezygnować z zamówienia."
+ link „Jak liczymy koszt dostawy" → `/dostawa`.

**DE:** odpowiednik („Der angezeigte Betrag enthält keine Versandkosten…").

Miejsca:
1. **Koszyk** `app/koszyk/page.tsx` — przy podsumowaniu/linii dostawy.
2. **Checkout** `app/checkout/CheckoutForm.tsx` — przy linii dostawy w podsumowaniu (gdzie dziś „od 99 zł").
3. **Karta produktu** — jednozdaniowa notka + link: „Koszt dostawy ustalany indywidualnie (transport meblowy) — szczegóły" → `/dostawa`. Umieścić w `ProductMainSection.tsx` w bloku informacyjnym pod CTA (gdzie są zwroty/gwarancja/czas dostawy). Treść z `t.product.*`.
4. **Regulamin** §5 (dostawa) — jedno zdanie potwierdzające tryb, jeśli go brak: „Koszt dostawy mebli wielkogabarytowych ustalany jest indywidualnie po złożeniu zamówienia i wymaga akceptacji Kupującego; w razie jej braku Kupujący może bezpłatnie zrezygnować z zamówienia (szczegóły w zakładce Dostawa)."

Słownik: nowe klucze w `t.cart.*` (lub `t.checkout.*`), `t.product.*`, `t.footer.*` — w `PlShape` (pl.ts) + wartości PL (pl.ts) + DE (de.ts). Zachować parzystość kluczy (tsc pilnuje).

## Edge cases

- Brak pliku logotypu w `public/payments/` → `next/image` pokaże złamany obraz. Mitigacja: w notatkach go‑live wypisać dokładne wymagane nazwy plików; właścicielka wrzuca wszystkie 4 przed deployem. (Nie dodajemy logiki „render tylko istniejących" — to statyczne assety, wymóg dostarczenia.)
- DE: jeśli klucz `_de` pominięty, `de.ts` jest `DeepPartial<PlShape>` → fallback do PL; mimo to dodajemy pełne tłumaczenia.

## Testy

- To treść + UI; brak nowej logiki do unit‑testów. Bramki: `tsc --noEmit` 0, `eslint` 0, pełny `vitest` zielony (zgodność `de.ts` z `PlShape`), `next build` przechodzi.
- Weryfikacja manualna po deployu: stopka pokazuje 4 logotypy na każdej podstronie; regulamin zawiera klauzulę PayPro; koszyk/checkout/karta produktu pokazują komunikat o indywidualnej dostawie + link do /dostawa.

## Kolejność wdrożenia (dla planu)

1. #12 — klauzula PayPro w `regulamin/page.tsx` (PL+DE).
2. #8 słownik + miejsca: klucze `t.*` (PlShape/pl/de) → koszyk, checkout, karta produktu, regulamin §5.
3. #13 — `t.footer.securePayments` + pasek logotypów w `Footer.tsx` (ścieżki `public/payments/*`).
4. Bramki + (opcjonalnie) build.

**Deploy / go‑live:** właścicielka (a) wrzuca do `public/payments/` pliki: `przelewy24.svg`, `visa.svg`, `mastercard.svg`, `blik.svg` (oficjalne z paczki P24) PRZED deployem; (b) w panelu dezaktywuje 3 testowe produkty i 6 pustych kategorii (#5); (c) push przez Woodecky10. Bez migracji.
