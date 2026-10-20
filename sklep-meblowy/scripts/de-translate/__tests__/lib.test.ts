import { describe, expect, it } from "vitest";
import {
  visibleTextSection,
  unitKey,
  assembleDeSections,
  packBatches,
  mergeBlockContentDe,
  tagSequence,
  hasPolishLetters,
  polishWords,
  numberTokens,
  urls,
  validateUnit,
  unitsFromProduct,
  dedupeUnits,
} from "../lib.mjs";

describe("visibleTextSection", () => {
  it("bierze admin_title/admin_body gdy są wypełnione", () => {
    expect(
      visibleTextSection({
        kind: "text",
        title: "Import",
        body: "<p>Import</p>",
        admin_title: "Opis",
        admin_body: "<p>Opis admina</p>",
      })
    ).toEqual({ title: "Opis", body: "<p>Opis admina</p>" });
  });

  it("puste/biało-znakowe admin_* → fallback do title/body", () => {
    expect(
      visibleTextSection({ kind: "text", title: "Opis", body: "Treść", admin_title: "  ", admin_body: "" })
    ).toEqual({ title: "Opis", body: "Treść" });
  });

  it("brak admin_* → title/body bez zmian", () => {
    expect(visibleTextSection({ kind: "text", title: "A", body: "B" })).toEqual({ title: "A", body: "B" });
  });

  it("body bierze SUROWE admin_body (bez trimowania treści)", () => {
    const out = visibleTextSection({ kind: "text", title: "", body: "x", admin_body: " <p>a</p> " });
    expect(out.body).toBe(" <p>a</p> ");
  });
});

describe("unitKey", () => {
  it("jest deterministyczny", () => {
    expect(unitKey("section_body", "Wygodna sofa")).toBe(unitKey("section_body", "Wygodna sofa"));
  });

  it("ten sam tekst w innym kind → inny klucz", () => {
    expect(unitKey("section_title", "Opis")).not.toBe(unitKey("section_body", "Opis"));
  });

  it("ma 12 znaków hex", () => {
    expect(unitKey("product_name", "Sofa")).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("assembleDeSections", () => {
  const t = (kind: string, pl: string, de: string) => [unitKey(kind, pl), de] as const;

  it("tekst: DE idzie do title/body, admin_* NIE trafia do DE, hidden/admin_custom kopiowane z PL", () => {
    const pl = [
      {
        kind: "text",
        title: "Import",
        body: "Treść importu",
        admin_title: "Opis",
        admin_body: "Treść admina",
        hidden: true,
        admin_custom: false,
      },
    ];
    const translations = Object.fromEntries([
      t("section_title", "Opis", "Beschreibung"),
      t("section_body", "Treść admina", "Inhalt vom Admin"),
    ]);
    expect(assembleDeSections(pl, translations)).toEqual([
      {
        kind: "text",
        title: "Beschreibung",
        body: "Inhalt vom Admin",
        hidden: true,
        admin_custom: false,
      },
    ]);
  });

  it("brak tłumaczenia → pusty string (nie undefined, nie tekst PL)", () => {
    const pl = [{ kind: "text", title: "Opis", body: "Treść" }];
    expect(assembleDeSections(pl, {})).toEqual([{ kind: "text", title: "", body: "" }]);
  });

  it("obraz: image_url z PL, alt tłumaczony, caption tylko gdy niepusty, display gdy truthy", () => {
    const pl = [
      { kind: "image", image_url: "https://x/a.jpg", image_alt: "Sofa w salonie", display: "wide" },
      { kind: "image", image_url: "https://x/b.jpg", image_alt: "Łóżko", caption: "Podpis" },
    ];
    const translations = Object.fromEntries([
      t("image_alt", "Sofa w salonie", "Sofa im Wohnzimmer"),
      t("image_alt", "Łóżko", "Bett"),
      t("caption", "Podpis", "Bildunterschrift"),
    ]);
    expect(assembleDeSections(pl, translations)).toEqual([
      { kind: "image", image_url: "https://x/a.jpg", image_alt: "Sofa im Wohnzimmer", display: "wide" },
      { kind: "image", image_url: "https://x/b.jpg", image_alt: "Bett", caption: "Bildunterschrift" },
    ]);
  });

  it("wynik ma DOKŁADNIE tyle sekcji co PL (storefront podmienia całą tablicę)", () => {
    const pl = [
      { kind: "text", title: "A", body: "B" },
      { kind: "image", image_url: "u", image_alt: "" },
      { kind: "text", title: "", body: "" },
    ];
    expect(assembleDeSections(pl, {})).toHaveLength(3);
  });

  it("klucz kolidujący z prototypem nie przecieka z Object.prototype", () => {
    // Gdyby lookup robił translations[key], "constructor" zwróciłby funkcję.
    const pl = [{ kind: "text", title: "Opis", body: "" }];
    const out = assembleDeSections(pl, { constructor: "zły" } as Record<string, string>);
    expect(out[0]).toEqual({ kind: "text", title: "", body: "" });
  });
});

describe("packBatches", () => {
  const u = (key: string, text: string) => ({ key, kind: "section_body", text });

  it("pakuje zachłannie do limitu", () => {
    const batches = packBatches([u("a", "12345"), u("b", "12345"), u("c", "1")], 10);
    expect(batches.map((b) => b.map((x: { key: string }) => x.key))).toEqual([["a", "b"], ["c"]]);
  });

  it("jednostka dłuższa niż limit ląduje sama w partii", () => {
    const batches = packBatches([u("a", "12"), u("big", "x".repeat(50)), u("b", "34")], 10);
    expect(batches.map((b) => b.map((x: { key: string }) => x.key))).toEqual([["a"], ["big"], ["b"]]);
  });

  it("pusta lista → brak partii", () => {
    expect(packBatches([], 100)).toEqual([]);
  });
});

describe("mergeBlockContentDe", () => {
  it("zachowuje nietłumaczalne klucze i dokleja *_de", () => {
    const content = {
      heading: "Nagłówek",
      body: "<p>Treść</p>",
      layout: "left",
      image_url: "https://x/a.jpg",
      cta_href: "/sklep",
      limit: 4,
      product_ids: ["1", "2"],
    };
    const out = mergeBlockContentDe(content, { heading: "Überschrift", body: "<p>Inhalt</p>" });
    expect(out).toMatchObject({
      layout: "left",
      image_url: "https://x/a.jpg",
      cta_href: "/sklep",
      limit: 4,
      product_ids: ["1", "2"],
      heading: "Nagłówek",
      heading_de: "Überschrift",
      body_de: "<p>Inhalt</p>",
    });
  });

  it("nie nadpisuje istniejącego _de bez force", () => {
    const content = { heading: "Nagłówek", heading_de: "Stare DE" };
    expect(mergeBlockContentDe(content, { heading: "Nowe DE" }).heading_de).toBe("Stare DE");
    expect(mergeBlockContentDe(content, { heading: "Nowe DE" }, { force: true }).heading_de).toBe("Nowe DE");
  });

  it("items łączy PO INDEKSIE i nie rusza pozostałych pól itemu", () => {
    const content = {
      items: [
        { question: "Pyt 1", answer: "Odp 1" },
        { question: "Pyt 2", answer: "Odp 2", answer_de: "Antwort 2" },
      ],
    };
    const out = mergeBlockContentDe(content, {
      items: [
        { question: "Frage 1", answer: "Antwort 1" },
        { question: "Frage 2", answer: "NOWE" },
      ],
    });
    expect(out.items).toEqual([
      { question: "Pyt 1", answer: "Odp 1", question_de: "Frage 1", answer_de: "Antwort 1" },
      { question: "Pyt 2", answer: "Odp 2", answer_de: "Antwort 2", question_de: "Frage 2" },
    ]);
  });

  it("nie tworzy items gdy ich nie było", () => {
    expect(mergeBlockContentDe({ heading: "A" }, { heading: "B" })).not.toHaveProperty("items");
  });
});

describe("walidatory", () => {
  it("tagSequence zwraca nazwy tagów w kolejności, lowercase", () => {
    expect(tagSequence("<P><STRONG>a</strong></p>")).toEqual(["p", "strong", "strong", "p"]);
    expect(tagSequence("bez tagów")).toEqual([]);
  });

  it("hasPolishLetters / polishWords", () => {
    expect(hasPolishLetters("Sofa aus Stoff")).toBe(false);
    expect(hasPolishLetters("Sofa z tkaniny wełnianej")).toBe(true);
    expect(polishWords("Bett mit Łóżko und gęsty")).toEqual(["Łóżko", "gęsty"]);
  });

  it("numberTokens zwraca posortowany multizbiór", () => {
    expect(numberTokens("180x200 cm, 2,5 kg")).toEqual(["180", "2,5", "200"].sort());
  });

  it("urls obcina cudzysłowy i nawiasy kątowe", () => {
    expect(urls('<a href="https://mollien.pl/sklep">x</a>')).toEqual(["https://mollien.pl/sklep"]);
    expect(urls("bez linków")).toEqual([]);
  });

  it("ERROR: brak wyniku / pusty / zły typ", () => {
    const u = { key: "k", kind: "section_body", text: "Tekst" };
    expect(validateUnit(u, undefined).errors).toHaveLength(1);
    expect(validateUnit(u, "").errors).toHaveLength(1);
    expect(validateUnit(u, 42 as unknown as string).errors).toHaveLength(1);
  });

  it("ERROR: inna sekwencja tagów", () => {
    const u = { key: "k", kind: "section_body", text: "<p><strong>Sofa</strong></p>" };
    const res = validateUnit(u, "<p>Sofa</p>");
    expect(res.errors.join(" ")).toMatch(/tag/i);
  });

  it("ERROR: inny zbiór URL-i", () => {
    const u = { key: "k", kind: "section_body", text: "Zobacz https://mollien.pl/sklep" };
    expect(validateUnit(u, "Siehe https://mollien.de/shop").errors.join(" ")).toMatch(/URL/);
    expect(validateUnit(u, "Siehe https://mollien.pl/sklep").errors).toEqual([]);
  });

  it("ERROR: polskie litery w DE", () => {
    const u = { key: "k", kind: "section_title", text: "Wygodne łóżko" };
    expect(validateUnit(u, "Bequemes łóżko").errors.join(" ")).toMatch(/polskie znaki/);
  });

  it("ERROR: wyróżnione słowo nie jest podłańcuchem tytułu", () => {
    const u = { key: "k", kind: "slide_highlight", text: "Elegancja" };
    expect(validateUnit(u, "Stil", { titleDe: "Eleganz pur" }).errors).toHaveLength(1);
    expect(validateUnit(u, "eleganz", { titleDe: "Eleganz pur" }).errors).toEqual([]);
  });

  it("brak tytułu DE dla highlight → ostrzeżenie, nie błąd", () => {
    const u = { key: "k", kind: "slide_highlight", text: "Elegancja" };
    const res = validateUnit(u, "Eleganz", {});
    expect(res.errors).toEqual([]);
    expect(res.warnings).toHaveLength(1);
  });

  it("WARNING: DE identyczne z PL przy dłuższym tekście", () => {
    const text = "To jest dosc dlugi tekst bez diakrytykow do sprawdzenia";
    const res = validateUnit({ key: "k", kind: "section_body", text }, text);
    expect(res.errors).toEqual([]);
    expect(res.warnings.join(" ")).toMatch(/identyczne/);
  });

  it("WARNING: podejrzana proporcja długości", () => {
    const res = validateUnit({ key: "k", kind: "section_body", text: "x".repeat(100) }, "y".repeat(10));
    expect(res.warnings.join(" ")).toMatch(/długo/);
  });

  it("WARNING: inne liczby", () => {
    const res = validateUnit({ key: "k", kind: "section_title", text: "Sofa 180 cm" }, "Sofa 190 cm");
    expect(res.warnings.join(" ")).toMatch(/liczby/);
  });

  it("czysty przypadek nie daje ani błędu, ani ostrzeżenia", () => {
    const u = { key: "k", kind: "section_body", text: "<p>Sofa o szerokości 180 cm.</p>" };
    expect(validateUnit(u, "<p>Sofa mit einer Breite von 180 cm.</p>")).toEqual({ errors: [], warnings: [] });
  });
});

describe("unitsFromProduct + dedupeUnits", () => {
  it("tworzy jednostki z widocznych tekstów i pomija puste", () => {
    const units = unitsFromProduct({
      id: "1",
      name: "Sofa Vegas",
      description_sections: [
        { kind: "text", title: "Opis", body: "Treść", admin_body: "Treść admina" },
        { kind: "text", title: "", body: "" },
        { kind: "image", image_url: "u", image_alt: "Alt", caption: "" },
      ],
    });
    expect(units.map((u: { kind: string; text: string }) => [u.kind, u.text])).toEqual([
      ["product_name", "Sofa Vegas"],
      ["section_title", "Opis"],
      ["section_body", "Treść admina"],
      ["image_alt", "Alt"],
    ]);
  });

  it("dedupeUnits zostawia pierwsze wystąpienie", () => {
    const a = { key: "x", kind: "section_title", text: "Opis", ctx: "pierwszy" };
    const b = { key: "x", kind: "section_title", text: "Opis", ctx: "drugi" };
    expect(dedupeUnits([a, b])).toEqual([a]);
  });
});
