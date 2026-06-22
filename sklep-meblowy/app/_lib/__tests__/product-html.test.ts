import { describe, it, expect } from "vitest";
import { sanitizeProductHtml } from "@/app/_lib/product-html";

// Normalizacja jak przeglądarka traktuje URL w href: ignoruje znaki sterujące.
const stripCtrl = (s: string) => s.toLowerCase().replace(/[\x00-\x20]/g, "");

describe("sanitizeProductHtml — wektory XSS (audyt HIGH#4)", () => {
  it("javascript: ze znakiem sterującym w href jest neutralizowany", () => {
    const out = sanitizeProductHtml('<a href="java\nscript:alert(1)">klik</a>');
    expect(stripCtrl(out)).not.toContain("javascript:");
  });

  it("javascript: z tabulatorem w schemacie jest neutralizowany", () => {
    const out = sanitizeProductHtml('<a href="java\tscript:alert(1)">klik</a>');
    expect(stripCtrl(out)).not.toContain("javascript:");
  });

  it("podwojony < nie tworzy żywego <img onerror>", () => {
    const out = sanitizeProductHtml("<<img src=x onerror=alert(1)>");
    expect(out.toLowerCase()).not.toContain("onerror");
    expect(out.toLowerCase()).not.toContain("<img");
  });

  it("zwykły javascript: href usuwany (regresja)", () => {
    const out = sanitizeProductHtml('<a href="javascript:alert(1)">x</a>');
    expect(stripCtrl(out)).not.toContain("javascript:");
  });

  it("legalny https link zachowany", () => {
    const out = sanitizeProductHtml('<a href="https://example.com">x</a>');
    expect(out).toContain('href="https://example.com"');
  });

  it("legalny link relatywny zachowany", () => {
    const out = sanitizeProductHtml('<a href="/sklep">sklep</a>');
    expect(out).toContain('href="/sklep"');
  });

  it("paragraf i pogrubienie zachowane", () => {
    const out = sanitizeProductHtml("<p>Ladna <strong>sofa</strong></p>");
    expect(out).toContain("<p>");
    expect(out).toContain("<strong>");
  });
});

describe("sanitizeProductHtml — parytet z wyjściem TipTap", () => {
  it("przepuszcza akapity, listy, nagłówki H2/H3 i inline marks bez zmian", () => {
    const html =
      "<h2>Opis</h2><p>Wygodna <strong>sofa</strong> z <em>funkcją</em> spania.</p>" +
      "<ul><li>Tkanina wodoodporna</li><li>5 lat gwarancji</li></ul>" +
      "<h3>Detale</h3><ol><li>Punkt</li></ol>";
    expect(sanitizeProductHtml(html)).toBe(html);
  });

  it("przepuszcza bezpieczny link z rel/target", () => {
    const html = '<p><a href="https://mollien.pl" rel="noopener nofollow">Więcej</a></p>';
    expect(sanitizeProductHtml(html)).toBe(html);
  });

  it("wycina tag spoza whitelisty (div), zachowuje treść", () => {
    expect(sanitizeProductHtml("<div>Tekst</div>")).toBe("Tekst");
  });

  it("usuwa <script> wraz z zawartością", () => {
    const out = sanitizeProductHtml('<p>OK</p><script>alert(1)</script>');
    expect(out).toBe("<p>OK</p>");
  });

  it("dropuje link z niebezpiecznym schematem (javascript:)", () => {
    const out = sanitizeProductHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
  });
});
