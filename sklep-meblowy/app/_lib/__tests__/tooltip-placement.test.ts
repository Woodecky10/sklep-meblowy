import { describe, it, expect } from "vitest";
import { computeTooltipPosition } from "@/app/_lib/tooltip-placement";

// Domyślne wartości z implementacji — testy liczą na nich oczekiwane pozycje.
const GAP = 6;
const MARGIN = 8;

// Ikonka „i" ma 16×16 px; kotwicę stawiamy w różnych miejscach viewportu.
function anchorAt(top: number, left = 200) {
  return { top, left, width: 16, height: 16 };
}

describe("computeTooltipPosition — wybór strony (nad/pod kotwicą)", () => {
  it("dużo miejsca nad kotwicą → placement 'top' tuż nad ikonką", () => {
    const anchor = anchorAt(500);
    const tip = { width: 220, height: 60 };
    const r = computeTooltipPosition({
      anchor,
      tip,
      viewport: { width: 1280, height: 900 },
      topInset: 133,
    });
    expect(r.placement).toBe("top");
    expect(r.top).toBe(anchor.top - GAP - tip.height);
  });

  it("realny bug: kotwica pod sticky headerem (topInset 133) → odwraca się w dół i NIE wchodzi pod header", () => {
    const anchor = anchorAt(120);
    const tip = { width: 220, height: 128 };
    const r = computeTooltipPosition({
      anchor,
      tip,
      viewport: { width: 1280, height: 900 },
      topInset: 133,
    });
    expect(r.placement).toBe("bottom");
    expect(r.top).toBeGreaterThanOrEqual(133);
    expect(r.top).toBe(anchor.top + anchor.height + GAP);
  });

  it("nie mieści się ani nad, ani pod → strona z większą przestrzenią + clamp do widocznego obszaru", () => {
    const anchor = anchorAt(200);
    const tip = { width: 220, height: 200 };
    const r = computeTooltipPosition({
      anchor,
      tip,
      // roomAbove = 200-133-6-8 = 53; roomBelow = 300-216-6-8 = 70 → więcej pod
      viewport: { width: 1280, height: 300 },
      topInset: 133,
    });
    expect(r.placement).toBe("bottom");
    expect(r.top).toBeGreaterThanOrEqual(133 + MARGIN);
    expect(r.top).toBe(133 + MARGIN);
  });

  it("nie mieści się nigdzie, ale nad kotwicą jest więcej miejsca → placement 'top'", () => {
    const anchor = anchorAt(400);
    const tip = { width: 220, height: 400 };
    const r = computeTooltipPosition({
      anchor,
      // roomAbove = 400-0-6-8 = 386; roomBelow = 500-416-6-8 = 70
      tip,
      viewport: { width: 1280, height: 500 },
      topInset: 0,
    });
    expect(r.placement).toBe("top");
    expect(r.top).toBeGreaterThanOrEqual(MARGIN);
  });

  it("brak headera (topInset 0) i kotwica przy samej górze → 'bottom'", () => {
    const anchor = anchorAt(4);
    const r = computeTooltipPosition({
      anchor,
      tip: { width: 220, height: 60 },
      viewport: { width: 1280, height: 900 },
      topInset: 0,
    });
    expect(r.placement).toBe("bottom");
    expect(r.top).toBe(anchor.top + anchor.height + GAP);
  });
});

describe("computeTooltipPosition — pozycja pozioma", () => {
  it("wyśrodkowuje dymek na kotwicy", () => {
    const anchor = anchorAt(500, 600);
    const tip = { width: 220, height: 60 };
    const r = computeTooltipPosition({
      anchor,
      tip,
      viewport: { width: 1280, height: 900 },
      topInset: 133,
    });
    expect(r.left).toBe(anchor.left + anchor.width / 2 - tip.width / 2);
  });

  it("clamp przy lewej krawędzi → left === margin", () => {
    const r = computeTooltipPosition({
      anchor: anchorAt(500, 4),
      tip: { width: 220, height: 60 },
      viewport: { width: 1280, height: 900 },
      topInset: 133,
    });
    expect(r.left).toBe(MARGIN);
  });

  it("clamp przy prawej krawędzi → left === viewport.width - tip.width - margin", () => {
    const viewport = { width: 1280, height: 900 };
    const tip = { width: 220, height: 60 };
    const r = computeTooltipPosition({
      anchor: anchorAt(500, 1270),
      tip,
      viewport,
      topInset: 133,
    });
    expect(r.left).toBe(viewport.width - tip.width - MARGIN);
  });

  it("dymek szerszy niż viewport → left === margin (nigdy ujemny)", () => {
    const r = computeTooltipPosition({
      anchor: anchorAt(500, 180),
      tip: { width: 500, height: 60 },
      viewport: { width: 360, height: 800 },
      topInset: 0,
    });
    expect(r.left).toBe(MARGIN);
  });
});

describe("computeTooltipPosition — parametry i determinizm", () => {
  it("respektuje własne gap/margin", () => {
    const anchor = anchorAt(500);
    const tip = { width: 220, height: 60 };
    const r = computeTooltipPosition({
      anchor,
      tip,
      viewport: { width: 1280, height: 900 },
      topInset: 0,
      gap: 20,
      margin: 40,
    });
    expect(r.top).toBe(anchor.top - 20 - tip.height);
    expect(r.left).toBe(anchor.left + anchor.width / 2 - tip.width / 2);
  });

  it("czysta funkcja — te same wejścia dają ten sam wynik i nie mutuje argumentów", () => {
    const args = {
      anchor: anchorAt(300, 500),
      tip: { width: 220, height: 90 },
      viewport: { width: 1280, height: 900 },
      topInset: 133,
    };
    const snapshot = JSON.stringify(args);
    const a = computeTooltipPosition(args);
    const b = computeTooltipPosition(args);
    expect(a).toEqual(b);
    expect(JSON.stringify(args)).toBe(snapshot);
  });
});
