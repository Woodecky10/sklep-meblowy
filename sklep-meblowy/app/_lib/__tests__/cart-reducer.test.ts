import { describe, it, expect } from "vitest";
import { cartReducer, type CartState } from "@/app/_context/CartContext";
import type { CartItem } from "@/app/_context/CartContext";

const empty: CartState = { items: [], appliedPromo: null, hydrated: true };

const bundleMeta = {
  id: "b1",
  name: "Zestaw Loft",
  unitKey: "b1##p1::Tkanina=Sawana 21||p2::Tkanina=Sawana 21",
  discountType: "percent" as const,
  discountValue: 10,
};

function bundleItems(qty = 1): CartItem[] {
  return [
    { id: "p1", name: "Fotel", price: 3000, image: "", quantity: qty, variantValues: { Tkanina: "Sawana 21" }, bundle: bundleMeta },
    { id: "p2", name: "Narożnik", price: 2200, image: "", quantity: qty, variantValues: { Tkanina: "Sawana 21" }, bundle: bundleMeta },
  ];
}

describe("cartReducer — zestawy", () => {
  it("ADD_BUNDLE dodaje wszystkie składniki atomowo", () => {
    const s = cartReducer(empty, { type: "ADD_BUNDLE", items: bundleItems() });
    expect(s.items).toHaveLength(2);
    expect(s.items.every((i) => i.bundle?.unitKey === bundleMeta.unitKey)).toBe(true);
  });

  it("ADD_BUNDLE z tym samym unitKey zwiększa ilości całej grupy", () => {
    let s = cartReducer(empty, { type: "ADD_BUNDLE", items: bundleItems() });
    s = cartReducer(s, { type: "ADD_BUNDLE", items: bundleItems() });
    expect(s.items).toHaveLength(2);
    expect(s.items.every((i) => i.quantity === 2)).toBe(true);
  });

  it("ten sam produkt solo i w zestawie to OSOBNE pozycje", () => {
    let s = cartReducer(empty, { type: "ADD_BUNDLE", items: bundleItems() });
    s = cartReducer(s, {
      type: "ADD",
      item: { id: "p1", name: "Fotel", price: 3000, image: "", quantity: 1, variantValues: { Tkanina: "Sawana 21" } },
    });
    expect(s.items).toHaveLength(3);
    const solo = s.items.filter((i) => i.id === "p1" && !i.bundle);
    expect(solo).toHaveLength(1);
    expect(solo[0].quantity).toBe(1);
  });

  it("REMOVE solo NIE usuwa pozycji zestawowej o tym samym id+wariancie", () => {
    let s = cartReducer(empty, { type: "ADD_BUNDLE", items: bundleItems() });
    s = cartReducer(s, {
      type: "ADD",
      item: { id: "p1", name: "Fotel", price: 3000, image: "", quantity: 1, variantValues: { Tkanina: "Sawana 21" } },
    });
    s = cartReducer(s, { type: "REMOVE", id: "p1", variantValues: { Tkanina: "Sawana 21" } });
    expect(s.items).toHaveLength(2);
    expect(s.items.every((i) => i.bundle)).toBe(true);
  });

  it("REMOVE_BUNDLE usuwa całą grupę i nic poza nią", () => {
    let s = cartReducer(empty, { type: "ADD_BUNDLE", items: bundleItems() });
    s = cartReducer(s, {
      type: "ADD",
      item: { id: "solo", name: "Puf", price: 400, image: "", quantity: 1 },
    });
    s = cartReducer(s, { type: "REMOVE_BUNDLE", unitKey: bundleMeta.unitKey });
    expect(s.items).toHaveLength(1);
    expect(s.items[0].id).toBe("solo");
  });

  it("UPDATE_BUNDLE_QTY synchronizuje ilości wszystkich składników (clamp 1..99)", () => {
    let s = cartReducer(empty, { type: "ADD_BUNDLE", items: bundleItems() });
    s = cartReducer(s, { type: "UPDATE_BUNDLE_QTY", unitKey: bundleMeta.unitKey, quantity: 3 });
    expect(s.items.every((i) => i.quantity === 3)).toBe(true);
    s = cartReducer(s, { type: "UPDATE_BUNDLE_QTY", unitKey: bundleMeta.unitKey, quantity: 500 });
    expect(s.items.every((i) => i.quantity === 99)).toBe(true);
  });

  it("UPDATE_NOTES z bundleUnitKey trafia w składnik zestawu, bez — w solo", () => {
    let s = cartReducer(empty, { type: "ADD_BUNDLE", items: bundleItems() });
    s = cartReducer(s, {
      type: "ADD",
      item: { id: "p1", name: "Fotel", price: 3000, image: "", quantity: 1, variantValues: { Tkanina: "Sawana 21" } },
    });
    s = cartReducer(s, {
      type: "UPDATE_NOTES",
      id: "p1",
      variantValues: { Tkanina: "Sawana 21" },
      notes: "solo-nota",
    });
    s = cartReducer(s, {
      type: "UPDATE_NOTES",
      id: "p1",
      variantValues: { Tkanina: "Sawana 21" },
      notes: "bundle-nota",
      bundleUnitKey: bundleMeta.unitKey,
    });
    expect(s.items.find((i) => i.id === "p1" && !i.bundle)?.notes).toBe("solo-nota");
    expect(s.items.find((i) => i.id === "p1" && i.bundle)?.notes).toBe("bundle-nota");
  });

  it("UPDATE_BUNDLE_TERMS aktualizuje warunki wszystkich pozycji zestawu, nie rusza innych", () => {
    // Zestaw b1 (2 pozycje) + inny zestaw b2 + pozycja solo.
    const b2Meta = {
      id: "b2",
      name: "Zestaw Skandi",
      unitKey: "b2##p3::||p4::",
      discountType: "percent" as const,
      discountValue: 5,
    };
    let s = cartReducer(empty, { type: "ADD_BUNDLE", items: bundleItems() });
    s = cartReducer(s, {
      type: "ADD_BUNDLE",
      items: [
        { id: "p3", name: "Stół", price: 1000, image: "", quantity: 1, bundle: b2Meta },
        { id: "p4", name: "Krzesło", price: 500, image: "", quantity: 1, bundle: b2Meta },
      ],
    });
    s = cartReducer(s, {
      type: "ADD",
      item: { id: "solo", name: "Puf", price: 400, image: "", quantity: 1 },
    });

    s = cartReducer(s, {
      type: "UPDATE_BUNDLE_TERMS",
      bundleId: "b1",
      discountType: "amount",
      discountValue: 500,
    });

    // Wszystkie pozycje b1 mają nowe warunki.
    const b1Items = s.items.filter((i) => i.bundle?.id === "b1");
    expect(b1Items).toHaveLength(2);
    expect(b1Items.every((i) => i.bundle?.discountType === "amount")).toBe(true);
    expect(b1Items.every((i) => i.bundle?.discountValue === 500)).toBe(true);

    // Inny zestaw b2 bez zmian.
    const b2Items = s.items.filter((i) => i.bundle?.id === "b2");
    expect(b2Items.every((i) => i.bundle?.discountType === "percent")).toBe(true);
    expect(b2Items.every((i) => i.bundle?.discountValue === 5)).toBe(true);

    // Pozycja solo bez zmian (brak bundle).
    const solo = s.items.find((i) => i.id === "solo");
    expect(solo?.bundle).toBeUndefined();
  });

  it("HYDRATE ze starymi wpisami bez bundle działa bez migracji", () => {
    const s = cartReducer(empty, {
      type: "HYDRATE",
      items: [{ id: "old", name: "Stary", price: 100, image: "", quantity: 1 }],
      appliedPromo: null,
    });
    expect(s.items).toHaveLength(1);
    expect(s.hydrated).toBe(true);
  });
});
