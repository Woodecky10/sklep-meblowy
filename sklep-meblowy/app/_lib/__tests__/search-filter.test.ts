import { describe, it, expect } from "vitest";
import {
  escapeIlike,
  sanitizeSearchTerm,
  buildSearchOrFilter,
} from "@/app/_lib/search-filter";

describe("sanitizeSearchTerm — ochrona przed injection w .or() (audyt MED)", () => {
  it("normalna fraza zostaje", () => {
    expect(sanitizeSearchTerm("sofa")).toBe("sofa");
    expect(sanitizeSearchTerm("łóżko 160x200")).toBe("łóżko 160x200");
    expect(sanitizeSearchTerm("narożnik 3-osobowy")).toBe("narożnik 3-osobowy");
  });

  it("usuwa składnię .or() PostgREST (przecinek, kropka, nawiasy)", () => {
    // Wektor z audytu: q=x,price.gt.0 wstrzykiwał dodatkowy warunek OR.
    expect(sanitizeSearchTerm("x,price.gt.0")).toBe("xpricegt0");
    expect(sanitizeSearchTerm("sofa,beż")).toBe("sofabeż");
    expect(sanitizeSearchTerm("a(b)c")).toBe("abc");
  });

  it("usuwa wildcardy ILIKE i backslash", () => {
    expect(sanitizeSearchTerm("100%")).toBe("100");
    expect(sanitizeSearchTerm("a_b")).toBe("ab");
    expect(sanitizeSearchTerm("a\\b")).toBe("ab");
  });

  it("collapse białych znaków + trim", () => {
    expect(sanitizeSearchTerm("  sofa   beżowa  ")).toBe("sofa beżowa");
    expect(sanitizeSearchTerm("sofa\tbeżowa\n")).toBe("sofa beżowa");
  });

  it("sama interpunkcja → pusty string", () => {
    expect(sanitizeSearchTerm(",.()%_")).toBe("");
    expect(sanitizeSearchTerm("")).toBe("");
  });
});

describe("buildSearchOrFilter", () => {
  it("buduje filtr .or() z czystej frazy", () => {
    expect(buildSearchOrFilter("sofa")).toBe(
      "name.ilike.%sofa%,description.ilike.%sofa%"
    );
  });

  it("null gdy po sanityzacji nic nie zostaje (nie zawężaj wyników)", () => {
    expect(buildSearchOrFilter(",.()")).toBeNull();
    expect(buildSearchOrFilter("   ")).toBeNull();
    expect(buildSearchOrFilter("")).toBeNull();
  });

  it("wstrzyknięta składnia .or() nie przechodzi do filtra", () => {
    const filter = buildSearchOrFilter("x,price.gt.0");
    // Tylko JEDEN przecinek (separator name/description), żaden z user inputu.
    expect(filter).toBe("name.ilike.%xpricegt0%,description.ilike.%xpricegt0%");
    expect(filter?.split(",").length).toBe(2);
  });

  it("locale de → kolumny _de", () => {
    expect(buildSearchOrFilter("sofa", "de")).toBe(
      "name_de.ilike.%sofa%,description_de.ilike.%sofa%"
    );
  });

  it("locale pl (domyślnie) → kolumny PL", () => {
    expect(buildSearchOrFilter("sofa")).toBe(
      "name.ilike.%sofa%,description.ilike.%sofa%"
    );
  });
});

describe("escapeIlike — escape wildcardów (linkGuestOrders, audyt MED)", () => {
  it("escapuje _ i % i backslash", () => {
    expect(escapeIlike("a_b")).toBe("a\\_b");
    expect(escapeIlike("a%b")).toBe("a\\%b");
    expect(escapeIlike("a\\b")).toBe("a\\\\b");
  });

  it("email z _ przestaje działać jak wildcard", () => {
    // jan_kowalski@x.com — bez escape `_` dopasowałby też janXkowalski@x.com
    expect(escapeIlike("jan_kowalski@x.com")).toBe("jan\\_kowalski@x.com");
  });

  it("zwykły email bez zmian", () => {
    expect(escapeIlike("anna.nowak@x.com")).toBe("anna.nowak@x.com");
  });
});
