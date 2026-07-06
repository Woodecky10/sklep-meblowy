# Zdjęcia sekcji opisu bez ucinania + domyślna dostawa/gwarancja — spec

**Data:** 2026-07-06
**Status:** zatwierdzony projekt (brainstorming z użytkownikiem)

Dwie niezależne, małe funkcje panelu admina / karty produktu.

## A. Dopasowanie zdjęć w sekcjach opisu produktu

### Problem
`ProductDescriptionSections` renderuje każdą sekcję `image` w sztywnym
kontenerze `aspect-[16/9]` z `object-cover` — zdjęcia o innych proporcjach są
przycinane (góra/dół lub boki).

### Model danych
`ProductDescriptionSectionImage` (`app/_lib/types.ts`) dostaje opcjonalne pole:

```ts
export type ProductDescriptionSectionImage = {
  kind: "image";
  image_url: string;
  image_alt: string;
  caption?: string;
  // Tryb wyświetlania na karcie produktu. Brak pola = "całe zdjęcie"
  // (naturalne proporcje, nic nie ucinane). "wide" = kadr panoramiczny 16:9
  // z przycięciem (object-cover) — dotychczasowy wygląd.
  display?: "wide";
};
```

- **Brak pola = tryb naturalny (domyślny).** Zgodność wstecz: istniejące
  sekcje w DB nie mają pola → od wdrożenia przestają być ucinane bez migracji.
- Zapisujemy `display: "wide"` tylko gdy admin wybrał kadr; wybór „Całe
  zdjęcie" usuwa pole (JSON bez szumu).

### Karta produktu (`app/_components/ui/ProductDescriptionSections.tsx`, ImageSection)
- `display === "wide"` → dotychczasowy render: `aspect-[16/9]` + next/image
  `fill` + `object-cover` (bez zmian).
- tryb naturalny → obraz w pełnej szerokości kontenera, wysokość wg proporcji
  oryginału: zwykły `<img>` z `w-full h-auto rounded-2xl` + `loading="lazy"`
  (precedens w repo: FabricSwatchGroup używa `<img>` z eslint-disable;
  wymiary intrinsic nie są znane, więc next/image `fill` odpada).
- Caption i tło/zaokrąglenia jak dotychczas. Dotyczy PL i DE (sekcje DE to
  osobna tablica `description_sections_de` — pole `display` przechodzi przez
  te same typy; istniejące sekcje DE bez pola też stają się naturalne).

### Admin (`app/admin/produkty/[id]/DescriptionSectionsEditor.tsx`, ImageSectionRow)
- Obok pól alt/podpis przełącznik „Wyświetlanie": **„Całe zdjęcie"** (domyślne)
  / **„Kadr panoramiczny 16:9"** — `<select>` w stylu istniejących inputów.
- Zmiana → `patchSection(idx, { display: v === "wide" ? "wide" : undefined })`.
- Miniatura podglądu w wierszu edytora odzwierciedla tryb (naturalne vs 16:9).
- Akcja zapisu sekcji: sprawdzić, czy nie wycina nieznanych pól (whitelista /
  sanityzacja w `app/admin/produkty/actions.ts` lub `product-html.ts`) — jeśli
  wycina, dodać `display` do przepuszczanych pól. Dotyczy też ścieżki zapisu
  tłumaczeń (sekcje DE), by pole nie znikało przy zapisie DE.

## B. Domyślna dostawa i gwarancja dla nowych produktów

### Problem
Nowy produkt startuje z `delivery_time: null` i `warranty: null` — admin musi
za każdym razem wpisywać te same wartości ręcznie.

### Zmiana
`buildNewProductPayload` (`app/_lib/new-product.ts`):

```ts
delivery_time: DEFAULT_DELIVERY_TIME, // "21 dni roboczych"
warranty: DEFAULT_WARRANTY,           // "2 lata"
```

Stałe `DEFAULT_DELIVERY_TIME` / `DEFAULT_WARRANTY` eksportowane z
`app/_lib/spec-format.ts` (obok normalizatorów — jedno źródło kanonicznych
formatów; oba stringi mają już tłumaczenia w mapach DE).

- Pola pozostają edytowalne w adminie; auto-normalizacja przy zapisie
  (spec-format) działa bez zmian.
- Istniejących produktów nie ruszamy (wszystkie mają już wartości po
  migracji 44).

## Testy / weryfikacja
- Unit: payload nowego produktu zawiera domyślne wartości (rozszerzenie/nowy
  test `new-product`); stałe zgodne z kluczami map DE (`DELIVERY_TIME_DE`,
  `WARRANTY_DE`) — asercja pilnująca spójności tłumaczeń.
- Pełny zestaw vitest + `tsc --noEmit` + `npm run build`.
- Playwright na lokalnym buildzie produkcyjnym: (1) karta produktu z sekcją
  image bez `display` → obraz bez kontenera 16:9 (naturalna wysokość);
  (2) formularz admina sekcji ma przełącznik; (3) formularz nowego produktu —
  weryfikacja domyślnych wartości BEZ tworzenia produktu na produkcyjnej DB
  (prefill widoczny w edytorze dopiero po utworzeniu — więc weryfikacja
  ogranicza się do asercji unit na payloadzie).

## Poza zakresem (świadomie)
- Ręczny edytor kadrowania (drag/zoom) — YAGNI.
- Zmiany galerii głównej produktu i zdjęć slidera/kafelków.
- Migracja danych istniejących sekcji (brak pola = poprawne domyślne).
