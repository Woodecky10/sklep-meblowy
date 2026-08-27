import { describe, expect, it } from "vitest";
import {
  LIMIT_DANE_MS,
  LIMIT_STORAGE_MS,
  limitDlaUrl,
} from "../supabase/fetch-timeout";

describe("limitDlaUrl", () => {
  const base = "https://tlvgsddpiikolgdwuwmc.supabase.co";

  it("zapytanie do bazy dostaje krótki limit", () => {
    expect(limitDlaUrl(`${base}/rest/v1/products?select=name`)).toBe(LIMIT_DANE_MS);
  });

  it("auth dostaje krótki limit — to on wisi w proxy przy każdym żądaniu", () => {
    expect(limitDlaUrl(`${base}/auth/v1/user`)).toBe(LIMIT_DANE_MS);
  });

  // Upload zdjęcia produktu z panelu to megabajty; przerwanie go po 5 s
  // oznaczałoby utracony plik, więc Storage MUSI mieć osobny, wyższy limit.
  it("Storage dostaje długi limit", () => {
    expect(limitDlaUrl(`${base}/storage/v1/object/products/foto.jpg`)).toBe(
      LIMIT_STORAGE_MS
    );
  });

  it("krótki limit jest wyraźnie krótszy od limitu Storage", () => {
    expect(LIMIT_DANE_MS).toBeLessThan(LIMIT_STORAGE_MS);
  });
});
