import { describe, it, expect } from "vitest";
import { validateImageUpload } from "@/app/_lib/image-upload";

function makeFile(type: string, size = 1000, name = "x") {
  return new File([new Uint8Array(size)], name, { type });
}

describe("validateImageUpload — allowlist (audyt LOW: SVG = stored XSS)", () => {
  it("akceptuje JPG/PNG/WebP/AVIF i mapuje rozszerzenie", () => {
    const cases: [string, string][] = [
      ["image/jpeg", "jpg"],
      ["image/png", "png"],
      ["image/webp", "webp"],
      ["image/avif", "avif"],
    ];
    for (const [mime, ext] of cases) {
      const r = validateImageUpload(makeFile(mime));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.ext).toBe(ext);
        expect(r.contentType).toBe(mime);
      }
    }
  });

  it("odrzuca SVG", () => {
    expect(validateImageUpload(makeFile("image/svg+xml")).ok).toBe(false);
  });

  it("odrzuca inne typy (gif, pdf, html)", () => {
    expect(validateImageUpload(makeFile("image/gif")).ok).toBe(false);
    expect(validateImageUpload(makeFile("application/pdf")).ok).toBe(false);
    expect(validateImageUpload(makeFile("text/html")).ok).toBe(false);
  });

  it("brak pliku / pusty → false", () => {
    expect(validateImageUpload(null).ok).toBe(false);
    expect(validateImageUpload(makeFile("image/png", 0)).ok).toBe(false);
  });

  it("za duży plik → false", () => {
    expect(validateImageUpload(makeFile("image/png", 100), 50).ok).toBe(false);
  });

  it("rozszerzenie z mime, nie z nazwy pliku (evil.svg jako image/png → png)", () => {
    const r = validateImageUpload(makeFile("image/png", 1000, "evil.svg"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ext).toBe("png");
  });
});
