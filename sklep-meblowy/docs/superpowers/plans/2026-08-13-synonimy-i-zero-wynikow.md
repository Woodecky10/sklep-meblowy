# Synonimy i wyjście ze stanu „zero wyników" — plan wdrożenia

> **Dla agentów:** WYMAGANA PODSKILL: użyj superpowers:subagent-driven-development (zalecane) albo superpowers:executing-plans. Kroki mają checkboxy (`- [ ]`).

**Cel:** Klient wpisujący „łóżeczko", „kanapa" czy „materacyk" dostaje produkty, których szuka, a fraza bez trafień kończy się podpowiedzią zamiast ślepego zaułka.

**Architektura:** Nowy plik `search-vocabulary.ts` trzyma dwie ręcznie utrzymywane stałe — mapę synonimów i listę rzeczy nieprowadzonych. Filtr do bazy rozszerza każdy token o jego synonimy przez `.or()` (grupy ANDowane między sobą, alternatywy ORowane wewnątrz). Ranking traktuje trafienie po synonimie jako poziom rdzenia, nigdy dokładny. Stan pustego wyniku na `/sklep` dostaje osobny komponent.

**Stos:** Next.js 16 App Router, Supabase/PostgREST przez supabase-js, vitest, Playwright.

**Spec:** `sklep-meblowy/docs/superpowers/specs/2026-08-13-synonimy-i-zero-wynikow-design.md`

## Global Constraints

- **Słownik żyje w kodzie, nie w bazie.** Decyzja właściciela: zbiór jest domknięty (siedem rodzin produktów), a nowa rodzina to i tak zmiana z udziałem programisty. Żadnej migracji, żadnego ekranu CRUD.
- **Klucze i wartości słownika to RDZENIE** po złożeniu znaków i obcięciu końcówki — dokładnie to, co zwraca `searchKeyTokens()`. Nie surowe słowa.
- **Mapowanie jednokierunkowe:** słowo klienta → słowo z katalogu.
- **`searchTokens()` zostaje absolutnie nietknięty.** Prymityw sanityzacji chroniący przed wstrzyknięciem w PostgREST `.or()` (audyt MEDIUM 2026-06-11). Nowe rzeczy siadają ZA nim.
- **`searchKeyTokens()` zachowuje sygnaturę i zachowanie.** Filtr do bazy dalej pyta rdzeniami.
- **Wartości słownika wyłącznie `[a-z0-9]+`,** pilnowane testem. Wchodzą do składni `.or()`, gdzie przecinek, kropka i nawias są znakami znaczącymi.
- **Synonim NIGDY nie jest trafieniem dokładnym.** Wchodzi jako poziom 2 rankingu (rdzeń). Poziom 1 liczy wyłącznie formę wpisaną przez użytkownika.
- **Trzy konsumenty muszą zostać zbieżne:** `app/_lib/products.ts`, `app/api/search/suggest/route.ts`, `app/admin/produkty/actions.ts`. Rozjazd znaczy, że klient i panel widzą inny katalog.
- **DE musi zostać poprawne**, choć sprzedaż jest tylko PL (niemiecki zamrożony flagą `DE_ENABLED`). Nowe teksty lądują w `pl.ts` ORAZ `de.ts`.
- **Migracji NIE MA w tym planie.** Nic nie dotyka schematu bazy.
- **Lokalny `npm start` łączy się z bazą PRODUKCYJNĄ.** Wolno czytać, nie wolno zapisywać.
- **Playwright nie działa na `next dev`** w tym projekcie (`ERR_ABORTED`, ~6 min na test). Testy wizualne wyłącznie na `npm run build` + `npm start`.
- **Testy:** `npm test` (vitest run). **Typy:** `npx tsc --noEmit`. **Lint:** `npm run lint` — 0 błędów; 4 ostrzeżenia w `bundles-server.ts` i `variants.ts` są sprzed tej gałęzi.
- Komentarze w kodzie po polsku, zgodnie z konwencją repo.
- Katalog roboczy: `C:\Users\mwlodarczyk\repos\private\sklep-meblowy\sklep-meblowy` (repo ma zagnieżdżony katalog o tej samej nazwie).

## Struktura plików

| plik | odpowiedzialność |
|---|---|
| `app/_lib/search-vocabulary.ts` | **nowy** — `SEARCH_SYNONYMS`, `NOT_CARRIED`, `synonymsFor()`, `notCarriedLabel()`. Tylko dane i czyste odczyty, zero zależności od bazy. |
| `app/_lib/__tests__/search-vocabulary.test.ts` | **nowy** — kształt wpisów i osiągalność kluczy przez tokenizer. |
| `app/_lib/search-filter.ts` | + `searchKeyTokenGroups()`; `rankByNameMatch()` świadomy synonimów. |
| `app/_lib/search-filter.test.ts` | + testy grup i rankingu po synonimie. |
| `app/_lib/products.ts` | filtr `/sklep` na grupach alternatyw. |
| `app/api/search/suggest/route.ts` | filtr rozwijki na grupach alternatyw. |
| `app/admin/produkty/actions.ts` | filtr `searchProductsForSizeGroup` na grupach alternatyw. |
| `app/sklep/EmptySearchState.tsx` | **nowy** — komunikat i kafelki kategorii przy zerowym wyniku. |
| `app/sklep/page.tsx` | użycie komponentu w miejscu dzisiejszego bloku pustego wyniku. |
| `app/_lib/dictionaries/pl.ts`, `de.ts` | nowe teksty w sekcji `shop`. |

---

### Task 1: Słownik katalogu

**Pliki:**
- Utwórz: `app/_lib/search-vocabulary.ts`
- Test: `app/_lib/__tests__/search-vocabulary.test.ts`

**Interfejsy:**
- Produkuje: `SEARCH_SYNONYMS: Record<string, readonly string[]>`, `NOT_CARRIED: Record<string, { pl: string; de: string }>`, `synonymsFor(stem: string): string[]`, `notCarriedLabel(stems: string[], locale: "pl" | "de"): string | null`
- Konsumuje: nic. Ten plik nie importuje niczego — dzięki temu nie ma cyklu z `search-filter.ts`, które będzie importować z niego.

- [ ] **Krok 1: Napisz plik słownika**

```ts
// Wiedza o tym, jak klient nazywa to, co sklep sprzedaje — i czego sklep nie
// sprzedaje. Jedno miejsce, ręcznie utrzymywane.
//
// ⚠️ TA LISTA SIĘ ZESTARZEJE I NIC O TYM NIE PRZYPOMNI. Gdy sklep zacznie
// sprzedawać nową rodzinę produktów, wpisy trzeba dopisać ręcznie. Świadome
// ograniczenie: zbiór jest domknięty (siedem rodzin: łóżka, materace,
// narożniki, sofy, fotele, pufy, schodki), a nowa rodzina produktów to i tak
// zmiana z udziałem programisty.
//
// Klucze i wartości to RDZENIE po złożeniu znaków i obcięciu końcówki, czyli
// dokładnie to, co zwraca searchKeyTokens() z search-filter.ts. NIE surowe
// słowa — inaczej „kanapy" nie trafiłoby we wpis „kanapa". Test w
// __tests__/search-vocabulary.test.ts pilnuje, że każdy klucz jest naprawdę
// osiągalny dla tokenizera.
//
// Mapowanie jednokierunkowe: słowo klienta → słowo z katalogu. W drugą stronę
// nie ma sensu, bo „kanapa" nie występuje w żadnej nazwie produktu.
//
// Liczby w komentarzach to pomiar na produkcji 2026-08-13 (349 aktywnych
// pozycji): ile produktów zawiera dany rdzeń w kolumnie search_key_fold.
export const SEARCH_SYNONYMS: Record<string, readonly string[]> = {
  // → sofy (rdzeń „sof": 41)
  kanap: ["sof"],
  kanapk: ["sof"],
  wersalk: ["sof"],
  sofk: ["sof"], // zdrobnienie; stem nie zejdzie z „sofk" na „sof"
  otoman: ["sof"],
  szezlong: ["sof"],
  lezank: ["sof"],
  tapczan: ["sof", "lozk"], // bywa i sofą, i łóżkiem
  // → narożniki (rdzeń „naroznik": 40)
  kacik: ["naroznik"], // „kącik wypoczynkowy"
  // → pufy (rdzeń „puf": 9)
  podnozek: ["puf"],
  podnozk: ["puf"], // dwa klucze: stem różni się dla „podnóżek" i „podnóżka"
  // → łóżka (rdzeń „lozk": 167)
  lozeczk: ["lozk"], // NAJWAŻNIEJSZY WPIS: 41 łóżek dziecięcych, dziś zero wyników
  poslan: ["lozk"],
  boxspring: ["kontynentaln"], // boxspring to łóżko kontynentalne („kontynentaln": 113)
  // → materace (157), fotele (9), dziecięce (25)
  materacyk: ["materac"],
  fotelik: ["fotel"],
  dziecinn: ["dzieciec"], // katalog mówi „dziecięce", klient też „dziecinne"
};

// Rzeczy, których sklep NIE prowadzi. Wartość to nazwa w DOPEŁNIACZU liczby
// mnogiej, wstawiana do komunikatu „Nie prowadzimy ...".
//
// Sprawdzane WYŁĄCZNIE przy zerowym wyniku, więc kolizja z realnym produktem
// jest niemożliwa: gdyby sklep zaczął sprzedawać stoliki, fraza „stol" coś by
// zwróciła i do tej gałęzi nigdy byśmy nie doszli. Pomiar 2026-08-13: każdy
// z tych rdzeni daje dziś 0 trafień.
export const NOT_CARRIED: Record<string, { pl: string; de: string }> = {
  szaf: { pl: "szaf", de: "Schränke" },
  komod: { pl: "komód", de: "Kommoden" },
  stol: { pl: "stołów", de: "Tische" },
  krzesl: { pl: "krzeseł", de: "Stühle" },
  biurk: { pl: "biurek", de: "Schreibtische" },
  dywan: { pl: "dywanów", de: "Teppiche" },
  lamp: { pl: "lamp", de: "Lampen" },
  regal: { pl: "regałów", de: "Regale" },
};

// Alternatywy dla jednego rdzenia: on sam plus jego synonimy. Bez wpisu
// w słowniku zwraca jednoelementową listę, więc wołający nie musi rozgałęziać.
export function synonymsFor(stem: string): string[] {
  const extra = SEARCH_SYNONYMS[stem];
  return extra ? [stem, ...extra] : [stem];
}

// Nazwa rzeczy nieprowadzonej dla pierwszego rdzenia frazy, który ją opisuje.
// null = fraza nie dotyczy niczego z listy, czyli zero wyników ma inny powód.
export function notCarriedLabel(
  stems: string[],
  locale: "pl" | "de"
): string | null {
  for (const stem of stems) {
    const entry = NOT_CARRIED[stem];
    if (entry) return entry[locale];
  }
  return null;
}
```

- [ ] **Krok 2: Napisz testy kształtu i osiągalności**

```ts
import { describe, it, expect } from "vitest";
import {
  SEARCH_SYNONYMS,
  NOT_CARRIED,
  synonymsFor,
  notCarriedLabel,
} from "@/app/_lib/search-vocabulary";
import { searchKeyTokens } from "@/app/_lib/search-filter";

describe("SEARCH_SYNONYMS — kształt wpisów", () => {
  it("klucze i wartości to wyłącznie małe litery ASCII i cyfry", () => {
    // Bramka bezpieczeństwa: wartości trafiają do składni PostgREST .or(),
    // gdzie przecinek, kropka i nawias są znakami znaczącymi. Wpis z takim
    // znakiem ROZJECHAŁBY filtr, a nie tylko nie zadziałał.
    for (const [key, values] of Object.entries(SEARCH_SYNONYMS)) {
      expect(key, `klucz ${key}`).toMatch(/^[a-z0-9]+$/);
      for (const value of values) {
        expect(value, `wartość ${value} przy kluczu ${key}`).toMatch(
          /^[a-z0-9]+$/
        );
      }
    }
  });

  it("klucze NOT_CARRIED też są czystymi rdzeniami", () => {
    for (const key of Object.keys(NOT_CARRIED)) {
      expect(key).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("żaden synonim nie wskazuje na własny klucz", () => {
    for (const [key, values] of Object.entries(SEARCH_SYNONYMS)) {
      expect(values, `klucz ${key}`).not.toContain(key);
    }
  });

  it("słownik synonimów i lista nieprowadzonych nie mają wspólnych kluczy", () => {
    // Wpis w obu naraz znaczyłby „rozszerz o synonim, a potem powiedz, że nie
    // prowadzimy" — sprzeczność.
    const wspolne = Object.keys(SEARCH_SYNONYMS).filter((k) => k in NOT_CARRIED);
    expect(wspolne).toEqual([]);
  });
});

describe("SEARCH_SYNONYMS — klucze osiągalne dla tokenizera", () => {
  // Najgroźniejszy możliwy błąd w tym pliku to klucz, którego searchKeyTokens
  // nigdy nie wyprodukuje — wpis wygląda dobrze i nie robi nic.
  const przypadki: [string, string][] = [
    ["kanapa", "kanap"],
    ["kanapy", "kanap"],
    ["kanapka", "kanapk"],
    ["wersalka", "wersalk"],
    ["sofka", "sofk"],
    ["otomana", "otoman"],
    ["szezlong", "szezlong"],
    ["leżanka", "lezank"],
    ["tapczan", "tapczan"],
    ["kącik", "kacik"],
    ["podnóżek", "podnozek"],
    ["podnóżka", "podnozk"],
    ["łóżeczko", "lozeczk"],
    ["posłanie", "poslan"],
    ["boxspring", "boxspring"],
    ["materacyk", "materacyk"],
    ["fotelik", "fotelik"],
    ["dziecinne", "dziecinn"],
  ];

  it.each(przypadki)("„%s\" tokenizuje się do „%s\"", (slowo, rdzen) => {
    expect(searchKeyTokens(slowo)).toEqual([rdzen]);
    expect(rdzen in SEARCH_SYNONYMS).toBe(true);
  });

  it("każdy klucz słownika ma pokrycie w powyższej tabeli", () => {
    // Bez tego można dopisać wpis i nigdy nie sprawdzić, czy jest osiągalny.
    const pokryte = new Set(przypadki.map(([, rdzen]) => rdzen));
    const niepokryte = Object.keys(SEARCH_SYNONYMS).filter(
      (k) => !pokryte.has(k)
    );
    expect(niepokryte).toEqual([]);
  });
});

describe("synonymsFor / notCarriedLabel", () => {
  it("rdzeń ze słownika dostaje siebie na pierwszym miejscu i synonimy dalej", () => {
    expect(synonymsFor("kanap")).toEqual(["kanap", "sof"]);
    expect(synonymsFor("tapczan")).toEqual(["tapczan", "sof", "lozk"]);
  });

  it("rdzeń bez wpisu zwraca sam siebie", () => {
    expect(synonymsFor("materac")).toEqual(["materac"]);
  });

  it("nazwa nieprowadzonej rzeczy po pierwszym pasującym rdzeniu", () => {
    expect(notCarriedLabel(["szaf"], "pl")).toBe("szaf");
    expect(notCarriedLabel(["szaf"], "de")).toBe("Schränke");
    expect(notCarriedLabel(["drewnian", "komod"], "pl")).toBe("komód");
  });

  it("fraza spoza listy → null", () => {
    expect(notCarriedLabel(["xyzabc"], "pl")).toBeNull();
    expect(notCarriedLabel([], "pl")).toBeNull();
  });
});
```

- [ ] **Krok 3: Uruchom testy — muszą przejść od razu**

Uruchom: `npx vitest run app/_lib/__tests__/search-vocabulary.test.ts`
Oczekiwane: wszystkie zielone. Jeśli któryś przypadek z tabeli osiągalności padnie, **popraw KLUCZ w słowniku**, nie asercję — asercja mówi prawdę o tokenizerze.

- [ ] **Krok 4: Commit**

```bash
git add app/_lib/search-vocabulary.ts app/_lib/__tests__/search-vocabulary.test.ts
git commit -m "feat(search): slownik synonimow i rzeczy nieprowadzonych"
```

---

### Task 2: Grupy alternatyw do filtra

**Pliki:**
- Modyfikuj: `app/_lib/search-filter.ts` (dopisz na końcu, obok `searchKeyTokens`)
- Test: `app/_lib/search-filter.test.ts`

**Interfejsy:**
- Konsumuje: `synonymsFor()` z Taska 1, `searchKeyTokens()` (istniejący)
- Produkuje: `searchKeyTokenGroups(raw: string): string[][]` — dla Taska 4

- [ ] **Krok 1: Napisz test (nie ma jeszcze funkcji)**

Dopisz do `app/_lib/search-filter.test.ts`:

```ts
describe("searchKeyTokenGroups — alternatywy do filtra", () => {
  it("token bez synonimów daje grupę jednoelementową", () => {
    expect(searchKeyTokenGroups("materace")).toEqual([["materac"]]);
  });

  it("token ze słownika daje siebie plus synonimy", () => {
    expect(searchKeyTokenGroups("kanapa")).toEqual([["kanap", "sof"]]);
  });

  it("fraza wielosłowna daje jedną grupę na słowo, w kolejności", () => {
    expect(searchKeyTokenGroups("kanapa welur")).toEqual([
      ["kanap", "sof"],
      ["welur"],
    ]);
  });

  it("liczba grup zawsze równa liczbie tokenów z searchKeyTokens", () => {
    // Wiążące: filtr ANDuje grupy, więc rozjazd znaczyłby inny zbiór wymagań
    // niż ten, którego pilnuje ranking.
    for (const fraza of ["kanapa", "sofa sofy", "łóżeczko dziecinne", ""]) {
      expect(searchKeyTokenGroups(fraza)).toHaveLength(
        searchKeyTokens(fraza).length
      );
    }
  });

  it("pusta fraza → brak grup", () => {
    expect(searchKeyTokenGroups("   ")).toEqual([]);
  });
});
```

Dopisz `searchKeyTokenGroups` do importu z `@/app/_lib/search-filter` na górze pliku testowego.

- [ ] **Krok 2: Uruchom test i potwierdź, że pada**

Uruchom: `npx vitest run app/_lib/search-filter.test.ts`
Oczekiwane: FAIL — `searchKeyTokenGroups is not a function`.

- [ ] **Krok 3: Zaimplementuj**

Dopisz na końcu `app/_lib/search-filter.ts`:

```ts
// Grupy alternatyw dla filtra do bazy: każdy token frazy zamienia się w listę
// „on sam plus jego synonimy" (patrz search-vocabulary.ts).
//
// Filtr ANDuje grupy między sobą (każde słowo frazy musi wystąpić) i ORuje
// alternatywy wewnątrz grupy (w którejkolwiek postaci). Liczba grup jest
// zawsze równa liczbie tokenów z searchKeyTokens — inaczej filtr wymagałby
// czego innego niż ranking.
//
// Ranking NIE używa tej funkcji: on potrzebuje wiedzieć, którą formą token
// trafił, i woła searchKeyTokenForms + synonymsFor osobno.
export function searchKeyTokenGroups(raw: string): string[][] {
  return searchKeyTokens(raw).map((token) => synonymsFor(token));
}
```

Dopisz import na górze pliku:

```ts
import { synonymsFor } from "./search-vocabulary";
```

Uwaga na cykl: `search-vocabulary.ts` nie importuje niczego, więc cyklu nie ma. Nie dodawaj tam żadnego importu z `search-filter.ts`.

- [ ] **Krok 4: Uruchom testy — całość pliku zielona**

Uruchom: `npx vitest run app/_lib/search-filter.test.ts`
Oczekiwane: PASS, wszystkie istniejące testy nadal zielone.

- [ ] **Krok 5: Commit**

```bash
git add app/_lib/search-filter.ts app/_lib/search-filter.test.ts
git commit -m "feat(search): searchKeyTokenGroups - alternatywy tokenu do filtra"
```

---

### Task 3: Ranking świadomy synonimów

**Pliki:**
- Modyfikuj: `app/_lib/search-filter.ts` (`rankByNameMatch`)
- Test: `app/_lib/search-filter.test.ts`

**Interfejsy:**
- Sygnatura `rankByNameMatch(rows, raw, getName)` **bez zmian**.

- [ ] **Krok 1: Napisz testy**

```ts
describe("rankByNameMatch — trafienie po synonimie", () => {
  const nazwy = (rows: { name: string }[]) => rows.map((r) => r.name);
  const pobierz = (r: { name: string }) => r.name;

  it("synonim wyciąga produkt z poziomu „tylko opis\" na poziom rdzenia", () => {
    // „kanapa" nie występuje w ŻADNEJ nazwie sofy, więc bez świadomości
    // synonimów wszystkie sofy wpadałyby na poziom 3 i mieszały się z szumem
    // opisowym.
    const rows = [
      { name: "Łóżko Lino z pojemnikiem" },
      { name: "Sofa Modena rozkładana" },
    ];
    expect(nazwy(rankByNameMatch(rows, "kanapa", pobierz))).toEqual([
      "Sofa Modena rozkładana",
      "Łóżko Lino z pojemnikiem",
    ]);
  });

  it("synonim NIE jest trafieniem dokładnym — poziom 1 zostaje pusty", () => {
    // Gdyby synonim wchodził na poziom 1, fraza „kanapa sofa" ustawiłaby sofy
    // z „kanapą" w nazwie równo z pozostałymi. Poziom 1 liczy wyłącznie formę
    // wpisaną przez użytkownika.
    const rows = [
      { name: "Sofa Modena" },
      { name: "Kanapa Modena" }, // hipotetyczna: dokładne trafienie frazy
    ];
    expect(nazwy(rankByNameMatch(rows, "kanapa", pobierz))).toEqual([
      "Kanapa Modena",
      "Sofa Modena",
    ]);
  });

  it("fraza bez synonimów zachowuje się dokładnie jak dotąd", () => {
    const rows = [
      { name: "Łóżko Lino na pościel" },
      { name: "Narożnik Vegas w POSO" },
    ];
    expect(nazwy(rankByNameMatch(rows, "poso", pobierz))).toEqual([
      "Narożnik Vegas w POSO",
      "Łóżko Lino na pościel",
    ]);
  });

  it("synonim wielocelowy działa dla każdego celu", () => {
    const rows = [
      { name: "Fotel Uszak" },
      { name: "Łóżko Sawana" },
      { name: "Sofa Modena" },
    ];
    // „tapczan" → sof ORAZ lozk; fotel zostaje na końcu
    const wynik = nazwy(rankByNameMatch(rows, "tapczan", pobierz));
    expect(wynik[2]).toBe("Fotel Uszak");
    expect(wynik.slice(0, 2).sort()).toEqual(["Łóżko Sawana", "Sofa Modena"]);
  });
});
```

- [ ] **Krok 2: Uruchom testy i potwierdź, które padają**

Uruchom: `npx vitest run app/_lib/search-filter.test.ts`
Oczekiwane: padają pierwszy i czwarty test (synonim nie działa), przechodzą drugi i trzeci.

- [ ] **Krok 3: Zaimplementuj — jedna linia w warunku**

W `rankByNameMatch` zamień warunek wejścia do `rest`:

```ts
    if (!forms.every((f) => key.includes(f.stem))) {
```

na:

```ts
    if (!forms.every((f) => synonymsFor(f.stem).some((alt) => key.includes(alt)))) {
```

Warunek poziomu 1 (`forms.every((f) => key.includes(f.fold))`) **zostaw bez zmian** — synonim z definicji nie jest dokładnym trafieniem.

Dopisz do komentarza nad funkcją, po akapicie o poziomie 2:

```ts
// Synonimy (search-vocabulary.ts) liczą się na poziomie 2, nigdy na 1. „kanapa"
// nie występuje w żadnej nazwie sofy, więc bez tego wszystkie sofy wpadałyby na
// poziom 3 i mieszały się z szumem opisowym. Poziom 1 dalej znaczy „nic nie
// musiałem rozszerzać" — ani stemem, ani słownikiem.
```

Zwróć uwagę, że `synonymsFor(stem)` bez wpisu w słowniku zwraca `[stem]`, więc dla fraz bez synonimów `.some()` sprowadza się do dokładnie starego warunku — zero zmiany zachowania.

- [ ] **Krok 4: Uruchom pełny plik testowy**

Uruchom: `npx vitest run app/_lib/search-filter.test.ts`
Oczekiwane: PASS. **Żadna istniejąca asercja rankingu nie ma prawa wymagać zmiany.** Jeśli któraś pada, to znak, że warunek poziomu 1 też został ruszony — cofnij i popraw.

- [ ] **Krok 5: Commit**

```bash
git add app/_lib/search-filter.ts app/_lib/search-filter.test.ts
git commit -m "fix(search): synonim liczy sie jako trafienie rdzeniem, nie dokladne"
```

---

### Task 4: Trzy konsumenty na grupach alternatyw

**Pliki:**
- Modyfikuj: `app/_lib/products.ts:158-165`
- Modyfikuj: `app/api/search/suggest/route.ts` (blok budowy zapytania)
- Modyfikuj: `app/admin/produkty/actions.ts` (`searchProductsForSizeGroup`)

**Interfejsy:**
- Konsumuje: `searchKeyTokenGroups()` z Taska 2

**⚠️ NIEPEWNOŚĆ DO ROZSTRZYGNIĘCIA POMIAREM, NIE ZGADYWANIEM.** W składni filtra PostgREST wildcardem ILIKE jest `*`, a nie `%` — `search_key_fold.ilike.*kanap*`. W wywołaniu `.ilike()` (osobna metoda) używa się `%`. Ten plan zakłada `*` wewnątrz `.or()`. **Zweryfikuj to na żywej bazie w kroku 5, zanim uznasz task za zrobiony.** Jeśli `*` nie zadziała, spróbuj `%` — a jeśli i to nie, zbuduj alternatywę przez `.or()` z pełną składnią `and(...)`. Nie zostawiaj tego niesprawdzonego: błąd tutaj nie wywala wyjątku, tylko cicho zwraca zero wyników.

- [ ] **Krok 1: `products.ts` — storefront**

Zamień blok wyszukiwania:

```ts
  const searchTerms = searchKeyTokens(search ?? "");
  const searchActive = searchTerms.length > 0;
  if (searchActive) {
    const keyCol = locale === "de" ? "search_key_fold_de" : "search_key_fold";
    for (const token of searchTerms) {
      query = query.ilike(keyCol, `%${escapeIlike(token)}%`);
    }
  }
```

na:

```ts
  const searchGroups = searchKeyTokenGroups(search ?? "");
  const searchActive = searchGroups.length > 0;
  if (searchActive) {
    const keyCol = locale === "de" ? "search_key_fold_de" : "search_key_fold";
    for (const group of searchGroups) {
      query = applyTokenGroup(query, keyCol, group);
    }
  }
```

Zmień też komentarz nad blokiem — dopisz zdanie:

```
  // Token ze słownika synonimów (search-vocabulary.ts) dostaje zamiast jednego
  // .ilike() alternatywę .or(): „kanapa" szuka „kanap" LUB „sof". Grupy dalej
  // są ANDowane, więc każde słowo frazy musi wystąpić w którejkolwiek postaci.
```

- [ ] **Krok 2: Wspólny helper budowy warunku**

Dopisz do `app/_lib/search-filter.ts`:

```ts
// Warunek dla jednej grupy alternatyw, wspólny dla trzech konsumentów — żeby
// składnia PostgREST siedziała w jednym miejscu, a nie w trzech kopiach.
//
// Grupa jednoelementowa idzie zwykłym .ilike() (czytelniejsze i tańsze).
// Grupa z synonimami idzie .or(), gdzie wildcardem jest `*`, NIE `%` — to inna
// składnia niż w metodzie .ilike(). Wiele .or() na zapytaniu jest ANDowanych,
// tak samo jak wiele .ilike().
//
// Bezpieczeństwo: tokeny przeszły już sanitizeSearchTerm (usuwa `, . ( )` oraz
// wildcardy), a wartości słownika są ograniczone testem do [a-z0-9]+. Do tego
// escapeIlike na każdym operandzie.
export function applyTokenGroup<Q extends {
  ilike: (col: string, pattern: string) => Q;
  or: (filters: string) => Q;
}>(query: Q, keyCol: string, group: string[]): Q {
  if (group.length === 1) {
    return query.ilike(keyCol, `%${escapeIlike(group[0])}%`);
  }
  return query.or(
    group.map((alt) => `${keyCol}.ilike.*${escapeIlike(alt)}*`).join(",")
  );
}
```

Typ generyczny zamiast konkretnego typu z supabase-js: trzy konsumenty budują zapytania na różnych klientach (zwykły i admin), a nam wystarczą dwie metody.

- [ ] **Krok 3: `suggest/route.ts` — rozwijka**

Zamień:

```ts
  const tokens = searchKeyTokens(q);
  if (tokens.length === 0) {
    return NextResponse.json<SearchSuggestion[]>([]);
  }
```

na:

```ts
  const groups = searchKeyTokenGroups(q);
  if (groups.length === 0) {
    return NextResponse.json<SearchSuggestion[]>([]);
  }
```

oraz:

```ts
  const keyCol = locale === "de" ? "search_key_fold_de" : "search_key_fold";
  for (const token of tokens) {
    query = query.ilike(keyCol, `%${escapeIlike(token)}%`);
  }
```

na:

```ts
  const keyCol = locale === "de" ? "search_key_fold_de" : "search_key_fold";
  for (const group of groups) {
    query = applyTokenGroup(query, keyCol, group);
  }
```

Popraw import: `searchKeyTokens` → `searchKeyTokenGroups, applyTokenGroup`. `escapeIlike` przestaje być tu potrzebny — usuń go z importu, jeśli nie ma innych użyć w pliku.

- [ ] **Krok 4: `admin/produkty/actions.ts` — panel**

Zamień:

```ts
  const tokens = searchKeyTokens(query);
  if (tokens.join("").length < 2) return { ok: true, data: { results: [] } };
```

na:

```ts
  const groups = searchKeyTokenGroups(query);
  // Próg liczony na RDZENIACH, nie na alternatywach — synonimy nie mają
  // podnosić długości frazy i przepuszczać zapytań jednoznakowych.
  if (groups.map((g) => g[0]).join("").length < 2) {
    return { ok: true, data: { results: [] } };
  }
```

oraz:

```ts
  for (const token of tokens) {
    q = q.ilike("search_key_fold", `%${escapeIlike(token)}%`);
  }
```

na:

```ts
  for (const group of groups) {
    q = applyTokenGroup(q, "search_key_fold", group);
  }
```

- [ ] **Krok 5: Bramka pomiarowa na żywej bazie**

To krok, w którym rozstrzygasz niepewność ze wstępu do taska. Uruchom `npm run build` i `npm start`, potem sprawdź przez HTTP:

```bash
curl -s "http://localhost:3000/api/search/suggest?q=kanapa" | head -c 300
curl -s "http://localhost:3000/api/search/suggest?q=lozeczko" | head -c 300
```

Oczekiwane: **niepusta** tablica z sofami dla `kanapa` i z łóżkami dla `lozeczko`. Pusta tablica znaczy, że składnia wildcarda w `.or()` jest inna — wróć do kroku 2.

Potem policz wyniki na `/sklep` dla wszystkich kluczy słownika i dla fraz kontrolnych:

| fraza | oczekiwane |
|---|---|
| `kanapa`, `wersalka`, `tapczan`, `sofka`, `otomana`, `szezlong`, `leżanka`, `kącik`, `podnóżek`, `posłanie`, `boxspring`, `łóżeczko`, `materacyk`, `fotelik`, `dziecinne` | **> 0** dla każdej |
| `łóżko`, `lozko` | 177 — **niezmienione** |
| `sofy` | 41 — **niezmienione** |
| `poso` | 41, z POSO na pozycjach 1-3 — **niezmienione** |
| `materac` | 157 — **niezmienione** |

Synonimy nie mają prawa ruszyć frazy, która ich nie dotyczy. Każda rozbieżność w prawej kolumnie to awaria, nie ciekawostka.

- [ ] **Krok 6: Typy, lint, testy**

```bash
npx tsc --noEmit
npm run lint
npm test
```

Oczekiwane: tsc bez wyjścia, lint 0 błędów (4 ostrzeżenia baseline), testy wszystkie zielone.

- [ ] **Krok 7: Commit**

```bash
git add app/_lib/products.ts app/_lib/search-filter.ts app/api/search/suggest/route.ts app/admin/produkty/actions.ts
git commit -m "feat(search): trzy konsumenty rozszerzaja fraze o synonimy"
```

---

### Task 5: Stan pustego wyniku na /sklep

**Pliki:**
- Utwórz: `app/sklep/EmptySearchState.tsx`
- Modyfikuj: `app/sklep/page.tsx:285-289`
- Modyfikuj: `app/_lib/dictionaries/pl.ts` (sekcja `shop`, przy `emptyTitle`)
- Modyfikuj: `app/_lib/dictionaries/de.ts` (sekcja `shop`, przy `emptyTitle`)

**Interfejsy:**
- Konsumuje: `notCarriedLabel()` z Taska 1, `searchKeyTokens()` (istniejący)
- Kontekst dostępny w `page.tsx` w miejscu wstawienia: `search` (linia 94, `string | undefined`), `filterNodes` (linia 214, wynik `menuProjection`), `t` (słownik), `locale`

- [ ] **Krok 1: Dopisz teksty do `pl.ts`**

W sekcji `shop`, zaraz po `emptyHint`:

```ts
    emptyNotCarried: "Nie prowadzimy",
    emptySearchTitle: "Nie znaleźliśmy nic dla",
    emptyCategoriesHint: "Sprawdź, co mamy:",
```

- [ ] **Krok 2: Dopisz te same klucze do `de.ts`**

W sekcji `shop`, zaraz po `emptyHint`:

```ts
    emptyNotCarried: "Wir führen keine",
    emptySearchTitle: "Keine Ergebnisse für",
    emptyCategoriesHint: "Sehen Sie, was wir anbieten:",
```

Brak klucza w `de.ts` wywali typy — słowniki są typowane wzajemnie.

- [ ] **Krok 3: Napisz komponent**

```tsx
import LocalizedLink from "../_components/ui/LocalizedLink";
import { searchKeyTokens } from "@/app/_lib/search-filter";
import { notCarriedLabel } from "@/app/_lib/search-vocabulary";
import type { Locale } from "@/app/_lib/i18n";

type Kafelek = { slug: string; label: string };

// Stan pustego wyniku na /sklep. Trzy przypadki, w tej kolejności:
//
//   1. fraza opisuje rzecz, której sklep nie prowadzi (szafa, komoda) →
//      mówimy to wprost, bo klient inaczej szuka dalej po pustych stronach,
//   2. fraza nie trafiła w nic innego → mówimy dla czego nie ma wyników,
//   3. brak frazy (zero wynika z filtrów) → dotychczasowa podpowiedź o filtrach.
//
// W przypadkach 1 i 2 pokazujemy kafelki kategorii, bo ślepy zaułek był
// najgorszą częścią starego komunikatu.
export default function EmptySearchState({
  query,
  categories,
  locale,
  labels,
}: {
  query: string | undefined;
  categories: Kafelek[];
  locale: Locale;
  labels: {
    emptyTitle: string;
    emptyHint: string;
    emptyNotCarried: string;
    emptySearchTitle: string;
    emptyCategoriesHint: string;
  };
}) {
  const fraza = query?.trim();
  if (!fraza) {
    return (
      <div className="text-center py-24 text-[var(--muted)]">
        <p className="font-display text-2xl mb-2">{labels.emptyTitle}</p>
        <p className="text-sm">{labels.emptyHint}</p>
      </div>
    );
  }

  const nieprowadzone = notCarriedLabel(
    searchKeyTokens(fraza),
    locale === "de" ? "de" : "pl"
  );

  return (
    <div className="text-center py-16 text-[var(--muted)]">
      <p className="font-display text-2xl mb-2 text-[var(--fg)]">
        {nieprowadzone
          ? `${labels.emptyNotCarried} ${nieprowadzone}.`
          : `${labels.emptySearchTitle} \u201E${fraza}\u201D`}
      </p>
      {categories.length > 0 && (
        <>
          <p className="text-sm mb-6">{labels.emptyCategoriesHint}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {categories.map((c) => (
              <LocalizedLink
                key={c.slug}
                href={`/sklep?kategoria=${c.slug}`}
                className="px-5 py-2.5 rounded-full border border-[var(--border)] text-sm text-[var(--fg)] hover:border-[var(--color-navy)] hover:bg-[var(--surface)] transition-colors"
              >
                {c.label}
              </LocalizedLink>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

Konwencja linku (`/sklep?kategoria=<slug>`) jest zweryfikowana — to ta sama, którą stosuje `app/sklep/CategoryChildren.tsx:21`. Nie `/sklep/<slug>`.

- [ ] **Krok 4: Podłącz w `page.tsx`**

Zamień blok z linii 285-289:

```tsx
      {products.length === 0 ? (
        <div className="text-center py-24 text-[var(--muted)]">
          <p className="font-display text-2xl mb-2">{t.shop.emptyTitle}</p>
          <p className="text-sm">{t.shop.emptyHint}</p>
        </div>
      ) : (
```

na:

```tsx
      {products.length === 0 ? (
        <EmptySearchState
          query={search}
          categories={filterNodes.map((n) => ({ slug: n.slug, label: n.label }))}
          locale={locale}
          labels={{
            emptyTitle: t.shop.emptyTitle,
            emptyHint: t.shop.emptyHint,
            emptyNotCarried: t.shop.emptyNotCarried,
            emptySearchTitle: t.shop.emptySearchTitle,
            emptyCategoriesHint: t.shop.emptyCategoriesHint,
          }}
        />
      ) : (
```

Dopisz import komponentu na górze pliku. Kształt węzła jest zweryfikowany: `menuProjection` zwraca `MenuNode` z polami `{ slug, label, children }` (`app/_lib/category-tree.ts:222-226`), więc mapowanie wyżej jest poprawne.

Uwaga do kafelków: `filterNodes` to węzły najwyższego poziomu, a wśród nich mogą być pozycje, które nie są rodziną produktów — pomiar 2026-08-13 pokazał kategorie `z-produkcji` („Nasze realizacje") i `meble` („Meble") z zerem produktów. Kafelek „Nasze realizacje" w stanie pustego wyniku byłby dziwny. Sprawdź na zrzucie z kroku 5, co się wyświetla, i jeśli takie pozycje tam są, wyklucz je w komponencie po slugu, stałą z komentarzem:

```tsx
// Kategorie, które nie są rodziną produktów — nie proponujemy ich klientowi,
// który właśnie nie znalazł tego, czego szukał.
const POMIJANE_KAFELKI = new Set(["z-produkcji", "meble"]);
```

Docelowo pokazujemy siedem rodzin: ŁÓŻKA, MATERACE, Narożniki, SOFY, Fotele, PUFY (siódma, „Schodki dla pupila", ma jeden produkt i nie ma węzła najwyższego poziomu).

- [ ] **Krok 5: Zrzuty ekranu z Playwrighta**

Playwright NIE działa na `next dev` w tym projekcie. Uruchom `npm run build` i `npm start`, a potem zrób zrzuty trzech stanów:

1. `/sklep?q=szafa` — musi pokazać „Nie prowadzimy szaf." i kafelki
2. `/sklep?q=xyzabc` — musi pokazać „Nie znaleźliśmy nic dla «xyzabc»" i kafelki
3. `/sklep?priceMin=99999` — musi pokazać STARY komunikat o filtrach, bez kafelków

Zrzuty zapisz poza repo (katalog scratchpad sesji) i podaj ścieżki w raporcie. Sprawdź na zrzutach, czy kafelki nie zawijają się brzydko i czy tekst nie ucieka poza kontener na wąskim ekranie — zrób jeden zrzut przy szerokości 390 px.

- [ ] **Krok 6: Typy, lint, testy**

```bash
npx tsc --noEmit
npm run lint
npm test
```

- [ ] **Krok 7: Commit**

```bash
git add app/sklep/EmptySearchState.tsx app/sklep/page.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts
git commit -m "feat(shop): zero wynikow z podpowiedziami zamiast slepego zaulka"
```

---

### Task 6: Weryfikacja end-to-end

**Pliki:** żaden — task wyłącznie weryfikacyjny.

- [ ] **Krok 1: Build i start**

```bash
npm run build
npm start
```

Jeśli port 3000 jest zajęty, ubij proces przed startem. `npm run build` przy działającym `next dev` psuje `.next` deva.

- [ ] **Krok 2: Wszystkie klucze słownika dają wyniki**

Dla każdego z 15 kluczy (`kanapa`, `kanapka`, `wersalka`, `sofka`, `otomana`, `szezlong`, `leżanka`, `tapczan`, `kącik`, `podnóżek`, `posłanie`, `łóżeczko`, `boxspring`, `materacyk`, `fotelik`, `dziecinne`) policz wyniki na `/sklep?q=...`. Każdy **musi być > 0**. Zapisz liczby w raporcie.

- [ ] **Krok 3: Frazy kontrolne bez zmian**

`łóżko` i `lozko` = 177, `sofy` = 41, `materac` = 157, `poso` = 41 z POSO na pozycjach 1-3. **Najważniejsza bramka całej tej pracy: `łóżko` nie ma prawa spaść.** Spadek to awaria — zaraportuj ją, nie szukaj wytłumaczenia.

- [ ] **Krok 4: Panel widzi to samo co klient**

W panelu (`searchProductsForSizeGroup`) fraza `łóżeczko` musi zwrócić te same produkty co `łóżko dziecięce`. Rozjazd znaczy, że jeden z trzech konsumentów został pominięty.

- [ ] **Krok 5: Rozwijka podpowiedzi**

`/api/search/suggest?q=kanapa` — sofy, nie pustka. `/api/search/suggest?q=poso` — POSO na czele, bez zmian względem stanu przed tą gałęzią.

- [ ] **Krok 6: Pełne bramki**

```bash
npm test
npx tsc --noEmit
npm run lint
```

- [ ] **Krok 7: Ubij serwer**

Zwolnij port 3000.

**Ten task NIE tworzy PR-a.** PR zakłada kontroler po czystym finalnym review.

---

## Czego ten plan świadomie nie robi

- **Materiałów** (`welur`, `sztruks`). Blokują je brakujące dane: `fabrics.category` jest pusta u wszystkich 17 tkanin, a materiał istnieje tylko w opisach wolnym tekstem i tylko dla 7. Osobny spec po wypełnieniu pola przez właściciela.
- **Wyszukiwania po etykiecie kategorii.** Dlatego „dwójka" i „trójka" nie weszły do słownika — `2-osobowa` daje zero w kluczu wyszukiwania, bo rozmiar sofy siedzi w kategorii, a klucz to nazwa plus opis.
- **Logowania fraz**, więc kolejne wpisy dalej dobiera się na wyczucie.
- **Deduplikacji rodzin produktów w podpowiedziach** — fraza „alva" dalej zwróci sześć niemal identycznych wariantów.

---

## STAN WYKONANIA

**Nic z tego planu nie jest jeszcze zaimplementowane.** Gałąź `feat/synonimy-i-zero-wynikow` zawiera na tę chwilę wyłącznie spec i ten plan.

### Kontekst do podjęcia pracy na innym komputerze

- Spec zatwierdzony przez właściciela. Zakres i decyzje: słownik w kodzie (nie panel), wszystkie trzy etapy chciane, ale **materiały wypadły z zakresu po pomiarach** (brak danych) i są osobnym tematem.
- Lista synonimów jest **do skreślania przez właściciela w każdej chwili** — jeden plik, jedna linia na wpis.
- **PR #138 (`fix/panel-wyszukiwarka-odmiana`) jest OTWARTY I NIEZMERGOWANY.** Naprawia odmianę w wyszukiwarkach panelu i we wzorniku tkanin. Nie koliduje z tym planem (inne pliki), ale zdecyduj, w jakiej kolejności je mergować.
- Poprzedni projekt (ogonki i odmiana) wdrożony: PR #136 + #137, migracje 73 i 74 na produkcji. Jego rozstrzygnięcia i follow-upy są w sekcji „STAN WYKONANIA" planu `2026-08-13-wyszukiwanie-dopasowanie.md`.
- Push wymaga konta gh **Woodecky10** (domyślne `mwlo1403` dostaje 403). Jeśli `gh pr merge` odbije się od klasyfikatora w PowerShellu, spróbuj tego samego w Bashu — blokady różnią się per narzędzie.
- **Przed każdym mergem sprawdź `git log origin/<branch>..<branch>`.** Przy PR #136 zmergowano wersję bez trzech commitów poprawki, bo gałąź pushnięto przed ich powstaniem.

### Największe ryzyko tego planu

Składnia wildcarda w `.or()` PostgREST (Task 4). Błąd tam **nie wywala wyjątku — cicho zwraca zero wyników**. Dlatego Task 4 ma osobną bramkę pomiarową na żywej bazie i nie wolno go uznać za zrobiony bez niej.
