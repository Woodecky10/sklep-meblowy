import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FabricPropertyBadges from "@/app/_components/ui/FabricPropertyBadges";
import type { FabricPropertyCode } from "@/app/_lib/fabric-properties";
import type { Locale } from "@/app/_lib/i18n";

// Testy renderu bez DOM: środowisko vitesta to `node`, więc zamiast
// testing-library idzie renderToStaticMarkup (komponent jest czysty — zero
// hooków i zero importów server-only). Plik ma rozszerzenie .ts (taki jest
// `include` w vitest.config.mts), stąd createElement zamiast składni JSX.
function render(codes: FabricPropertyCode[], locale: Locale = "pl"): string {
  return renderToStaticMarkup(createElement(FabricPropertyBadges, { codes, locale }));
}

// Nazwy elementów na najwyższym poziomie zagnieżdżenia. Pigułki trafiają do
// akapitu <p>, więc korzeń MUSI być jeden i MUSI być inline (<span>) — <div>
// w <p> to nieprawidłowy HTML, który przeglądarka „naprawia" i psuje hydrację.
function topLevelTagNames(html: string): string[] {
  const names: string[] = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*?(\/?)>/g;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const [, closing, name, selfClosing] = m;
    if (closing) {
      depth -= 1;
      continue;
    }
    if (depth === 0) names.push(name);
    if (!selfClosing) depth += 1;
  }
  return names;
}

describe("FabricPropertyBadges", () => {
  it("brak cech → zero markupu (żadnego pustego kontenera)", () => {
    expect(render([])).toBe("");
  });

  it("jedna cecha → podpis PL ze słownika w pojedynczym korzeniu <span>, bez <div>", () => {
    const html = render(["waterproof"]);
    expect(html).toContain("Wodoodporna");
    expect(html).not.toContain("<div");
    expect(topLevelTagNames(html)).toEqual(["span"]);
  });

  it("locale de → podpis niemiecki ze słownika (nie zaszyty w komponencie)", () => {
    const html = render(["easy_clean"], "de");
    expect(html).toContain("Pflegeleicht");
    expect(html).not.toContain("Łatwa w czyszczeniu");
  });

  it("kolejność wyświetlania jest stała, niezależna od kolejności wejścia", () => {
    const html = render(["easy_clean", "waterproof"]);
    expect(html.indexOf("Wodoodporna")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("Wodoodporna")).toBeLessThan(html.indexOf("Łatwa w czyszczeniu"));
  });
});
