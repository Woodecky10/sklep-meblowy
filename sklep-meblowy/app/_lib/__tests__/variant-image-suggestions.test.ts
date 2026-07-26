import { describe, it, expect } from "vitest";
import {
  collectVariantImageSuggestions,
  sortGroupsForContext,
  filterGroups,
} from "../variant-image-suggestions";

// Skrót na wiersz produktu w formie surowej (jak z Supabase).
function row(name: string, options: unknown[]) {
  return { name, variants: { options } };
}

describe("collectVariantImageSuggestions", () => {
  it("zbiera zdjęcia wartości opcji i grupuje po nazwie opcji", () => {
    const out = collectVariantImageSuggestions([
      row("ROMA", [
        { name: "Stelaż", values: ["Drewniany"], value_images: { Drewniany: ["a.jpg"] } },
      ]),
      row("VEGAS", [
        { name: "Kolor nóżek", values: ["Czarny"], value_images: { Czarny: ["b.jpg"] } },
      ]),
    ]);
    expect(out).toEqual([
      { key: "kolor nóżek", name: "Kolor nóżek", images: [{ url: "b.jpg", value: "Czarny", productName: "VEGAS" }] },
      { key: "stelaż", name: "Stelaż", images: [{ url: "a.jpg", value: "Drewniany", productName: "ROMA" }] },
    ]);
  });

  it("scala mieszany casing nazwy opcji w jedną grupę", () => {
    const out = collectVariantImageSuggestions([
      row("A", [{ name: "STELAŻ", values: [], value_images: { X: ["1.jpg"] } }]),
      row("B", [{ name: " stelaż ", values: [], value_images: { Y: ["2.jpg"] } }]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Stelaż");
    expect(out[0].images.map((i) => i.url)).toEqual(["1.jpg", "2.jpg"]);
  });

  it("pomija opcję Tkanina w każdym casingu", () => {
    const out = collectVariantImageSuggestions([
      row("A", [
        { name: "Tkanina", values: [], value_images: { "Sawana 21": ["t1.jpg"] } },
        { name: "TKANINA", values: [], value_images: { "Sawana 22": ["t2.jpg"] } },
        { name: " tkanina ", values: [], value_images: { "Sawana 23": ["t3.jpg"] } },
        { name: "Stelaż", values: [], value_images: { Drewniany: ["ok.jpg"] } },
      ]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].images.map((i) => i.url)).toEqual(["ok.jpg"]);
  });

  it("deduplikuje ten sam URL — podpis z pierwszego wystąpienia", () => {
    const out = collectVariantImageSuggestions([
      row("PIERWSZY", [{ name: "Stelaż", values: [], value_images: { Drewniany: ["s.jpg"] } }]),
      row("DRUGI", [{ name: "Stelaż", values: [], value_images: { Metalowy: ["s.jpg"] } }]),
    ]);
    expect(out[0].images).toEqual([
      { url: "s.jpg", value: "Drewniany", productName: "PIERWSZY" },
    ]);
  });

  it("nie tworzy grupy dla opcji bez zdjęć i pustych tablic", () => {
    const out = collectVariantImageSuggestions([
      row("A", [
        { name: "Rozmiar", values: ["140"] },
        { name: "Strona", values: ["Lewa"], value_images: { Lewa: [] } },
      ]),
    ]);
    expect(out).toEqual([]);
  });

  it("znosi śmieciowy JSONB bez wyjątku", () => {
    const out = collectVariantImageSuggestions([
      { name: "A", variants: null },
      { name: "B", variants: "tekst" },
      { name: "C", variants: { options: "nie-tablica" } },
      { name: "D", variants: { options: [null, "tekst", 42] } },
      { name: "E", variants: { options: [{ name: 42, value_images: { X: ["x.jpg"] } }] } },
      { name: "F", variants: { options: [{ name: "  ", value_images: { X: ["y.jpg"] } }] } },
      { name: "G", variants: { options: [{ name: "Stelaż", value_images: "nie-obiekt" }] } },
      { name: "H", variants: { options: [{ name: "Stelaż", value_images: { X: "nie-tablica" } }] } },
      { name: "I", variants: { options: [{ name: "Stelaż", value_images: { X: [42, "", "  ", "ok.jpg"] } }] } },
      { name: 42, variants: { options: [{ name: "Stelaż", value_images: { X: ["bez-nazwy.jpg"] } }] } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].images).toEqual([
      { url: "ok.jpg", value: "X", productName: "I" },
      { url: "bez-nazwy.jpg", value: "X", productName: "" },
    ]);
  });

  it("pusta lista wierszy → pusta lista grup", () => {
    expect(collectVariantImageSuggestions([])).toEqual([]);
  });
});

describe("sortGroupsForContext", () => {
  const groups = [
    { key: "kolor nóżek", name: "Kolor nóżek", images: [] },
    { key: "stelaż", name: "Stelaż", images: [] },
  ];

  it("stawia grupę kontekstu na początku (mimo casingu)", () => {
    expect(sortGroupsForContext(groups, "STELAŻ").map((g) => g.key)).toEqual([
      "stelaż",
      "kolor nóżek",
    ]);
  });

  it("brak kontekstu lub kontekst bez grupy → kolejność bez zmian", () => {
    expect(sortGroupsForContext(groups, null).map((g) => g.key)).toEqual([
      "kolor nóżek",
      "stelaż",
    ]);
    expect(sortGroupsForContext(groups, "Rozmiar").map((g) => g.key)).toEqual([
      "kolor nóżek",
      "stelaż",
    ]);
  });
});

describe("filterGroups", () => {
  const groups = [
    {
      key: "stelaż",
      name: "Stelaż",
      images: [
        { url: "a.jpg", value: "Drewniany", productName: "Łóżko ROMA" },
        { url: "b.jpg", value: "Metalowy", productName: "Sofa VEGAS" },
      ],
    },
  ];

  it("puste zapytanie zwraca wejście", () => {
    expect(filterGroups(groups, "   ")).toEqual(groups);
  });

  it("filtruje po wartości, nazwie produktu i nazwie opcji", () => {
    expect(filterGroups(groups, "metalowy")[0].images.map((i) => i.url)).toEqual(["b.jpg"]);
    expect(filterGroups(groups, "vegas")[0].images.map((i) => i.url)).toEqual(["b.jpg"]);
    expect(filterGroups(groups, "stelaz")[0].images).toHaveLength(2);
  });

  it("znosi brak diakrytyków i dowolną kolejność tokenów", () => {
    expect(filterGroups(groups, "lozko drewniany")[0].images.map((i) => i.url)).toEqual(["a.jpg"]);
    expect(filterGroups(groups, "drewniany lozko")[0].images.map((i) => i.url)).toEqual(["a.jpg"]);
  });

  it("brak trafień → pusta lista grup", () => {
    expect(filterGroups(groups, "czegoś takiego nie ma")).toEqual([]);
  });
});
