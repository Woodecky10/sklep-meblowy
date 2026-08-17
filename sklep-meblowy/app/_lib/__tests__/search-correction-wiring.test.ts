import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// ⚠️ GUARD TEKSTOWY, NIE BEHAWIORALNY. Ten plik CZYTA ŹRÓDŁA products.ts
// i app/sklep/page.tsx i sprawdza, czy fallback korekty literówek jest wciąż
// podpięty tak, jak został zaprojektowany. NIE dowodzi, że działa — dowodzi
// tylko, że ktoś tego nie rozspawał. Wzorzec wzięty z drift-guarda formularza
// próbek (app/probki/__tests__/sample-form-guards.test.ts).
//
// Dlaczego tak, a nie testem zachowania: cała LOGIKA korekty siedzi
// w search-correction.ts i JEST przetestowana zachowaniem (I/O wstrzyknięte,
// zero mocków supabase). Nie da się tak przetestować dwóch SZWÓW:
//   • getProducts — woła prawdziwe supabase przez createClient() → cookies(),
//     a repo świadomie nie mockuje bazy w testach jednostkowych;
//   • app/sklep/page.tsx — serwerowy komponent .tsx, a vitest chodzi tu
//     w środowisku "node", bez jsdom i bez @testing-library/react (patrz
//     vitest.config.ts: include obejmuje wyłącznie .test.ts).
// To są dokładnie te dwa miejsca, w których da się zepsuć feature bez
// oblania jednego testu — stąd ten guard.

const PRODUCTS = readFileSync(
  path.join(process.cwd(), "app", "_lib", "products.ts"),
  "utf8"
);
const SKLEP_PAGE = readFileSync(
  path.join(process.cwd(), "app", "sklep", "page.tsx"),
  "utf8"
);

describe("getProducts — podpięcie fallbacku korekty literówek", () => {
  it("o odpaleniu korekty decyduje `total === 0`, a NIE `products.length === 0`", () => {
    // NAJWAŻNIEJSZA ASERCJA TEGO PLIKU. Na 2. stronie wyszukiwania lista
    // produktów bywa pusta, choć fraza coś znalazła (total > 0) — gdyby
    // predykat pytał o długość listy, korekta odpaliłaby się na frazie, KTÓRA
    // MA WYNIKI, i podmieniła je wynikami innej frazy. To jest ta regresja,
    // przed którą stoi cały feature.
    expect(
      /isEmpty:\s*\(\s*\w+\s*\)\s*=>\s*\w+\.total === 0/.test(PRODUCTS),
      "getProducts nie podaje już applyTypoCorrection predykatu `total === 0` — " +
        "korekta może się odpalać na frazie, która ma wyniki"
    ).toBe(true);
    expect(
      /isEmpty:[^\n]*products\.length/.test(PRODUCTS),
      "getProducts pyta o `products.length` zamiast o `total` — na 2. stronie " +
        "wyszukiwania to znaczy „pusto” mimo znalezionych produktów"
    ).toBe(false);
  });

  it("powtórzone zapytanie niesie flagę blokującą kolejną korektę", () => {
    // Bez tej flagi poprawiona fraza mogłaby zostać poprawiona ponownie, i tak
    // w kółko, na PUBLICZNYM /sklep. Głębokość rekurencji ma być dokładnie 1.
    expect(
      /rerun:[\s\S]{0,200}?skipTypoCorrection:\s*true/.test(PRODUCTS),
      "rerun w getProducts nie ustawia już `skipTypoCorrection: true` — " +
        "poprawiona fraza może zostać poprawiona ponownie (pętla na /sklep)"
    ).toBe(true);
  });

  it("flaga jest naprawdę czytana i zatrzymuje rekurencję", () => {
    // Sama obecność pola w obiekcie nic nie daje, jeśli getProducts jej nie
    // odczyta i nie wyjdzie przed wywołaniem korekty.
    expect(
      // Osobna linia `skipTypoCorrection,` = pozycja w destrukturyzacji
      // `} = filters`, a nie ustawienie pola w obiekcie (tam jest `: true`).
      // `\s*$` z flagą `m` toleruje CRLF — repo jest edytowane na Windowsie.
      /=\s*filters;/.test(PRODUCTS) &&
        /^\s*skipTypoCorrection,\s*$/m.test(PRODUCTS),
      "getProducts nie destrukturyzuje już `skipTypoCorrection` z filtrów"
    ).toBe(true);
    const wywolanie = PRODUCTS.indexOf("applyTypoCorrection({");
    const wyjscie = PRODUCTS.indexOf("if (skipTypoCorrection) return");
    expect(
      wyjscie,
      "getProducts nie ma już wczesnego wyjścia `if (skipTypoCorrection) return` — " +
        "powtórzone zapytanie znów spróbuje poprawić frazę"
    ).toBeGreaterThan(-1);
    expect(
      wyjscie < wywolanie,
      "wczesne wyjście na `skipTypoCorrection` stoi PO wywołaniu " +
        "applyTypoCorrection — czyli niczego nie blokuje"
    ).toBe(true);
  });

  it("błąd słownika nie ma jak wywalić strony", () => {
    // getCatalogVocabulary RZUCA przy błędzie bazy (celowo — żeby cache nie
    // zapamiętał pustego słownika na 300 s). Łapie to applyTypoCorrection,
    // więc słownik MUSI iść przez `loadVocabulary`, a nie być awaitowany
    // wprost w getProducts. W repo nie ma error.tsx: niezłapany wyjątek to
    // strona awarii zamiast zwykłego „nic nie znaleźliśmy".
    expect(
      /loadVocabulary:\s*\(\)\s*=>\s*getCatalogVocabulary\(/.test(PRODUCTS),
      "getProducts nie przekazuje już getCatalogVocabulary jako callback — " +
        "jeśli jest awaitowany wprost, jego wyjątek wywali /sklep"
    ).toBe(true);
    expect(
      /await getCatalogVocabulary\(/.test(PRODUCTS),
      "getProducts awaituje getCatalogVocabulary wprost — ta funkcja RZUCA " +
        "przy błędzie bazy, a /sklep nie ma error.tsx"
    ).toBe(false);
  });
});

describe("/sklep — zdanie o korekcie nad siatką produktów", () => {
  it("zdanie pokazuje się tylko przy zaszłej korekcie i cytuje obie frazy", () => {
    expect(
      /\{correctedFrom &&/.test(SKLEP_PAGE),
      "app/sklep/page.tsx nie renderuje już zdania o korekcie warunkowo na " +
        "`correctedFrom` — albo zdanie zniknęło, albo pokazuje się zawsze"
    ).toBe(true);
    expect(
      /\{correctedTo \?/.test(SKLEP_PAGE),
      "app/sklep/page.tsx nie rozróżnia już wariantu A od B po `correctedTo`"
    ).toBe(true);
  });

  it("zdanie nie pokazuje się nad pustą siatką", () => {
    // Korekta patrzy na `total`, więc przy `?q=sofq&strona=10` poprawiona fraza
    // MA wyniki (41 sztuk), ale ta strona jest za końcem listy. Bez warunku na
    // `products.length` klient zobaczyłby „Pokazujemy wyniki dla «sofa»" tuż
    // nad „Nie znaleźliśmy nic dla «sofq»" — dwa zdania, które sobie przeczą.
    expect(
      /\{correctedFrom && products\.length > 0 &&/.test(SKLEP_PAGE),
      "zdanie o korekcie straciło warunek `products.length > 0` — na stronie " +
        "za końcem listy stanie nad przeczącym mu pustym stanem"
    ).toBe(true);
  });

  it("strona NIE powtarza u siebie reguły, którą poprawkę wolno pokazać", () => {
    // Kontrakt: `correctedTo` jest obecne DOKŁADNIE wtedy, gdy poprawkę wolno
    // zacytować (patrz canShowCorrection). Gdyby strona sama sprawdzała
    // długość albo przynależność do słownika ręcznego, dwa miejsca decydowałyby
    // o tym samym i cicho by się rozjechały.
    expect(
      /VOCABULARY_EXTRA_WORDS|MIN_SHOWN_CORRECTION_LENGTH|correctedTo[^\n]*length/.test(
        SKLEP_PAGE
      ),
      "app/sklep/page.tsx zaczął sam decydować, czy poprawkę pokazać — ta " +
        "reguła ma jedno miejsce: canShowCorrection w search-correction.ts"
    ).toBe(false);
  });

  it("fraza klienta w zdaniu ma break-words", () => {
    // Jedno długie słowo bez spacji (55 znaków w teście EmptySearchState)
    // wychodziło poza kontener na 390 px. Tu do UI trafia fraza WPROST od
    // klienta, więc ten sam wzorzec jest obowiązkowy.
    const start = SKLEP_PAGE.indexOf("{correctedFrom &&");
    expect(start, "Nie znaleziono bloku korekty w app/sklep/page.tsx").toBeGreaterThan(-1);
    const blok = SKLEP_PAGE.slice(start, start + 400);
    expect(
      /break-words/.test(blok),
      "Zdanie o korekcie straciło break-words — długa fraza klienta wyjdzie " +
        "poza kontener na wąskim ekranie"
    ).toBe(true);
  });

  it("oba warianty zdania biorą tekst ze słownika, nie z literałów", () => {
    for (const klucz of [
      "t.shop.correctedShowing",
      "t.shop.correctedNotFound",
      "t.shop.correctedSimilar",
      "t.shop.emptySearchTitle",
    ]) {
      expect(
        SKLEP_PAGE.includes(klucz),
        `app/sklep/page.tsx nie używa już ${klucz} — /de pokaże polski tekst`
      ).toBe(true);
    }
  });
});
