import { describe, expect, test } from "vitest";
import { productPlainText } from "@/app/_lib/product-text";

// Plain-text opisu produktu jest potrzebny w TRZECH miejscach: meta description,
// JSON-LD Product i feed do Merchant Center. Wcześniej logika żyła prywatnie
// w app/produkt/[id]/page.tsx — feed musiałby ją duplikować, a rozjazd między
// opisem w Google Shopping i na karcie produktu to błąd w panelu Merchant.
describe("productPlainText", () => {
  test("używa pola description gdy jest wypełnione", () => {
    expect(
      productPlainText({ description: "<p>Wygodny narożnik.</p>" })
    ).toBe("Wygodny narożnik.");
  });

  test("gdy description puste, składa widoczne sekcje tekstowe", () => {
    const out = productPlainText({
      description: "",
      description_sections: [
        { kind: "text", title: "Materiał", body: "<p>Tkanina plamoodporna.</p>" },
        { kind: "text", title: "Wymiary", body: "<p>240 x 160 cm.</p>" },
      ],
    });
    expect(out).toBe("Tkanina plamoodporna.\n\n240 x 160 cm.");
  });

  test("pomija sekcje ukryte przez admina", () => {
    const out = productPlainText({
      description_sections: [
        { kind: "text", title: "Widoczna", body: "<p>Zostaje.</p>" },
        { kind: "text", title: "Ukryta", body: "<p>Znika.</p>", hidden: true },
      ],
    });
    expect(out).toBe("Zostaje.");
  });

  test("admin_body wygrywa nad body (nadpisanie z panelu)", () => {
    const out = productPlainText({
      description_sections: [
        {
          kind: "text",
          title: "Opis",
          body: "<p>Wersja z importu.</p>",
          admin_body: "<p>Wersja poprawiona.</p>",
        },
      ],
    });
    expect(out).toBe("Wersja poprawiona.");
  });

  test("pomija sekcje niebędące tekstem (zdjęcia)", () => {
    const out = productPlainText({
      description_sections: [
        { kind: "image", url: "https://cdn.example/a.jpg" },
        { kind: "text", title: "Opis", body: "<p>Tekst.</p>" },
      ],
    });
    expect(out).toBe("Tekst.");
  });

  test("usuwa tagi i dekoduje encje (Google nie chce HTML w opisie)", () => {
    const out = productPlainText({
      description: "<p>Tkanina &amp; skóra</p><ul><li>Miękka</li></ul>",
    });
    expect(out).not.toContain("<");
    expect(out).toContain("Tkanina & skóra");
    expect(out).toContain("Miękka");
  });

  test("zamienia <br> na spację, żeby wyrazy się nie zlepiały", () => {
    expect(productPlainText({ description: "<p>Szerokość<br/>240 cm</p>" })).toBe(
      "Szerokość 240 cm"
    );
  });

  test("zwija wielokrotne białe znaki wewnątrz akapitu", () => {
    expect(productPlainText({ description: "<p>Dużo    spacji\n\ttutaj</p>" })).toBe(
      "Dużo spacji tutaj"
    );
  });

  test("brak jakiegokolwiek opisu daje pusty string", () => {
    expect(productPlainText({})).toBe("");
    expect(productPlainText({ description: null, description_sections: null })).toBe("");
    expect(productPlainText({ description_sections: [] })).toBe("");
  });

  test("pomija sekcje o pustej treści zamiast zostawiać puste akapity", () => {
    const out = productPlainText({
      description_sections: [
        { kind: "text", title: "A", body: "<p>Pierwsza.</p>" },
        { kind: "text", title: "B", body: "   " },
        { kind: "text", title: "C", body: "<p>Druga.</p>" },
      ],
    });
    expect(out).toBe("Pierwsza.\n\nDruga.");
  });
});
