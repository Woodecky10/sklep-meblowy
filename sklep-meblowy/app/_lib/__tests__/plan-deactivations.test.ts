import { describe, it, expect } from "vitest";
import { planDeactivations } from "@/app/_lib/baselinker-sync";

const db = (...ids: string[]) => ids.map((baselinker_id) => ({ baselinker_id }));
const guards = { completedFully: true, maxRatio: 0.2, maxAbsoluteFloor: 5 };

describe("planDeactivations", () => {
  it("abort gdy pobranie niekompletne", () => {
    const r = planDeactivations(db("1", "2"), new Set<string>(), {
      ...guards,
      completedFully: false,
    });
    expect(r.toDeactivate).toEqual([]);
    expect(r.skippedReason).toMatch(/niekompletne/i);
  });
  it("ukrywa produkty z DB nieobecne w seenBlIds", () => {
    const r = planDeactivations(db("1", "2", "3"), new Set(["1", "2"]), guards);
    expect(r.toDeactivate).toEqual(["3"]);
    expect(r.skippedReason).toBeNull();
  });
  it("nic do ukrycia gdy wszystkie widziane", () => {
    const r = planDeactivations(db("1", "2"), new Set(["1", "2"]), guards);
    expect(r.toDeactivate).toEqual([]);
    expect(r.skippedReason).toBeNull();
  });
  it("podłoga: 3 z 3 (poniżej floor=5) PRZECHODZI", () => {
    const r = planDeactivations(db("1", "2", "3"), new Set<string>(), guards);
    expect(r.toDeactivate).toEqual(["1", "2", "3"]);
  });
  it("próg: 25 z 100 (>20%) wstrzymuje", () => {
    const all = Array.from({ length: 100 }, (_, i) => String(i));
    const r = planDeactivations(db(...all), new Set(all.slice(25)), guards);
    expect(r.toDeactivate).toEqual([]);
    expect(r.skippedReason).toMatch(/podejrzanie dużo \(25\)/);
  });
  it("próg: 15 z 100 (<20%) PRZECHODZI", () => {
    const all = Array.from({ length: 100 }, (_, i) => String(i));
    const r = planDeactivations(db(...all), new Set(all.slice(15)), guards);
    expect(r.toDeactivate).toHaveLength(15);
  });
});
