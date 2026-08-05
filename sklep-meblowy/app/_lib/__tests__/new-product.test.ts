import { describe, it, expect } from "vitest";
import {
  buildNewProductPayload,
  buildDuplicatePayload,
  type DuplicateSource,
} from "@/app/_lib/new-product";
import { DEFAULT_DELIVERY_TIME, DEFAULT_WARRANTY } from "@/app/_lib/spec-format";
import { DELIVERY_TIME_DE, WARRANTY_DE } from "@/app/_lib/de-content-maps";

const valid = { name: "Sofa Mollien", price: "1999.99", category: "sofy" };

describe("buildNewProductPayload", () => {
  it("happy path: payload z domyślnymi (needs_translation=true, stock=0, is_active=true)", () => {
    const r = buildNewProductPayload(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.name).toBe("Sofa Mollien");
      expect(r.payload.price).toBe(1999.99);
      expect(r.payload.category).toBe("sofy");
      expect(r.payload.needs_translation).toBe(true);
      expect(r.payload.stock).toBe(0);
      expect(r.payload.is_active).toBe(true);
      expect(r.payload.images).toEqual([]);
      expect(r.payload.variants).toBeNull();
      expect(r.payload.description).toBe("");
    }
  });

  it("normalizuje przecinek w cenie", () => {
    const r = buildNewProductPayload({ ...valid, price: "1999,50" });
    expect(r.ok && r.payload.price).toBe(1999.5);
  });

  it("przycina nazwę i odrzuca pustą/whitespace", () => {
    expect(buildNewProductPayload({ ...valid, name: "   " }).ok).toBe(false);
    const r = buildNewProductPayload({ ...valid, name: "  Fotel  " });
    expect(r.ok && r.payload.name).toBe("Fotel");
  });

  it("odrzuca cenę ujemną, NaN, pustą", () => {
    expect(buildNewProductPayload({ ...valid, price: "-5" }).ok).toBe(false);
    expect(buildNewProductPayload({ ...valid, price: "abc" }).ok).toBe(false);
    expect(buildNewProductPayload({ ...valid, price: "" }).ok).toBe(false);
  });

  it("odrzuca brak kategorii", () => {
    expect(buildNewProductPayload({ ...valid, category: "" }).ok).toBe(false);
    expect(buildNewProductPayload({ ...valid, category: "   " }).ok).toBe(false);
  });

  it("odrzuca nazwę dłuższą niż 300 znaków", () => {
    expect(buildNewProductPayload({ ...valid, name: "x".repeat(301) }).ok).toBe(false);
  });

  it("naroznik-l → variants ma opcje Strona", () => {
    const r = buildNewProductPayload({ name: "N", price: 1000, category: "naroznik-l" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.variants?.options.map((o) => o.name)).toEqual(["Strona"]);
    }
  });

  it("inne kategorie narożników (narozniki, naroznik-u) → variants null (opt-in przez toggle)", () => {
    for (const category of ["narozniki", "naroznik-u", "sofy"]) {
      const r = buildNewProductPayload({ ...valid, category });
      expect(r.ok && r.payload.variants).toBeNull();
    }
  });

  it("nowy produkt dostaje domyślny czas dostawy i gwarancję", () => {
    const r = buildNewProductPayload(valid);
    expect(r.ok && r.payload.delivery_time).toBe("21 dni roboczych");
    expect(r.ok && r.payload.warranty).toBe("2 lata");
  });

  it("domyślne wartości mają tłumaczenia DE (spójność z mapami)", () => {
    expect(DELIVERY_TIME_DE[DEFAULT_DELIVERY_TIME]).toBeTruthy();
    expect(WARRANTY_DE[DEFAULT_WARRANTY]).toBeTruthy();
  });
});

// Pełne źródło (jak wiersz z DB) — wszystkie pola niepuste, żeby test wykrył
// zgubienie któregokolwiek przy kopiowaniu.
const dupSource: DuplicateSource = {
  name: "Łóżko Alice 140x200",
  description: "<p>Opis</p>",
  price: 1299.0,
  sale_price: 999.0,
  category: "lozka-tapicerowane",
  images: ["https://x/1.jpg", "https://x/2.jpg"],
  stock: 5,
  color: "beżowy",
  material: "welur",
  dimensions: { width: 140, depth: 200, height: 100 },
  weight: 60,
  construction: "stelaż drewniany",
  delivery_time: "21 dni roboczych",
  warranty: "2 lata",
  collection_id: "col-1",
  features: [{ key: "Nóżki", value: "złote" }],
  description_sections: [{ kind: "text", title: "Sekcja", body: "treść" }],
  variants: { options: [{ name: "Tkanina", values: ["Sawana 21"] }] },
  name_de: "Bett Alice 140x200",
  description_de: "<p>Beschreibung</p>",
  description_sections_de: [{ kind: "text", title: "Abschnitt", body: "text" }],
  color_de: "beige",
  material_de: "Velours",
  needs_translation: false,
  translated_at: "2026-07-01T00:00:00.000Z",
  // pola resetowane — kopia NIE może ich odziedziczyć tak jak są:
  size_group: "alice-ab12",
  size_label: "140×200 cm",
  omnibus_price: 950.0,
};

describe("buildDuplicatePayload", () => {
  it("dodaje sufiks (kopia) do nazwy", () => {
    expect(buildDuplicatePayload(dupSource).name).toBe("Łóżko Alice 140x200 (kopia)");
  });

  it("kopiuje pola treści 1:1", () => {
    const p = buildDuplicatePayload(dupSource);
    expect(p.description).toBe(dupSource.description);
    expect(p.price).toBe(dupSource.price);
    expect(p.category).toBe(dupSource.category);
    expect(p.stock).toBe(dupSource.stock);
    expect(p.color).toBe(dupSource.color);
    expect(p.material).toBe(dupSource.material);
    expect(p.dimensions).toEqual(dupSource.dimensions);
    expect(p.weight).toBe(dupSource.weight);
    expect(p.construction).toBe(dupSource.construction);
    expect(p.delivery_time).toBe(dupSource.delivery_time);
    expect(p.warranty).toBe(dupSource.warranty);
    expect(p.collection_id).toBe(dupSource.collection_id);
    expect(p.features).toEqual(dupSource.features);
    expect(p.description_sections).toEqual(dupSource.description_sections);
    expect(p.variants).toEqual(dupSource.variants);
  });

  it("współdzieli te same URL-e zdjęć (kopiuje tablicę images)", () => {
    expect(buildDuplicatePayload(dupSource).images).toEqual(dupSource.images);
  });

  it("kopiuje wszystkie pola DE + needs_translation + translated_at", () => {
    const p = buildDuplicatePayload(dupSource);
    expect(p.name_de).toBe(dupSource.name_de);
    expect(p.description_de).toBe(dupSource.description_de);
    expect(p.description_sections_de).toEqual(dupSource.description_sections_de);
    expect(p.color_de).toBe(dupSource.color_de);
    expect(p.material_de).toBe(dupSource.material_de);
    expect(p.needs_translation).toBe(false);
    expect(p.translated_at).toBe(dupSource.translated_at);
  });

  it("NIE dziedziczy promocji ani omnibusa — kopia bez historii cen nie może ogłaszać obniżki", () => {
    const p = buildDuplicatePayload(dupSource);
    // Wcześniej sale_price było kopiowane przy wyzerowanym omnibus_price →
    // kopia pokazywała obniżkę bez wymaganej najniższej ceny z 30 dni.
    expect(p.sale_price).toBeNull();
    expect(p.sale_price_planned).toBeNull();
    expect(p.sale_from).toBeNull();
    expect(p.sale_to).toBeNull();
    expect(p.promo_badge).toBeNull();
    expect(p.omnibus_price).toBeNull();
  });

  it("tworzy się jako ukryty szkic (is_active=false, deactivation_source=manual)", () => {
    const p = buildDuplicatePayload(dupSource);
    expect(p.is_active).toBe(false);
    expect(p.deactivation_source).toBe("manual");
  });

  it("czyści size_group i size_label (grupa przez linkowanie, rozmiar to nowy)", () => {
    const p = buildDuplicatePayload(dupSource);
    expect(p.size_group).toBeNull();
    expect(p.size_label).toBeNull();
  });

  it("nie ustawia id ani created_at (zostawia defaulty DB)", () => {
    const p = buildDuplicatePayload(dupSource) as Record<string, unknown>;
    expect("id" in p).toBe(false);
    expect("created_at" in p).toBe(false);
  });
});
