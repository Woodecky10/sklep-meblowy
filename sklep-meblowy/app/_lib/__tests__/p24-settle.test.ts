import { describe, it, expect } from "vitest";
import { expectedVerifyAmount } from "../../api/p24/status/route";

describe("expectedVerifyAmount", () => {
  it("przelicza jednostki główne na grosze (zaokrąglenie)", () => {
    expect(expectedVerifyAmount(1999)).toBe(199900);
    expect(expectedVerifyAmount(19.99)).toBe(1999);
    expect(expectedVerifyAmount(0.1 + 0.2)).toBe(30); // bez błędu floata
  });
});
