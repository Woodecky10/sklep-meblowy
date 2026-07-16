import { describe, it, expect } from "vitest";
import {
  SYSTEM_BLOCK_TYPES,
  CONTENT_BLOCK_TYPES,
  isSystemBlockType,
  isContentBlockType,
  CONTENT_BLOCK_DEFS,
  DEFAULT_HOME_BLOCKS,
  mergeHomeBlocks,
  localizeBlock,
  validateBlockContent,
  type PageBlockRow,
} from "@/app/_lib/blocks";

const row = (over: Partial<PageBlockRow>): PageBlockRow => ({
  id: "00000000-0000-0000-0000-000000000001",
  page_id: null,
  block_type: "banner",
  sort_order: 0,
  visible: true,
  content: {},
  ...over,
});

describe("type guards i rejestr", () => {
  it("rozróżnia typy systemowe i treściowe", () => {
    expect(isSystemBlockType("hero")).toBe(true);
    expect(isSystemBlockType("banner")).toBe(false);
    expect(isContentBlockType("banner")).toBe(true);
    expect(isContentBlockType("hero")).toBe(false);
    expect(isContentBlockType("nieznany")).toBe(false);
  });
  it("rejestr treściowy ma wpis dla każdego typu z nazwą, opisem i defaultem", () => {
    for (const t of CONTENT_BLOCK_TYPES) {
      const def = CONTENT_BLOCK_DEFS[t];
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.defaultContent()).toBeTypeOf("object");
    }
  });
  it("defaultContent zwraca świeży obiekt (bez współdzielenia referencji)", () => {
    expect(CONTENT_BLOCK_DEFS.faq.defaultContent()).not.toBe(
      CONTENT_BLOCK_DEFS.faq.defaultContent()
    );
  });
});

describe("DEFAULT_HOME_BLOCKS", () => {
  it("5 bloków systemowych w kolejności hero,tiles,featured,trust_bar,collections", () => {
    expect(DEFAULT_HOME_BLOCKS.map((b) => b.block_type)).toEqual([
      ...SYSTEM_BLOCK_TYPES,
    ]);
    expect(DEFAULT_HOME_BLOCKS.map((b) => b.sort_order)).toEqual([0, 1, 2, 3, 4]);
  });
  it("defaulty nagłówków = dzisiejszy wygląd (słowniki)", () => {
    const tiles = DEFAULT_HOME_BLOCKS.find((b) => b.block_type === "tiles")!;
    expect(tiles.content.heading).toBe("Znajdź swój styl");
    expect(tiles.content.heading_de).toBe("Finden Sie Ihren Stil");
    expect(tiles.content.subheading).toBe("Kolekcje");
    const hero = DEFAULT_HOME_BLOCKS.find((b) => b.block_type === "hero")!;
    expect(hero.content.heading ?? null).toBeNull();
  });
});

describe("mergeHomeBlocks", () => {
  it("null (błąd fetch) → kopia defaultów", () => {
    const out = mergeHomeBlocks(null);
    expect(out.map((b) => b.block_type)).toEqual([...SYSTEM_BLOCK_TYPES]);
    expect(out).not.toBe(DEFAULT_HOME_BLOCKS);
  });
  it("pusta tabela → defaulty (fail-open, wygląd 1:1)", () => {
    expect(mergeHomeBlocks([]).map((b) => b.block_type)).toEqual([
      ...SYSTEM_BLOCK_TYPES,
    ]);
  });
  it("wiersze z DB są prawdą; brakujący blok systemowy uzupełniony defaultem", () => {
    const rows = [
      row({ id: "a", block_type: "hero", sort_order: 3, visible: false }),
      row({ id: "b", block_type: "banner", sort_order: 1 }),
      row({ id: "c", block_type: "tiles", sort_order: 0, content: { heading: "X" } }),
    ];
    const out = mergeHomeBlocks(rows);
    // tiles(0), banner(1), featured(2 default), hero(3, ukryty), trust_bar(3 def), collections(4 def)
    expect(out.find((b) => b.block_type === "tiles")!.content.heading).toBe("X");
    expect(out.find((b) => b.block_type === "hero")!.visible).toBe(false);
    expect(out.some((b) => b.block_type === "featured")).toBe(true);
    expect(out.some((b) => b.block_type === "collections")).toBe(true);
    expect(out.filter((b) => b.block_type === "banner")).toHaveLength(1);
  });
  it("sortuje po sort_order z deterministycznym tie-breakiem po id", () => {
    const rows = [
      row({ id: "b", block_type: "banner", sort_order: 1 }),
      row({ id: "a", block_type: "gallery", sort_order: 1 }),
    ];
    const out = mergeHomeBlocks(rows).filter((b) => isContentBlockType(b.block_type));
    expect(out.map((b) => b.id)).toEqual(["a", "b"]);
  });
  it("ignoruje nieznane block_type (kompatybilność w przód)", () => {
    const out = mergeHomeBlocks([row({ block_type: "wideo" })]);
    expect(out.some((b) => b.block_type === "wideo")).toBe(false);
  });
});

describe("localizeBlock — systemowe", () => {
  it("PL bierze heading/subheading, DE per-pole z fallbackiem PL", () => {
    const r = row({
      block_type: "trust_bar",
      content: { heading: "Dlaczego my?", heading_de: "Warum wir?", subheading: "MEBLE" },
    });
    const plB = localizeBlock(r, "pl")!;
    const deB = localizeBlock(r, "de")!;
    expect(plB).toMatchObject({ type: "trust_bar", heading: "Dlaczego my?", subheading: "MEBLE" });
    expect(deB).toMatchObject({ heading: "Warum wir?", subheading: "MEBLE" });
  });
  it("brak klucza nagłówka = wyczyszczone (null), NIE fallback na słownik", () => {
    const r = row({ block_type: "tiles", content: {} });
    expect(localizeBlock(r, "pl")).toMatchObject({ heading: null, subheading: null });
  });
});

describe("localizeBlock — treściowe", () => {
  it("banner: pola per locale, layout waliduje się do left przy śmieciu", () => {
    const r = row({
      block_type: "banner",
      content: {
        heading: "Salon marzeń", heading_de: "Traumsalon",
        body: "Opis", layout: "zle", image_url: "https://x/y.jpg",
        cta_label: "Zobacz", cta_href: "/sklep",
      },
    });
    const b = localizeBlock(r, "de")!;
    expect(b).toMatchObject({
      type: "banner",
      content: { heading: "Traumsalon", body: "Opis", layout: "left", cta_label: "Zobacz", cta_href: "/sklep" },
    });
  });
  it("banner: niebezpieczny cta_href z DB odpada przy lokalizacji", () => {
    const r = row({
      block_type: "banner",
      content: { heading: "H", cta_label: "X", cta_href: "javascript:alert(1)" },
    });
    const b = localizeBlock(r, "pl")!;
    if (b.type === "banner") expect(b.content.cta_href).toBeNull();
  });
  it("gallery: odfiltrowuje wpisy bez url", () => {
    const r = row({
      block_type: "gallery",
      content: { images: [{ url: "https://x/a.jpg", alt: "A" }, { alt: "bez url" }, "smiec"] },
    });
    const b = localizeBlock(r, "pl")!;
    expect(b.type).toBe("gallery");
    if (b.type === "gallery") expect(b.content.images).toEqual([{ url: "https://x/a.jpg", alt: "A" }]);
  });
  it("products: normalizuje source i limit (clamp 1..12, default 4)", () => {
    const r = row({
      block_type: "products",
      content: { source: "collection", collection_slug: "lisbon", limit: 99 },
    });
    const b = localizeBlock(r, "pl")!;
    if (b.type === "products") {
      expect(b.content).toMatchObject({ source: "collection", collection_slug: "lisbon", limit: 12, product_ids: [] });
    }
    const bad = localizeBlock(row({ block_type: "products", content: { source: "x" } }), "pl")!;
    if (bad.type === "products") expect(bad.content.source).toBe("manual");
  });
  it("faq/reviews: itemy z kompletem pól, DE per pole; puste odpadają", () => {
    const r = row({
      block_type: "faq",
      content: { items: [
        { question: "Q1", question_de: "F1", answer: "A1" },
        { question: "", answer: "bez pytania" },
      ] },
    });
    const b = localizeBlock(r, "de")!;
    if (b.type === "faq") expect(b.content.items).toEqual([{ question: "F1", answer: "A1" }]);
    const rv = localizeBlock(
      row({ block_type: "reviews", content: { items: [{ quote: "Super!", author: "Anna" }] } }),
      "pl"
    )!;
    if (rv.type === "reviews") expect(rv.content.items).toEqual([{ quote: "Super!", author: "Anna" }]);
  });
  it("nieznany typ → null", () => {
    expect(localizeBlock(row({ block_type: "wideo" }), "pl")).toBeNull();
  });
});

describe("validateBlockContent", () => {
  it("banner: wymaga nagłówka; CTA wymaga pary etykieta+link; link tylko / lub https://", () => {
    expect(validateBlockContent("banner", { heading: "  " }).ok).toBe(false);
    expect(
      validateBlockContent("banner", { heading: "H", cta_label: "Zobacz" }).ok
    ).toBe(false);
    expect(
      validateBlockContent("banner", { heading: "H", cta_label: "Zobacz", cta_href: "javascript:x" }).ok
    ).toBe(false);
    const ok = validateBlockContent("banner", {
      heading: " H ", heading_de: "", body: "B", layout: "right",
      cta_label: "Zobacz", cta_href: "/sklep", image_url: "https://x/y.jpg",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.content.heading).toBe("H");        // trim
      expect(ok.content.heading_de).toBeUndefined(); // puste pola nie zaśmiecają jsonb
      expect(ok.content.layout).toBe("right");
    }
  });
  it("banner: zły layout odrzucony", () => {
    expect(validateBlockContent("banner", { heading: "H", layout: "diag" }).ok).toBe(false);
  });
  it("gallery: wymaga ≥1 zdjęcia, max 24, url https:// lub /", () => {
    expect(validateBlockContent("gallery", { images: [] }).ok).toBe(false);
    expect(
      validateBlockContent("gallery", { images: [{ url: "ftp://x" }] }).ok
    ).toBe(false);
    const many = { images: Array.from({ length: 25 }, (_, i) => ({ url: `https://x/${i}.jpg` })) };
    expect(validateBlockContent("gallery", many).ok).toBe(false);
    const ok = validateBlockContent("gallery", {
      heading: "G", images: [{ url: "https://x/a.jpg", alt: " A " }],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect((ok.content.images as { alt?: string }[])[0].alt).toBe("A");
  });
  it("products: manual wymaga ≥1 id (max 12); collection/category wymagają sluga", () => {
    expect(validateBlockContent("products", { source: "manual", product_ids: [] }).ok).toBe(false);
    expect(validateBlockContent("products", { source: "collection" }).ok).toBe(false);
    const ok = validateBlockContent("products", {
      heading: "P", source: "category", category_slug: "sofy", limit: 99,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.content.limit).toBe(12); // clamp
  });
  it("faq/reviews: wymaga ≥1 kompletnego itemu, max 20; puste itemy czyszczone", () => {
    expect(validateBlockContent("faq", { items: [{ question: "Q" }] }).ok).toBe(false);
    const ok = validateBlockContent("faq", {
      items: [{ question: " Q ", answer: "A" }, { question: "", answer: "" }],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.content.items).toEqual([{ question: "Q", answer: "A" }]);
    expect(validateBlockContent("reviews", { items: [] }).ok).toBe(false);
    expect(validateBlockContent("reviews", { items: [{ quote: "Ok!", author: "" }] }).ok).toBe(true);
  });
  it("odrzuca nie-obiekt", () => {
    expect(validateBlockContent("banner", "zupa").ok).toBe(false);
  });
});
