import { describe, it, expect } from "vitest";
import {
  SAMPLE_OTHER_GROUP_ID,
  buildSampleCatalog,
  preselectSamples,
  sampleSelectionKey,
  toSampleFabrics,
  toSampleGroups,
  toggleSampleSelection,
  type SampleFabric,
} from "../sample-catalog";
import type { Fabric, FabricPriceGroup } from "../types";

function fabric(over: Partial<Fabric> & Pick<Fabric, "id" | "name">): Fabric {
  return {
    name_de: null,
    colors: [],
    color_images: {},
    price: 0,
    sort_order: 0,
    category: null,
    group_id: "g1",
    slug: over.name.toLowerCase(),
    description: null,
    description_de: null,
    short_info: null,
    short_info_de: null,
    properties: [],
    featured_product_ids: [],
    created_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

function group(id: string, name: string, sort = 0): FabricPriceGroup {
  return {
    id,
    code: id,
    name,
    name_de: null,
    surcharge: 0,
    sort_order: sort,
    created_at: "2026-08-01T00:00:00Z",
  };
}

function lean(over: Partial<SampleFabric> & Pick<SampleFabric, "id" | "name">): SampleFabric {
  return {
    slug: over.name.toLowerCase(),
    groupId: "g1",
    colors: ["01"],
    images: {},
    ...over,
  };
}

describe("toSampleFabrics", () => {
  it("zostawia tylko pola potrzebne wzornikowi", () => {
    const out = toSampleFabrics([
      fabric({
        id: "f1",
        name: "Riviera",
        slug: "riviera",
        group_id: "g2",
        colors: ["16", "21"],
        color_images: { "16": "https://x/16.jpg" },
        description: "<p>opis</p>",
      }),
    ]);
    expect(out).toEqual([
      {
        id: "f1",
        name: "Riviera",
        slug: "riviera",
        groupId: "g2",
        colors: ["16", "21"],
        images: { "16": "https://x/16.jpg" },
      },
    ]);
  });

  // Tkanina bez kolorów nie ma czego wyciąć — pusta karta w wzorniku to
  // element, w który klient klika i nic się nie dzieje.
  it("pomija tkaninę bez kolorów", () => {
    const out = toSampleFabrics([
      fabric({ id: "f1", name: "Bez kolorow", colors: [] }),
      fabric({ id: "f2", name: "Z kolorem", colors: ["01"] }),
    ]);
    expect(out.map((f) => f.id)).toEqual(["f2"]);
  });

  it("przycina kolory, usuwa puste i duplikaty", () => {
    const out = toSampleFabrics([
      fabric({ id: "f1", name: "X", colors: [" 01 ", "01", "  ", "02"] }),
    ]);
    expect(out[0].colors).toEqual(["01", "02"]);
  });

  // Klucz w color_images bywa zapisany ze spacją (wpisywany ręcznie w adminie)
  // — kafelek musi mimo to pokazać zdjęcie, bo inaczej klient wybiera numer
  // w ciemno.
  it("znajduje zdjęcie także pod nieprzyciętym kluczem", () => {
    const out = toSampleFabrics([
      fabric({ id: "f1", name: "X", colors: [" 07 "], color_images: { " 07 ": "https://x/7.jpg" } }),
    ]);
    expect(out[0].images).toEqual({ "07": "https://x/7.jpg" });
  });

  it("nie wysypuje się na braku colors/color_images", () => {
    const broken = { ...fabric({ id: "f1", name: "X" }), colors: undefined, color_images: undefined };
    expect(toSampleFabrics([broken as unknown as Fabric])).toEqual([]);
  });
});

describe("toSampleGroups", () => {
  it("zwraca id i nazwę grupy (dopłata dotyczy mebla, nie próbki)", () => {
    expect(toSampleGroups([group("g1", "Standard"), group("g2", "Premium", 1)])).toEqual([
      { id: "g1", name: "Standard" },
      { id: "g2", name: "Premium" },
    ]);
  });
});

describe("buildSampleCatalog", () => {
  const fabrics = [
    lean({ id: "f1", name: "Riviera", groupId: "g1" }),
    lean({ id: "f2", name: "Monolith Plus", groupId: "g2" }),
    lean({ id: "f3", name: "Solar", groupId: "g1" }),
  ];
  const groups = [
    { id: "g1", name: "Standard" },
    { id: "g2", name: "Premium" },
  ];

  it("grupuje w kolejności grup, wewnątrz zachowuje kolejność tkanin", () => {
    const out = buildSampleCatalog(fabrics, groups, "");
    expect(out.map((s) => s.name)).toEqual(["Standard", "Premium"]);
    expect(out[0].fabrics.map((f) => f.id)).toEqual(["f1", "f3"]);
    expect(out[1].fabrics.map((f) => f.id)).toEqual(["f2"]);
  });

  it("pusta fraza nie zawęża listy", () => {
    expect(buildSampleCatalog(fabrics, groups, "   ").flatMap((s) => s.fabrics)).toHaveLength(3);
  });

  // Ten sam mechanizm, co reszta wyszukiwarek w sklepie (searchMatches):
  // odporny na spacje, kolejność słów i diakrytyki.
  it("filtruje po nazwie niezależnie od kolejności słów i spacji", () => {
    expect(
      buildSampleCatalog(fabrics, groups, "plus monolith").flatMap((s) => s.fabrics.map((f) => f.id))
    ).toEqual(["f2"]);
    expect(
      buildSampleCatalog(fabrics, groups, "monolithplus").flatMap((s) => s.fabrics.map((f) => f.id))
    ).toEqual(["f2"]);
  });

  it("sekcja bez trafień znika (żeby nie zostawał sam nagłówek)", () => {
    const out = buildSampleCatalog(fabrics, groups, "riviera");
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Standard");
  });

  it("brak trafień = pusta lista sekcji", () => {
    expect(buildSampleCatalog(fabrics, groups, "nieistniejaca")).toEqual([]);
  });

  // Gdyby lista grup przyszła niekompletna, tkanina zniknęłaby po cichu —
  // awaria, której nikt nie zgłosi. Ma wylądować w sekcji „Pozostałe".
  it("tkanina z nieznaną grupą trafia do sekcji Pozostałe, nie znika", () => {
    const out = buildSampleCatalog(
      [...fabrics, lean({ id: "f9", name: "Sierota", groupId: "g-nieznana" })],
      groups,
      ""
    );
    const last = out[out.length - 1];
    expect(last.id).toBe(SAMPLE_OTHER_GROUP_ID);
    expect(last.fabrics.map((f) => f.id)).toEqual(["f9"]);
  });
});

describe("wybór próbek", () => {
  const riviera16 = { fabricId: "f1", fabricName: "Riviera", color: "16" };
  const riviera21 = { fabricId: "f1", fabricName: "Riviera", color: "21" };

  it("klucz to para tkanina + kolor", () => {
    expect(sampleSelectionKey("f1", "16")).toBe("f1::16");
  });

  it("dwa kolory tej samej tkaniny to dwie osobne próbki", () => {
    const out = toggleSampleSelection(toggleSampleSelection([], riviera16), riviera21);
    expect(out).toEqual([riviera16, riviera21]);
    expect(new Set(out.map((s) => sampleSelectionKey(s.fabricId, s.color)))).toEqual(
      new Set(["f1::16", "f1::21"])
    );
  });

  it("ponowny klik odznacza", () => {
    const out = toggleSampleSelection([riviera16, riviera21], riviera16);
    expect(out).toEqual([riviera21]);
  });

  // Kolejność wyznacza, które sztuki baza rozliczy jako darmowe (pierwsze
  // `free` pozycji) — dopisujemy na koniec, nie na początek.
  it("nowy wybór ląduje na końcu kolejki", () => {
    const out = toggleSampleSelection([riviera16], riviera21);
    expect(out.map((s) => s.color)).toEqual(["16", "21"]);
  });

  it("nie mutuje wejściowej tablicy", () => {
    const input = [riviera16];
    toggleSampleSelection(input, riviera21);
    expect(input).toEqual([riviera16]);
  });

  // Klucz musi rozróżniać kolory tej samej tkaniny — inaczej odznaczenie
  // jednego numeru kasowałoby cały wybór z tej tkaniny.
  it("odznaczenie jednego koloru nie rusza drugiego z tej samej tkaniny", () => {
    expect(toggleSampleSelection([riviera16, riviera21], riviera21)).toEqual([riviera16]);
  });
});

describe("preselectSamples", () => {
  const fabrics = [
    lean({ id: "f1", name: "Riviera", slug: "riviera", colors: ["16", "21"] }),
    lean({ id: "f2", name: "Pusta", slug: "pusta", colors: [] }),
  ];

  it("zaznacza pierwszy kolor tkaniny z adresu", () => {
    expect(preselectSamples(fabrics, "riviera")).toEqual([
      { fabricId: "f1", fabricName: "Riviera", color: "16" },
    ]);
  });

  it("nieznany slug nie jest błędem — nic nie zaznaczamy", () => {
    expect(preselectSamples(fabrics, "nie-ma-takiej")).toEqual([]);
  });

  it("brak parametru = pusty wybór", () => {
    expect(preselectSamples(fabrics, null)).toEqual([]);
    expect(preselectSamples(fabrics, "")).toEqual([]);
  });

  it("tkanina bez kolorów nie daje preselekcji", () => {
    expect(preselectSamples(fabrics, "pusta")).toEqual([]);
  });
});
