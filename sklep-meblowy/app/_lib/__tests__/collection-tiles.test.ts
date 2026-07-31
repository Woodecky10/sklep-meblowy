import { describe, it, expect } from "vitest";
import {
  buildCollectionTiles,
  countActiveProductsByCollection,
  foldAfterIndex,
  HOME_COLLECTIONS_VISIBLE,
  type CollectionProductRow,
} from "@/app/_lib/collection-tiles";
import type { Collection } from "@/app/_lib/types";

// Fabryka kolekcji — pełny typ, żeby test nie rozjechał się przy dodaniu pola.
function col(over: Partial<Collection> & { id: string; label: string }): Collection {
  return {
    slug: over.label.toLowerCase(),
    label_de: null,
    description: null,
    description_de: null,
    sort_order: 0,
    show_on_home: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  } as Collection;
}

// isActive domyślnie true — większość testów nie testuje aktywności, więc nie
// chcemy jej powtarzać w każdym wywołaniu.
function row(
  collectionId: string | null,
  image?: string | null,
  isActive = true
): CollectionProductRow {
  return {
    collection_id: collectionId,
    images: image === undefined ? ["img.jpg"] : image ? [image] : [],
    is_active: isActive,
  };
}

describe("countActiveProductsByCollection", () => {
  it("liczy wiersze per kolekcja i ignoruje produkty bez kolekcji", () => {
    const counts = countActiveProductsByCollection([row("a"), row("a"), row("b"), row(null)]);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
    expect(counts.size).toBe(2);
  });

  it("produkt bez zdjęcia też się liczy", () => {
    const counts = countActiveProductsByCollection([row("a", null), row("a")]);
    expect(counts.get("a")).toBe(2);
  });

  it("produkt nieaktywny (is_active=false) nie liczy się do licznika", () => {
    const counts = countActiveProductsByCollection([
      row("a", "img1.jpg", false),
      row("a", "img2.jpg"),
    ]);
    expect(counts.get("a")).toBe(1);
  });
});

describe("buildCollectionTiles", () => {
  it("sortuje po sort_order rosnąco", () => {
    const tiles = buildCollectionTiles(
      [col({ id: "b", label: "Bergen", sort_order: 1 }), col({ id: "a", label: "Oslo", sort_order: 0 })],
      [row("a"), row("b")],
      "pl"
    );
    expect(tiles.map((t) => t.collection.id)).toEqual(["a", "b"]);
  });

  it("przy równym sort_order rozstrzyga label", () => {
    const tiles = buildCollectionTiles(
      [col({ id: "z", label: "Zamora", sort_order: 3 }), col({ id: "a", label: "Avila", sort_order: 3 })],
      [row("a"), row("z")],
      "pl"
    );
    expect(tiles.map((t) => t.collection.id)).toEqual(["a", "z"]);
  });

  it("pomija kolekcję z show_on_home=false", () => {
    const tiles = buildCollectionTiles(
      [col({ id: "a", label: "Oslo", show_on_home: false }), col({ id: "b", label: "Bergen" })],
      [row("a"), row("b")],
      "pl"
    );
    expect(tiles.map((t) => t.collection.id)).toEqual(["b"]);
  });

  it("pomija kolekcję bez produktów", () => {
    const tiles = buildCollectionTiles([col({ id: "a", label: "Oslo" })], [], "pl");
    expect(tiles).toEqual([]);
  });

  it("bierze najwyżej 4 zdjęcia, ale licznik pokazuje wszystkie produkty", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row("a", `img${i}.jpg`));
    const [tile] = buildCollectionTiles([col({ id: "a", label: "Oslo" })], rows, "pl");
    expect(tile.thumbnails).toHaveLength(4);
    expect(tile.productCount).toBe(20);
  });

  it("produkt bez zdjęcia nie zajmuje kafelka w mozaice, ale liczy się do licznika", () => {
    const rows = [row("a", null), row("a", "img1.jpg"), row("a", null), row("a", "img2.jpg")];
    const [tile] = buildCollectionTiles([col({ id: "a", label: "Oslo" })], rows, "pl");
    expect(tile.thumbnails).toEqual(["img1.jpg", "img2.jpg"]);
    expect(tile.productCount).toBe(4);
  });

  it("lokalizuje etykietę dla DE z fallbackiem do PL", () => {
    const [tile] = buildCollectionTiles(
      [col({ id: "a", label: "Sofy", label_de: "Sofas" })],
      [row("a")],
      "de"
    );
    expect(tile.collection.label).toBe("Sofas");
  });

  it("deduplikuje powtórzone zdjęcie w mozaice, licznik liczy wszystkie produkty", () => {
    const rows = [
      row("a", "img1.jpg"),
      row("a", "img1.jpg"), // to samo zdjęcie co wyżej (np. ta sama sofa w innym rozmiarze)
      row("a", "img2.jpg"),
      row("a", "img3.jpg"),
    ];
    const [tile] = buildCollectionTiles([col({ id: "a", label: "Oslo" })], rows, "pl");
    expect(tile.thumbnails).toEqual(["img1.jpg", "img2.jpg", "img3.jpg"]);
    expect(tile.productCount).toBe(4);
  });

  it("dedupe nie zabiera miejsca w mozaice — cztery różne zdjęcia mimo powtórzenia na początku", () => {
    const rows = [
      row("a", "img1.jpg"),
      row("a", "img1.jpg"), // duplikat na samym początku — nie może zająć jednego z 4 slotów
      row("a", "img2.jpg"),
      row("a", "img3.jpg"),
      row("a", "img4.jpg"),
    ];
    const [tile] = buildCollectionTiles([col({ id: "a", label: "Oslo" })], rows, "pl");
    expect(tile.thumbnails).toEqual(["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"]);
    expect(tile.productCount).toBe(5);
  });

  it("produkt nieaktywny nie liczy się do licznika ani nie daje miniatury", () => {
    const rows = [row("a", "img1.jpg", false), row("a", "img2.jpg")];
    const [tile] = buildCollectionTiles([col({ id: "a", label: "Oslo" })], rows, "pl");
    expect(tile.thumbnails).toEqual(["img2.jpg"]);
    expect(tile.productCount).toBe(1);
  });
});

describe("foldAfterIndex", () => {
  const counts = new Map<string, number>();
  const many = Array.from({ length: 9 }, (_, i) => {
    counts.set(`c${i}`, 1);
    return col({ id: `c${i}`, label: `K${i}`, sort_order: i });
  });

  it("zwraca indeks szóstej kolekcji, która realnie trafi na home", () => {
    expect(foldAfterIndex(many, counts)).toBe(HOME_COLLECTIONS_VISIBLE - 1);
  });

  it("nie liczy kolekcji ukrytych ani pustych — kreska przesuwa się dalej", () => {
    const mixed = [
      col({ id: "hidden", label: "Ukryta", sort_order: 0, show_on_home: false }),
      col({ id: "empty", label: "Pusta", sort_order: 1 }),
      ...many,
    ];
    const c = new Map(counts);
    c.set("hidden", 5); // ma produkty, ale jest ukryta
    // "empty" celowo bez wpisu w liczniku
    expect(foldAfterIndex(mixed, c)).toBe(HOME_COLLECTIONS_VISIBLE + 1);
  });

  it("zwraca null gdy widocznych kolekcji jest 6 lub mniej", () => {
    const few = many.slice(0, 5);
    expect(foldAfterIndex(few, counts)).toBeNull();
  });

  it("zwraca null przy dokładnie 6 widocznych kolekcjach — nie ma nic pod kreską", () => {
    const exactlySix = many.slice(0, HOME_COLLECTIONS_VISIBLE);
    expect(foldAfterIndex(exactlySix, counts)).toBeNull();
  });

  it("zwraca indeks szóstej kolekcji przy dokładnie 7 widocznych", () => {
    const exactlySeven = many.slice(0, HOME_COLLECTIONS_VISIBLE + 1);
    expect(foldAfterIndex(exactlySeven, counts)).toBe(HOME_COLLECTIONS_VISIBLE - 1);
  });
});
