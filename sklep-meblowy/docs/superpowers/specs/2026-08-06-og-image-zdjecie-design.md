# Kafelek udostępnień (og:image) — zdjęcie zamiast plakatu z napisem — projekt

**Data:** 2026-08-06
**Autor decyzji produktowych:** Mikołaj (właściciel)
**Status:** zatwierdzony, do implementacji

## Problem

Przy wklejeniu linku na Facebooka wyświetla się czarna kafla z napisem
**„Meble tapicerowane na wymiar"**. Dwa niezależne problemy:

1. **Treść jest nieprawdziwa** — Mollien nie robi mebli na wymiar. Napis jest
   zaszyty na sztywno w `app/og/route.tsx:72`, drugi raz jako tekst alternatywny
   w `app/_lib/seo-og.ts:27`.
2. **Wygląda źle** — pusty granat plus dwie linijki tekstu. Facebook i tak
   dokleja pod obrazkiem pasek z domeną i tytułem strony, więc napis na grafice
   jest _drugim_ nagłówkiem w tym samym kafelku.

Kafelek dotyczy stron bez własnych zdjęć (home, `/sklep`, podstrony). Karty
produktów mają własne `og:image` ze zdjęć produktu i ta ścieżka się nie zmienia.

## Decyzje właściciela

- **Zdjęcie mebla, bez żadnego napisu na grafice.** Branding niesie pasek
  Facebooka pod spodem.
- **Zdjęcie wskazywane jawnie w panelu**, nie brane automatycznie z pierwszego
  slajdu hero. Uzasadnienie w „Odrzucone warianty".
- Wartość startowa = zdjęcie z pierwszego slajdu (beżowy narożnik we wnętrzu).

## Ustalenia zweryfikowane empirycznie

Wszystkie poniższe sprawdzone przed spisaniem specu, nie zakładane:

| Ustalenie | Dowód |
|---|---|
| Satori obsługuje `objectFit: "cover"` | jawne `objectFit === "cover"` w `@vercel/og/index.node.js` |
| **Satori NIE rasteryzuje WebP ani AVIF** | render testowy: JPEG OK, PNG OK, WebP → `u2 is not iterable`, AVIF → to samo |
| Rozszerzenia plików w storage kłamią | `…-82deb531….png` ma w środku JPEG (magic `ffd8ff`) |
| Kadr 1200×630 ze slajdu 1 wygląda dobrze | wyrenderowany podgląd; ucinamy 21,3% wysokości (109 px góra/dół) |
| Połowa slajdów wypada źle w tym kadrze | slajd 2 = nierozpoznawalny fragment poduszki; slajd 4 = pasy tkanin (promocja) |
| `sharp` nie jest zadeklarowaną zależnością | brak w `package.json`, tylko tranzytywnie z Next |

Konsekwencja dwóch środkowych wierszy jest krytyczna: `validateImageUpload`
dopuszcza dziś WebP i AVIF, więc **jeden upload WebP wyłączyłby og:image na całym
sklepie** (route rzuca → 500). Dlatego upload kafelka ma węższą allowlistę niż
reszta panelu, a ścieżka odczytu dodatkowo sniffuje magic bytes — bo rozszerzeniu
w tym storage nie można ufać.

## Rozwiązanie

### Dane

Migracja **70**: kolumna `store_settings.og_image_url text NULL`.

### Odczyt

Nowy moduł `app/_lib/og-image-settings.ts` — własny tag cache `og-image`,
wzorzec jak `store-settings.ts` (bare anon client wewnątrz `unstable_cache`,
fallback per wywołanie, nie per wpis cache).

Świadomie **nie** doklejam kolumny do `theme-settings.ts`: zdjęcie udostępnień
nie jest częścią motywu, a wspólny tag zmuszałby do przerysowania obrazka przy
każdej zmianie koloru.

### Czyste helpery — `app/_lib/og-image.ts`

Bez I/O, w całości pokryte testami:

- `sniffImageMime(bytes): "image/jpeg" | "image/png" | null` — po magic bytes.
- `ogPhotoCandidates(configuredUrl, slides): string[]` — kolejność prób:
  skonfigurowane zdjęcie → pierwszy aktywny slajd ze zdjęciem. Pusta lista =
  karta brandowa.

### `app/og/route.tsx`

Kolejno: pobierz kandydatów → dla każdego `fetch` z timeoutem → sniff magic
bytes → pierwszy, który jest JPEG-iem albo PNG-iem, wchodzi jako `<img>` na
całą powierzchnię (`objectFit: "cover"`, 1200×630, bez nakładki i bez tekstu).

Bajty idą do Satori jako `data:` URI — pobieramy raz i w `try/catch`, zamiast
zostawiać `<img src="https://…">` i pozwalać Satori pobierać samodzielnie, bo
wtedy błąd sieci leci w środku renderu i kończy się pustym `og:image`.

**Fallback:** gdy żaden kandydat nie przejdzie — obecna karta brandowa
(granat/złoto/krem z motywu), ale z podpisem bez „na wymiar". Udostępnienie
nigdy nie idzie bez obrazka.

`revalidate = 3600` zostaje. Nawet gdyby propagacja tagów cache zawiodła,
najgorszy skutek to godzina opóźnienia, a nie trwale zamrożony obrazek.

### Panel — `/admin/wyglad`

Karta „Zdjęcie do udostępnień" w `ThemeEditor`: upload, podgląd w **dokładnym**
kadrze 1200×630 (`aspect-[1200/630]` + `object-cover`), przycisk usunięcia,
zdanie wyjaśniające, gdzie to widać.

Format rozwiązany **konwersją, nie odmową** — decyzja zmieniona w trakcie
implementacji, gdy okazało się, że repo ma już `browser-image-compression`
(używa go `admin/slider`). Karta przepuszcza wgrany plik przez ten sam
kompresor z `fileType: "image/jpeg"`, więc WebP i AVIF są po cichu
konwertowane w przeglądarce, zamiast być odbijane komunikatem. Konwersja jest
bezwarunkowa — także dla plików małych, bo chodzi o format, nie o wagę.

Serwerowa allowlista JPG/PNG (`OG_IMAGE_MIME`, trzeci parametr
`validateImageUpload`) zostaje jako **druga bramka** na wypadek wysyłki
z pominięciem UI.

Bucket: istniejący, publiczny `home-slides` — bez nowej infrastruktury. Stary
plik kasowany po podmianie, tak jak w `admin/slider/actions.ts`.

## Odrzucone warianty

**Automat „bierz pierwszy aktywny slajd".** Kuszący, bo zero panelu. Odrzucony,
bo połowa slajdów wypada w tym kadrze źle, a slajd 4 to slajd promocyjny — a
promocje z natury wskakują na pierwsze miejsce podczas kampanii. Zepsucie byłoby
niewidoczne z poziomu strony (na stronie slider wygląda dobrze) i nikt by go nie
zauważył przez miesiące. Zostaje jako _fallback_, nie jako główna ścieżka.

**Próg proporcji odrzucający zdjęcia o złym kadrze.** Żeby przepuścić slajd 1
(1.50), a odciąć slajd 2 (1.25), próg musiałby stanąć koło 1.4 — dobrany pod
dzisiejsze dwa pliki. Ola dostawałaby ciche „twoje zdjęcie nie weszło" bez
wyjaśnienia.

**Konwersja WebP/AVIF → JPEG przez `sharp` na serwerze.** `sharp` nie jest
zadeklarowaną zależnością (wchodzi tylko tranzytywnie z Next), a dokładanie jej
do produkcji dla jednego pola w panelu to zły handel. Konwersję robi zamiast
tego przeglądarka — patrz „Panel".

**Napis albo logo na zdjęciu.** Facebook renderuje pod obrazkiem własny pasek z
domeną i tytułem. Tekst na grafice dublowałby nagłówek.

## Testy

Jednostkowe (vitest) na `sniffImageMime` (JPEG, PNG, WebP, AVIF, śmieci, za
krótkie wejście) i `ogPhotoCandidates` (kolejność, puste, slajdy bez zdjęć).
Route weryfikowany ręcznie: `/og` musi zwrócić PNG 1200×630, a po wgraniu
nieobsługiwanego formatu — kartę brandową, nie błąd 500.

## Zaległości po wdrożeniu (nie w kodzie)

- **Przeskrobać adres w Facebook Sharing Debugger.** FB trzyma grafikę w cache;
  bez tego nowe posty dalej pokażą czarną kartę. Post, który już wisi, może
  zostać ze starą grafiką na stałe.
- **Wklejać adres z `www`.** Apex robi 308 i część scraperów się na tym gubi —
  ten sam rozjazd apex/www, który blokuje Search Console.
