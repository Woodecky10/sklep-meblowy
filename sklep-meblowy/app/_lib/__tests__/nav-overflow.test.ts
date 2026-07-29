import { describe, it, expect } from "vitest";
import { countFittingNavItems } from "@/app/_lib/nav-overflow";

// Szerokości w px, tak jak zmierzone w przeglądarce. gap = odstęp między
// pozycjami paska (gap-6 = 24 px), more = szerokość przycisku „Więcej".
describe("countFittingNavItems", () => {
  it("wszystkie się mieszczą → zwraca wszystkie, bez rezerwy na Więcej", () => {
    // 3 × 100 + 2 × 24 = 348
    expect(countFittingNavItems([100, 100, 100], 348, 24, 80)).toBe(3);
  });

  it("brak miejsca na ostatnią pozycję → rezerwuje miejsce na Więcej", () => {
    // Dwie pozycje + gap + Więcej = 100 + 24 + 100 + 24 + 80 = 328 ≤ 330
    expect(countFittingNavItems([100, 100, 100], 330, 24, 80)).toBe(2);
  });

  it("chowa dwie, gdy po schowaniu jednej Więcej wciąż się nie mieści", () => {
    // 1 poz. + gap + Więcej = 100 + 24 + 80 = 204 ≤ 210, ale 2 poz. + Więcej
    // = 100 + 24 + 100 + 24 + 80 = 328 > 210
    expect(countFittingNavItems([100, 100, 100], 210, 24, 80)).toBe(1);
  });

  it("nie mieści się nawet jedna pozycja → 0 (całość idzie do Więcej)", () => {
    expect(countFittingNavItems([100, 100], 90, 24, 80)).toBe(0);
  });

  it("dokładne dopasowanie co do piksela liczy się jako zmieszczone", () => {
    expect(countFittingNavItems([100, 100], 224, 24, 80)).toBe(2);
    expect(countFittingNavItems([100, 100], 223, 24, 80)).toBe(1);
  });

  it("pusta lista → 0", () => {
    expect(countFittingNavItems([], 500, 24, 80)).toBe(0);
  });

  it("brak zmierzonej dostępnej szerokości → 0", () => {
    // available = 0 zdarza się przed pierwszym pomiarem; wołający sam decyduje,
    // że wtedy pokazuje wszystko — funkcja nie zgaduje.
    expect(countFittingNavItems([100], 0, 24, 80)).toBe(0);
    expect(countFittingNavItems([100], -50, 24, 80)).toBe(0);
  });

  it("jedna pozycja mieszcząca się w całości nie rezerwuje miejsca na Więcej", () => {
    expect(countFittingNavItems([100], 100, 24, 80)).toBe(1);
  });

  it("ignoruje ujemne i nieskończone szerokości pozycji", () => {
    expect(countFittingNavItems([100, Number.NaN, 100], 348, 24, 80)).toBe(1);
  });
});
