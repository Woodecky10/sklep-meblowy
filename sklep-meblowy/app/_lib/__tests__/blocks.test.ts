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
  it("każdy blok systemowy ma default, w kolejności SYSTEM_BLOCK_TYPES i z ciągłym sort_order", () => {
    expect(DEFAULT_HOME_BLOCKS.map((b) => b.block_type)).toEqual([
      ...SYSTEM_BLOCK_TYPES,
    ]);
    expect(DEFAULT_HOME_BLOCKS.map((b) => b.sort_order)).toEqual(
      SYSTEM_BLOCK_TYPES.map((_, i) => i)
    );
  });
  it("defaulty nagłówków = dzisiejszy wygląd (słowniki)", () => {
    const tiles = DEFAULT_HOME_BLOCKS.find((b) => b.block_type === "tiles")!;
    expect(tiles.content.heading).toBe("Znajdź swój styl");
    expect(tiles.content.heading_de).toBe("Finden Sie Ihren Stil");
    expect(tiles.content.subheading).toBe("Kolekcje");
    const hero = DEFAULT_HOME_BLOCKS.find((b) => b.block_type === "hero")!;
    expect(hero.content.heading ?? null).toBeNull();
  });
  it("sekcja opinii jest blokiem systemowym z nagłówkami PL i DE", () => {
    expect(isSystemBlockType("customer_reviews")).toBe(true);
    const reviews = DEFAULT_HOME_BLOCKS.find(
      (b) => b.block_type === "customer_reviews"
    )!;
    expect(reviews.content.heading).toBe("Co mówią klienci");
    expect(reviews.content.heading_de).toBe("Was unsere Kunden sagen");
    expect(reviews.content.subheading).toBe("Opinie klientów");
    expect(reviews.content.subheading_de).toBe("Kundenmeinungen");
  });
  it("wszystkie defaulty systemowe są widoczne, OPRÓCZ customer_reviews (jedyny wyjątek)", () => {
    // Intencja od tego zadania: dopóki `page_blocks` nie ma realnego wiersza
    // dla "customer_reviews", jego default musi startować jako niewidoczny —
    // inaczej sekcja zapaliłaby się sama, a panel nie mógłby jej ukryć/
    // przestawić (syntetyczne id "system:customer_reviews" nie przechodzi
    // przez requireBlockId w actions.ts). Ten test twierdzi tyle samo, co
    // przed zmianą (wszystkie defaulty widoczne) — tylko z jawnym, jednym
    // wyjątkiem, żeby przyszła zmiana defaultu nie przeszła niezauważona.
    const others = DEFAULT_HOME_BLOCKS.filter(
      (b) => b.block_type !== "customer_reviews"
    );
    expect(others.every((b) => b.visible === true)).toBe(true);
    const reviews = DEFAULT_HOME_BLOCKS.find(
      (b) => b.block_type === "customer_reviews"
    )!;
    expect(reviews.visible).toBe(false);
  });
  it("localizeBlock traktuje customer_reviews generycznie (nagłówek + podnagłówek)", () => {
    const r = row({
      block_type: "customer_reviews",
      content: { heading: "Co mówią klienci", heading_de: "Was unsere Kunden sagen" },
    });
    expect(localizeBlock(r, "pl")).toMatchObject({
      type: "customer_reviews",
      heading: "Co mówią klienci",
      subheading: null,
    });
    expect(localizeBlock(r, "de")).toMatchObject({ heading: "Was unsere Kunden sagen" });
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
  it("banner: body sanityzowany, layout center/full akceptowany", () => {
    const r = row({
      block_type: "banner",
      content: { heading: "H", body: "<p>Opis<script>x</script></p>", layout: "center" },
    });
    const b = localizeBlock(r, "pl")!;
    if (b.type === "banner") {
      expect(b.content.body).toBe("<p>Opis</p>");
      expect(b.content.layout).toBe("center");
    }
    const full = localizeBlock(row({ block_type: "banner", content: { heading: "H", layout: "full" } }), "pl")!;
    if (full.type === "banner") expect(full.content.layout).toBe("full");
    const bad = localizeBlock(row({ block_type: "banner", content: { heading: "H", layout: "zle" } }), "pl")!;
    if (bad.type === "banner") expect(bad.content.layout).toBe("left");
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
  it("gallery: caption_align/columns — defaulty i clamp", () => {
    const r = row({ block_type: "gallery", content: { images: [{ url: "https://x/a.jpg" }] } });
    const b = localizeBlock(r, "pl")!;
    if (b.type === "gallery") {
      expect(b.content.caption_align).toBe("center");
      expect(b.content.columns).toBe("masonry");
    }
    const r2 = row({ block_type: "gallery", content: { images: [{ url: "https://x/a.jpg" }], caption_align: "left", columns: "2" } });
    const b2 = localizeBlock(r2, "pl")!;
    if (b2.type === "gallery") {
      expect(b2.content.caption_align).toBe("left");
      expect(b2.content.columns).toBe("2");
    }
    const r3 = row({ block_type: "gallery", content: { images: [{ url: "https://x/a.jpg" }], caption_align: "zle", columns: "9" } });
    const b3 = localizeBlock(r3, "pl")!;
    if (b3.type === "gallery") {
      expect(b3.content.caption_align).toBe("center");
      expect(b3.content.columns).toBe("masonry");
    }
  });
  it("gallery validate: zapisuje caption_align/columns (default przy braku)", () => {
    const ok = validateBlockContent("gallery", { images: [{ url: "https://x/a.jpg" }] });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.content.caption_align).toBe("center");
      expect(ok.content.columns).toBe("masonry");
    }
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
  it("banner validate: body HTML sanityzowany, center OK", () => {
    const ok = validateBlockContent("banner", { heading: "H", body: "<p>a<script>x</script></p>", layout: "center" });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.content.body).toBe("<p>a</p>");
      expect(ok.content.layout).toBe("center");
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

describe("blok text", () => {
  it("jest typem tresciowym z wpisem w rejestrze", () => {
    expect(isContentBlockType("text")).toBe(true);
    expect(CONTENT_BLOCK_DEFS.text.name.length).toBeGreaterThan(0);
    expect(CONTENT_BLOCK_DEFS.text.defaultContent()).toEqual({ body: "" });
  });
  it("localizeBlock: body PL, DE per-locale z fallbackiem", () => {
    const r = row({ block_type: "text", content: { body: "<p>PL</p>", body_de: "<p>DE</p>" } });
    expect(localizeBlock(r, "pl")).toMatchObject({ type: "text", content: { body: "<p>PL</p>" } });
    expect(localizeBlock(r, "de")).toMatchObject({ type: "text", content: { body: "<p>DE</p>" } });
    const noDe = row({ block_type: "text", content: { body: "<p>PL</p>" } });
    expect(localizeBlock(noDe, "de")).toMatchObject({ content: { body: "<p>PL</p>" } });
  });
  it("localizeBlock: sanityzuje HTML z DB (script wyciety)", () => {
    const r = row({ block_type: "text", content: { body: "<p>ok</p><script>x</script>" } });
    const b = localizeBlock(r, "pl")!;
    if (b.type === "text") expect(b.content.body).toBe("<p>ok</p>");
  });
  it("validateBlockContent: wymaga tresci; sanityzuje; puste DE pomijane", () => {
    expect(validateBlockContent("text", { body: "   " }).ok).toBe(false);
    const ok = validateBlockContent("text", { body: "<p>Cze<script>x</script>sc</p>", body_de: "" });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.content.body).toBe("<p>Czesc</p>");
      expect(ok.content.body_de).toBeUndefined();
    }
  });
});
