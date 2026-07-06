import { describe, it, expect } from "vitest";
import {
  shouldMarkDirty,
  shouldInterceptLink,
  nextSettleState,
  decideAfterSave,
  SETTLE_INTERVAL_MS,
  SETTLE_TIMEOUT_MS,
} from "@/app/_lib/unsaved-guard-core";

describe("shouldMarkDirty", () => {
  it("pole w formularzu → brudne", () => {
    expect(shouldMarkDirty({ isFileInput: false, inIgnored: false, unitKind: "form" })).toBe(true);
  });
  it("pole w sekcji data-guard-section → brudne", () => {
    expect(shouldMarkDirty({ isFileInput: false, inIgnored: false, unitKind: "section" })).toBe(true);
  });
  it("input[type=file] → nigdy (upload zapisuje się sam)", () => {
    expect(shouldMarkDirty({ isFileInput: true, inIgnored: false, unitKind: "form" })).toBe(false);
  });
  it("wewnątrz [data-guard-ignore] → nie (wyszukiwarki)", () => {
    expect(shouldMarkDirty({ isFileInput: false, inIgnored: true, unitKind: "form" })).toBe(false);
  });
  it("poza jakąkolwiek jednostką → nie", () => {
    expect(shouldMarkDirty({ isFileInput: false, inIgnored: false, unitKind: null })).toBe(false);
  });
});

const baseLink = {
  sameOrigin: true,
  samePageHash: false,
  modifier: false,
  targetBlank: false,
  hasDownload: false,
  mainButton: true,
};

describe("shouldInterceptLink", () => {
  it("wewnętrzny link + brudno → przechwyć", () => {
    expect(shouldInterceptLink(baseLink, 1)).toBe(true);
  });
  it("czysto → nie przechwytuj", () => {
    expect(shouldInterceptLink(baseLink, 0)).toBe(false);
  });
  it("inny origin → nie (beforeunload to złapie)", () => {
    expect(shouldInterceptLink({ ...baseLink, sameOrigin: false }, 1)).toBe(false);
  });
  it("kotwica na tej samej stronie → nie", () => {
    expect(shouldInterceptLink({ ...baseLink, samePageHash: true }, 1)).toBe(false);
  });
  it("ctrl/meta (nowa karta) → nie", () => {
    expect(shouldInterceptLink({ ...baseLink, modifier: true }, 1)).toBe(false);
  });
  it("target=_blank → nie", () => {
    expect(shouldInterceptLink({ ...baseLink, targetBlank: true }, 1)).toBe(false);
  });
  it("download → nie", () => {
    expect(shouldInterceptLink({ ...baseLink, hasDownload: true }, 1)).toBe(false);
  });
  it("środkowy przycisk myszy → nie", () => {
    expect(shouldInterceptLink({ ...baseLink, mainButton: false }, 1)).toBe(false);
  });
});

describe("nextSettleState", () => {
  it("zapis trwa → zeruje licznik idle, dodaje czas", () => {
    const r = nextSettleState({ consecutiveIdle: 1, elapsedMs: 0 }, true);
    expect(r.state.consecutiveIdle).toBe(0);
    expect(r.state.elapsedMs).toBe(SETTLE_INTERVAL_MS);
    expect(r.settled).toBe(false);
    expect(r.timedOut).toBe(false);
  });
  it("dwa kolejne odczyty idle → settled", () => {
    const r1 = nextSettleState({ consecutiveIdle: 0, elapsedMs: 300 }, false);
    expect(r1.settled).toBe(false);
    const r2 = nextSettleState(r1.state, false);
    expect(r2.settled).toBe(true);
  });
  it("przekroczenie timeoutu → timedOut", () => {
    const r = nextSettleState({ consecutiveIdle: 0, elapsedMs: SETTLE_TIMEOUT_MS }, true);
    expect(r.timedOut).toBe(true);
  });
});

describe("decideAfterSave", () => {
  it("wszystko zapisane, brak błędów → leave", () => {
    expect(decideAfterSave({ errorToastVisible: false, anyStillDirty: false, timedOut: false })).toBe("leave");
  });
  it("toast błędu → stay (użytkownik widzi błąd)", () => {
    expect(decideAfterSave({ errorToastVisible: true, anyStillDirty: false, timedOut: false })).toBe("stay");
  });
  it("jednostka nadal brudna (walidacja zatrzymała submit) → stay", () => {
    expect(decideAfterSave({ errorToastVisible: false, anyStillDirty: true, timedOut: false })).toBe("stay");
  });
  it("timeout → stay (bez nawigacji w ciemno)", () => {
    expect(decideAfterSave({ errorToastVisible: false, anyStillDirty: false, timedOut: true })).toBe("stay");
  });
});
