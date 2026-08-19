import { describe, it, expect } from "vitest";
import {
  ORDER_ISSUE_CATEGORIES,
  orderIssueCategoryLabel,
  orderItemLabel,
  validateOrderIssueInput,
  isOwnIssuePhotoUrl,
} from "../order-issues";

describe("orderIssueCategoryLabel", () => {
  it("zwraca etykietę PL/DE dla znanej kategorii", () => {
    expect(orderIssueCategoryLabel("damage", "pl")).toBe("Uszkodzenie / wada");
    expect(orderIssueCategoryLabel("damage", "de")).toBe("Beschädigung / Mangel");
  });
  it("nieznana kategoria → zwraca wejście bez zmian", () => {
    expect(orderIssueCategoryLabel("xxx", "pl")).toBe("xxx");
  });
  it("ma dokładnie 5 kategorii", () => {
    expect(ORDER_ISSUE_CATEGORIES).toEqual(["damage", "missing", "wrong", "delivery", "other"]);
  });
});

describe("orderItemLabel", () => {
  it("sama nazwa gdy brak wariantów", () => {
    expect(orderItemLabel("Sofa LUNA", null, "pl")).toBe("Sofa LUNA");
    expect(orderItemLabel("Sofa LUNA", {}, "pl")).toBe("Sofa LUNA");
  });
  it("nazwa + wariant gdy są wartości", () => {
    expect(orderItemLabel("Sofa LUNA", { Strona: "Lewa" }, "pl")).toBe("Sofa LUNA — Strona: Lewa");
  });
});

describe("validateOrderIssueInput", () => {
  it("odrzuca nieznaną kategorię", () => {
    expect(validateOrderIssueInput({ category: "x", message: "zepsute", photos: [], orderItemId: null }))
      .toEqual({ ok: false, error: "category" });
  });
  it("odrzuca za krótki opis", () => {
    expect(validateOrderIssueInput({ category: "damage", message: "hi", photos: [], orderItemId: null }))
      .toEqual({ ok: false, error: "message" });
  });
  it("odrzuca > 5 zdjęć", () => {
    const photos = ["a", "b", "c", "d", "e", "f"];
    expect(validateOrderIssueInput({ category: "damage", message: "zepsute", photos, orderItemId: null }))
      .toEqual({ ok: false, error: "photos" });
  });
  it("przyjmuje poprawne i trimuje/normalizuje", () => {
    const res = validateOrderIssueInput({ category: "damage", message: "  zepsute rogi  ", photos: ["u1"], orderItemId: "" });
    expect(res).toEqual({ ok: true, value: { category: "damage", message: "zepsute rogi", photos: ["u1"], orderItemId: null } });
  });
});

describe("isOwnIssuePhotoUrl", () => {
  const base = "https://abc.supabase.co";
  it("akceptuje URL z naszego prefiksu order-issues", () => {
    expect(isOwnIssuePhotoUrl(`${base}/storage/v1/object/public/products/order-issues/x.jpg`, base)).toBe(true);
  });
  it("odrzuca obcy host", () => {
    expect(isOwnIssuePhotoUrl("https://evil.com/x.jpg", base)).toBe(false);
  });
  it("odrzuca nasz storage ale spoza order-issues", () => {
    expect(isOwnIssuePhotoUrl(`${base}/storage/v1/object/public/products/inne.jpg`, base)).toBe(false);
  });
  it("odrzuca gdy brak supabaseUrl", () => {
    expect(isOwnIssuePhotoUrl(`${base}/storage/v1/object/public/products/order-issues/x.jpg`, "")).toBe(false);
  });
  // Sam prefiks nie wystarczy: `..` normalizuje się dopiero przy PARSOWANIU
  // adresu, czyli PO walidacji — patrz ten sam przypadek w reviews-photos.test.ts.
  it("odrzuca wyjście z katalogu przez `..`", () => {
    expect(
      isOwnIssuePhotoUrl(`${base}/storage/v1/object/public/products/order-issues/../opinie/x.jpg`, base)
    ).toBe(false);
  });
  it("odrzuca `..` i `/` zakodowane procentowo (%2e%2e, %2f)", () => {
    expect(
      isOwnIssuePhotoUrl(`${base}/storage/v1/object/public/products/order-issues/%2e%2e%2fopinie%2fx.jpg`, base)
    ).toBe(false);
  });
  // Sama kropka/kropki mieszczą się we wzorcu nazwy, ale nigdy nie są
  // poprawnym kluczem pliku — patrz ten sam przypadek w reviews-photos.test.ts.
  it("odrzuca resztę złożoną z samych kropek", () => {
    expect(isOwnIssuePhotoUrl(`${base}/storage/v1/object/public/products/order-issues/..`, base)).toBe(false);
    expect(isOwnIssuePhotoUrl(`${base}/storage/v1/object/public/products/order-issues/.`, base)).toBe(false);
  });
});
