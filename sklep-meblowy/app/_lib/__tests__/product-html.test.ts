import { describe, it, expect } from "vitest";
import { sanitizeProductHtml } from "@/app/_lib/product-html";

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
