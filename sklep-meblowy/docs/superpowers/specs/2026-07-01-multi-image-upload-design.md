# Multi-image upload w adminie (multi-select + drag & drop)

Data: 2026-07-01

## Cel

Umożliwić dodawanie wielu zdjęć na raz z panelu admina — przez zaznaczenie
wielu plików w oknie wyboru oraz przez przeciągnięcie (drag & drop). Dotyczy
trzech miejsc: głównej galerii produktu, zdjęć wariantów i zdjęć w sekcjach
opisu.

## Stan obecny

Trzy komponenty uploadują zdjęcia tym samym wzorcem, ale każdy ma własną,
zduplikowaną kopię logiki (pojedynczy plik → `compressIfNeeded` →
`uploadProductImage` → doklej URL → osobny „Zapisz"):

- `app/admin/produkty/[id]/ProductEditor.tsx` — galeria `products.images[]`
- `app/admin/produkty/[id]/VariantsEditor.tsx` — `variants.combinations[].images[]`
- `app/admin/produkty/[id]/DescriptionSectionsEditor.tsx` — sekcje opisu (obraz na pozycji)

Wszystkie: `<input type="file">` bez `multiple`, jeden plik na raz, sekwencyjnie.
Serwerowa akcja `uploadProductImage(formData)` przyjmuje jeden plik (walidacja
formatu 8 MB / jpg-png-webp-avif, nazwa `${Date.now()}-${uuid}.${ext}`, zapis do
bucketu `products` przez `createAdminClient()` / service_role).

## Architektura (2 nowe jednostki wielokrotnego użytku)

### 1. `uploadImageFiles(files, { onProgress? })` — klient (`app/_lib/`)

- Wejście: `File[]` (z pickera lub z drop).
- Dla każdego pliku: `compressIfNeeded` → `uploadProductImage`.
- Ograniczona równoległość: **max 3 uploady jednocześnie** (szybciej niż
  sekwencyjnie, bez zalewania serwera).
- Zachowuje kolejność wybranych plików w wyniku.
- Zwraca `{ urls: string[]; failures: { name: string; error: string }[] }`.
- **Serwer bez zmian** — reużywamy akcji jeden-plik N razy.

### 2. `<ImageDropzone onUploaded multiple? disabled? />` — wspólny UI (klient)

- Renderuje przycisk „+ Dodaj zdjęcia" (`<input multiple accept="image/*">`)
  oraz strefę drop z podświetleniem przy `dragover`.
- Obsługuje `dragover`/`dragleave`/`drop`, filtruje do plików obrazów.
- Woła `uploadImageFiles`, pokazuje postęp „Wgrywam N/M…".
- Po zakończeniu: `onUploaded(urls)`; jeśli są `failures` → toast zbiorczy.
- Reset `input.value` po wyborze. Blokada podwójnego uploadu (stan `uploading`).

## Podłączenie

- **Galeria** (ProductEditor): `onUploaded(urls) => setImages(prev => [...prev, ...urls])`.
- **Warianty** (VariantsEditor, per kombinacja): doklej `urls` do `combo.images`.
- **Sekcje opisu** (DescriptionSectionsEditor): wstaw **N sekcji-obrazów** na
  wybranej pozycji, w kolejności `urls`.

Zachowane bez zmian: kompresja, walidacja, miniatury, reorder/usuwanie, wzorzec
„wgraj → Zapisz", DB, akcje serwerowe.

## Błędy i przypadki brzegowe

- **Częściowa porażka:** dobre pliki wgrywają się mimo błędnych; toast zbiorczy
  „Wgrano X, nie udało się Y: nazwa — powód". Jeden zły plik nie przerywa reszty.
- Ponowny wybór tych samych plików działa (reset `value`).
- Drop nie-obrazów → ignorowane / zgłoszone w failures.

## Testy / weryfikacja

- `npm run build` + lokalny `next start`.
- Ręcznie: multi-select i drag & drop w galerii oraz w wariantach; wszystkie
  URL-e trafiają do stanu, „Zapisz" utrwala, częściowa porażka raportowana.
- Vitest: test jednostkowy `uploadImageFiles` — kolejność wyników i zbieranie
  `failures` przy zamockowanej akcji `uploadProductImage`.

## Poza zakresem (YAGNI)

- Zmiany w schemacie DB i w akcjach serwerowych.
- Pasek postępu per plik (wystarczy licznik N/M).
- Twardy limit liczby zdjęć (dziś brak — nie wprowadzamy).
