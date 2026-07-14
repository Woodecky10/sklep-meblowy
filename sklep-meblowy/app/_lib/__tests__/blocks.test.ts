import { describe, it, expect } from "vitest";
import {
  SYSTEM_BLOCK_TYPES,
  CONTENT_BLOCK_TYPES,
  isSystemBlockType,
  isContentBlockType,
  CONTENT_BLOCK_DEFS,
  DEFAULT_HOME_BLOCKS,
  mergeHomeBlocks,
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
