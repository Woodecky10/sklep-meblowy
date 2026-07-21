# Diagnoza: „zdjęcia z produkcji / linki nie dodają się" na stronie tkaniny

Data: 2026-07-21. Status: **otwarte** — zdiagnozowane, poprawka niezaczęta (czeka na potwierdzenie objawu).
Kontekst: follow-up do feature „zdjęcia z produkcji" (PR #73) i lightbox (PR #74/#75).

## Zgłoszenie
Użytkownik dostał sygnał, że na stronie tkaniny **nie dodają się zdjęcia z produkcji lub linki do produktów**.

## Co ustalono (dowody)
- **Baza produkcyjna:** 0 z 17 tkanin ma `production_photos`; **17/17 ma `color_images`** (próbki). Czyli upload+zapis fizycznie działa — próbki się zapisują, zdjęcia z produkcji ani razu.
- **Wiek danych:** wszystkie 17 tkanin utworzone ≤ 2026-07-20; feature zdjęć z produkcji wdrożony 2026-07-21 → żadna tkanina nie była zapisana nową ścieżką z dodanym zdjęciem.
- **Kod zapisu — poprawny:**
  - `app/admin/tkaniny/FabricsEditor.tsx` — ukryte pole `production_photos_json` serializuje wiersze `photoRows.filter(url).map({url, product_id})` (ten sam wzorzec co działające `colors_json`).
  - `app/admin/tkaniny/actions.ts` — `createFabric` i `updateFabric` czytają `production_photos_json` → `parseProductionPhotos` → `validatePhotoProducts` → zapis `production_photos` w INSERT **i** UPDATE.
  - Kolumna `fabrics.production_photos jsonb NOT NULL default '[]'` istnieje (migracja 58, zaaplikowana ręcznie MCP).
- **Render — poprawny:** `app/tkaniny/[slug]/page.tsx` + `FabricProductionPhotos.tsx` renderują sekcję gdy `photos.length > 0`; przy braku zdjęć sekcja się nie pokazuje (poprawnie).

**Wniosek:** to nie błąd logiki zapisu/renderu — zawodzi sama *próba dodania* w panelu.

## Dwie wiodące przyczyny (wprost z kodu)
1. **Format zdjęcia (dla „zdjęcia się nie dodają").** `app/_lib/image-upload.ts` → `validateImageUpload` przyjmuje **tylko** `image/jpeg|png|webp|avif`. `app/_lib/image-compress.ts` → `compressIfNeeded` NIE konwertuje HEIC (zachowuje `file.type`, poza png→jpeg; przy <800 KB w ogóle nie rusza pliku). Zdjęcie „mebla na żywo" z iPhone = **HEIC** → odrzucone (czerwony komunikat pod uploadem „Dozwolone formaty: JPG, PNG, WebP, AVIF"), url nie ustawiony → wiersz odfiltrowany → zapisuje się `[]`. Próbki działały, bo to JPG/PNG (skany katalogowe).
2. **Link produktu wymaga DOKŁADNEJ nazwy (dla „linki się nie dodają").** `FabricsEditor.tsx` → `setPhotoProduct` ustawia `productId` tylko gdy `pickerProducts.find(p => p.name === query)` (native `<datalist>`, exact-match). Wpisanie fragmentu / niewybranie pozycji z listy → `product_id` = null → brak linku.
3. **Do wykluczenia:** po wgraniu zdjęcia trzeba kliknąć **„Zapisz zmiany"** na tkaninie (upload ≠ zapis).

## Czego brakuje do 100% pewności
Nie odtworzono na żywo — panel admina wymaga logowania (brak dostępu w sesji). Potrzebny 1 objaw od zgłaszającego **albo** dostęp do admina (odtworzenie Playwrightem):
- Po wybraniu pliku: pojawia się **miniatura**, czy **czerwony błąd**? (błąd → przyczyna 1, format)
- Czy kliknięto **„Zapisz zmiany"**?
- Przy linku: produkt **wybrany z rozwijanej listy**, czy wpisany ręcznie?

## Kandydaci na poprawkę (po potwierdzeniu — jeszcze NIE zrobione)
- **Format:** dopuścić HEIC/HEIF i konwertować klient-side do JPG w `compressIfNeeded` (np. przez `heic2any` albo canvas gdy przeglądarka dekoduje), lub minimum: czytelniejszy komunikat „przekonwertuj zdjęcie do JPG". Zmiana dotknie `image-upload.ts` (allowlist) i/lub `image-compress.ts`.
- **Link:** dopasowanie produktu nieczułe na wielkość liter / po fragmencie (albo prawdziwy select z id zamiast `<datalist>`), zamiast exact-match po nazwie. Zmiana w `FabricsEditor.tsx` (`setPhotoProduct`).

## Szybki re-check bazy (read-only)
```sql
select name, jsonb_array_length(production_photos) n, production_photos
from public.fabrics
where production_photos <> '[]'::jsonb;
```
Pusto = nadal 0 zapisanych zdjęć z produkcji.
