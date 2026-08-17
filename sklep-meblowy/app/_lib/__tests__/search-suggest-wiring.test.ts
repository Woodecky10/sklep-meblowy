import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// ⚠️ GUARD TEKSTOWY, NIE BEHAWIORALNY. Ten plik CZYTA ŹRÓDŁA
// app/api/search/suggest/route.ts i app/_components/layout/SearchBox.tsx
// i sprawdza, czy korekta literówek jest w rozwijce podpięta tak, jak została
// zaprojektowana. NIE dowodzi, że działa — dowodzi tylko, że ktoś tego nie
// rozspawał. Bliźniak search-correction-wiring.test.ts robi to samo dla
// /sklep; wzorzec pochodzi z app/probki/__tests__/sample-form-guards.test.ts.
//
// Dlaczego tak, a nie testem zachowania: LOGIKA jest przetestowana zachowaniem
// (search-suggest.test.ts — normalizeSuggestResponse oraz kompozycja
// applyTypoCorrection z predykatem rozwijki). Nie da się tak przetestować dwóch
// SZWÓW:
//   • route handlera — woła prawdziwe supabase przez createClient() → cookies(),
//     a repo świadomie nie mockuje bazy w testach jednostkowych;
//   • SearchBox.tsx — komponent kliencki .tsx, a vitest chodzi tu w środowisku
//     "node", bez jsdom i bez @testing-library/react (patrz vitest.config.mts:
//     include obejmuje wyłącznie .test.ts).
// To są dokładnie te dwa miejsca, w których da się zepsuć feature bez oblania
// jednego testu — stąd ten guard.

const ROUTE = readFileSync(
  path.join(process.cwd(), "app", "api", "search", "suggest", "route.ts"),
  "utf8"
);
const SEARCHBOX = readFileSync(
  path.join(process.cwd(), "app", "_components", "layout", "SearchBox.tsx"),
  "utf8"
);

describe("/api/search/suggest — podpięcie korekty literówek", () => {
  it("o odpaleniu korekty decyduje PUSTA lista podpowiedzi", () => {
    // NAJWAŻNIEJSZA ASERCJA TEGO PLIKU. Fraza, która cokolwiek podpowiada, ma
    // podpowiadać DOKŁADNIE to samo w tej samej kolejności — a rozwijka to
    // najgorętszy endpoint sklepu (żądanie na każde wpisane słowo), więc
    // bezwarunkowa korekta to i regresja wyników, i podwojony ruch do bazy.
    expect(
      /isEmpty:\s*\(\s*\w+\s*\)\s*=>\s*\w+\.length === 0/.test(ROUTE),
      "route nie podaje już applyTypoCorrection predykatu `length === 0` — " +
        "korekta może się odpalać na frazie, która ma podpowiedzi"
    ).toBe(true);
  });

  it("ponowienie idzie przez runSuggest, który sam korekty NIE robi", () => {
    // Głębokość ponowienia ma być dokładnie 1. Tutaj pilnuje jej struktura,
    // a nie flaga (jak skipTypoCorrection w getProducts): runSuggest to samo
    // zapytanie + ranking, bez ani jednego wywołania korekty.
    const wywolania = ROUTE.match(/applyTypoCorrection\(/g) ?? [];
    expect(
      wywolania.length,
      "applyTypoCorrection jest w route wołane " +
        `${wywolania.length} raz(y) zamiast dokładnie raz — pętla na publicznym ` +
        "endpoincie jest niedopuszczalna"
    ).toBe(1);
    expect(
      /rerun:[\s\S]{0,160}?runSuggest\(/.test(ROUTE),
      "rerun w route nie woła już runSuggest — ponowienie może przechodzić " +
        "przez ścieżkę, która sama poprawia frazę"
    ).toBe(true);
    const definicja = ROUTE.indexOf("async function runSuggest");
    const korekta = ROUTE.indexOf("applyTypoCorrection({");
    expect(definicja, "route nie ma już runSuggest").toBeGreaterThan(-1);
    expect(
      definicja < korekta,
      "applyTypoCorrection stoi PRZED definicją runSuggest — kolejność " +
        "sugeruje, że korekta wleczie się do środka ponawianego zapytania"
    ).toBe(true);
  });

  it("błąd zapytania kończy się PRZED korektą, pusto i ze statusem 200", () => {
    // Awaria bazy to nie jest «fraza nic nie znalazła». Ponawianie zapytania
    // (plus pobranie słownika) w momencie, gdy baza właśnie oddała błąd,
    // dokłada jej ruchu w najgorszej możliwej chwili — a klient i tak ma
    // zobaczyć dzisiejszą pustą rozwijkę, nie stronę awarii.
    const bladZapytania = ROUTE.indexOf("if (initial === null)");
    const korekta = ROUTE.indexOf("applyTypoCorrection({");
    expect(
      bladZapytania,
      "route nie ma już wczesnego wyjścia na błąd zapytania (`initial === null`)"
    ).toBeGreaterThan(-1);
    expect(
      bladZapytania < korekta,
      "wyjście na błąd zapytania stoi PO korekcie — padająca baza dostaje " +
        "jeszcze dwa zapytania na każde wpisane słowo"
    ).toBe(true);
    expect(
      /\{ items: \[\] \}, \{ status: 200 \}/.test(ROUTE),
      "błąd zapytania nie odpowiada już pustką ze statusem 200 — rozwijka wisi " +
        "w headerze każdej strony i nie ma prawa jej wywalić"
    ).toBe(true);
  });

  it("fraza bez tokenów wychodzi PRZED jakimkolwiek I/O", () => {
    // `?q=!!!` nie ma czego poprawiać (planSearchCorrection sanityzuje frazę
    // tym samym searchTokens i zwraca null), więc czytanie dla niej słownika
    // katalogu to praca do wyrzucenia — na endpoincie odpytywanym przy każdym
    // wpisanym słowie. Przed dołożeniem korekty ta ścieżka nie dotykała nawet
    // klienta supabase i ma tak zostać.
    const wyjscie = ROUTE.indexOf("searchKeyTokenGroups(q).length === 0");
    const klient = ROUTE.indexOf("await createClient()");
    expect(
      wyjscie,
      "route nie ma już wyjścia dla frazy bez tokenów (sama interpunkcja)"
    ).toBeGreaterThan(-1);
    expect(
      wyjscie < klient,
      "wyjście dla frazy bez tokenów stoi PO utworzeniu klienta supabase — " +
        "`?q=!!!` znów kosztuje I/O"
    ).toBe(true);
  });

  it("błąd słownika nie ma jak wywalić endpointu", () => {
    // getCatalogVocabulary RZUCA przy błędzie bazy (celowo — żeby cache nie
    // zapamiętał pustego słownika na 300 s). Łapie to applyTypoCorrection, więc
    // słownik MUSI iść przez `loadVocabulary`, a nie być awaitowany wprost.
    expect(
      /loadVocabulary:\s*\(\)\s*=>\s*getCatalogVocabulary\(/.test(ROUTE),
      "route nie przekazuje już getCatalogVocabulary jako callback — jeśli jest " +
        "awaitowany wprost, jego wyjątek zwróci 500 z rozwijki"
    ).toBe(true);
    expect(
      /await getCatalogVocabulary\(/.test(ROUTE),
      "route awaituje getCatalogVocabulary wprost — ta funkcja RZUCA przy " +
        "błędzie bazy"
    ).toBe(false);
  });

  it("okno kandydatów i ranking zostają nietknięte", () => {
    // Brief Taska 4: SUGGEST_CANDIDATES (30), SUGGEST_LIMIT (6) i rankByNameMatch
    // bez zmian. Uzasadnienie liczby 30 siedzi w komentarzu nad stałą (pomiar
    // 2026-08-13) i korekta literówek go nie unieważnia.
    expect(/const SUGGEST_CANDIDATES = 30;/.test(ROUTE)).toBe(true);
    expect(/const SUGGEST_LIMIT = 6;/.test(ROUTE)).toBe(true);
    expect(/rankByNameMatch\(/.test(ROUTE)).toBe(true);
  });

  it("pola korekty są w odpowiedzi NIEOBECNE, gdy korekty nie było", () => {
    // Na obecności pól stoi decyzja UI o pokazaniu zdania — `correctedFrom: ""`
    // albo `null` zamiast braku pola to zdanie znikąd nad podpowiedziami.
    expect(
      /if \(correctedFrom === undefined\)[\s\S]{0,120}?json<SuggestResponse>\(\{ items \}\)/.test(
        ROUTE
      ),
      "route nie odróżnia już odpowiedzi bez korekty — pola korekty mogą " +
        "wyciekać puste"
    ).toBe(true);
  });
});

describe("SearchBox — zdanie o korekcie nad podpowiedziami", () => {
  it("odpowiedź jest czytana przez normalizeSuggestResponse", () => {
    // ⚠️ To jest łagodne zejście ze starego kształtu odpowiedzi (goła tablica).
    // Bez niego nowy bundle odpytujący starszy deployment pokazuje pustą
    // rozwijkę zamiast podpowiedzi.
    expect(
      /normalizeSuggestResponse\(/.test(SEARCHBOX),
      "SearchBox nie używa już normalizeSuggestResponse — kształt odpowiedzi " +
        "jest czytany na piechotę i stara odpowiedź przestaje działać"
    ).toBe(true);
    expect(
      /Array\.isArray\(data\)/.test(SEARCHBOX),
      "SearchBox znów sam sprawdza kształt odpowiedzi — ta reguła ma jedno " +
        "miejsce: normalizeSuggestResponse w app/_lib/search-suggest.ts"
    ).toBe(false);
  });

  it("zdanie pokazuje się tylko przy zaszłej korekcie i rozróżnia oba warianty", () => {
    expect(
      /\{correction && \(/.test(SEARCHBOX),
      "SearchBox nie renderuje już zdania warunkowo na `correction` — albo " +
        "zdanie zniknęło, albo pokazuje się zawsze"
    ).toBe(true);
    expect(
      /\{correction\.to \?/.test(SEARCHBOX),
      "SearchBox nie rozróżnia już wariantu A od B po `correction.to`"
    ).toBe(true);
  });

  it("zdanie stoi POZA listą pozycji (klawiatura indeksuje podpowiedzi)", () => {
    // `highlighted` indeksuje `suggestions`, a strzałki liczą modulo
    // `suggestions.length`. Gdyby zdanie było elementem <ul role="listbox">,
    // Enter trafiałby o jeden produkt obok, a czytnik ekranu ogłaszałby zdanie
    // jako wybieralną opcję.
    const zdanie = SEARCHBOX.indexOf("{correction && (");
    // Kod, nie wzmianka w komentarzu: linia złożona WYŁĄCZNIE z tego tagu.
    const lista = SEARCHBOX.search(/^\s*<ul role="listbox">\s*$/m);
    expect(zdanie, "Nie znaleziono bloku zdania o korekcie").toBeGreaterThan(-1);
    expect(lista, "Nie znaleziono <ul role=\"listbox\">").toBeGreaterThan(-1);
    expect(
      zdanie < lista,
      "zdanie o korekcie wjechało do środka <ul role=\"listbox\"> — psuje " +
        "nawigację strzałkami i semantykę listy"
    ).toBe(true);
  });

  it("fraza klienta w zdaniu ma break-words", () => {
    // Do UI trafia fraza WPROST od klienta, a rozwijka jest wąska (na mobile
    // szerokość ekranu minus marginesy). Ten sam wzorzec co
    // w EmptySearchState.tsx i w zdaniu na /sklep.
    const start = SEARCHBOX.indexOf("{correction && (");
    const blok = SEARCHBOX.slice(start, start + 400);
    expect(
      /break-words/.test(blok),
      "Zdanie o korekcie straciło break-words — długa fraza klienta rozepchnie " +
        "rozwijkę"
    ).toBe(true);
  });

  it("oba warianty zdania biorą tekst ze słownika, nie z literałów", () => {
    for (const klucz of [
      "t.shop.correctedShowing",
      "t.shop.emptySearchTitle",
      "t.shop.correctedSimilar",
    ]) {
      expect(
        SEARCHBOX.includes(klucz),
        `SearchBox nie używa już ${klucz} — /de pokaże polski tekst`
      ).toBe(true);
    }
  });

  it("SearchBox NIE powtarza u siebie reguły, którą poprawkę wolno pokazać", () => {
    // Kontrakt: `correctedTo` przychodzi DOKŁADNIE wtedy, gdy poprawkę wolno
    // zacytować (canShowCorrection). Gdyby komponent sam sprawdzał długość albo
    // przynależność do słownika ręcznego, dwa miejsca decydowałyby o tym samym
    // i cicho by się rozjechały.
    expect(
      /VOCABULARY_EXTRA_WORDS|MIN_SHOWN_CORRECTION_LENGTH|correction\.to[^\n]*length/.test(
        SEARCHBOX
      ),
      "SearchBox zaczął sam decydować, czy poprawkę pokazać — ta reguła ma " +
        "jedno miejsce: canShowCorrection w search-correction.ts"
    ).toBe(false);
  });

  it("każde czyszczenie podpowiedzi czyści też zdanie o korekcie", () => {
    // Inaczej zostaje zdanie nad listą, której już nie ma (albo nad wynikami
    // zupełnie innej frazy).
    const czyszczeniaListy = (SEARCHBOX.match(/setSuggestions\(\[\]\)/g) ?? [])
      .length;
    const czyszczeniaZdania = (SEARCHBOX.match(/setCorrection\(null\)/g) ?? [])
      .length;
    expect(
      czyszczeniaZdania >= czyszczeniaListy,
      `setSuggestions([]) występuje ${czyszczeniaListy} razy, a ` +
        `setCorrection(null) ${czyszczeniaZdania} — jakieś czyszczenie ` +
        "podpowiedzi zostawia zdanie o korekcie na ekranie"
    ).toBe(true);
  });

  it("debounce i anulowanie fetcha zostają nietknięte", () => {
    // Ten kod ma za sobą naprawiony bug: flaga `cancelled` żyła kiedyś
    // w closure setTimeout, więc jej cleanup był wyrzucany i anulowanie nigdy
    // nie działało. Korekta literówek nie miała prawa tego ruszyć.
    expect(/let cancelled = false;/.test(SEARCHBOX)).toBe(true);
    expect(/cancelled = true;/.test(SEARCHBOX)).toBe(true);
    expect(/if \(cancelled\) return;/.test(SEARCHBOX)).toBe(true);
  });
});
