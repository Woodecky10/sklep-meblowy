import { describe, it, expect } from "vitest";
import { bundleImageStoragePath } from "@/app/_lib/bundle-image";

const BASE = "https://tlvgsddpiikolgdwuwmc.supabase.co/storage/v1/object/public";

describe("bundleImageStoragePath", () => {
  it("plik zestawu → ścieżka w buckecie", () => {
    expect(bundleImageStoragePath(`${BASE}/products/zestawy/1-abc.jpg`)).toBe("zestawy/1-abc.jpg");
  });

  it("ignoruje query/hash w adresie", () => {
    expect(bundleImageStoragePath(`${BASE}/products/zestawy/1-abc.jpg?v=2`)).toBe("zestawy/1-abc.jpg");
  });

  it("zdjęcie PRODUKTU (ten sam bucket, poza folderem zestawy/) → null, nie kasujemy", () => {
    expect(bundleImageStoragePath(`${BASE}/products/1783270862947-0f2e.jpg`)).toBeNull();
  });

  it("inny bucket, adres zewnętrzny, pusty → null", () => {
    expect(bundleImageStoragePath(`${BASE}/home-tiles/zestawy/a.jpg`)).toBeNull();
    expect(bundleImageStoragePath("https://images.unsplash.com/zestawy/a.jpg")).toBeNull();
    expect(bundleImageStoragePath("")).toBeNull();
    expect(bundleImageStoragePath(null)).toBeNull();
    expect(bundleImageStoragePath(undefined)).toBeNull();
  });

  it("sam folder albo wyjście z folderu („..”) → null", () => {
    expect(bundleImageStoragePath(`${BASE}/products/zestawy/`)).toBeNull();
    expect(bundleImageStoragePath(`${BASE}/products/zestawy/../1-produkt.jpg`)).toBeNull();
  });
});
