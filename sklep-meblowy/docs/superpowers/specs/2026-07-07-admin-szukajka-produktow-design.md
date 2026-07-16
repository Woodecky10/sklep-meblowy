# Wyszukiwarka produktów w panelu admina — design

Data: 2026-07-07

## Cel

Pole „Szukaj" nad listą produktów w `/admin/produkty`, filtrujące listę
natychmiast przy pisaniu (bez przeładowania strony) — żeby przy rosnącym
katalogu dało się szybko znaleźć produkt do edycji. UX trywialny (panel
obsługuje osoba nietechniczna).

## Decyzja (z brainstormu)

Wariant A: filtr kliencki na żywo. Wszystkie produkty i tak są ładowane na
tę stronę w całości (dziesiątki sztuk, bez paginacji) — filtrowanie po
stronie przeglądarki daje natychmiastowy feedback bez podróży na serwer.
(Odrzucony wariant B: serwerowa szukajka `?q=` jak w zamówieniach — wolniejsze
wrażenie przy tej skali.)

## Zmiany

### 1. `app/_lib/search-normalize.ts` — czysta funkcja (nowy plik)

```ts
export function normalizeSearchText(input: string): string
```

Małe litery → `normalize("NFD")` + zdjęcie znaków łączących (diakrytyki)
→ jawne mapowanie `ł→l` (NFD nie rozkłada ł/Ł) → trim. Dzięki temu
„lozko" znajdzie „Łóżko", „SOFA" znajdzie „sofa".
Test jednostkowy: `app/_lib/__tests__/search-normalize.test.ts`
(diakrytyki, ł/Ł, wielkość liter, spacje).

### 2. `app/admin/produkty/ProductsList.tsx` — nowy client component

- Przejmuje z `page.tsx` renderowanie listy (markup wiersza bez zmian:
  miniatura, nazwa + badge „ukryty", metadane, Edytuj /
  ToggleProductActiveButton / DeleteProductButton — to już client
  componenty).
- Props: lekka projekcja produktów (serwer NIE wysyła pełnego JSON-a
  wariantów do klienta):

```ts
type AdminProductRow = {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;          // policzony na serwerze (totalProductStock/stock)
  variantCount: number;   // policzony na serwerze
  thumb: string | null;   // images[0]
  isActive: boolean;
};
```

- Stan: `const [query, setQuery] = useState("")`. Dopasowanie:
  `normalizeSearchText(name).includes(q) || normalizeSearchText(category).includes(q)`
  gdzie `q = normalizeSearchText(query)`; puste `q` = pełna lista.
- Pole szukania nad listą, w kontenerze z **`data-guard-ignore`** —
  wpisywanie w filtr nie może uzbrajać `UnsavedChangesGuard` (ten sam
  mechanizm co szukajka w `/admin/zamowienia`). Placeholder:
  „Szukaj: nazwa lub kategoria…", przycisk × czyści (widoczny gdy
  `query` niepuste).
- Licznik: bez filtra jak dziś („Łącznie: N produktów…"); z aktywnym
  filtrem „X z N produktów". Pusty wynik filtra: komunikat
  „Brak produktów dla «fraza»." (istniejący pusty stan „Brak produktów…"
  zostaje dla pustego katalogu).

### 3. `app/admin/produkty/page.tsx` — odchudzenie

Server component: pobiera produkty (bez zmian), mapuje na
`AdminProductRow[]` (stock/variantCount/thumb liczone tu — `hasVariants`,
`totalProductStock` zostają po stronie serwera) i renderuje
`<ProductsList products={rows} />`. Nagłówek + przycisk „+ Nowy produkt"
+ obsługa błędu ładowania zostają w page.

## Testy / weryfikacja

- Unit: `normalizeSearchText` (przypadki: „Łóżko"→„lozko", „SOFA"→„sofa",
  diakrytyki ą/ę/ś/ż/ź/ć/ń/ó, trim) + logika filtra (nazwa, kategoria,
  pusta fraza).
- `npx tsc --noEmit` + pełna suita.
- Smoke wizualny (Playwright/dev, admin wymaga logowania — jeśli brak
  auth: ręczna weryfikacja przez Mikołaja): wpisanie frazy zawęża listę
  bez przeładowania, × czyści, guard nie odpala się przy wyjściu ze
  strony po samym szukaniu.

## Poza zakresem

- Paginacja listy produktów (przy setkach produktów do rozważenia razem
  z serwerową szukajką).
- Filtrowanie po cenie/stocku/statusie (YAGNI — nazwa+kategoria wystarczą).
- Zmiany w szukajce sklepu (`SearchBox`) i w szukajce zamówień.
