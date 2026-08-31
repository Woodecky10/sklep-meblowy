import { describe, it, expect } from "vitest";
import { groupReviewPhotosByProduct } from "@/app/_lib/reviews-gallery";

// Skrót do budowania opinii — testy interesują tylko cztery pola, reszta
// PublicReview jest tu szumem.
function opinia(over: {
  id: string;
  product_id: string;
  product_name?: string | null;
  photos?: string[];
  created_at?: string;
}) {
  return {
    id: over.id,
    product_id: over.product_id,
    // `??` zjadłoby jawny null, czyli dokładnie przypadek skasowanego produktu.
    product_name: "product_name" in over ? over.product_name : "Produkt",
    photos: over.photos ?? [],
    created_at: over.created_at ?? "2026-08-01T00:00:00Z",
  } as never;
}

describe("groupReviewPhotosByProduct", () => {
  it("skleja zdjęcia RÓŻNYCH autorów o tym samym produkcie w jedną sekcję", () => {
    const grupy = groupReviewPhotosByProduct([
      opinia({ id: "r1", product_id: "p1", product_name: "Luna", photos: ["a.jpg", "b.jpg"] }),
      opinia({ id: "r2", product_id: "p1", product_name: "Luna", photos: ["c.jpg"] }),
    ]);
    expect(grupy).toHaveLength(1);
    expect(grupy[0].productId).toBe("p1");
    expect(grupy[0].productName).toBe("Luna");
    expect(grupy[0].photos.map((p) => p.src)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("rozdziela produkty i pomija opinie bez zdjęć", () => {
    const grupy = groupReviewPhotosByProduct([
      opinia({ id: "r1", product_id: "p1", product_name: "Luna", photos: ["a.jpg"] }),
      opinia({ id: "r2", product_id: "p2", product_name: "Bali", photos: [] }),
      opinia({ id: "r3", product_id: "p3", product_name: "Vegas", photos: ["b.jpg"] }),
    ]);
    expect(grupy.map((g) => g.productId)).toEqual(["p1", "p3"]);
  });

  it("pusto, gdy żadna opinia nie ma zdjęć — strona ma wtedy ukryć przełącznik", () => {
    expect(
      groupReviewPhotosByProduct([opinia({ id: "r1", product_id: "p1", photos: [] })])
    ).toEqual([]);
  });

  it("znosi brak pola photos (stary cache sprzed migracji 79)", () => {
    const bezPola = { id: "r1", product_id: "p1", product_name: "Luna" } as never;
    expect(groupReviewPhotosByProduct([bezPola])).toEqual([]);
  });

  it("kolejność grup idzie za wejściem (opinie przychodzą najnowsze pierwsze)", () => {
    const grupy = groupReviewPhotosByProduct([
      opinia({ id: "r1", product_id: "p2", product_name: "Bali", photos: ["b.jpg"] }),
      opinia({ id: "r2", product_id: "p1", product_name: "Luna", photos: ["a.jpg"] }),
    ]);
    expect(grupy.map((g) => g.productName)).toEqual(["Bali", "Luna"]);
  });

  it("ten sam adres w dwóch opiniach pojawia się RAZ — inaczej lightbox dubluje klucz", () => {
    const grupy = groupReviewPhotosByProduct([
      opinia({ id: "r1", product_id: "p1", photos: ["a.jpg"] }),
      opinia({ id: "r2", product_id: "p1", photos: ["a.jpg", "b.jpg"] }),
    ]);
    expect(grupy[0].photos.map((p) => p.src)).toEqual(["a.jpg", "b.jpg"]);
  });

  it("zdjęcie niesie id swojej opinii — do klucza Reacta bez kolizji", () => {
    const grupy = groupReviewPhotosByProduct([
      opinia({ id: "r7", product_id: "p1", photos: ["a.jpg"] }),
    ]);
    expect(grupy[0].photos[0]).toEqual({ src: "a.jpg", reviewId: "r7" });
  });

  it("produkt bez nazwy (skasowany) nadal daje sekcję — zdjęcia nie znikają", () => {
    const grupy = groupReviewPhotosByProduct([
      opinia({ id: "r1", product_id: "p1", product_name: null, photos: ["a.jpg"] }),
    ]);
    expect(grupy).toHaveLength(1);
    expect(grupy[0].productName).toBeNull();
  });
});
