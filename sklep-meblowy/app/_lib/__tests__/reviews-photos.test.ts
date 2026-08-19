import { describe, it, expect } from "vitest";
import {
  MAX_REVIEW_PHOTOS,
  REVIEW_PHOTO_DIR,
  reviewPhotoPrefix,
  isOwnReviewPhotoUrl,
  odmianaZdjec,
  reviewPhotoPath,
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

  // Sam prefiks nie wystarczy: `..` normalizuje się dopiero przy PARSOWANIU
  // adresu, czyli PO walidacji. Bez sprawdzenia RESZTY adresu poniższe URL-e
  // przechodziły przez bramkę, a przeglądarka i optymalizator obrazów
  // pokazywały plik spoza katalogu `opinie/` — np. cudzą reklamację.
  it("odrzuca wyjście z katalogu przez `..` — zdjęcie z reklamacji w publicznej opinii", () => {
    expect(isOwnReviewPhotoUrl(OK("../order-issues/x.jpg"), SB)).toBe(false);
  });

  it("odrzuca `..` i `/` zakodowane procentowo (%2e%2e, %2f) — omijały wzorzec na surowe znaki", () => {
    expect(isOwnReviewPhotoUrl(OK("%2e%2e%2forder-issues%2fx.jpg"), SB)).toBe(false);
  });

  it("odrzuca zagnieżdżony katalog — nazwy plików generujemy płasko", () => {
    expect(isOwnReviewPhotoUrl(OK("podkatalog/x.jpg"), SB)).toBe(false);
  });

  it("odrzuca sam prefiks bez nazwy pliku (pusta reszta)", () => {
    expect(isOwnReviewPhotoUrl(reviewPhotoPrefix(SB), SB)).toBe(false);
  });

  // `..` samo w sobie mieści się we wzorcu nazwy pliku, a nigdy nie jest
  // poprawną nazwą — i trafiłoby do storage.remove() jako klucz obiektu.
  it("odrzuca resztę złożoną z samych kropek (`.`, `..`)", () => {
    expect(isOwnReviewPhotoUrl(OK(".."), SB)).toBe(false);
    expect(isOwnReviewPhotoUrl(OK("."), SB)).toBe(false);
    expect(isOwnReviewPhotoUrl(OK("..."), SB)).toBe(false);
  });

  it("przepuszcza prawdziwą nazwę z uploadu (`${Date.now()}-${randomUUID()}.jpg`)", () => {
    expect(
      isOwnReviewPhotoUrl(OK("1755600000000-3f1c9a2e-1b2c-4d5e-8f90-abcdef012345.jpg"), SB)
    ).toBe(true);
  });
});

describe("reviewPhotoPath", () => {
  it("zwraca ścieżkę w buckecie dla naszego URL-a", () => {
    expect(reviewPhotoPath(OK("1-a.jpg"), SB)).toBe(`${REVIEW_PHOTO_DIR}/1-a.jpg`);
  });

  it("zwraca null dla obcego hosta", () => {
    expect(
      reviewPhotoPath("https://evil.example.com/storage/v1/object/public/products/opinie/x.jpg", SB)
    ).toBeNull();
  });

  it("zwraca null dla innego bucketa", () => {
    expect(reviewPhotoPath(`${SB}/storage/v1/object/public/inne/opinie/x.jpg`, SB)).toBeNull();
  });

  it("zwraca null dla prefiksu reklamacji — kasowanie opinii nie może ruszyć cudzej reklamacji", () => {
    expect(
      reviewPhotoPath(`${SB}/storage/v1/object/public/products/order-issues/x.jpg`, SB)
    ).toBeNull();
  });

  it("zwraca null dla `..` w nazwie — inaczej kasowanie opinii sięgałoby poza katalog", () => {
    expect(reviewPhotoPath(OK("../order-issues/x.jpg"), SB)).toBeNull();
  });

  it("zwraca null, gdy adres Supabase jest pusty", () => {
    expect(reviewPhotoPath(OK("1-a.jpg"), "")).toBeNull();
  });

  it("zwraca null dla samych kropek — `opinie/..` nigdy nie jest kluczem pliku", () => {
    expect(reviewPhotoPath(OK(".."), SB)).toBeNull();
  });
});

// Liczba zdjęć trafia do zdań pokazywanych klientowi i właścicielce, a limit
// jest stałą, którą wolno podnieść — bez odmiany „Maksymalnie 5 zdjęcia".
describe("odmianaZdjec", () => {
  it("1 → zdjęcie", () => {
    expect(odmianaZdjec(1)).toBe("zdjęcie");
  });

  it("2, 3, 4 → zdjęcia", () => {
    expect(odmianaZdjec(2)).toBe("zdjęcia");
    expect(odmianaZdjec(3)).toBe("zdjęcia");
    expect(odmianaZdjec(4)).toBe("zdjęcia");
  });

  it("5 → zdjęć (tu psuł się stary, zaszyty tekst)", () => {
    expect(odmianaZdjec(5)).toBe("zdjęć");
  });

  it("12 → zdjęć — nastki są wyjątkiem od reguły końcówki 2–4", () => {
    expect(odmianaZdjec(12)).toBe("zdjęć");
  });

  it("22 → zdjęcia (końcówka 2 poza nastkami)", () => {
    expect(odmianaZdjec(22)).toBe("zdjęcia");
  });

  it("25 → zdjęć", () => {
    expect(odmianaZdjec(25)).toBe("zdjęć");
  });

  it("0 → zdjęć", () => {
    expect(odmianaZdjec(0)).toBe("zdjęć");
  });

  it("odmienia poprawnie dla dzisiejszego MAX_REVIEW_PHOTOS", () => {
    expect(`Maksymalnie ${MAX_REVIEW_PHOTOS} ${odmianaZdjec(MAX_REVIEW_PHOTOS)}`).toBe(
      "Maksymalnie 3 zdjęcia"
    );
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

  // Duplikaty dają zduplikowane `key={url}` w trzech rendererach zdjęć
  // (ReviewCard, ReviewList, ReviewPhotoPicker) i ostrzeżenie Reacta.
  it("usuwa duplikaty — ten sam adres trzy razy daje jedno zdjęcie", () => {
    const jeden = OK("1.jpg");
    expect(validateReviewPhotos([jeden, jeden, jeden], SB)).toEqual({
      ok: true,
      value: [jeden],
    });
  });

  it("deduplikacja zachowuje kolejność pierwszych wystąpień", () => {
    const a = OK("a.jpg");
    const b = OK("b.jpg");
    expect(validateReviewPhotos([a, b, a], SB)).toEqual({ ok: true, value: [a, b] });
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
