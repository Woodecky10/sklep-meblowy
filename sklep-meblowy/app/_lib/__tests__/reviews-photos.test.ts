import { describe, it, expect } from "vitest";
import {
  MAX_REVIEW_PHOTOS,
  REVIEW_PHOTO_DIR,
  reviewPhotoPrefix,
  isOwnReviewPhotoUrl,
  validateReviewPhotos,
  parseReviewPhotos,
} from "@/app/_lib/reviews-photos";

const SB = "https://tlvgsddpiikolgdwuwmc.supabase.co";
const OK = (n: string) => `${reviewPhotoPrefix(SB)}${n}`;

describe("reviewPhotoPrefix", () => {
  it("składa ścieżkę publiczną bucketa products i katalogu opinie", () => {
    expect(reviewPhotoPrefix(SB)).toBe(
      `${SB}/storage/v1/object/public/products/${REVIEW_PHOTO_DIR}/`
    );
  });

  it("znosi końcowy ukośnik z adresu Supabase (podwójny // psuje porównanie)", () => {
    expect(reviewPhotoPrefix(`${SB}/`)).toBe(reviewPhotoPrefix(SB));
  });
});

describe("isOwnReviewPhotoUrl — anti-injection", () => {
  it("przepuszcza URL z naszego prefiksu", () => {
    expect(isOwnReviewPhotoUrl(OK("1-a.jpg"), SB)).toBe(true);
  });

  it("odrzuca obcy host", () => {
    expect(
      isOwnReviewPhotoUrl("https://evil.example.com/storage/v1/object/public/products/opinie/x.jpg", SB)
    ).toBe(false);
  });

  it("odrzuca inny bucket", () => {
    expect(
      isOwnReviewPhotoUrl(`${SB}/storage/v1/object/public/inne/opinie/x.jpg`, SB)
    ).toBe(false);
  });

  it("odrzuca prefiks reklamacji — zdjęcie z order-issues nie jest zdjęciem do opinii", () => {
    expect(
      isOwnReviewPhotoUrl(`${SB}/storage/v1/object/public/products/order-issues/x.jpg`, SB)
    ).toBe(false);
  });

  it("odrzuca cokolwiek, co nie jest stringiem", () => {
    expect(isOwnReviewPhotoUrl(null, SB)).toBe(false);
    expect(isOwnReviewPhotoUrl(42, SB)).toBe(false);
  });

  it("odrzuca wszystko, gdy adres Supabase jest pusty (brak zmiennej != otwarta bramka)", () => {
    expect(isOwnReviewPhotoUrl(OK("1-a.jpg"), "")).toBe(false);
  });
});

describe("validateReviewPhotos", () => {
  it("brak pola to brak zdjęć, nie błąd", () => {
    expect(validateReviewPhotos(undefined, SB)).toEqual({ ok: true, value: [] });
  });

  it("pusta lista przechodzi", () => {
    expect(validateReviewPhotos([], SB)).toEqual({ ok: true, value: [] });
  });

  it("przepuszcza dokładnie MAX_REVIEW_PHOTOS zdjęć", () => {
    const lista = Array.from({ length: MAX_REVIEW_PHOTOS }, (_, i) => OK(`${i}.jpg`));
    expect(validateReviewPhotos(lista, SB)).toEqual({ ok: true, value: lista });
  });

  it("odrzuca o jedno za dużo", () => {
    const lista = Array.from({ length: MAX_REVIEW_PHOTOS + 1 }, (_, i) => OK(`${i}.jpg`));
    expect(validateReviewPhotos(lista, SB)).toEqual({ ok: false, error: "count" });
  });

  it("odrzuca listę z jednym obcym URL-em", () => {
    expect(
      validateReviewPhotos([OK("1.jpg"), "https://evil.example.com/x.jpg"], SB)
    ).toEqual({ ok: false, error: "url" });
  });

  it("odrzuca wartość, która nie jest tablicą (zepsuty JSON z formularza)", () => {
    expect(validateReviewPhotos(null, SB)).toEqual({ ok: false, error: "url" });
    expect(validateReviewPhotos("[]", SB)).toEqual({ ok: false, error: "url" });
  });

  it("sprawdza limit PRZED prefiksem — cztery obce URL-e to nadal 'count'", () => {
    const lista = Array.from({ length: MAX_REVIEW_PHOTOS + 1 }, () => "https://evil.example.com/x.jpg");
    expect(validateReviewPhotos(lista, SB)).toEqual({ ok: false, error: "count" });
  });
});

describe("parseReviewPhotos", () => {
  it("brak pola i pusty string dają pustą listę", () => {
    expect(parseReviewPhotos(undefined)).toEqual([]);
    expect(parseReviewPhotos(null)).toEqual([]);
    expect(parseReviewPhotos("")).toEqual([]);
  });

  it("parsuje listę URL-i", () => {
    expect(parseReviewPhotos('["a","b"]')).toEqual(["a", "b"]);
  });

  it("zepsuty JSON zwraca null, a nie pustą listę — walidacja ma to odrzucić, nie przemilczeć", () => {
    expect(parseReviewPhotos("{")).toBeNull();
    expect(validateReviewPhotos(parseReviewPhotos("{"), SB)).toEqual({ ok: false, error: "url" });
  });
});
