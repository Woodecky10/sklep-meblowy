import { describe, it, expect } from "vitest";
import {
  resolveBlFeatures,
  pickFirstImage,
  buildProductSyncPayload,
} from "@/app/_lib/baselinker-sync";

describe("resolveBlFeatures — tolerancja źródła", () => {
  it("czyta text_fields.features gdy obecne", () => {
    expect(
      resolveBlFeatures({ text_fields: { features: { Kolor: "Beż" } } })
    ).toEqual({ Kolor: "Beż" });
  });
  it("fallback do top-level features", () => {
    expect(resolveBlFeatures({ features: { Kolor: "Szary" } })).toEqual({
      Kolor: "Szary",
    });
  });
  it("preferuje text_fields.features nad top-level", () => {
    expect(
      resolveBlFeatures({
        text_fields: { features: { Kolor: "Beż" } },
        features: { Kolor: "Szary" },
      })
    ).toEqual({ Kolor: "Beż" });
  });
  it("brak cech → undefined", () => {
    expect(resolveBlFeatures({})).toBeUndefined();
  });
});

describe("pickFirstImage — sort kluczy numerycznych", () => {
  it("obiekt {2,1,10} → kolejność numeryczna", () => {
    expect(pickFirstImage({ "2": "a.jpg", "1": "b.jpg", "10": "c.jpg" })).toEqual([
      "b.jpg",
      "a.jpg",
      "c.jpg",
    ]);
  });
  it("tablica bez zmian", () => {
    expect(pickFirstImage(["x.jpg", "y.jpg"])).toEqual(["x.jpg", "y.jpg"]);
  });
  it("filtruje puste", () => {
    expect(pickFirstImage(["a.jpg", ""])).toEqual(["a.jpg"]);
  });
});

describe("buildProductSyncPayload — chudy sync zdjęć (seed przy nowym, ręczne potem)", () => {
  it("nowy produkt: payload zawiera images (seed z BL)", () => {
    const payload = buildProductSyncPayload(
      { name: "Sofa", price: 1999, images: ["a.jpg", "b.jpg"] },
      true
    );
    expect(payload).toHaveProperty("images", ["a.jpg", "b.jpg"]);
    expect(payload).toHaveProperty("name", "Sofa");
  });

  it("istniejący produkt: payload NIE zawiera images (preserve ręcznej galerii admina)", () => {
    const payload = buildProductSyncPayload(
      { name: "Sofa", price: 1999, images: ["a.jpg", "b.jpg"] },
      false
    );
    expect(payload).not.toHaveProperty("images");
    // pozostałe „twarde" pola (nazwa, cena) nadal lecą do upsertu
    expect(payload).toHaveProperty("name", "Sofa");
    expect(payload).toHaveProperty("price", 1999);
  });

  it("nie mutuje wejścia przy odpinaniu images", () => {
    const input = { name: "Sofa", price: 1999, images: ["a.jpg"] };
    buildProductSyncPayload(input, false);
    expect(input).toHaveProperty("images", ["a.jpg"]);
  });
});
