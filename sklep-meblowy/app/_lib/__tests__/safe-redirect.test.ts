import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/app/_lib/safe-redirect";

describe("safeNextPath — ochrona przed open redirect (audyt MED)", () => {
  it("bezpieczna ścieżka lokalna zostaje", () => {
    expect(safeNextPath("/konto")).toBe("/konto");
    expect(safeNextPath("/admin?x=1")).toBe("/admin?x=1");
    expect(safeNextPath("/")).toBe("/");
  });

  it("protokołowo-względny //evil.com → null", () => {
    expect(safeNextPath("//evil.com")).toBeNull();
  });

  it("backslash /\\evil.com (przeglądarka traktuje \\ jak /) → null", () => {
    expect(safeNextPath("/\\evil.com")).toBeNull();
  });

  it("userinfo trick @evil.com (bez wiodącego /) → null", () => {
    expect(safeNextPath("@evil.com")).toBeNull();
  });

  it("subdomena .evil.com → null", () => {
    expect(safeNextPath(".evil.com")).toBeNull();
  });

  it("pełny URL z absolutnym schematem → null", () => {
    expect(safeNextPath("https://evil.com")).toBeNull();
    expect(safeNextPath("http://evil.com")).toBeNull();
  });

  it("brak/pusty → null", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath("")).toBeNull();
  });
});
