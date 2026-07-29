import { describe, it, expect } from "vitest";
import {
  FILTERABLE_FEATURE_KEYS,
  FEATURE_PARAM_PREFIX,
  FEATURE_PARAM_SEPARATOR,
  collectFeatureFacets,
  localizeFeatureFacets,
  productMatchesFeatureFilters,
  parseFeatureFilterParams,
} from "../feature-filter";

const rows = (...features: unknown[]) => features.map((f) => ({ features: f }));

describe("collectFeatureFacets", () => {
  it("grupuje po kanonicznych kluczach w kolejności FILTERABLE_FEATURE_KEYS", () => {
    const out = collectFeatureFacets(
      rows(
        [{ key: "Wysokość nóżek", value: "15 cm" }],
        [{ key: "Powierzchnia spania", value: "160x200" }],
        [{ key: "Pojemnik na pościel", value: "Tak" }]
      )
    );
    expect(out.map((g) => g.name)).toEqual([
      "Powierzchnia spania",
      "Pojemnik na pościel",
      "Wysokość nóżek",
    ]);
    expect(out.map((g) => g.slug)).toEqual([
      "powierzchnia-spania",
      "pojemnik-na-posciel",
      "wysokosc-nozek",
    ]);
  });

  it("dopasowuje klucz case-insensitive po trim, nazwa grupy = kanoniczna", () => {
    const out = collectFeatureFacets(
      rows([{ key: "  POJEMNIK NA POŚCIEL ", value: "Tak" }])
    );
    expect(out).toEqual([
      { slug: "pojemnik-na-posciel", name: "Pojemnik na pościel", values: ["Tak"] },
    ]);
  });

  it("dedupe wartości po trim (pierwsza pisownia wygrywa) + sort numeric pl", () => {
    const out = collectFeatureFacets(
      rows(
        [{ key: "Powierzchnia spania", value: "160x200" }],
        [{ key: "Powierzchnia spania", value: " 160x200 " }],
        [{ key: "Powierzchnia spania", value: "80x200" }],
        [{ key: "Wysokość nóżek", value: "15 cm" }],
        [{ key: "Wysokość nóżek", value: "4,5 cm" }],
        [{ key: "Wysokość nóżek", value: "1 cm" }]
      )
    );
    expect(out[0].values).toEqual(["80x200", "160x200"]);
    expect(out[1].values).toEqual(["1 cm", "4,5 cm", "15 cm"]);
  });

  it("pomija: klucze spoza listy, wartości z separatorem, puste, śmieciowe wejścia", () => {
    const out = collectFeatureFacets(
      rows(
        [{ key: "Materac wbudowany", value: "Tak" }],
        [{ key: "Wysokość nóżek", value: `1${FEATURE_PARAM_SEPARATOR}2 cm` }],
        [{ key: "Wysokość nóżek", value: "   " }],
        [{ key: 7, value: "x" }, { value: "bez klucza" }, "tekst", null],
        "nie-tablica",
        null,
        [{ key: "Wysokość nóżek", value: "15 cm" }]
      )
    );
    expect(out).toEqual([
      { slug: "wysokosc-nozek", name: "Wysokość nóżek", values: ["15 cm"] },
    ]);
  });

  it("dedupe wartości case-insensitive (pierwsza pisownia wygrywa)", () => {
    const out = collectFeatureFacets(
      rows(
        [{ key: "Pojemnik na pościel", value: "Tak" }],
        [{ key: "Pojemnik na pościel", value: "TAK" }]
      )
    );
    expect(out).toEqual([
      { slug: "pojemnik-na-posciel", name: "Pojemnik na pościel", values: ["Tak"] },
    ]);
  });

  it("puste grupy wypadają (brak danych → [])", () => {
    expect(collectFeatureFacets([])).toEqual([]);
  });
});

describe("localizeFeatureFacets", () => {
  const groups = collectFeatureFacets(
    rows(
      [{ key: "Powierzchnia spania", value: "160x200" }],
      [{ key: "Pojemnik na pościel", value: "Tak" }]
    )
  );
  it("pl: label = nazwa/wartość surowa", () => {
    const out = localizeFeatureFacets(groups, "pl");
    expect(out[0]).toEqual({
      slug: "powierzchnia-spania",
      label: "Powierzchnia spania",
      values: [{ value: "160x200", label: "160x200" }],
    });
  });
  it("de: label grupy z FEATURE_KEY_DE, wartość Tak→Ja, wymiary bez zmian", () => {
    const out = localizeFeatureFacets(groups, "de");
    expect(out[0].label).toBe("Liegefläche");
    expect(out[0].values[0]).toEqual({ value: "160x200", label: "160x200" });
    expect(out[1].label).toBe("Bettkasten");
    expect(out[1].values[0]).toEqual({ value: "Tak", label: "Ja" });
  });
});

describe("productMatchesFeatureFilters", () => {
  const features = [
    { key: "Powierzchnia spania", value: "160x200" },
    { key: "pojemnik na pościel", value: " Tak " },
  ];
  it("pusty wybór → pasuje wszystko", () => {
    expect(productMatchesFeatureFilters(features, {})).toBe(true);
    expect(productMatchesFeatureFilters(null, {})).toBe(true);
  });
  it("OR w grupie, klucz case-insensitive, wartości po trim", () => {
    expect(
      productMatchesFeatureFilters(features, {
        "powierzchnia-spania": ["80x200", "160x200"],
        "pojemnik-na-posciel": ["Tak"],
      })
    ).toBe(true);
  });
  it("AND między grupami — jedna niepasująca grupa odrzuca", () => {
    expect(
      productMatchesFeatureFilters(features, {
        "powierzchnia-spania": ["160x200"],
        "wysokosc-nozek": ["15 cm"],
      })
    ).toBe(false);
  });
  it("dopasowanie wartości case-insensitive (Tak ↔ TAK)", () => {
    expect(
      productMatchesFeatureFilters([{ key: "Pojemnik na pościel", value: "TAK" }], {
        "pojemnik-na-posciel": ["Tak"],
      })
    ).toBe(true);
    expect(
      productMatchesFeatureFilters([{ key: "Pojemnik na pościel", value: "Tak" }], {
        "pojemnik-na-posciel": ["TAK"],
      })
    ).toBe(true);
  });
  it("brak parametru / śmieciowe features przy aktywnej grupie → false", () => {
    expect(
      productMatchesFeatureFilters(null, { "wysokosc-nozek": ["15 cm"] })
    ).toBe(false);
    expect(
      productMatchesFeatureFilters("śmieć", { "wysokosc-nozek": ["15 cm"] })
    ).toBe(false);
  });
});

describe("parseFeatureFilterParams", () => {
  it("czyta cecha_<slug>, splituje po separatorze, trim, puste odpadają", () => {
    expect(
      parseFeatureFilterParams({
        [`${FEATURE_PARAM_PREFIX}wysokosc-nozek`]: `1 cm${FEATURE_PARAM_SEPARATOR} 4,5 cm ${FEATURE_PARAM_SEPARATOR}`,
        [`${FEATURE_PARAM_PREFIX}powierzchnia-spania`]: ["80x200", "ignored-second"],
        [`${FEATURE_PARAM_PREFIX}ZłY_slug!`]: "x",
        cecha_pusty: "  ",
        inne: "y",
      })
    ).toEqual({
      "wysokosc-nozek": ["1 cm", "4,5 cm"],
      "powierzchnia-spania": ["80x200"],
    });
  });
});
