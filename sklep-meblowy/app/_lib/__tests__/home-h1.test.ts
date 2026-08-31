import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getDictionary } from "@/app/_lib/dictionaries";

// Jedyny <h1> strony głównej: treść w słowniku + jego podpięcie w app/page.tsx.
//
// TU STOI KANON HISTORII tego nagłówka — app/page.tsx i słownik pl.ts
// wskazują na ten plik zamiast powtarzać opis trzeci raz.
//
// Historia, bez której ten plik wygląda na przesadę: h1 dodano 2026-08-10
// (commit 7feeb7fd) po TRZECIM odrzuceniu weryfikacji marki Google z powodem
// „strona główna nie wyjaśnia celu aplikacji"; do tego dnia nad zgięciem stały
// same hasła („Meble, które opowiadają historię"). 2026-08-17 (b39fdbd7) h1
// usunięto na polecenie właściciela — razem z kluczami `home.h1`/`home.h1Lead`
// ze słowników. 2026-08-31 przywrócono go, też decyzją właściciela, tym razem
// z treścią dobraną pod realne frazy z Search Console. Feature zniknął już raz
// przez zmianę w JEDNYM pliku i nic tego nie wyłapało.
//
// Część druga to GUARD TEKSTOWY, nie behawioralny (wzorzec:
// search-correction-wiring.test.ts). Vitest chodzi tu w środowisku "node",
// bez jsdom, a `include` łapie wyłącznie .test.ts — serwerowego page.tsx nie
// da się tu wyrenderować. Guard dowodzi tylko, że nikt nie rozspawał h1;
// zgodność wyrenderowanego DOM-u sprawdza e2e/home-h1.spec.ts.

const PAGE = readFileSync(path.join(process.cwd(), "app", "page.tsx"), "utf8");
const SLIDER = readFileSync(
  path.join(process.cwd(), "app", "_components", "layout", "HomeHeroSlider.tsx"),
  "utf8"
);

type Frame = { kind: "template" } | { kind: "interp"; depth: number };

// Usuwa komentarze `//` i `/* */`, ale WYŁĄCZNIE te stojące w kodzie — oba
// czytane pliki opisują w komentarzach, ile mają być warte nagłówki, i
// sekwencja „<h1>" pada tam kilka razy.
//
// Skaner idzie znak po znaku i pamięta kontekst: 'apostrof', "cudzysłów",
// `szablon` (razem z zagnieżdżonym ${…}, gdzie znowu obowiązują reguły kodu).
// Dzięki temu „https://…" w stringu nie zjada reszty linii, a komentarz
// doklejony ZA kodem (`foo(); // uwaga`) znika tak samo jak ten w osobnej
// linii. Znaki nowej linii zostają, żeby numeracja się nie rozjechała.
//
// Ograniczenie: literały regexowe idą jak zwykły kod. Regex z `/*` albo
// z niezescapowanym `//` zmyliłby skaner — w tych dwóch plikach takich nie ma.
function stripComments(src: string): string {
  let out = "";
  const stack: Frame[] = [];
  let i = 0;
  while (i < src.length) {
    const top = stack[stack.length - 1];
    const c = src[i];
    const next = src[i + 1];

    // Wnętrze szablonu `…` to tekst, nie kod — komentarzy tu nie ma.
    if (top?.kind === "template") {
      if (c === "\\") {
        out += c + (next ?? "");
        i += 2;
        continue;
      }
      if (c === "`") {
        out += c;
        i++;
        stack.pop();
        continue;
      }
      if (c === "$" && next === "{") {
        out += "${";
        i += 2;
        stack.push({ kind: "interp", depth: 0 });
        continue;
      }
      out += c;
      i++;
      continue;
    }

    // Kod: najwyższy poziom albo wnętrze ${…}.
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      out += c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        // Nowa linia w zwykłym stringu = literał niedomknięty (albo skaner
        // zgubił kontekst) — kończymy, zamiast połknąć resztę pliku.
        const done = src[i] === c || src[i] === "\n";
        out += src[i];
        i++;
        if (done) break;
      }
      continue;
    }
    if (c === "`") {
      out += c;
      i++;
      stack.push({ kind: "template" });
      continue;
    }
    if (top?.kind === "interp") {
      if (c === "{") top.depth++;
      else if (c === "}") {
        if (top.depth === 0) {
          out += c;
          i++;
          stack.pop();
          continue;
        }
        top.depth--;
      }
    }
    out += c;
    i++;
  }
  return out;
}

function countH1(src: string): number {
  return (stripComments(src).match(/<h1[\s>]/g) ?? []).length;
}

// Przeskakuje literał ('…', "…", `…`) — zwraca indeks znaku zamykającego.
function skipLiteral(src: string, start: number): number {
  const quote = src[start];
  for (let i = start + 1; i < src.length; i++) {
    if (src[i] === "\\") {
      i++;
      continue;
    }
    if (src[i] === quote) return i;
  }
  return src.length - 1;
}

// Wycina CAŁE ciało purposeHeading() — <section> razem z <h1> w środku.
// Cloaking sprawdzamy na całej sekcji, bo `hidden` na rodzicu chowa nagłówek
// równie skutecznie jak `hidden` na samym <h1>.
function purposeHeadingSource(src: string): string {
  const cleaned = stripComments(src);
  const start = cleaned.search(/function\s+purposeHeading\s*\(/);
  if (start === -1) return "";
  const open = cleaned.indexOf("{", start);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipLiteral(cleaned, i);
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return cleaned.slice(open, i + 1);
  }
  return "";
}

const CLOAKING_CLASSES = new Set(["hidden", "sr-only", "invisible"]);

// Tokeny klas z każdego className="…" w kawałku JSX. Wariant Tailwinda
// (`md:hidden`, `dark:hidden`) to ta sama klasa — obcinamy prefiks.
// `overflow-hidden` jest JEDNYM tokenem, więc nie pasuje do `hidden`.
function classTokens(jsx: string): string[] {
  return [...jsx.matchAll(/className="([^"]*)"/g)]
    .flatMap((m) => m[1].split(/\s+/))
    .filter(Boolean)
    .map((tok) => tok.slice(tok.lastIndexOf(":") + 1));
}

describe("stripComments — rzetelność samego guardu", () => {
  it("nie zjada kodu, gdy // albo /* stoi w stringu", () => {
    const src = 'const a = "https://mollien.pl"; const b = "/* nie komentarz */";';
    expect(stripComments(src)).toBe(src);
  });

  it("usuwa komentarz doklejony za kodem i komentarz blokowy", () => {
    expect(stripComments("const a = 1; // uwaga\nconst b = 2;")).toBe(
      "const a = 1; \nconst b = 2;"
    );
    expect(stripComments("a(/* w środku */ 1)")).toBe("a( 1)");
  });

  it("radzi sobie z szablonem i zagnieżdżonym ${…}", () => {
    const src = "const s = `x ${a // koniec linii\n} // realny komentarz\n`;";
    expect(stripComments(src)).toBe("const s = `x ${a \n} // realny komentarz\n`;");
  });

  it("liczy <h1> tylko w kodzie, nie w komentarzach", () => {
    expect(countH1("// tu był <h1>\n<h1 className=\"x\">y</h1>")).toBe(1);
  });
});

describe("słownik — treść h1 strony głównej", () => {
  it("PL i DE mają niepusty h1 i h1Lead", () => {
    for (const locale of ["pl", "de"] as const) {
      const t = getDictionary(locale);
      expect(t.home.h1.trim(), `${locale}.home.h1 jest pusty`).not.toBe("");
      expect(t.home.h1Lead.trim(), `${locale}.home.h1Lead jest pusty`).not.toBe("");
    }
  });

  it("DE h1 jest przetłumaczony, a nie fallbackiem do PL", () => {
    expect(getDictionary("de").home.h1).not.toBe(getDictionary("pl").home.h1);
    expect(getDictionary("de").home.h1Lead).not.toBe(getDictionary("pl").home.h1Lead);
  });

  it("h1 niesie frazy z Search Console, nie hasło marketingowe", () => {
    // PL: klaster „meble/sklep + polski producent" (~20 wyświetleń, 0 kliknięć).
    // DE: klaster „möbel aus polen online" (~41 wyświetleń, 0 kliknięć).
    // Te asercje istnieją po to, żeby ktoś, kto zechce wpisać tu „Meble, które
    // opowiadają historię", zobaczył czerwony test i przeczytał ten komentarz.
    const plH1 = getDictionary("pl").home.h1.toLowerCase();
    expect(plH1, "PL h1 nie mówi, że to sklep").toContain("sklep");
    expect(plH1, "PL h1 zgubił frazę o polskim producencie").toContain("polsk");

    const deH1 = getDictionary("de").home.h1.toLowerCase();
    expect(deH1, "DE h1 zgubil fraze mobel").toContain("möbel");
    expect(deH1, "DE h1 zgubil fraze aus Polen").toContain("polen");
  });

  it("h1Lead nazywa markę i wyjaśnia, po co jest konto", () => {
    // To zdanie jest odpowiedzią na zarzut Google „nie wyjaśnia celu aplikacji".
    for (const locale of ["pl", "de"] as const) {
      const lead = getDictionary(locale).home.h1Lead;
      expect(lead, `${locale}: h1Lead bez nazwy marki`).toContain("Mollien.pl");
      expect(
        /konto|Konto/.test(lead),
        `${locale}: h1Lead nie tłumaczy już, po co jest konto`
      ).toBe(true);
    }
  });
});

describe("app/page.tsx — podpięcie jedynego h1", () => {
  const CLEAN = stripComments(PAGE);

  it("home ma dokładnie jeden element <h1>", () => {
    expect(countH1(PAGE)).toBe(1);
  });

  it("h1 bierze treść ze słownika, nie z literału", () => {
    expect(/<h1[^>]*>\s*\{t\.home\.h1\}/.test(CLEAN)).toBe(true);
    expect(CLEAN).toContain("{t.home.h1Lead}");
  });

  it("purposeHeading() jest zdefiniowane i wywoływane", () => {
    expect(purposeHeadingSource(PAGE), "zniknęła funkcja purposeHeading()").not.toBe("");
    // Co najmniej dwa wywołania: h1 pod hero ORAZ h1 na górze strony, gdy
    // hero jej nie otwiera (wyłączony w panelu albo przeciągnięty w dół).
    // Bez tego drugiego wariantu wyłączenie hero zdejmuje z home jedyny h1 —
    // cicho, bez żadnego błędu. Świadome scalenie obu wariantów w jedno
    // wywołanie jest OK: wtedy popraw tę liczbę razem z e2e/home-h1.spec.ts.
    const calls = (
      CLEAN.replace(/function\s+purposeHeading\s*\(\)/, "").match(/purposeHeading\(\)/g) ?? []
    ).length;
    expect(calls, "zniknął któryś wariant renderowania h1").toBeGreaterThanOrEqual(2);
  });

  it("h1 ani jego sekcja nie są ukryte przed użytkownikiem (cloaking)", () => {
    const cloaked = classTokens(purposeHeadingSource(PAGE)).filter((t) =>
      CLOAKING_CLASSES.has(t)
    );
    expect(cloaked, `sekcja h1 ukryta klasami: ${cloaked.join(", ")}`).toEqual([]);
  });
});

describe("HomeHeroSlider — hasła slajdów zostają h2", () => {
  it("slider nie renderuje żadnego <h1>", () => {
    // Slider trzyma WSZYSTKIE slajdy w DOM naraz (rotacja jest wizualna), więc
    // h1 na slajdzie dawałby ich tyle, ile slajdów — tak było do 2026-08-10.
    expect(countH1(SLIDER)).toBe(0);
  });
});
