import { describe, it, expect } from "vitest";
import { sanitizeProductHtml, sanitizeSectionsHtml, sanitizeStyleAttr } from "@/app/_lib/product-html";
import { FONT_OPTIONS } from "@/app/_lib/description-fonts";
import type { ProductDescriptionSection } from "@/app/_lib/types";

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
    // img jest teraz na whiteliście — tag przechodzi, ale bez niebezpiecznych atrybutów;
    // atrybuty bez cudzysłowów (src=x) są ignorowane przez regex atrybutów.
    expect(out.toLowerCase()).not.toContain("onerror");
    expect(out.toLowerCase()).not.toContain("src=x");
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

describe("sanitizeSectionsHtml — sanityzacja body sekcji przy zapisie", () => {
  it("sanityzuje body i admin_body sekcji text", () => {
    const sections: ProductDescriptionSection[] = [
      {
        kind: "text",
        title: "Opis",
        body: '<p>OK</p><script>alert(1)</script>',
        admin_body: "<div>nadpis</div>",
      },
    ];
    const out = sanitizeSectionsHtml(sections);
    expect(out[0].kind).toBe("text");
    if (out[0].kind === "text") {
      expect(out[0].body).toBe("<p>OK</p>");
      expect(out[0].admin_body).toBe("nadpis");
      expect(out[0].title).toBe("Opis"); // tytuł nietknięty
    }
  });

  it("nie rusza sekcji image", () => {
    const sections: ProductDescriptionSection[] = [
      { kind: "image", image_url: "https://x/y.jpg", image_alt: "Sofa" },
    ];
    expect(sanitizeSectionsHtml(sections)).toEqual(sections);
  });

  it("pomija admin_body gdy nieobecne", () => {
    const sections: ProductDescriptionSection[] = [
      { kind: "text", title: "T", body: "<p>x</p>" },
    ];
    const out = sanitizeSectionsHtml(sections);
    if (out[0].kind === "text") expect(out[0].admin_body).toBeUndefined();
  });

  it("image: przepuszcza display bez zmian (tryb wyświetlania na karcie)", () => {
    const sections: ProductDescriptionSection[] = [
      { kind: "image", image_url: "https://x/a.jpg", image_alt: "a", display: "wide" },
      { kind: "image", image_url: "https://x/b.jpg", image_alt: "b" },
    ];
    const out = sanitizeSectionsHtml(sections);
    expect(out[0]).toEqual(sections[0]);
    expect((out[1] as { display?: string }).display).toBeUndefined();
  });
});

describe("sanitizeStyleAttr — waska whitelista CSS", () => {
  it("text-align dozwolone na p", () => {
    expect(sanitizeStyleAttr("p", "text-align: center")).toBe("text-align: center");
  });
  it("color dozwolony na span", () => {
    expect(sanitizeStyleAttr("span", "color: #c00")).toBe("color: #c00");
  });
  it("wycina niedozwolona property, zostawia text-align", () => {
    expect(sanitizeStyleAttr("p", "text-align:center; background:url(x)")).toBe("text-align: center");
  });
  it("odrzuca color z expression", () => {
    expect(sanitizeStyleAttr("span", "color: expression(alert(1))")).toBe("");
  });
  it("odrzuca color z url()", () => {
    expect(sanitizeStyleAttr("span", "color: url(javascript:1)")).toBe("");
  });
  it("text-align spoza enuma odrzucony", () => {
    expect(sanitizeStyleAttr("p", "text-align: end")).toBe("");
  });
  it("color na p (niedozwolone na bloku) wyciety", () => {
    expect(sanitizeStyleAttr("p", "color: red")).toBe("");
  });
  it("nieznany tag -> pusto", () => {
    expect(sanitizeStyleAttr("div", "text-align: center")).toBe("");
  });
});

describe("sanitizeProductHtml — nowe tagi i style", () => {
  it("przepuszcza u/s/blockquote/mark", () => {
    const html = "<p><u>a</u> <s>b</s> <mark>c</mark></p><blockquote>d</blockquote>";
    expect(sanitizeProductHtml(html)).toBe(html);
  });
  it("przepuszcza wyrownanie i kolor", () => {
    const html = '<p style="text-align: center">x</p><p><span style="color: #c00">y</span></p>';
    expect(sanitizeProductHtml(html)).toBe(html);
  });
  it("przepuszcza img z bezpiecznym src", () => {
    expect(sanitizeProductHtml('<img src="https://x/y.jpg" alt="Sofa" />')).toContain('src="https://x/y.jpg"');
  });
  it("wycina onerror z img", () => {
    const out = sanitizeProductHtml('<img src="https://x/y.jpg" onerror="alert(1)" />');
    expect(out.toLowerCase()).not.toContain("onerror");
  });
  it("odrzuca img z javascript: src", () => {
    const out = sanitizeProductHtml('<img src="javascript:alert(1)" />');
    expect(out.toLowerCase()).not.toContain("javascript:");
  });
  it("czysci niebezpieczny style zostawiajac text-align", () => {
    const out = sanitizeProductHtml('<p style="text-align:center; background:url(x)">x</p>');
    expect(out).toContain("text-align: center");
    expect(out.toLowerCase()).not.toContain("url(");
  });
});

describe("sanitizeStyleAttr — font-family (zamknięta lista czcionek opisów)", () => {
  it("każdy dozwolony stack przechodzi w formie kanonicznej", () => {
    for (const o of FONT_OPTIONS) {
      expect(sanitizeStyleAttr("span", `font-family: ${o.stack}`)).toBe(`font-family: ${o.stack}`);
    }
  });
  it("normalizuje cudzysłowy i wielkość liter do kanonicznego stacka", () => {
    expect(sanitizeStyleAttr("span", 'font-family: "courier new", MONOSPACE')).toBe(
      "font-family: 'Courier New', monospace"
    );
  });
  it("obce i niebezpieczne wartości są wycinane", () => {
    expect(sanitizeStyleAttr("span", "font-family: Comic Sans MS")).toBe("");
    expect(sanitizeStyleAttr("span", "font-family: url(javascript:x)")).toBe("");
    expect(sanitizeStyleAttr("span", "font-family: expression(alert(1))")).toBe("");
    expect(sanitizeStyleAttr("span", "font-family: var(--cokolwiek), serif")).toBe("");
  });
  it("color + font-family w jednym stylu — obie deklaracje zachowane", () => {
    expect(sanitizeStyleAttr("span", "color: #ff0000; font-family: Georgia, serif")).toBe(
      "color: #ff0000; font-family: Georgia, serif"
    );
  });
});
