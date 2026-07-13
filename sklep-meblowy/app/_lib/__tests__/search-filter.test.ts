import { describe, it, expect } from "vitest";
import {
  escapeIlike,
  sanitizeSearchTerm,
  buildSearchOrFilter,
  rankByNameMatch,
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

describe("rankByNameMatch — trafienia w nazwie przed trafieniami w opisie", () => {
  const get = (r: { name: string }) => r.name;

  it("produkty z frazą w nazwie idą przed dopasowanymi tylko przez opis", () => {
    // Scenariusz z bugu: „materac" łapie materac (nazwa) + łóżka kontynentalne
    // (opis, boxspring z materacem). Materac musi być pierwszy.
    const rows = [
      { name: "Łóżko kontynentalne Marbella" }, // dopasowane przez opis
      { name: "Materac kieszeniowy AURELIO" }, // dopasowane przez nazwę
      { name: "Łóżko kontynentalne Tiki" }, // dopasowane przez opis
    ];
    expect(rankByNameMatch(rows, "materac", get)).toEqual([
      { name: "Materac kieszeniowy AURELIO" },
      { name: "Łóżko kontynentalne Marbella" },
      { name: "Łóżko kontynentalne Tiki" },
    ]);
  });

  it("zachowuje kolejność wejściową w obrębie każdej grupy (stabilne)", () => {
    const rows = [
      { name: "Materac A" },
      { name: "Bez trafienia w nazwie 1" },
      { name: "Materac B" },
      { name: "Bez trafienia w nazwie 2" },
    ];
    expect(rankByNameMatch(rows, "materac", get)).toEqual([
      { name: "Materac A" },
      { name: "Materac B" },
      { name: "Bez trafienia w nazwie 1" },
      { name: "Bez trafienia w nazwie 2" },
    ]);
  });

  it("dopasowanie nazwy jest case-insensitive (jak ILIKE)", () => {
    const rows = [{ name: "sofa" }, { name: "MATERAC" }];
    expect(rankByNameMatch(rows, "materac", get)).toEqual([
      { name: "MATERAC" },
      { name: "sofa" },
    ]);
  });

  it("używa przekazanego akcesora (np. kolumna DE)", () => {
    const rows = [
      { name: "Łóżko", name_de: "Matratzen-Bett" },
      { name: "Materac", name_de: "Matratze" },
    ];
    const ranked = rankByNameMatch(rows, "matratze", (r) => r.name_de);
    // Oba mają „matratze" w name_de, ale pierwszy ma je też — kolejność
    // stabilna: oba trafione, więc bez zmian.
    expect(ranked.map((r) => r.name)).toEqual(["Łóżko", "Materac"]);
  });

  it("fraza pusta/sama interpunkcja → wejście bez zmian (nie rankuj)", () => {
    const rows = [{ name: "Łóżko" }, { name: "Materac" }];
    expect(rankByNameMatch(rows, "", get)).toEqual(rows);
    expect(rankByNameMatch(rows, "   ", get)).toEqual(rows);
    expect(rankByNameMatch(rows, ",.()", get)).toEqual(rows);
  });

  it("sanityzuje frazę tak jak buildSearchOrFilter (spójne dopasowanie)", () => {
    // „materac,x" sanityzuje się do „materacx" — nie trafia w „Materac ...".
    const rows = [{ name: "Materac kieszeniowy" }, { name: "Sofa" }];
    expect(rankByNameMatch(rows, "materac", get)[0]).toEqual({
      name: "Materac kieszeniowy",
    });
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
