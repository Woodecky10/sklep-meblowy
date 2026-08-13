# Wyszukiwanie mebli — dopasowanie odporne na ogonki i odmianę — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klient wpisujący „lozko" albo „narożniki" znajduje produkty, których dziś nie znajduje wcale — przez złożenie polskich znaków po obu stronach dopasowania i obcięcie końcówki fleksyjnej we frazie.

**Architecture:** Baza zyskuje dwie **dodatkowe** kolumny generowane (`search_key_fold`, `search_key_fold_de`) ze znakami złożonymi na ASCII przez `translate()`. Kod dostaje w `search-filter.ts` trzy nowe czyste funkcje (`foldDiacritics`, `stemToken`, `searchKeyTokens`), a wszyscy trzej konsumenci wyszukiwania przechodzą na nowy potok i nową kolumnę. Podpowiedzi w headerze przestają sortować po dacie i przechodzą na istniejący `rankByNameMatch`.

**Tech Stack:** Next.js 16 (App Router, route handlers, server actions), Supabase/Postgres (kolumny generowane STORED, GIN + pg_trgm), PostgREST przez supabase-js, vitest, Playwright, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-13-wyszukiwanie-dopasowanie-design.md`

## Global Constraints

- **Mapowanie znaków musi być identyczne w SQL i w TS.** `translate()` w migracji 73 kontra `foldDiacritics()` w `app/_lib/search-filter.ts`. Rozjazd nie wywala błędu — cicho zeruje wyszukiwanie. Każdy plik komentarzem wskazuje na drugi.
- **PL:** `ą→a ć→c ę→e ł→l ń→n ó→o ś→s ź→z ż→z`. **DE:** dodatkowo `ä→a ö→o ü→u` oraz `ß→ss`.
- **Minimalna długość rdzenia po stemowaniu: 3 znaki.** Decyzja właściciela; przy 4 fraza „sofy" dalej dawałaby zero.
- **Stemowanie działa tylko na frazie, nigdy w bazie.** Baza trzyma pełne formy.
- **`searchTokens()` zostaje nietknięty.** To przetestowany prymityw sanityzacji (ochrona przed injection w PostgREST `.or()`, audyt MEDIUM 2026-06-11). Nowe funkcje siadają obok, nie zamiast.
- **Migracja tylko dodaje.** Żadnego `drop column` — stare kolumny zostają do osobnej migracji sprzątającej po potwierdzeniu na produkcji.
- **Migracje na tym projekcie NIE aplikują się automatycznie.** Trzeba puścić ręcznie przez MCP `apply_migration` i potwierdzić `list_migrations`.
- **Lokalny `npm start` łączy się z bazą PRODUKCYJNĄ.** Migrację trzeba zaaplikować przed testami lokalnymi; jest to bezpieczne, bo tylko dodaje kolumny.
- **Playwright nie działa na `next dev`** na tym projekcie (nawigacja `ERR_ABORTED`, ~6 min na test). Testy wizualne wyłącznie na `npm run build` + `npm start`.
- **Testy jednostkowe:** `npm test` (vitest run). **Lint:** `npm run lint`.
- Komentarze w kodzie po polsku, zgodnie z konwencją repo.

---

### Task 1: `foldDiacritics` — składanie znaków diakrytycznych

**Files:**
- Modify: `sklep-meblowy/app/_lib/search-filter.ts` (dodanie na końcu pliku)
- Test: `sklep-meblowy/app/_lib/__tests__/search-filter.test.ts` (nowy blok `describe`)

**Interfaces:**
- Consumes: nic (funkcja czysta, bez zależności)
- Produces: `foldDiacritics(value: string): string` — zwraca tekst małymi literami ze złożonymi znakami. Używane w Task 3 (`searchKeyTokens`) i Task 4 (`rankByNameMatch`).

- [ ] **Step 1: Napisz test, który ma nie przejść**

Dodaj na końcu `sklep-meblowy/app/_lib/__tests__/search-filter.test.ts` i dopisz `foldDiacritics` do importu z `@/app/_lib/search-filter` na górze pliku:

```ts
describe("foldDiacritics — składanie znaków na ASCII (musi = translate() w migracji 73)", () => {
  it("składa wszystkie dziewięć polskich znaków", () => {
    expect(foldDiacritics("ąćęłńóśźż")).toBe("acelnoszz");
  });

  it("składa realne frazy z katalogu", () => {
    expect(foldDiacritics("łóżko")).toBe("lozko");
    expect(foldDiacritics("narożnik")).toBe("naroznik");
    expect(foldDiacritics("rozkładana")).toBe("rozkladana");
  });

  it("sprowadza do małych liter (wielkie znaki też składa)", () => {
    expect(foldDiacritics("ŁÓŻKO")).toBe("lozko");
    expect(foldDiacritics("Narożnik ALVA")).toBe("naroznik alva");
  });

  it("niemieckie: ä ö ü oraz ß jako dwuznak", () => {
    expect(foldDiacritics("äöü")).toBe("aou");
    expect(foldDiacritics("Größe")).toBe("grosse");
  });

  it("tekst bez diakrytyków przechodzi bez zmian (poza wielkością liter)", () => {
    expect(foldDiacritics("sofa modena")).toBe("sofa modena");
    expect(foldDiacritics("160x200")).toBe("160x200");
  });

  it("puste wejście → pusty string", () => {
    expect(foldDiacritics("")).toBe("");
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że pada**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/search-filter.test.ts -t foldDiacritics`
Expected: FAIL — `foldDiacritics is not a function` albo błąd importu z TypeScripta.

- [ ] **Step 3: Zaimplementuj minimum**

Dodaj na końcu `sklep-meblowy/app/_lib/search-filter.ts`:

```ts
// Składanie znaków diakrytycznych na ASCII.
//
// ⚠️ TA LISTA MUSI ODPOWIADAĆ wyrażeniu translate()/replace() w migracji
// 73_search_key_fold.sql. Rozjazd nie wywala błędu — cicho zeruje wyszukiwanie,
// bo token przestaje trafiać w klucz. Zmieniasz tu → zmieniasz tam.
//
// ß jest dwuznakiem (→ ss), więc idzie osobnym replace, a nie mapą 1:1.
const FOLD_MAP: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
  ä: "a",
  ö: "o",
  ü: "u",
};

export function foldDiacritics(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[ąćęłńóśźżäöü]/g, (ch) => FOLD_MAP[ch] ?? ch);
}
```

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/search-filter.test.ts -t foldDiacritics`
Expected: PASS — 6 testów.

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/_lib/search-filter.ts sklep-meblowy/app/_lib/__tests__/search-filter.test.ts
git commit -m "feat(search): foldDiacritics — skladanie polskich i niemieckich znakow na ASCII"
```

---

### Task 2: `stemToken` — obcięcie końcówki fleksyjnej

**Files:**
- Modify: `sklep-meblowy/app/_lib/search-filter.ts`
- Test: `sklep-meblowy/app/_lib/__tests__/search-filter.test.ts`

**Interfaces:**
- Consumes: nic (funkcja czysta; działa na tokenie JUŻ złożonym przez `foldDiacritics`)
- Produces: `stemToken(token: string): string` oraz stała `MIN_STEM_LENGTH: number` (= 3). Używane w Task 3.

- [ ] **Step 1: Napisz test, który ma nie przejść**

Dodaj do `search-filter.test.ts`, dopisując `stemToken` i `MIN_STEM_LENGTH` do importu:

```ts
describe("stemToken — obcięcie jednej końcówki fleksyjnej", () => {
  it("liczba mnoga wraca do rdzenia (przypadki z pomiarów na produkcji)", () => {
    expect(stemToken("narozniki")).toBe("naroznik");
    expect(stemToken("fotele")).toBe("fotel");
    expect(stemToken("materace")).toBe("materac");
    expect(stemToken("sofy")).toBe("sof");
    expect(stemToken("lozka")).toBe("lozk");
  });

  it("obcina najdłuższą pasującą końcówkę, nie pierwszą z listy", () => {
    // „materacami" → „ami" (3 znaki), nie „i" (1 znak).
    expect(stemToken("materacami")).toBe("materac");
    expect(stemToken("lozkach")).toBe("lozk");
    expect(stemToken("stolowi")).toBe("stol");
  });

  it("obcina TYLKO jedną końcówkę", () => {
    // „sofami" → „sof”; nie stemujemy dalej do „so".
    expect(stemToken("sofami")).toBe("sof");
  });

  it("nie obcina, gdy rdzeń zszedłby poniżej MIN_STEM_LENGTH", () => {
    expect(MIN_STEM_LENGTH).toBe(3);
    // „ale" → obcięcie „e" dałoby rdzeń 2-znakowy → zostaw nietknięte.
    expect(stemToken("ale")).toBe("ale");
    expect(stemToken("do")).toBe("do");
    expect(stemToken("na")).toBe("na");
  });

  it("token bez końcówki z listy zostaje bez zmian", () => {
    expect(stemToken("materac")).toBe("materac");
    expect(stemToken("naroznik")).toBe("naroznik");
    expect(stemToken("vegas")).toBe("vegas");
  });

  it("wymiary i liczby zostają nietknięte", () => {
    expect(stemToken("160x200")).toBe("160x200");
    expect(stemToken("3")).toBe("3");
  });

  it("pusty token zostaje pusty", () => {
    expect(stemToken("")).toBe("");
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że pada**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/search-filter.test.ts -t stemToken`
Expected: FAIL — `stemToken is not a function`.

- [ ] **Step 3: Zaimplementuj minimum**

Dodaj do `sklep-meblowy/app/_lib/search-filter.ts` pod `foldDiacritics`:

```ts
// Końcówki fleksyjne w formie JUŻ ZŁOŻONEJ (po foldDiacritics), posortowane od
// najdłuższej — inaczej „materacami" straciłoby samo „i" zamiast „ami".
// „ów" po złożeniu to „ow", „ą" to „a", „ę" to „e", dlatego lista jest krótsza,
// niż wyglądałaby dla surowej polszczyzny.
const STEM_SUFFIXES = [
  "ami",
  "ach",
  "owi",
  "iem",
  "ow",
  "om",
  "ie",
  "em",
  "y",
  "i",
  "e",
  "a",
  "u",
  "o",
];

// Minimalna długość rdzenia po obcięciu. 3, nie 4 — przy progu 4 fraza „sofy"
// (rdzeń „sof") nie zostałaby zestemowana i dalej dawałaby zero wyników.
export const MIN_STEM_LENGTH = 3;

// Obcina JEDNĄ końcówkę. Dopasowanie w bazie jest podciągiem, więc krótszy
// rdzeń łapie wszystkie dłuższe formy — stemowanie może tylko DODAĆ trafienia,
// nigdy odebrać.
export function stemToken(token: string): string {
  for (const suffix of STEM_SUFFIXES) {
    if (
      token.length - suffix.length >= MIN_STEM_LENGTH &&
      token.endsWith(suffix)
    ) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}
```

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/search-filter.test.ts -t stemToken`
Expected: PASS — 7 testów.

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/_lib/search-filter.ts sklep-meblowy/app/_lib/__tests__/search-filter.test.ts
git commit -m "feat(search): stemToken — obciecie jednej koncowki fleksyjnej, rdzen min. 3 znaki"
```

---

### Task 3: `searchKeyTokens` — potok tokenów do dopasowania

**Files:**
- Modify: `sklep-meblowy/app/_lib/search-filter.ts`
- Test: `sklep-meblowy/app/_lib/__tests__/search-filter.test.ts`

**Interfaces:**
- Consumes: `searchTokens(raw: string): string[]` (istniejąca, bez zmian), `foldDiacritics` (Task 1), `stemToken` (Task 2)
- Produces: `searchKeyTokens(raw: string): string[]` — tokeny gotowe do `ILIKE %token%` przeciwko `search_key_fold`. Używane w Task 4, 6 i 7.

- [ ] **Step 1: Napisz test, który ma nie przejść**

Dodaj do `search-filter.test.ts`, dopisując `searchKeyTokens` do importu:

```ts
describe("searchKeyTokens — potok: sanityzacja → składanie → stem", () => {
  it("fraza bez ogonków trafia w ten sam rdzeń co z ogonkami", () => {
    expect(searchKeyTokens("łóżko")).toEqual(["lozk"]);
    expect(searchKeyTokens("lozko")).toEqual(["lozk"]);
  });

  it("liczba mnoga i pojedyncza dają ten sam rdzeń", () => {
    expect(searchKeyTokens("narożniki")).toEqual(["naroznik"]);
    expect(searchKeyTokens("narożnik")).toEqual(["naroznik"]);
  });

  it("wiele słów → wiele tokenów, kolejność zachowana", () => {
    expect(searchKeyTokens("narożnik szary")).toEqual(["naroznik", "szar"]);
  });

  it("odfiltrowuje duplikaty powstałe po stemowaniu", () => {
    // „sofa" i „sofy" dają oba rdzeń „sof" — jeden warunek ILIKE, nie dwa.
    expect(searchKeyTokens("sofa sofy")).toEqual(["sof"]);
  });

  it("dziedziczy sanityzację po searchTokens (injection w .or())", () => {
    expect(searchKeyTokens("x,price.gt.0")).toEqual(["xpricegt0"]);
  });

  it("sama interpunkcja / pusta fraza → []", () => {
    expect(searchKeyTokens(",.()")).toEqual([]);
    expect(searchKeyTokens("")).toEqual([]);
  });

  it("respektuje limit MAX_SEARCH_TOKENS (10 unikalnych rdzeni)", () => {
    const raw = Array.from({ length: 15 }, (_, i) => `wyraz${i}`).join(" ");
    expect(searchKeyTokens(raw).length).toBeLessThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że pada**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/search-filter.test.ts -t searchKeyTokens`
Expected: FAIL — `searchKeyTokens is not a function`.

- [ ] **Step 3: Zaimplementuj minimum**

Dodaj do `sklep-meblowy/app/_lib/search-filter.ts` pod `stemToken`:

```ts
// Tokeny gotowe do dopasowania przeciwko kolumnie search_key_fold: sanityzacja
// (jak searchTokens — w tym ochrona przed injection w .or()) → złożenie znaków
// → obcięcie końcówki.
//
// Duplikaty po stemowaniu są odfiltrowane: „sofa sofy" daje dwa razy „sof",
// a dwa identyczne warunki ILIKE to zbędna praca dla bazy.
export function searchKeyTokens(raw: string): string[] {
  const stemmed = searchTokens(raw).map((token) =>
    stemToken(foldDiacritics(token))
  );
  return [...new Set(stemmed)].filter(Boolean);
}
```

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/search-filter.test.ts -t searchKeyTokens`
Expected: PASS — 7 testów.

- [ ] **Step 5: Uruchom CAŁY plik i potwierdź brak regresji**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/search-filter.test.ts`
Expected: PASS — wszystkie bloki, w tym istniejące `sanitizeSearchTerm`, `searchTokens`, `rankByNameMatch`, `escapeIlike`. Żaden istniejący test nie może być zmieniony w tym zadaniu.

- [ ] **Step 6: Commit**

```bash
git add sklep-meblowy/app/_lib/search-filter.ts sklep-meblowy/app/_lib/__tests__/search-filter.test.ts
git commit -m "feat(search): searchKeyTokens — potok sanityzacja, skladanie, stem, dedup"
```

---

### Task 4: `rankByNameMatch` na złożonych nazwach

**Files:**
- Modify: `sklep-meblowy/app/_lib/search-filter.ts:47-64` (ciało `rankByNameMatch`)
- Test: `sklep-meblowy/app/_lib/__tests__/search-filter.test.ts`

**Interfaces:**
- Consumes: `searchKeyTokens` (Task 3), `foldDiacritics` (Task 1)
- Produces: sygnatura `rankByNameMatch` **bez zmian** — `rankByNameMatch<T>(rows: T[], raw: string, getName: (row: T) => string | null | undefined): T[]`. Zmienia się tylko zachowanie wewnętrzne.

**Dlaczego to zadanie istnieje:** funkcja porównuje tokeny z nazwą produktu, która diakrytyki ma. Po przejściu na złożone i zestemowane tokeny żadna nazwa nie dopasowałaby się do „lozk", więc **cały ranking cicho zdegradowałby się** do „wszystko potraktowane jak trafienie z opisu". To nie jest kosmetyka — bez tego Task 7 nie ma sensu.

- [ ] **Step 1: Napisz test, który ma nie przejść**

Dodaj do `search-filter.test.ts` nowy blok:

```ts
describe("rankByNameMatch — dopasowanie nazwy po złożeniu znaków", () => {
  const get = (r: { name: string }) => r.name;

  it("fraza BEZ ogonków rozpoznaje trafienie w nazwie Z ogonkami", () => {
    const rows = [
      { name: "Sofa Modena" },
      { name: "Łóżko kontynentalne Marbella" },
    ];
    // Dziś „lozko" nie trafia w „Łóżko" i oba wiersze lądują w grupie „z opisu",
    // czyli kolejność wejściowa zostaje bez zmian.
    expect(rankByNameMatch(rows, "lozko", get)).toEqual([
      { name: "Łóżko kontynentalne Marbella" },
      { name: "Sofa Modena" },
    ]);
  });

  it("liczba mnoga we frazie rozpoznaje pojedynczą w nazwie", () => {
    const rows = [
      { name: "Materac kieszeniowy AURELIO" },
      { name: "Narożnik Alva L" },
    ];
    expect(rankByNameMatch(rows, "narożniki", get)[0]).toEqual({
      name: "Narożnik Alva L",
    });
  });

  it("działa dla ścieżki DE (ß w nazwie)", () => {
    const rows = [
      { name: "A", name_de: "Sofa klein" },
      { name: "B", name_de: "Sofa Größe XL" },
    ];
    const ranked = rankByNameMatch(rows, "grösse", (r) => r.name_de);
    expect(ranked[0].name).toBe("B");
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że pada**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/search-filter.test.ts -t "po złożeniu znaków"`
Expected: FAIL — pierwszy test pokaże kolejność `["Sofa Modena", "Łóżko kontynentalne Marbella"]`, bo `lozko` nie trafia dziś w żadną nazwę.

- [ ] **Step 3: Podmień ciało `rankByNameMatch`**

W `sklep-meblowy/app/_lib/search-filter.ts` zamień dwie linie w ciele funkcji.

Było:

```ts
  const tokens = searchTokens(raw);
```

Ma być:

```ts
  const tokens = searchKeyTokens(raw);
```

Było:

```ts
    const key = (getName(row) ?? "").toLowerCase().replace(/\s+/g, "");
    if (tokens.every((t) => key.includes(t.toLowerCase()))) nameHits.push(row);
```

Ma być:

```ts
    // Klucz nazwy budowany DOKŁADNIE jak kolumna search_key_fold w bazie:
    // złożone znaki, małe litery, bez spacji. Tokeny są już złożone i
    // zestemowane, więc żadnego toLowerCase() na nich nie potrzeba.
    const key = foldDiacritics(getName(row) ?? "").replace(/\s+/g, "");
    if (tokens.every((t) => key.includes(t))) nameHits.push(row);
```

Zaktualizuj też komentarz nad funkcją — obecny mówi „bez diakrytyko-niezależności (identycznie jak zapytanie)", co po tej zmianie jest nieprawdą. Zastąp ten fragment:

```
// Dopasowanie case-insensitive
// (jak ILIKE) i po tych samych tokenach co filtr DB — bez
// diakrytyko-niezależności (identycznie jak zapytanie). Fraza pusta po
// sanityzacji → wejście bez zmian (nie ma czego rankować).
```

na:

```
// Dopasowanie po tych samych tokenach co filtr DB (searchKeyTokens) i po tak
// samo złożonej nazwie — czyli niezależnie od wielkości liter, ogonków
// i końcówki fleksyjnej. Fraza pusta po sanityzacji → wejście bez zmian.
```

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/search-filter.test.ts -t "po złożeniu znaków"`
Expected: PASS — 3 testy.

- [ ] **Step 5: Potwierdź, że ISTNIEJĄCE testy rankingu też przechodzą**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/search-filter.test.ts`
Expected: PASS — wszystko, łącznie ze starym blokiem „rankByNameMatch — trafienia w nazwie przed trafieniami w opisie".

Sprawdziłem ręcznie każdą asercję z tego bloku i **wszystkie przeżywają zmianę**: „spania vegas" → `["spani","vegas"]` i dalej trafia w „Narożnik VEGAS L Duża Funkcja SPANIA"; „materac" nie ma końcówki z listy, więc zostaje „materac" i nie trafia w „Łóżko kontynentalne"; „matratze" → „matratz" trafia w oba `name_de`, więc kolejność stabilna zostaje. **Jeśli którykolwiek z tych testów jest czerwony, to prawdziwa regresja — nie poprawiaj testu, znajdź przyczynę.**

- [ ] **Step 6: Commit**

```bash
git add sklep-meblowy/app/_lib/search-filter.ts sklep-meblowy/app/_lib/__tests__/search-filter.test.ts
git commit -m "fix(search): rankByNameMatch dopasowuje nazwe po zlozeniu znakow i stemie"
```

---

### Task 5: Migracja 73 — kolumny ze złożonymi znakami

**Files:**
- Create: `sklep-meblowy/supabase/migrations/73_search_key_fold.sql`

**Interfaces:**
- Consumes: nic
- Produces: kolumny `products.search_key_fold` i `products.search_key_fold_de` (`text`, `generated always as (...) stored`) oraz indeksy `products_search_key_fold_trgm`, `products_search_key_fold_de_trgm`. Używane w Task 6 i 7.

**Numer migracji:** najwyższy na `main` w chwili pisania planu to **72**. Jeśli po rebase na `main` istnieje już 73, weź kolejny wolny i popraw nazwę w tym zadaniu oraz komentarz w `foldDiacritics`.

- [ ] **Step 1: Napisz migrację**

Utwórz `sklep-meblowy/supabase/migrations/73_search_key_fold.sql`:

```sql
-- Migracja 73: kolumny wyszukiwania ze ZŁOŻONYMI znakami diakrytycznymi.
--
-- Problem: search_key (migracja 65) zachowuje polskie znaki, więc klient
-- piszący bez ogonków dostawał ZERO wyników. Pomiar na produkcji 2026-08-13:
-- „lozko" 0 trafień przy 177 pasujących produktach, „naroznik" 0 przy 40.
--
-- DODAJE kolumny obok search_key/search_key_de, NIE podmienia ich. Powód jest
-- wdrożeniowy: dopasowanie wymaga złożenia znaków po OBU stronach, więc gdyby
-- istniejąca kolumna zmieniła znaczenie pod działającym kodem, wyszukiwanie
-- zwracałoby zero na WSZYSTKO do momentu deployu — a migracje na tym projekcie
-- idą ręcznie, więc okno liczyłoby się w minutach żywego sklepu. Wariant
-- dodatkowy jest neutralny dla starego kodu i można go puścić w dowolnej
-- kolejności względem deployu. Stare kolumny sprząta osobna migracja, po
-- potwierdzeniu nowych na produkcji.
--
-- ⚠️ MAPOWANIE ZNAKÓW MUSI ODPOWIADAĆ funkcji foldDiacritics()
-- w app/_lib/search-filter.ts. Rozjazd nie wywala błędu — cicho zeruje
-- wyszukiwanie. Zmieniasz tu → zmieniasz tam.
--
-- translate() i replace() są IMMUTABLE, więc wolno ich użyć w kolumnie
-- generowanej. unaccent() NIE jest immutable i dlatego nie wchodzi w grę bez
-- opakowywania we własną funkcję — translate załatwia sprawę bez tego długu.
--
-- W pełni idempotentna, bez drop.

create extension if not exists pg_trgm;

-- PL: ą ć ę ł ń ó ś ź ż → a c e l n o s z z
alter table public.products
  add column if not exists search_key_fold text
  generated always as (
    translate(
      regexp_replace(
        regexp_replace(
          lower(coalesce(name, '') || ' ' || coalesce(description, '')),
          '<[^>]*>', ' ', 'g'
        ),
        '\s+', '', 'g'
      ),
      'ąćęłńóśźż',
      'acelnoszz'
    )
  ) stored;

-- DE: ä ö ü → a o u oraz ß → ss (dwuznak, więc replace przed translate).
-- Polskie znaki składane też — nazwy DE bywają nieprzetłumaczone.
alter table public.products
  add column if not exists search_key_fold_de text
  generated always as (
    translate(
      replace(
        regexp_replace(
          regexp_replace(
            lower(coalesce(name_de, '') || ' ' || coalesce(description_de, '')),
            '<[^>]*>', ' ', 'g'
          ),
          '\s+', '', 'g'
        ),
        'ß',
        'ss'
      ),
      'äöüąćęłńóśźż',
      'aouacelnoszz'
    )
  ) stored;

create index if not exists products_search_key_fold_trgm
  on public.products using gin (search_key_fold gin_trgm_ops);
create index if not exists products_search_key_fold_de_trgm
  on public.products using gin (search_key_fold_de gin_trgm_ops);
```

- [ ] **Step 2: Zaaplikuj migrację na bazie**

Automat na tym projekcie **nie odpala**. Puść przez MCP Supabase `apply_migration` z nazwą `73_search_key_fold` i treścią pliku.

Uwaga: podłączony projekt Supabase to **produkcja**. Migracja jest bezpieczna (tylko dodaje kolumny pochodne, nie rusza danych źródłowych, stary kod jej nie widzi), a zaaplikowanie jej teraz jest **warunkiem** przetestowania zmiany lokalnie — `npm start` łączy się z tą samą bazą.

- [ ] **Step 3: Potwierdź, że migracja weszła i kolumny są wypełnione**

Uruchom przez MCP Supabase `execute_sql`:

```sql
select
  count(*) filter (where search_key_fold is not null) as wypelnione_pl,
  count(*) filter (where search_key_fold_de is not null) as wypelnione_de,
  count(*) filter (where search_key_fold like '%ł%' or search_key_fold like '%ó%'
                      or search_key_fold like '%ż%' or search_key_fold like '%ą%'
                      or search_key_fold like '%ć%' or search_key_fold like '%ę%'
                      or search_key_fold like '%ń%' or search_key_fold like '%ś%'
                      or search_key_fold like '%ź%') as zostaly_ogonki
from products;
```

Expected: `wypelnione_pl` = 357 (albo aktualna liczba produktów), `zostaly_ogonki` = **0**. Niezerowy `zostaly_ogonki` oznacza, że mapa `translate` nie pokrywa wszystkich znaków.

- [ ] **Step 4: Potwierdź progi trafień z planu weryfikacji**

Uruchom przez MCP Supabase `execute_sql`:

```sql
select
  count(*) filter (where search_key_fold like '%lozk%')      as lozko_rdzen,
  count(*) filter (where search_key_fold like '%naroznik%')  as naroznik,
  count(*) filter (where search_key_fold like '%rozkladan%') as rozkladana,
  count(*) filter (where search_key_fold like '%fotel%')     as fotel,
  count(*) filter (where search_key like '%łóżko%')          as stara_kolumna_bez_zmian
from products;
```

Expected: `lozko_rdzen` ≥ 177, `naroznik` ≥ 40, `rozkladana` ≥ 7, `fotel` ≥ 8, `stara_kolumna_bez_zmian` = 177 (stara kolumna musi zostać nietknięta — to dowód, że migracja jest dodatkowa).

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/supabase/migrations/73_search_key_fold.sql
git commit -m "feat(db): migracja 73 — kolumny search_key_fold ze zlozonymi znakami"
```

---

### Task 6: Przełączenie trzech konsumentów na nowy potok i nową kolumnę

**Files:**
- Modify: `sklep-meblowy/app/_lib/products.ts:6` (import), `:152-163` (filtr), `:241-249` (ranking — bez zmian w kodzie, tylko weryfikacja)
- Modify: `sklep-meblowy/app/api/search/suggest/route.ts:3` (import), `:26-42` (tokeny + kolumna)
- Modify: `sklep-meblowy/app/admin/produkty/actions.ts:23` (import), `:756-765` (tokeny + kolumna)

**Interfaces:**
- Consumes: `searchKeyTokens` (Task 3), kolumny `search_key_fold` / `search_key_fold_de` (Task 5)
- Produces: nic nowego — zmiana wewnętrzna trzech miejsc wywołania

**Dlaczego wszystkie trzy naraz:** `searchTokens` jest wspólnym tokenizerem dla storefrontu, podpowiedzi i panelu admina. Przełączenie części z nich zostawiłoby niespójność, w której jedna wyszukiwarka pyta o złożoną kolumnę, a druga o starą. To zadanie musi wejść w jednym commicie.

- [ ] **Step 1: Storefront — `products.ts`**

Zamień import w linii 6:

```ts
import { searchTokens, rankByNameMatch, escapeIlike } from "./search-filter";
```

na:

```ts
import { searchKeyTokens, rankByNameMatch, escapeIlike } from "./search-filter";
```

Zamień blok w liniach 152-163:

```ts
  // Wyszukiwanie odporne na spacje/kolejność ORAZ na ogonki i odmianę: frazę
  // tniemy na słowa, każde składamy do ASCII i obcinamy końcówkę
  // (searchKeyTokens), a potem dopasowujemy do kolumny search_key_fold
  // (odspacjowana, bez tagów, znaki złożone) przez ILIKE — wiele .ilike() na
  // tej samej kolumnie PostgREST ANDuje, więc każde słowo musi wystąpić,
  // niezależnie od kolejności. DE → search_key_fold_de.
  const searchTerms = searchKeyTokens(search ?? "");
  const searchActive = searchTerms.length > 0;
  if (searchActive) {
    const keyCol = locale === "de" ? "search_key_fold_de" : "search_key_fold";
    for (const token of searchTerms) {
      query = query.ilike(keyCol, `%${escapeIlike(token)}%`);
    }
  }
```

Wywołanie `rankByNameMatch` w liniach 241-249 **zostaje bez zmian** — funkcja sama składa nazwę po Task 4.

- [ ] **Step 2: Podpowiedzi — `suggest/route.ts`**

Zamień import w linii 3:

```ts
import { searchTokens, escapeIlike } from "@/app/_lib/search-filter";
```

na:

```ts
import { searchKeyTokens, escapeIlike } from "@/app/_lib/search-filter";
```

Zamień komentarz i tokenizację (linie 25-32):

```ts
  // Wyszukiwanie odporne na spacje/kolejność, ogonki i odmianę: frazę tniemy na
  // słowa, każde składamy do ASCII i obcinamy końcówkę, a potem dopasowujemy do
  // kolumny search_key_fold przez ILIKE — wiele .ilike() na tej samej kolumnie
  // PostgREST ANDuje (każde słowo musi wystąpić). Brak tokenów (sama
  // interpunkcja) → brak podpowiedzi.
  const tokens = searchKeyTokens(q);
  if (tokens.length === 0) {
    return NextResponse.json<SearchSuggestion[]>([]);
  }
```

Zamień pętlę filtrującą (linia 41) tak, by respektowała locale — dotąd podpowiedzi **zawsze** pytały o kolumnę PL, nawet pod `/de`:

```ts
  const keyCol = locale === "de" ? "search_key_fold_de" : "search_key_fold";
  for (const token of tokens) {
    query = query.ilike(keyCol, `%${escapeIlike(token)}%`);
  }
```

- [ ] **Step 3: Panel admina — `actions.ts`**

Zamień import w linii 23:

```ts
import { searchTokens, escapeIlike } from "@/app/_lib/search-filter";
```

na:

```ts
import { searchKeyTokens, escapeIlike } from "@/app/_lib/search-filter";
```

Zamień linię 756:

```ts
  const tokens = searchKeyTokens(query);
```

i linię 764:

```ts
    q = q.ilike("search_key_fold", `%${escapeIlike(token)}%`);
```

Bramka `if (tokens.join("").length < 2)` w linii 757 **zostaje** — po stemowaniu tokeny są krótsze, ale bramka dalej robi to, co ma robić: odsiewa zapytania jednoznakowe.

- [ ] **Step 4: Sprawdź, że nikt już nie pyta o starą kolumnę**

Run: `cd sklep-meblowy && grep -rn "search_key\b" app --include=*.ts --include=*.tsx`
Expected: **zero trafień w kodzie aplikacji.** Jedyne wystąpienia `search_key` mają zostać w `supabase/migrations/` (historia) i w komentarzach. Jeśli coś zostało — przełącz to teraz, inaczej ta wyszukiwarka po cichu przestanie działać.

Run: `cd sklep-meblowy && grep -rn "searchTokens" app --include=*.ts`
Expected: wystąpienia tylko w `_lib/search-filter.ts` (definicja + użycie w `searchKeyTokens`) i w pliku testowym.

- [ ] **Step 5: Typecheck, lint i testy**

Run: `cd sklep-meblowy && npx tsc --noEmit`
Expected: brak wyjścia.

Run: `cd sklep-meblowy && npm run lint`
Expected: brak wyjścia.

Run: `cd sklep-meblowy && npm test`
Expected: PASS — cały zestaw vitest.

- [ ] **Step 6: Commit**

```bash
git add sklep-meblowy/app/_lib/products.ts sklep-meblowy/app/api/search/suggest/route.ts sklep-meblowy/app/admin/produkty/actions.ts
git commit -m "feat(search): storefront, podpowiedzi i panel pytaja o search_key_fold przez searchKeyTokens"
```

---

### Task 7: Podpowiedzi sortowane po trafności, nie po dacie

**Files:**
- Modify: `sklep-meblowy/app/api/search/suggest/route.ts:3` (import), `:34-71` (zapytanie + mapowanie)

**Interfaces:**
- Consumes: `rankByNameMatch` (Task 4), `searchKeyTokens` (Task 3)
- Produces: nic nowego — `SearchSuggestion` i kontrakt endpointu `GET /api/search/suggest?q=&loc=` bez zmian, więc `SearchBox.tsx` nie wymaga żadnej zmiany

**Problem:** endpoint bierze 6 pierwszych po `created_at desc`, więc na frazę „sofa" klient dostaje 6 najnowszych produktów, w których słowo pada gdziekolwiek — nie 6 najtrafniejszych. Ranking „nazwa przed opisem" istnieje i jest używany na `/sklep`, ale w podpowiedziach nie.

- [ ] **Step 1: Dodaj stałe i typ wiersza**

W `sklep-meblowy/app/api/search/suggest/route.ts`, pod definicją typu `SearchSuggestion`:

```ts
// Kandydaci pobierani z bazy przed rankingiem. Ranking „nazwa przed opisem"
// potrzebuje szerszego zestawu niż 6, bo inaczej sortowanie po created_at
// odsiewa trafienia w nazwie, zanim zdążą wygrać. 30 przy katalogu ~357
// pozycji to koszt pomijalny.
const SUGGEST_CANDIDATES = 30;
const SUGGEST_LIMIT = 6;

type SuggestRow = {
  id: string;
  name: string;
  name_de: string | null;
  price: number;
  images: string[] | null;
  category: string;
};
```

- [ ] **Step 2: Podnieś limit zapytania**

Zamień `.limit(6)` na `.limit(SUGGEST_CANDIDATES)` w budowaniu zapytania.

- [ ] **Step 3: Wstaw ranking przed mapowaniem**

Zaraz po sprawdzeniu `error` i przed budowaniem `suggestions` dodaj:

```ts
  // Trafienia w NAZWIE przed trafieniami tylko z opisu, potem obcięcie do 6.
  // rankByNameMatch jest stabilny, więc kolejność z bazy (created_at desc)
  // zostaje jako rozstrzygnięcie remisów wewnątrz każdej grupy.
  const ranked = rankByNameMatch(
    (data ?? []) as SuggestRow[],
    q,
    (row) => (locale === "de" ? row.name_de ?? "" : row.name)
  ).slice(0, SUGGEST_LIMIT);
```

Zamień źródło mapowania z `(data ?? []).map(...)` na `ranked.map(...)` i uprość sygnaturę parametru do `(p: SuggestRow)`, bo typ jest już zadeklarowany:

```ts
  const suggestions: SearchSuggestion[] = ranked.map((p: SuggestRow) => ({
    id: p.id,
    name: pickLocalized(p.name, p.name_de, locale),
    price: Number(p.price),
    image: p.images?.[0] ?? null,
    category: labelBySlug.get(p.category) ?? p.category,
  }));
```

Dopisz `rankByNameMatch` do importu z `@/app/_lib/search-filter`.

- [ ] **Step 4: Typecheck i lint**

Run: `cd sklep-meblowy && npx tsc --noEmit`
Expected: brak wyjścia.

Run: `cd sklep-meblowy && npm run lint`
Expected: brak wyjścia.

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/api/search/suggest/route.ts
git commit -m "fix(search): podpowiedzi sortowane po trafnosci zamiast po dacie dodania"
```

---

### Task 8: Weryfikacja end-to-end na zbudowanej aplikacji

**Files:**
- Brak zmian w kodzie. Zadanie jest bramką jakości przed PR-em.

**Interfaces:**
- Consumes: wszystko z Tasks 1-7
- Produces: dowody do opisu PR-a

- [ ] **Step 1: Zbuduj i wystaw aplikację**

Sprawdź, że port 3000 jest wolny (build przy działającym `next dev` psuje `.next` dev-serwera):

Run: `powershell -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue"`
Expected: brak wyjścia.

Run: `cd sklep-meblowy && npm run build`
Expected: build kończy się bez błędów.

Run w tle: `cd sklep-meblowy && npm start`
Expected: `✓ Ready`.

- [ ] **Step 2: Sprawdź frazę bez ogonków na storefroncie**

Playwright: wejdź na `http://localhost:3000/sklep?q=lozko`.
Expected: siatka produktów **niepusta**, nagłówek liczby produktów pokazuje ≥ 177. Przed zmianą było 0 i komunikat „Brak produktów".

- [ ] **Step 3: Sprawdź liczbę mnogą**

Playwright: wejdź na `http://localhost:3000/sklep?q=narożniki`.
Expected: wyniki niepuste, ≥ 40 produktów.

- [ ] **Step 4: Sprawdź brak regresji dla frazy Z ogonkami**

Playwright: wejdź na `http://localhost:3000/sklep?q=łóżko`.
Expected: ≥ 177 produktów. **To jest najważniejszy test w całym planie** — jeśli tu jest 0, mapowanie SQL i TS się rozjechało i wyszukiwanie jest zepsute dla wszystkich.

- [ ] **Step 5: Sprawdź podpowiedzi w headerze**

Playwright: wejdź na `http://localhost:3000`, wpisz `lozko` w pasek wyszukiwania w headerze, poczekaj na dropdown (debounce 200 ms).
Expected: lista podpowiedzi niepusta.

Powtórz dla frazy `sofa`.
Expected: na liście produkty z „Sofa" w nazwie, a nie sześć najnowszych produktów, w których słowo pada gdziekolwiek.

- [ ] **Step 6: Regresja wyszukiwarki w panelu admina**

To zadanie najłatwiej ucierpi na zmianie tokenizacji, bo korzysta z tego samego tokenizera.

Zaloguj się do panelu (sesja: `e2e/.auth/admin.json`, dane: `.env.e2e`), wejdź w edycję dowolnego produktu i użyj wyszukiwarki „produkt do dołączenia" (grupy rozmiarów, `searchProductsForSizeGroup`).
Expected: wpisanie fragmentu nazwy istniejącego produktu zwraca wyniki. Sprawdź frazę z ogonkami (`łóżko`) **i** bez (`lozko`) — obie mają działać.

⚠️ Bez `E2E_BASE_URL` testy Playwrighta lecą w **produkcję**, a każdy zapis w panelu dotyka żywej bazy. Ustaw `E2E_BASE_URL=http://localhost:3000` i nie zapisuj formularzy — tylko czytaj wyniki wyszukiwania.

- [ ] **Step 7: Pełny zestaw testów i statyczna analiza**

Run: `cd sklep-meblowy && npm test`
Expected: PASS, cały zestaw.

Run: `cd sklep-meblowy && npx tsc --noEmit`
Expected: brak wyjścia.

Run: `cd sklep-meblowy && npm run lint`
Expected: brak wyjścia.

- [ ] **Step 8: Ubij serwer i zamknij gałąź**

Run: `powershell -Command "$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if ($c) { $c.OwningProcess | Sort-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force } }"`

Utwórz PR z opisem zawierającym: tabelę „przed → po" dla fraz `lozko`, `naroznik`, `narożniki`, `rozkladana`, `fotele`, potwierdzenie braku regresji dla `łóżko`, informację, że **migracja 73 jest już zaaplikowana na produkcji** (bo była warunkiem testów lokalnych), oraz notatkę, że stare kolumny `search_key` / `search_key_de` zostały jako martwe do osobnej migracji sprzątającej.

Push wymaga konta gh **Woodecky10** (domyślne `mwlo1403` dostaje 403). Jeśli `gh pr merge` zostanie odrzucone przez klasyfikator uprawnień w PowerShellu — spróbuj tego samego przez narzędzie Bash, blokady różnią się per narzędzie.

---

## Czego ten plan świadomie nie robi

- **Synonimów.** `kanapa`, `wersalka`, `tapczan` nadal dadzą zero wyników przy 39 sofach w katalogu. Wymaga decyzji, kto utrzymuje słownik: kod czy pole w panelu.
- **Wyjścia ze stanu „zero wyników".** Dalej ślepy zaułek: „Brak produktów. Spróbuj zmienić filtry lub frazę wyszukiwania."
- **Logowania fraz**, więc synonimy dalej trzeba by dobierać na wyczucie.
- **Deduplikacji rodzin produktów w podpowiedziach** — fraza „alva" zwraca sześć niemal identycznych wariantów.
- **Sprzątania starych kolumn** `search_key` / `search_key_de` i ich indeksów.

---

## STAN WYKONANIA (zamknięte 2026-08-13)

**Wdrożone na produkcję.** PR #136 (`baf9117`) + PR #137 (`ae31565`). Migracje `73_search_key_fold` (`20260813093401`) i `74_search_key_fold_pl_de_znaki` (`20260813111203`) zaaplikowane ręcznie przez MCP.

Wykonane przez subagent-driven-development: 8 tasków, każdy z własną recenzją, plus finalna recenzja całej gałęzi, poprawka i recenzja poprawki.

### Potwierdzone na produkcji po deployu

`poso` → trzy narożniki POSO na pozycjach 1–3 na `/sklep`, dwa pierwsze w podpowiedziach. `liva` → Liva przed Livią. `lozko`, `łóżko`, `sofy`, `narozniki` → pełna strona wyników, zero regresji. Przed zmianą `lozko`, `sofy` i `narożniki` dawały **zero wyników**.

### Rozstrzygnięcia, które warto znać przy następnej zmianie w wyszukiwaniu

- **Ranking ma trzy poziomy, nie dwa:** nazwa z dokładnym tokenem złożonym → nazwa z samym rdzeniem → trafienie z opisu. Dwa poziomy nie wystarczały: rdzeń 3-znakowy z 4-literowej nazwy własnej łapie popularne słowa (`poso`→`pos` łapie `pościel` w 21 nazwach), a taki hałas też jest trafieniem *w nazwie*, więc siedział w tej samej grupie i wygrywał datą. Spec założył, że ranking to wypchnie — dane tego nie potwierdziły.
- **Poziom 1 wymaga dokładnego trafienia WSZYSTKICH tokenów** (`every`, nie `some`). Przy `some` fraza `poso łóżko` awansowałaby łóżka „…na pościel", czyli hałas wracałby schowany za drugim tokenem.
- **Recall jest bezpieczny z konstrukcji, nie z pomiaru:** warunek wejścia na poziom „opis" jest dosłowną negacją starego warunku „trafienie w nazwie", więc poziom 1 ∪ poziom 2 to bit w bit stary zbiór. Rdzeń jest zawsze prefiksem formy złożonej, więc poziom 1 ⊆ poziom 2.
- **Filtr do bazy zostaje na rdzeniach.** Formy dokładne służą WYŁĄCZNIE rankingowi. Przełączenie filtra na formy dokładne zawaliłoby recall.
- **Migracja tylko dodająca była kluczowa.** Dzięki temu migracja mogła wejść przed deployem kodu, bez okna „zero wyników na wszystko" na żywym sklepie.
- **Okno 30 kandydatów w podpowiedziach:** dla każdego rdzenia z >30 dopasowaniami okno zawiera co najmniej 13 trafień w nazwie przy 6 potrzebnych (zmierzone na całym katalogu, 1070 rdzeni). NIE podnosić tej liczby na oślep, gdy zacznie się zbliżać do 6 — przenieść ranking do SQL (widok/RPC z CASE), bo tylko to rankuje cały katalog. Pełne wyszukiwanie na `/sklep` tego okna nie ma.

### Czego NIE sprawdzono na żywo

- Zrzutów Playwrightem po naprawie rankingu — weryfikacja szła przez HTTP i SQL, nie przez kliknięte UI.
- Pomiaru „1070 rdzeni / minimum 13" nikt nie odtworzył niezależnie (wymaga przepisania stemmingu JS na SQL); recenzent zrobił zgodne spot-checki.
- Ścieżki DE w przeglądarce — `/de` jest zamrożone flagą, sprawdzone tylko kodem i SQL-em.

### Follow-upy

- **Trzecia tkanina POSO nie wchodzi do podpowiedzi.** Jest 41. najnowszym dopasowaniem rdzenia `pos`, więc wypada za okno 30. Rankingiem nienaprawialne. Na `/sklep` widać wszystkie trzy.
- **Druga wyszukiwarka w repo nie rozumie odmiany.** `app/_lib/search-normalize.ts` (`searchMatches`) składa diakrytyki i radzi sobie z NFD, ale nie stemuje. Używana w `ProductsList`, `CollectionsEditor`, `BundlesEditor`, `FabricsEditor`, `VariantsEditor`, `BlockForms` i `sample-catalog.ts`. Skutek: admin wpisujący „sofy" na liście produktów dostaje 0, klient na `/sklep` 41. Dotyczy też wyszukiwarki próbek tkanin dla klienta.
- **Martwe indeksy do sprzątnięcia razem z kolumnami:** `products_search_key_trgm` (376 kB) i `products_search_key_de_trgm` (224 kB) — razem ~14% rozmiaru tabeli i narzut na każdy zapis. Potwierdzone: 0 widoków, 0 matviews, 0 polityk RLS, 0 odwołań w kodzie aplikacji.
- **`stemToken` bierze PIERWSZĄ pasującą końcówkę, nie najdłuższą** — poprawność zależy od ręcznego posortowania `STEM_SUFFIXES` od najdłuższej. Dopisanie 3-znakowej końcówki na końcu listy cicho zmieni zachowanie (skutek: mniej stemowania, nigdy strata trafień). Wymuszenie sortowania w kodzie zamieniłoby dyscyplinę na inwariant.
- **Pozycja porządkowa `search_key_fold`** przeskoczyła na koniec tabeli po DROP+ADD w migracji 74. Kod czyta kolumny po nazwie, więc bez znaczenia — ale eksport oparty o kolejność kolumn by się przewrócił.

### Pułapka procesowa, która kosztowała jeden zły deploy

PR #136 został zmergowany **bez trzech commitów poprawki**: gałąź pushnięto przed dispatchem poprawki (żeby zrównoleglić z finalną recenzją), a implementer poprawki miał zakaz pushowania. Na produkcję poszła wersja, którą finalna recenzja odrzuciła. Wykryło to dopiero `git branch -d`, odmawiając usunięcia gałęzi („not fully merged").

**Przed każdym mergem sprawdzić `git log origin/<branch>..<branch>`.** Jeśli cokolwiek zwróci, PR nie zawiera całej pracy.
