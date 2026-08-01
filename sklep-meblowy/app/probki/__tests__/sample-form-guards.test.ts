import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// ⚠️ GUARD TEKSTOWY, NIE BEHAWIORALNY. Ten plik CZYTA ŹRÓDŁO SampleForm.tsx
// i sprawdza, czy dwa zabezpieczenia formularza próbek wciąż w nim są. NIE
// dowodzi, że działają — dowodzi tylko, że ktoś ich nie skasował. Wzorzec
// wzięty z drift-guarda tras w app/_lib/__tests__/pages.test.ts.
//
// Dlaczego tak, a nie testem zachowania: formularz jest komponentem klienckim
// za bramką logowania (app/probki/page.tsx robi twardy redirect przed
// renderem). Repo nie ma czym go wyrenderować — vitest chodzi w środowisku
// "node", a w package.json nie ma @testing-library/react, jsdom ani
// @playwright/experimental-ct-react. E2E też odpada: bez konta testowego
// (.env.e2e nie istnieje) strona w ogóle się nie pokaże.
//
// ⚠️ I NAWET Z KONTEM behawioralny test Entera byłby niebezpieczny: gdyby
// guard zregresował, test oblałby się SKŁADAJĄC PRAWDZIWE ZAMÓWIENIE PRÓBEK
// — serwer dev chodzi po produkcyjnej bazie. Ten guard takiego ryzyka nie ma.

const SOURCE = readFileSync(
  path.join(process.cwd(), "app", "probki", "SampleForm.tsx"),
  "utf8"
);

// Wycina element JSX zaczynający się od podanego atrybutu aż do zamknięcia
// (`/>` dla samozamykających, `>` dla otwierających). Dzięki temu asercje
// dotyczą KONKRETNEGO elementu, a nie całego pliku.
function elementAt(marker: string, closing: string): string {
  const start = SOURCE.indexOf(marker);
  expect(start, `Nie znaleziono elementu z ${marker} w SampleForm.tsx`).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start);
  const end = rest.indexOf(closing);
  expect(end, `Element z ${marker} nie ma zamknięcia ${closing}`).toBeGreaterThan(-1);
  return rest.slice(0, end);
}

describe("SampleForm — drift-guard zabezpieczeń formularza", () => {
  it("pole wyszukiwania blokuje Enter (implicit submission)", () => {
    // Realny bug z Taska 4: pojedyncze pole tekstowe w <form> wysyła go
    // Enterem. Przy preselekcji z `?tkanina=` i adresie z profilu wszystkie
    // wymagane pola są już wypełnione, więc nic nie protestuje — klient
    // szukający tkaniny ląduje na bramce płatności.
    const input = elementAt('type="search"', "/>");

    expect(
      /onKeyDown/.test(input),
      "Pole wyszukiwania w SampleForm.tsx straciło onKeyDown — Enter znów wyśle zamówienie"
    ).toBe(true);
    expect(
      /key\s*===\s*["']Enter["']/.test(input),
      "Handler pola wyszukiwania nie sprawdza już klawisza Enter"
    ).toBe(true);
    expect(
      /preventDefault\(\)/.test(input),
      "Handler Entera nie woła preventDefault() — formularz i tak się wyśle"
    ).toBe(true);
  });

  it("przycisk zamówienia jest nieaktywny przy pustym wyborze", () => {
    // Ochrona przed zamówieniem bez ani jednej próbki (drugi warunek, `busy`,
    // pilnuje duplikatów — jego nie ruszamy, bo ma osobne uzasadnienie w kodzie).
    const button = elementAt('type="submit"', ">");

    expect(
      /disabled=\{[^}]*selections\.length === 0/.test(button),
      'Przycisk "Zamawiam" nie sprawdza już pustego wyboru w disabled — ' +
        "klient może wysłać zamówienie bez wybranej próbki"
    ).toBe(true);
  });
});
