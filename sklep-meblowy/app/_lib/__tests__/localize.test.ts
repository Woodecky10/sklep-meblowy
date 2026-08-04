import { describe, it, expect } from "vitest";
import {
  localizeProduct,
  localizeCategory,
  localizeCollection,
  localizeReview,
  buildLocalizedFacets,
} from "@/app/_lib/localize";
import type { ProductDescriptionSection } from "@/app/_lib/types";

const sectionsPl: ProductDescriptionSection[] = [
  { kind: "text", title: "Materiał", body: "<b>Miękki</b>" },
];
const sectionsDe: ProductDescriptionSection[] = [
  { kind: "text", title: "Material", body: "<b>Weich</b>" },
];

function baseProduct() {
  return {
    id: "p1",
    name: "Sofa",
    description: "<p>Wygodna</p>",
    color: "beż",
    material: "welur",
    description_sections: sectionsPl,
    name_de: "Couch",
    description_de: "<p>Bequem</p>",
    color_de: "beige",
    material_de: "Velours",
    description_sections_de: sectionsDe,
    price: 100,
  };
}

describe("localizeProduct", () => {
  it("DE z pełnym tłumaczeniem → zamienia pola na _de", () => {
    const out = localizeProduct(baseProduct(), "de");
    expect(out.name).toBe("Couch");
    expect(out.description).toBe("<p>Bequem</p>");
    expect(out.color).toBe("beige");
    expect(out.material).toBe("Velours");
    expect(out.description_sections).toEqual(sectionsDe);
    // pola źródłowe _de zostają (nie są usuwane)
    expect(out.price).toBe(100);
  });

  it("DE bez tłumaczenia → fallback do PL", () => {
    const row = {
      ...baseProduct(),
      name_de: null,
      description_de: "",
      color_de: null,
      material_de: "",
      description_sections_de: null,
    };
    const out = localizeProduct(row, "de");
    expect(out.name).toBe("Sofa");
    expect(out.description).toBe("<p>Wygodna</p>");
    expect(out.color).toBe("beż");
    expect(out.material).toBe("welur");
    expect(out.description_sections).toEqual(sectionsPl);
  });

  it("DE: pusta tablica sekcji _de → fallback do PL sekcji", () => {
    const row = { ...baseProduct(), description_sections_de: [] };
    const out = localizeProduct(row, "de");
    expect(out.description_sections).toEqual(sectionsPl);
  });

  it("DE: PRESERVE null dla color/material gdy PL = null i _de puste", () => {
    const row = {
      ...baseProduct(),
      color: null,
      material: null,
      color_de: null,
      material_de: null,
    };
    const out = localizeProduct(row, "de");
    expect(out.color).toBeNull();
    expect(out.material).toBeNull();
  });

  it("PL → passthrough bez zmian", () => {
    const row = baseProduct();
    const out = localizeProduct(row, "pl");
    expect(out.name).toBe("Sofa");
    expect(out.description).toBe("<p>Wygodna</p>");
    expect(out.color).toBe("beż");
    expect(out.material).toBe("welur");
    expect(out.description_sections).toEqual(sectionsPl);
  });
});

describe("localizeProduct — pola wolnotekstowe + cechy z importu (mapy DE)", () => {
  const withExtras = () => ({
    ...baseProduct(),
    construction: "Lite drewno dębowe, niska bryła, bez zagłówka",
    delivery_time: "14 dni roboczych",
    warranty: "2 lata",
    features: [
      { key: "Kolekcja", value: "SISI" },
      { key: "System Boxspring", value: "Tak" },
      { key: "Powierzchnia spania", value: "180x200" },
    ],
  });

  it("DE: tłumaczy construction/delivery_time/warranty znanymi mapami", () => {
    const out = localizeProduct(withExtras(), "de");
    expect(out.construction).toBe("Massives Eichenholz, niedrige Form, ohne Kopfteil");
    expect(out.delivery_time).toBe("14 Werktage");
    expect(out.warranty).toBe("2 Jahre");
  });

  it("DE: tłumaczy klucze cech; nieznane wartości (kody/wymiary) bez zmian", () => {
    const out = localizeProduct(withExtras(), "de");
    expect(out.features).toEqual([
      { key: "Kollektion", value: "SISI" },
      { key: "Boxspring-System", value: "Ja" },
      { key: "Liegefläche", value: "180x200" },
    ]);
  });

  it("DE: nieznana wartość wolnotekstowa przechodzi bez zmian", () => {
    const out = localizeProduct({ ...baseProduct(), warranty: "dożywotnia" }, "de");
    expect(out.warranty).toBe("dożywotnia");
  });

  it("PL: pola wolnotekstowe/cechy bez zmian", () => {
    const out = localizeProduct(withExtras(), "pl");
    expect(out.construction).toBe("Lite drewno dębowe, niska bryła, bez zagłówka");
    expect(out.warranty).toBe("2 lata");
    expect(out.features?.[0]).toEqual({ key: "Kolekcja", value: "SISI" });
  });
});

describe("localizeCategory", () => {
  it("DE z label_de → zamienia label", () => {
    expect(localizeCategory({ slug: "sofy", label: "Sofy", label_de: "Sofas" }, "de").label).toBe(
      "Sofas"
    );
  });

  it("DE bez label_de → fallback PL", () => {
    expect(localizeCategory({ slug: "sofy", label: "Sofy", label_de: null }, "de").label).toBe(
      "Sofy"
    );
    expect(localizeCategory({ slug: "sofy", label: "Sofy", label_de: "" }, "de").label).toBe(
      "Sofy"
    );
  });

  it("PL → passthrough", () => {
    expect(localizeCategory({ slug: "sofy", label: "Sofy", label_de: "Sofas" }, "pl").label).toBe(
      "Sofy"
    );
  });
});

describe("localizeCollection", () => {
  const base = () => ({
    slug: "lisbon",
    label: "Kolekcja Lisbon",
    description: "Polski opis kolekcji",
    label_de: "Kollektion Lisbon",
    description_de: "Deutsche Beschreibung",
  });

  it("DE z label_de i description_de → zamienia oba pola", () => {
    const out = localizeCollection(base(), "de");
    expect(out.label).toBe("Kollektion Lisbon");
    expect(out.description).toBe("Deutsche Beschreibung");
    // slug (pole pomocnicze) zostaje
    expect(out.slug).toBe("lisbon");
  });

  it("DE bez _de → fallback PL (label) i description PL", () => {
    const out = localizeCollection(
      { ...base(), label_de: null, description_de: "" },
      "de"
    );
    expect(out.label).toBe("Kolekcja Lisbon");
    expect(out.description).toBe("Polski opis kolekcji");
  });

  it("DE: description PL = null + brak _de → zostaje null", () => {
    const out = localizeCollection(
      { ...base(), description: null, description_de: null },
      "de"
    );
    expect(out.description).toBeNull();
  });

  it("PL → passthrough bez zmian", () => {
    const out = localizeCollection(base(), "pl");
    expect(out.label).toBe("Kolekcja Lisbon");
    expect(out.description).toBe("Polski opis kolekcji");
  });
});

describe("buildLocalizedFacets", () => {
  it("PL: value === label, dedupe po PL, sort po label", () => {
    const out = buildLocalizedFacets(
      [
        { value: "welur", value_de: "Velours" },
        { value: "beż", value_de: "beige" },
        { value: "welur", value_de: "Velours" }, // duplikat → jeden wpis
      ],
      "pl"
    );
    expect(out).toEqual([
      { value: "beż", label: "beż" },
      { value: "welur", label: "welur" },
    ]);
  });

  it("DE: value = PL kanoniczne, label = DE; sort po niemieckim labelu", () => {
    const out = buildLocalizedFacets(
      [
        { value: "welur", value_de: "Velours" },
        { value: "beż", value_de: "Beige" },
      ],
      "de"
    );
    // value zostaje PL (filtr DB), label niemiecki
    expect(out).toContainEqual({ value: "welur", label: "Velours" });
    expect(out).toContainEqual({ value: "beż", label: "Beige" });
    // posortowane po labelu: Beige < Velours
    expect(out.map((f) => f.label)).toEqual(["Beige", "Velours"]);
  });

  it("DE bez tłumaczenia → label = PL value (fallback)", () => {
    const out = buildLocalizedFacets(
      [
        { value: "dąb", value_de: null },
        { value: "orzech", value_de: "" },
      ],
      "de"
    );
    expect(out).toContainEqual({ value: "dąb", label: "dąb" });
    expect(out).toContainEqual({ value: "orzech", label: "orzech" });
  });

  it("DE: przetłumaczony wiersz wygrywa label nad nieprzetłumaczonym przy tym samym PL value", () => {
    const out = buildLocalizedFacets(
      [
        { value: "beż", value_de: null }, // najpierw bez tłumaczenia
        { value: "beż", value_de: "Beige" }, // potem z tłumaczeniem
      ],
      "de"
    );
    expect(out).toEqual([{ value: "beż", label: "Beige" }]);
  });

  it("pomija puste/whitespace wartości i trimuje", () => {
    const out = buildLocalizedFacets(
      [
        { value: null, value_de: "X" },
        { value: "   ", value_de: "Y" },
        { value: "  szary  ", value_de: "  Grau  " },
      ],
      "de"
    );
    expect(out).toEqual([{ value: "szary", label: "Grau" }]);
  });
});

describe("localizeReview", () => {
  it("DE z comment_de → zamienia comment", () => {
    expect(
      localizeReview({ id: "r1", comment: "Świetna", comment_de: "Toll" }, "de").comment
    ).toBe("Toll");
  });
  it("DE bez comment_de → fallback PL", () => {
    expect(
      localizeReview({ id: "r1", comment: "Świetna", comment_de: null }, "de").comment
    ).toBe("Świetna");
  });
  it("DE: comment PL null zostaje null", () => {
    expect(
      localizeReview({ id: "r1", comment: null, comment_de: null }, "de").comment
    ).toBeNull();
  });
  it("PL → passthrough", () => {
    expect(
      localizeReview({ id: "r1", comment: "Świetna", comment_de: "Toll" }, "pl").comment
    ).toBe("Świetna");
  });
});
