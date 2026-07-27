import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FabricPropertyBadges from "@/app/_components/ui/FabricPropertyBadges";
import type { FabricPropertyDef } from "@/app/_lib/fabric-properties";
import type { Locale } from "@/app/_lib/i18n";

// Testy renderu bez DOM: środowisko vitesta to `node`, więc zamiast
// testing-library idzie renderToStaticMarkup (komponent jest czysty — zero
// hooków i zero importów server-only). Plik ma rozszerzenie .ts (taki jest
// `include` w vitest.config.mts), stąd createElement zamiast składni JSX.
function render(defs: FabricPropertyDef[], locale: Locale = "pl"): string {
  return renderToStaticMarkup(createElement(FabricPropertyBadges, { defs, locale }));
}

// Skrót do budowania definicji cechy — pola nadpisujemy tylko tam, gdzie test
// naprawdę o nie pyta (podpisy pochodzą z bazy, nie ze słownika w kodzie).
function def(over: Partial<FabricPropertyDef> = {}): FabricPropertyDef {
  return {
    code: "wodoodporna",
    label: "Wodoodporna",
    labelDe: "Wasserabweisend",
    icon: "drop",
    sortOrder: 0,
    ...over,
  };
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

  it("jedna cecha → podpis z definicji w pojedynczym korzeniu <span>, bez <div>", () => {
    const html = render([def()]);
    expect(html).toContain("Wodoodporna");
    expect(html).not.toContain("<div");
    expect(topLevelTagNames(html)).toEqual(["span"]);
  });

  it("cecha z ikonką z biblioteki → w pigułce jest <svg>", () => {
    const html = render([def({ icon: "leaf", label: "Oddychająca" })]);
    expect(html).toContain("Oddychająca");
    expect(html).toContain("<svg");
  });

  it("locale de → podpis niemiecki z definicji (nie ze słownika)", () => {
    const html = render([def({ label: "Łatwa w czyszczeniu", labelDe: "Pflegeleicht" })], "de");
    expect(html).toContain("Pflegeleicht");
    expect(html).not.toContain("Łatwa w czyszczeniu");
  });

  it("locale de bez tłumaczenia (labelDe null) → podpis polski", () => {
    const html = render([def({ label: "Antyalergiczna", labelDe: null })], "de");
    expect(html).toContain("Antyalergiczna");
  });

  it("ikonka spoza biblioteki (icon null) → pigułka z podpisem, ale bez <svg>", () => {
    const html = render([def({ code: "wlasna", label: "Wodoodporna 3000", icon: null })]);
    expect(html).toContain("Wodoodporna 3000");
    expect(html).not.toContain("<svg");
    expect(topLevelTagNames(html)).toEqual(["span"]);
  });

  it("kolejność wynikowa = kolejność wejściowych definicji (sortuje warstwa danych)", () => {
    const html = render([
      def({ code: "latwa", label: "Łatwa w czyszczeniu", icon: "sparkle", sortOrder: 1 }),
      def({ code: "wodoodporna", label: "Wodoodporna", icon: "drop", sortOrder: 2 }),
    ]);
    expect(html.indexOf("Łatwa w czyszczeniu")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("Łatwa w czyszczeniu")).toBeLessThan(html.indexOf("Wodoodporna"));
  });
});
