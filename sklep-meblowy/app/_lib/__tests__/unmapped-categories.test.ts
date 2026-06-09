import { describe, it, expect } from "vitest";
import { aggregateUnmappedCategories } from "@/app/_lib/baselinker-sync";

describe("aggregateUnmappedCategories", () => {
  it("dedup po bl_category_id, count, pierwsza nazwa jako sample", () => {
    const r = aggregateUnmappedCategories([
      { bl_category_id: 10, product_name: "Sofa A" },
      { bl_category_id: 10, product_name: "Sofa B" },
      { bl_category_id: 22, product_name: "Łóżko C" },
    ]);
    expect(r).toEqual([
      { bl_category_id: 10, sample_product_name: "Sofa A", count: 2 },
      { bl_category_id: 22, sample_product_name: "Łóżko C", count: 1 },
    ]);
  });
  it("pusta lista → []", () => {
    expect(aggregateUnmappedCategories([])).toEqual([]);
  });
});
