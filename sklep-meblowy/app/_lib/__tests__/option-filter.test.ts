import { describe, it, expect } from "vitest";
import {
  normalizeOptionName,
  displayOptionName,
  optionParamSlug,
  OPTION_PARAM_PREFIX,
  EXCLUDED_OPTION_SLUGS,
  collectOptionFacets,
  localizeOptionFacets,
  productMatchesOptionFilters,
  productMatchesDimensions,
  hasActiveDimensionRanges,
  collectDimensionBounds,
  parseOptionFilterParams,
} from "@/app/_lib/option-filter";
import type { ProductVariants } from "@/app/_lib/types";

describe("normalizeOptionName", () => {
  it("trimuje, zbija spacje i lowercase'uje", () => {
    expect(normalizeOptionName("  POWIERZCHNIA   SPANIA ")).toBe(
      "powierzchnia spania"
    );
  });
  it("ROZMIAR i Rozmiar dają ten sam klucz", () => {
    expect(normalizeOptionName("ROZMIAR")).toBe(normalizeOptionName("Rozmiar"));
  });
});

describe("displayOptionName", () => {
  it("pierwsza litera wielka, reszta mała", () => {
    expect(displayOptionName("ROZMIAR")).toBe("Rozmiar");
    expect(displayOptionName("powierzchnia spania")).toBe("Powierzchnia spania");
  });
  it("pusty string zostaje pusty", () => {
    expect(displayOptionName("   ")).toBe("");
  });
});

describe("optionParamSlug", () => {
  it("zdejmuje polskie znaki i robi kebab-case", () => {
    expect(optionParamSlug("STELAŻ")).toBe("stelaz");
    expect(optionParamSlug("POWIERZCHNIA SPANIA")).toBe("powierzchnia-spania");
    expect(optionParamSlug("Rozmiar")).toBe("rozmiar");
  });
  it("znaki spoza a-z0-9 zamienia na myślnik bez wiodących/końcowych", () => {
    expect(optionParamSlug(" Kolor / Odcień ")).toBe("kolor-odcien");
  });
  it("nazwa z samych symboli daje pusty slug", () => {
    expect(optionParamSlug("***")).toBe("");
  });
});

describe("stałe", () => {
  it("prefiks parametru i wykluczenie tkaniny", () => {
    expect(OPTION_PARAM_PREFIX).toBe("opcja_");
    expect(EXCLUDED_OPTION_SLUGS.has("tkanina")).toBe(true);
  });
});

const v = (
  options: ProductVariants["options"],
  overrides?: ProductVariants["overrides"]
): ProductVariants => ({
  options,
  ...(overrides ? { overrides } : {}),
});

describe("collectOptionFacets", () => {
  it("zbiera tylko opcje filterable=true", () => {
    const rows = [
      { variants: v([{ name: "Rozmiar", values: ["140x200"], filterable: true }]) },
      { variants: v([{ name: "Stelaż", values: ["Drewniany"] }]) },
    ];
    const groups = collectOptionFacets(rows);
    expect(groups.map((g) => g.slug)).toEqual(["rozmiar"]);
  });

  it("scala ROZMIAR i Rozmiar w jedną grupę z unią wartości", () => {
    const rows = [
      { variants: v([{ name: "ROZMIAR", values: ["140x200"], filterable: true }]) },
      { variants: v([{ name: "Rozmiar", values: ["160x200"], filterable: true }]) },
    ];
    const groups = collectOptionFacets(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Rozmiar");
    expect(groups[0].values.map((x) => x.value)).toEqual(["140x200", "160x200"]);
  });

  it("pomija Tkaninę, puste slugi i produkty bez wariantów", () => {
    const rows = [
      { variants: v([{ name: "Tkanina", values: ["Poso 105"], filterable: true }]) },
      { variants: v([{ name: "***", values: ["x"], filterable: true }]) },
      { variants: null },
    ];
    expect(collectOptionFacets(rows)).toEqual([]);
  });

  it("bierze DE nazwy opcji z VARIANT_OPTION_DE (dowolny casing w grupie)", () => {
    const rows = [
      { variants: v([{ name: "Rozmiar", values: ["140x200"], filterable: true }]) },
      { variants: v([{ name: "ROZMIAR", values: ["160x200"], filterable: true }]) },
    ];
    // "Rozmiar" nie ma wpisu w mapie, "ROZMIAR" → "GRÖSSE" (wartość mapy bez transformacji)
    expect(collectOptionFacets(rows)[0].name_de).toBe("GRÖSSE");
  });

  it("etykieta wartości: override admina wygrywa, DE z VARIANT_VALUE_DE", () => {
    const rows = [
      {
        variants: v(
          [{ name: "Stelaż", values: ["DREWNIANY"], filterable: true }],
          { value_labels: { Stelaż: { DREWNIANY: "Drewniany" } } }
        ),
      },
    ];
    const [g] = collectOptionFacets(rows);
    expect(g.values[0]).toEqual({
      value: "DREWNIANY",
      label: "Drewniany",
      label_de: "HOLZ",
    });
  });

  it("sortuje wartości naturalnie (numeric) po etykiecie", () => {
    const rows = [
      {
        variants: v([
          { name: "Rozmiar", values: ["160x200", "90x200", "140x200"], filterable: true },
        ]),
      },
    ];
    expect(collectOptionFacets(rows)[0].values.map((x) => x.value)).toEqual([
      "90x200",
      "140x200",
      "160x200",
    ]);
  });
});

describe("localizeOptionFacets", () => {
  const groups = [
    {
      slug: "rozmiar",
      name: "Rozmiar",
      name_de: "GRÖSSE",
      values: [
        { value: "DREWNIANY", label: "Drewniany", label_de: "HOLZ" },
        { value: "140x200", label: "140x200", label_de: null },
      ],
    },
  ];
  it("PL: name + label", () => {
    const [g] = localizeOptionFacets(groups, "pl");
    expect(g.label).toBe("Rozmiar");
    expect(g.values).toEqual([
      { value: "DREWNIANY", label: "Drewniany" },
      { value: "140x200", label: "140x200" },
    ]);
  });
  it("DE: name_de/label_de z fallbackiem PL", () => {
    const [g] = localizeOptionFacets(groups, "de");
    expect(g.label).toBe("GRÖSSE");
    expect(g.values).toEqual([
      { value: "DREWNIANY", label: "HOLZ" },
      { value: "140x200", label: "140x200" },
    ]);
  });
});

describe("productMatchesOptionFilters", () => {
  const variants = v([
    { name: "ROZMIAR", values: ["140x200", "160x200"] },
    { name: "Stelaż", values: ["Drewniany"] },
  ]);
  it("OR wewnątrz grupy — jedna z wybranych wartości wystarczy", () => {
    expect(
      productMatchesOptionFilters(variants, { rozmiar: ["90x200", "140x200"] })
    ).toBe(true);
  });
  it("AND między grupami — każda grupa musi pasować", () => {
    expect(
      productMatchesOptionFilters(variants, {
        rozmiar: ["140x200"],
        stelaz: ["Metalowy"],
      })
    ).toBe(false);
  });
  it("produkt bez danej opcji odpada", () => {
    expect(productMatchesOptionFilters(variants, { kolor: ["Szary"] })).toBe(false);
    expect(productMatchesOptionFilters(null, { rozmiar: ["140x200"] })).toBe(false);
  });
  it("dopasowuje niezależnie od flagi filterable (facet i tak nie pokaże niewłączonych)", () => {
    // variants wyżej nie mają filterable — mimo to wartości dopasowują
    expect(productMatchesOptionFilters(variants, { rozmiar: ["140x200"] })).toBe(true);
  });
  it("pusty wybór = brak filtra", () => {
    expect(productMatchesOptionFilters(null, {})).toBe(true);
    expect(productMatchesOptionFilters(variants, { rozmiar: [] })).toBe(true);
  });
});

describe("wymiary", () => {
  it("hasActiveDimensionRanges wykrywa dowolną granicę", () => {
    expect(hasActiveDimensionRanges({})).toBe(false);
    expect(hasActiveDimensionRanges({ widthMax: 220 })).toBe(true);
  });
  it("dopasowanie zakresów per wymiar", () => {
    const dims = { width: 200, depth: 90, height: 85 };
    expect(productMatchesDimensions(dims, { widthMin: 180, widthMax: 220 })).toBe(true);
    expect(productMatchesDimensions(dims, { widthMax: 190 })).toBe(false);
    expect(productMatchesDimensions(dims, { depthMin: 100 })).toBe(false);
  });
  it("produkt bez wymiarów odpada przy aktywnym zakresie, przechodzi bez", () => {
    expect(productMatchesDimensions(null, { widthMin: 100 })).toBe(false);
    expect(productMatchesDimensions(null, {})).toBe(true);
  });
  it("collectDimensionBounds liczy min/max, ignoruje braki i zera", () => {
    const rows = [
      { dimensions: { width: 200, depth: 90, height: 85 } },
      { dimensions: { width: 140, depth: 200, height: 40 } },
      { dimensions: null },
    ];
    expect(collectDimensionBounds(rows)).toEqual({
      width: { min: 140, max: 200 },
      depth: { min: 90, max: 200 },
      height: { min: 40, max: 85 },
    });
    expect(collectDimensionBounds([{ dimensions: null }])).toEqual({
      width: null,
      depth: null,
      height: null,
    });
  });
});

describe("parseOptionFilterParams", () => {
  it("wyciąga opcja_* z CSV, ignoruje resztę i złe slugi", () => {
    expect(
      parseOptionFilterParams({
        opcja_rozmiar: "140x200,160x200",
        opcja_stelaz: "Drewniany",
        "opcja_ZŁY SLUG": "x",
        opcja_pusta: "",
        kolor: "Szary",
      })
    ).toEqual({
      rozmiar: ["140x200", "160x200"],
      stelaz: ["Drewniany"],
    });
  });
  it("tablicę parametrów redukuje do pierwszej wartości", () => {
    expect(parseOptionFilterParams({ opcja_rozmiar: ["140x200", "90x200"] })).toEqual({
      rozmiar: ["140x200"],
    });
  });
});
