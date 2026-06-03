# Jak wypełniać opisy produktów w BaseLinkerze

## Konwencja 5 pól = 5 sekcji na stronie

W BL Magazyn → produkt → zakładka "Opis" widzisz 5 pól tekstowych. Każde z nich automatycznie staje się osobną sekcją (akordeonem) na karcie produktu w sklepie Mollien.pl.

| Pole w BL | Tytuł sekcji na Mollien.pl | Co tu wpisać |
|---|---|---|
| **Opis** (główny) | Opis | Pierwszy paragraf — czym jest produkt, dla kogo, główne zalety. 2-4 zdania. |
| **Opis 1** (description_extra1) | Materiał i wykonanie | Z czego zrobiony jest mebel: rodzaj tkaniny / drewna, gęstość pianki, sprężyny, lakierowanie. Dla mebli tapicerowanych: skład tkaniny obiciowej. |
| **Opis 2** (description_extra2) | Pielęgnacja i czyszczenie | Jak utrzymać mebel w dobrym stanie. Co można prać, czego nie. Czy tkanina jest plamoodporna. Jak konserwować drewno. |
| **Opis 3** (description_extra3) | Wymiary szczegółowe | Pełna tabelka wymiarów: szerokość, głębokość, wysokość, wymiary opakowania, waga, wymiary po rozłożeniu (dla rozkładanych). |
| **Opis 4** (description_extra4) | Najczęstsze pytania (FAQ) | Pytania klientów: "Czy można zmienić tkaninę?", "Jaka jest wytrzymałość?", "Czy mebel jest dostarczany w częściach?". |

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
- [ ] Opis główny wypełniony
- [ ] Opis 1 (Materiał) — preferowane, znacznie poprawia UX
- [ ] Opis 2 (Pielęgnacja) — bardzo cenione przez klientów premium
- [ ] Opis 3 (Wymiary szczegółowe) — szczególnie dla mebli wielkogabarytowych
- [ ] Opis 4 (FAQ) — opcjonalne, ale podnosi konwersję
- [ ] Kategoria zmapowana (BL → Magazyn → Kategoria + sprawdzenie czy ID kategorii BL jest w `/admin/kategorie`)
