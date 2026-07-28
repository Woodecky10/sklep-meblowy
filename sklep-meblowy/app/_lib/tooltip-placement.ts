// Pozycjonowanie dymka „i" (ValueInfoTip) renderowanego portalem do body z
// position: fixed. Czysta funkcja (zero DOM/Next) — testowalna w vitest (env node).
//
// Po co: dymek renderowany w flow strony ZAWSZE otwierał się w górę i przy
// pierwszej grupie opcji wjeżdżał pod przyklejony nagłówek (sticky top-0 z-50,
// ~133 px) — był ucinany. Tutaj liczymy, po której stronie kotwicy jest miejsce
// (uwzględniając nagłówek jako „sufit" = topInset) i clampujemy do viewportu,
// żeby dymek nigdy nie wystawał poza ekran (globals.css ma overflow-x: clip).

export type TipRect = { top: number; left: number; width: number; height: number };
export type TipPlacement = "top" | "bottom";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeTooltipPosition(args: {
  anchor: TipRect; // prostokąt ikonki „i" we współrzędnych viewportu
  tip: { width: number; height: number };
  viewport: { width: number; height: number };
  topInset: number; // dolna krawędź przyklejonego nagłówka (px od góry viewportu)
  gap?: number; // odstęp kotwica↔dymek
  margin?: number; // margines od krawędzi ekranu
}): { top: number; left: number; placement: TipPlacement } {
  const { anchor, tip, viewport, topInset } = args;
  const gap = args.gap ?? 6;
  const margin = args.margin ?? 8;

  // Wolne miejsce po obu stronach kotwicy — nad nią „podłogą" jest nagłówek.
  const roomAbove = anchor.top - topInset - gap - margin;
  const roomBelow = viewport.height - (anchor.top + anchor.height) - gap - margin;

  // Preferujemy górę (dotychczasowy wygląd), dół gdy góra nie mieści dymka.
  // Gdy nie mieści się nigdzie — ta strona, gdzie miejsca więcej (dymek i tak
  // zostanie sclampowany, ale będzie widoczny w maksymalnym kawałku).
  let placement: TipPlacement;
  if (tip.height <= roomAbove) placement = "top";
  else if (tip.height <= roomBelow) placement = "bottom";
  else placement = roomAbove > roomBelow ? "top" : "bottom";

  const rawTop =
    placement === "top"
      ? anchor.top - gap - tip.height
      : anchor.top + anchor.height + gap;

  // Clamp w pionie: nigdy nad dolną krawędź nagłówka, nigdy poniżej ekranu.
  // max(...) chroni przed odwróconym zakresem, gdy dymek jest wyższy niż okno.
  const minTop = topInset + margin;
  const maxTop = Math.max(minTop, viewport.height - margin - tip.height);
  const top = clamp(rawTop, minTop, maxTop);

  // Wyśrodkowanie na kotwicy + clamp poziomy (dymek szerszy niż okno → margin).
  const rawLeft = anchor.left + anchor.width / 2 - tip.width / 2;
  const maxLeft = Math.max(margin, viewport.width - tip.width - margin);
  const left = clamp(rawLeft, margin, maxLeft);

  return { top, left, placement };
}
