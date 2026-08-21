import { describe, it, expect } from "vitest";
import { legacyFabricSlug } from "../legacy-urls";

describe("legacyFabricSlug", () => {
  it("stary płaski adres tkaniny → slug tkaniny", () => {
    expect(legacyFabricSlug("tkanina-woolly")).toBe("woolly");
    expect(legacyFabricSlug("tkanina-tilia")).toBe("tilia");
  });
  it("nazwa wielowyrazowa zostaje w całości", () => {
    expect(legacyFabricSlug("tkanina-chill-me")).toBe("chill-me");
  });
  it("zwykły slug podstrony → null", () => {
    expect(legacyFabricSlug("o-nas")).toBeNull();
    expect(legacyFabricSlug("tkaniny")).toBeNull();
  });
  it("sam prefiks bez nazwy → null", () => {
    expect(legacyFabricSlug("tkanina")).toBeNull();
    expect(legacyFabricSlug("tkanina-")).toBeNull();
  });
  it("prefiks liczy się tylko na początku", () => {
    expect(legacyFabricSlug("stara-tkanina-woolly")).toBeNull();
  });
});
