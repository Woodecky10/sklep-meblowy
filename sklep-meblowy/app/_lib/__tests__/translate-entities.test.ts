import { describe, it, expect } from "vitest";
import { translateProductFields } from "@/app/_lib/translate-entities";

// fałszywy translate: echo "DE:"+tekst, zachowuje kolejność
const fake = async (texts: string[]) => texts.map((t) => `DE:${t}`);

describe("translateProductFields", () => {
  it("tłumaczy nazwę/opis/kolor/materiał + sekcje", async () => {
    const out = await translateProductFields(
      {
        name: "Sofa",
        description: "<p>Wygodna</p>",
        color: "beż",
        material: "welur",
        description_sections: [
          { kind: "text", title: "Materiał", body: "<b>Miękki</b>" },
          { kind: "image", image_url: "x.jpg", image_alt: "zdjęcie", caption: "podpis" },
        ],
      },
      fake
    );
    expect(out.name_de).toBe("DE:Sofa");
    expect(out.description_de).toBe("DE:<p>Wygodna</p>");
    expect(out.color_de).toBe("DE:beż");
    expect(out.material_de).toBe("DE:welur");
    expect(out.description_sections_de?.[0]).toMatchObject({ kind: "text", title: "DE:Materiał", body: "DE:<b>Miękki</b>" });
    expect(out.description_sections_de?.[1]).toMatchObject({ kind: "image", image_url: "x.jpg", image_alt: "DE:zdjęcie", caption: "DE:podpis" });
  });
  it("puste/null pola zostają puste (nie woła translate na pusto)", async () => {
    const out = await translateProductFields({ name: "Sofa", description: "", color: null, material: null, description_sections: null }, fake);
    expect(out.name_de).toBe("DE:Sofa");
    expect(out.description_de).toBe("");
    expect(out.color_de).toBeNull();
  });
});
