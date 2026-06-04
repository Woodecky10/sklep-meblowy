# Jak wypełniać opisy produktów w BaseLinkerze

## Konwencja: pola BL → 3 sekcje na stronie

W BL Magazyn → produkt → zakładka "Opis" widzisz pola tekstowe. Łączymy je w **3 sekcje** (akordeony) na karcie produktu w sklepie Mollien.pl:

| Sekcja na Mollien.pl | Pola w BL | Co tu wpisać |
|---|---|---|
| **Opis** | Opis (główny) + Opis 1 + Opis 2 (sklejone w kolejności) | Czym jest produkt, dla kogo, główne zalety, kontynuacja opisu. Wszystko co o produkcie ogólnie — łącznie pierwsze 3 pola BL idą tutaj. |
| **Wymiary i materiały** | Opis 3 + Opis 4 (sklejone) | Wymiary szczegółowe (szerokość, głębokość, wysokość, wymiary opakowania) ORAZ materiały (rodzaj tkaniny, drewna, pianki, sprężyn). Dwa pola, jedna sekcja. |
| **Informacje dla klienta** | Dowolne pole BL zaczynające się od „Informacje dla klienta" w treści | Uwagi specjalne dla kupującego — "Kolor może się różnić od monitora", "Składa się sam, dostarczamy w 2 paczkach", próbki tkanin itd. **Ważne**: pierwsze słowa pola muszą być „Informacje dla klienta" — wtedy sklep automatycznie wyciąga to do osobnej sekcji. |

### Co jeśli pomyłka — wpisałaś co innego do niewłaściwego pola BL?

Sklep łączy pola wg powyższej konwencji bez sprawdzania zawartości. Jeśli wpiszesz wymiary w Opis 2, to wylądują w sekcji **Opis** zamiast w **Wymiary i materiały**. Otwórz produkt w BL → przenieś treść między polami → kolejny sync naprawi sklep.

## Co możesz używać w treści

✅ Akapity (Enter dla nowej linii)
✅ Listy wypunktowane
✅ Pogrubienia, kursywa
✅ Nagłówki H2, H3 (jeśli sekcja jest długa)

❌ **NIE używaj** w opisie:
- Linków do Allegro ("Zobacz inne nasze aukcje", URL-i allegro.pl) — są one **automatycznie usuwane** przy wyświetlaniu w sklepie
- Fraz typu "Kup teraz", "Numer aukcji", "Sprzedam na Allegro" — system wykryje to i pokaże Ci ostrzeżenie w panelu admina
- Cech "Stan: Nowy", "Faktura VAT: Tak", "Numer aukcji: XXX" w sekcji Cechy produktu — są to pola dla Allegro, sklep je automatycznie ignoruje

## Cechy produktu (Magazyn → Cechy)

To osobne pola od opisów. Cechy lądują w sekcji **Specyfikacja** na karcie produktu (pod tytułem, obok zdjęć). Najważniejsze pola dla mebli:

| Klucz w BL | Skutek na Mollien.pl |
|---|---|
| Kolor | Kolumna "Kolor bazowy" + filtr w `/sklep` |
| Materiał | Kolumna "Materiał" + filtr w `/sklep` |
| Konstrukcja | Kolumna "Konstrukcja" |
| Czas realizacji | Pokazane przy "Czas dostawy: 14-21 dni roboczych" |
| Gwarancja | Pokazane przy "Gwarancja 2 lata" |

**Pozostałe cechy** które wpiszesz (np. "Liczba osób", "Funkcja spania", "Wkład", "Zagłówki regulowane") **automatycznie pojawią się** w sekcji Specyfikacja — bez żadnej konfiguracji w panelu admina sklepu.

## Co system automatycznie odrzuca / sanityzuje

Sklep nie ufa ślepo treściom z BL — automatycznie:
- **Usuwa linki** do `allegro.pl`, `allegrolokalnie.pl`, `allegro.cz` — zachowuje tylko sam tekst
- **Filtruje cechy typu**: `Stan`, `Faktura VAT`, `Numer aukcji`, `Numer oferty`, `Czas wysyłki`, `Forma płatności`, `Sprzedawca`, `Kraj pochodzenia produktu`, `Gwarancja sprzedawcy`
- **Sanityzuje HTML** — usuwa skrypty, niedozwolone tagi, zostawia tylko bezpieczne formatowanie (akapity, listy, pogrubienia, nagłówki)
- **Ostrzega Ciebie** w `/admin/produkty/[id]` jeśli wykryje typowe frazy Allegro — żebyś wiedziała co poprawić w BL

## Jak sprawdzić co trafiło na sklep po sync

1. **Synchronizuj produkty** w `/admin/baselinker` (przycisk "Synchronizuj teraz")
2. Po zakończeniu pojawia się **lista produktów** dodanych i zaktualizowanych z nazwami
3. Wejdź w **`/admin/produkty/[id]`** dowolnego produktu — sprawdź czy:
   - Wszystkie 5 sekcji opisu jest wypełnionych (jeśli brak — zostaw puste, nie pokażą się klientowi)
   - Nie ma żółtego ostrzeżenia "Wykryto treści Allegro"
   - Cechy w sekcji "Specyfikacja" są sensowne (nie ma "Stan", "Faktura VAT")
4. Otwórz **`/produkt/[id]`** w trybie incognito — zobacz jak to wygląda dla klienta

## Krótka checklista przed publikacją produktu

- [ ] Nazwa produktu (BL → Magazyn → Nazwa)
- [ ] Cena (BL → Magazyn → Ceny)
- [ ] Co najmniej 3 zdjęcia (BL → Magazyn → Zdjęcia)
- [ ] Wymiary (BL → Magazyn → Wymiary — szerokość, głębokość, wysokość, waga)
- [ ] Kolor + Materiał w Cechach
- [ ] Opis główny wypełniony (główne zalety produktu)
- [ ] Opis 1 (kontynuacja opisu, np. styl, dla kogo) — opcjonalne
- [ ] Opis 2 (kontynuacja opisu, np. pielęgnacja, gwarancja) — opcjonalne
- [ ] Opis 3 (wymiary szczegółowe — tabela) — szczególnie dla wielkogabarytowych
- [ ] Opis 4 (materiały: skład tkaniny / drewna / pianek) — preferowane
- [ ] Pole zaczynające się od „Informacje dla klienta" — opcjonalne (jeśli są uwagi specjalne)
- [ ] Kategoria zmapowana (BL → Magazyn → Kategoria + sprawdzenie czy ID kategorii BL jest w `/admin/kategorie`)
