import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getDictionary } from "@/app/_lib/dictionaries";

// Jedyny <h1> strony głównej: treść w słowniku + jego podpięcie w app/page.tsx.
//
// Historia, bez której ten plik wygląda na przesadę: h1 dodano 2026-08-10
// (commit 7feeb7fd) po TRZECIM odrzuceniu weryfikacji marki Google z powodem
// „strona główna nie wyjaśnia celu aplikacji", usunięto 2026-08-17 (b39fdbd7)
// na polecenie właściciela, przywrócono 2026-08-31 — też decyzją właściciela,
// tym razem z treścią dobraną pod realne frazy z Search Console. Feature
// zniknął już raz przez zmianę w JEDNYM pliku i nic tego nie wyłapało.
//
// Część druga to GUARD TEKSTOWY, nie behawioralny (wzorzec:
// search-correction-wiring.test.ts). Vitest chodzi tu w środowisku "node",
// bez jsdom, a `include` łapie wyłącznie .test.ts — serwerowego page.tsx nie
// da się tu wyrenderować. Guard dowodzi tylko, że nikt nie rozspawał h1.

const PAGE = readFileSync(path.join(process.cwd(), "app", "page.tsx"), "utf8");
const SLIDER = readFileSync(
  path.join(process.cwd(), "app", "_components", "layout", "HomeHeroSlider.tsx"),
  "utf8"
);

// Liczenie <h1> musi pomijać komentarze — oba pliki OPISUJĄ w komentarzach, ile
// mają być warte nagłówki, i sekwencja „<h1>" pada tam kilka razy.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function countH1(src: string): number {
  return (stripComments(src).match(/<h1[\s>]/g) ?? []).length;
}

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
  it("home ma dokładnie jeden element <h1>", () => {
    expect(countH1(PAGE)).toBe(1);
  });

  it("h1 bierze treść ze słownika, nie z literału", () => {
    expect(/<h1[^>]*>\s*\{t\.home\.h1\}/.test(PAGE)).toBe(true);
    expect(PAGE).toContain("{t.home.h1Lead}");
  });

  it("purposeHeading() renderuje się pod hero", () => {
    expect(
      /<HomeHeroSlider slides=\{slides\} \/>\s*\{purposeHeading\(\)\}/.test(PAGE),
      "h1 przestał być renderowany pod sliderem"
    ).toBe(true);
  });

  it("purposeHeading() ma wariant zapasowy, gdy blok hero jest wyłączony", () => {
    // Bez tego wyłączenie hero w /admin/wyglad zdejmuje z home jedyny h1 —
    // cicho, bez żadnego błędu.
    expect(PAGE).toContain("const hasHero =");
    expect(
      /\{!hasHero && purposeHeading\(\)\}/.test(PAGE),
      "zniknął fallback h1 na wypadek wyłączonego bloku hero"
    ).toBe(true);
  });

  it("h1 nie jest ukryty przed użytkownikiem (cloaking)", () => {
    expect(/<h1[^>]*sr-only/.test(PAGE)).toBe(false);
    expect(/<h1[^>]*hidden/.test(PAGE)).toBe(false);
  });
});

describe("HomeHeroSlider — hasła slajdów zostają h2", () => {
  it("slider nie renderuje żadnego <h1>", () => {
    // Slider trzyma WSZYSTKIE slajdy w DOM naraz (rotacja jest wizualna), więc
    // h1 na slajdzie dawałby ich tyle, ile slajdów — tak było do 2026-08-10.
    expect(countH1(SLIDER)).toBe(0);
  });
});
