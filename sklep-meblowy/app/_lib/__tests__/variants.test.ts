import { describe, it, expect } from "vitest";
import {
  variantKey,
  getVariantPrice,
  getVariantSalePrice,
  getVariantOmnibus,
  getVariantStock,
  totalProductStock,
  getVariantImages,
  getVariantEffectivePrice,
  isVariantOnSale,
  formatVariantLabel,
  getOptionDisplayName,
  getValueDisplayLabel,
  isVariantSelectionComplete,
  hasVariants,
  expandFabrics,
  buildGroupSurchargeMap,
  buildFabricMetaMap,
  rebuildFabricValuePrices,
  removeFabricFromVariants,
  remapFabricInVariants,
  optionHasValueImages,
} from "@/app/_lib/variants";
import type { Product } from "@/app/_lib/types";

// Produkt z opcjami + doplatą per wartosc; stan/promo/zdjecia PRODUKTOWE.
const product = {
  id: "p1", name: "Sofa", price: 2000, stock: 5,
  sale_price: 1800, omnibus_price: 1700, images: ["prod.jpg"],
  variants: {
    options: [{ name: "Tkanina", values: ["Sawana 21", "Riviera 16"], value_prices: { "Riviera 16": 200 } }],
  },
} as unknown as import("@/app/_lib/types").Product;

describe("model tylko-opcje — ceny z dopłat + poziom produktu", () => {
  it("getVariantPrice -> base + dopłata wybranej wartości", () => {
    expect(getVariantPrice(product, { Tkanina: "Sawana 21" })).toBe(2000);
    expect(getVariantPrice(product, { Tkanina: "Riviera 16" })).toBe(2200);
  });
  it("getVariantSalePrice -> sale + dopłata (dopłata dolicza się do promocji)", () => {
    expect(getVariantSalePrice(product, { Tkanina: "Riviera 16" })).toBe(2000); // 1800+200
    expect(getVariantSalePrice(product, { Tkanina: "Sawana 21" })).toBe(1800);
  });
  it("getVariantOmnibus -> omnibus + dopłata", () => {
    expect(getVariantOmnibus(product, { Tkanina: "Riviera 16" })).toBe(1900); // 1700+200
  });
  it("getVariantEffectivePrice/isVariantOnSale -> spójne (on-sale ⇔ sale<base)", () => {
    expect(getVariantEffectivePrice(product, { Tkanina: "Riviera 16" })).toBe(2000);
    expect(isVariantOnSale(product, { Tkanina: "Riviera 16" })).toBe(true);
  });
  it("getVariantStock/totalProductStock -> product.stock", () => {
    expect(getVariantStock(product, { Tkanina: "Riviera 16" })).toBe(5);
    expect(totalProductStock(product)).toBe(5);
  });
  it("getVariantImages -> galeria produktu", () => {
    expect(getVariantImages(product, { Tkanina: "Riviera 16" })).toEqual(["prod.jpg"]);
  });
  it("brak sale_price -> getVariantSalePrice null", () => {
    const p2 = { ...product, sale_price: null } as typeof product;
    expect(getVariantSalePrice(p2, { Tkanina: "Riviera 16" })).toBeNull();
  });
});

describe("variantKey", () => {
  it("deterministyczny niezależnie od kolejności kluczy", () => {
    expect(variantKey({ Kolor: "Bez", Strona: "Lewa" })).toBe(
      variantKey({ Strona: "Lewa", Kolor: "Bez" })
    );
    expect(variantKey({ Kolor: "Bez" })).toBe("Kolor=Bez");
  });
});

describe("formatVariantLabel", () => {
  it("zwraca czytelny label dla wybranych wartości", () => {
    expect(formatVariantLabel({ Tkanina: "Sawana 21", Strona: "Lewa" })).toBe(
      "Tkanina: Sawana 21, Strona: Lewa"
    );
  });
});

describe("getOptionDisplayName / getValueDisplayLabel", () => {
  it("brak overrides -> zwraca oryginalna nazwa", () => {
    const p = { variants: { options: [], overrides: {} } } as unknown as Product;
    expect(getOptionDisplayName(p, "Tkanina")).toBe("Tkanina");
    expect(getValueDisplayLabel(p, "Tkanina", "Sawana 21")).toBe("Sawana 21");
  });
});

describe("isVariantSelectionComplete / hasVariants", () => {
  it("produkt bez wariantów -> hasVariants false, selection complete", () => {
    const p = { variants: null } as unknown as Product;
    expect(hasVariants(p)).toBe(false);
    expect(isVariantSelectionComplete(p, {})).toBe(true);
  });
  it("produkt z opcjami -> kompletny wybor gdy wszystkie opcje wybrane", () => {
    expect(isVariantSelectionComplete(product, { Tkanina: "Sawana 21" })).toBe(true);
    expect(isVariantSelectionComplete(product, {})).toBe(false);
  });
});

describe("expandFabrics z grupami cenowymi", () => {
  it("dolicza surcharge grupy do korekty tkaniny", () => {
    const { values, valuePrices } = expandFabrics(
      [{ name: "Monolith", colors: ["84", "85"], price: 50, group_id: "g-prem" }],
      { "g-prem": 250 }
    );
    expect(values).toEqual(["Monolith 84", "Monolith 85"]);
    expect(valuePrices).toEqual({ "Monolith 84": 300, "Monolith 85": 300 });
  });

  it("grupa 0 + korekta 0 → brak wpisu w valuePrices", () => {
    const { valuePrices } = expandFabrics(
      [{ name: "Sawana", colors: [], price: 0, group_id: "g-std" }],
      { "g-std": 0 }
    );
    expect(valuePrices).toEqual({});
  });

  it("brak group_id / brak mapy → jak dotąd (sama korekta)", () => {
    const { valuePrices } = expandFabrics([{ name: "Poso", colors: [], price: 30 }]);
    expect(valuePrices).toEqual({ Poso: 30 });
  });
});

describe("buildGroupSurchargeMap", () => {
  it("mapuje id → surcharge", () => {
    expect(
      buildGroupSurchargeMap([
        { id: "a", surcharge: 0 },
        { id: "b", surcharge: 250 },
      ])
    ).toEqual({ a: 0, b: 250 });
  });
});

describe("buildFabricMetaMap", () => {
  const groups = [
    { id: "g1", code: "standard", name: "Standard", name_de: null, surcharge: 0, sort_order: 0 },
    { id: "g2", code: "premium", name: "Premium", name_de: "Premium DE", surcharge: 250, sort_order: 1 },
  ];
  it("kluczuje po wartości wariantu i niesie slug + dane grupy", () => {
    const map = buildFabricMetaMap(
      [
        { name: "Monolith", colors: ["84"], slug: "monolith", group_id: "g2" },
        { name: "Sawana", colors: [], slug: "sawana", group_id: "g1" },
      ],
      groups,
      []
    );
    expect(map["Monolith 84"]).toEqual({
      fabricName: "Monolith",
      slug: "monolith",
      groupCode: "premium",
      groupName: "Premium",
      groupNameDe: "Premium DE",
      groupSurcharge: 250,
      groupSort: 1,
      shortInfo: null,
      shortInfoDe: null,
      properties: [],
    });
    expect(map["Sawana"].groupCode).toBe("standard");
  });
  it("pomija tkaniny z nieznanym group_id", () => {
    const map = buildFabricMetaMap(
      [{ name: "X", colors: [], slug: "x", group_id: "nieistnieje" }],
      groups,
      []
    );
    expect(map).toEqual({});
  });
  describe("buildFabricMetaMap — krótkie info", () => {
    it("shortInfo/shortInfoDe trafiają do meta każdej wartości tkaniny; puste → null", () => {
      const map = buildFabricMetaMap(
        [
          { name: "Baloo", colors: ["01", "02"], slug: "baloo", group_id: "g1", short_info: "  Miękki welur ", short_info_de: " Velours " },
          { name: "Sawana", colors: ["21"], slug: "sawana", group_id: "g1", short_info: "  ", short_info_de: null },
          { name: "Riviera", colors: [], slug: "riviera", group_id: "g1" },
        ],
        groups,
        []
      );
      expect(map["Baloo 01"].shortInfo).toBe("Miękki welur");
      expect(map["Baloo 01"].shortInfoDe).toBe("Velours");
      expect(map["Baloo 02"].shortInfo).toBe("Miękki welur"); // wszystkie kolory dostają to samo
      expect(map["Sawana 21"].shortInfo).toBeNull(); // whitespace → null
      expect(map["Riviera"].shortInfo).toBeNull(); // brak pól → null
      expect(map["Riviera"].shortInfoDe).toBeNull();
    });
  });
  // Definicje cech przychodzą dziś z tabeli fabric_property_defs (migracja 64),
  // więc mapa dostaje je z zewnątrz — kody tkaniny są tylko odnośnikiem.
  const PROPERTY_DEFS = [
    { code: "waterproof", label: "Wodoodporna", labelDe: "Wasserabweisend", icon: "drop" as const, sortOrder: 0 },
    { code: "easy_clean", label: "Łatwa w czyszczeniu", labelDe: null, icon: "sparkle" as const, sortOrder: 2 },
  ];

  describe("buildFabricMetaMap — cechy tkaniny", () => {
    it("rozwiązuje kody na definicje i przenosi je na każdą wartość rodziny", () => {
      const map = buildFabricMetaMap(
        [{ name: "Inari", colors: ["22", "23"], slug: "inari", group_id: "g1", properties: ["easy_clean", "waterproof"] }],
        [{ id: "g1", code: "std", name: "Standard", name_de: null, surcharge: 0, sort_order: 1 }],
        PROPERTY_DEFS
      );
      expect(map["Inari 22"].properties.map((p) => p.code)).toEqual(["waterproof", "easy_clean"]);
      expect(map["Inari 23"].properties[0].label).toBe("Wodoodporna");
    });

    it("brak kolumny properties → pusta lista, bez wyjątku", () => {
      const map = buildFabricMetaMap(
        [{ name: "Kronos", colors: ["01"], slug: "kronos", group_id: "g1" }],
        [{ id: "g1", code: "std", name: "Standard", name_de: null, surcharge: 0, sort_order: 1 }],
        PROPERTY_DEFS
      );
      expect(map["Kronos 01"].properties).toEqual([]);
    });

    it("kod bez definicji (usunięta cecha) jest odsiewany", () => {
      const map = buildFabricMetaMap(
        [{ name: "Poso", colors: ["105"], slug: "poso", group_id: "g1", properties: ["waterproof", "skasowana"] }],
        [{ id: "g1", code: "std", name: "Standard", name_de: null, surcharge: 0, sort_order: 1 }],
        PROPERTY_DEFS
      );
      expect(map["Poso 105"].properties.map((p) => p.code)).toEqual(["waterproof"]);
    });

    it("brak definicji w ogóle → pusta lista", () => {
      const map = buildFabricMetaMap(
        [{ name: "Poso", colors: ["105"], slug: "poso", group_id: "g1", properties: ["waterproof"] }],
        [{ id: "g1", code: "std", name: "Standard", name_de: null, surcharge: 0, sort_order: 1 }],
        []
      );
      expect(map["Poso 105"].properties).toEqual([]);
    });
  });
});

describe("rebuildFabricValuePrices", () => {
  const fabrics = [
    { name: "Monolith", colors: ["84"], price: 0, group_id: "g-prem" },
    { name: "Sawana", colors: ["21"], price: 10, group_id: "g-std" },
  ];
  const surcharges = { "g-prem": 250, "g-std": 0 };
  const variants = {
    options: [
      { name: "Strona", values: ["Lewa", "Prawa"] },
      {
        name: "Tkanina",
        values: ["Monolith 84", "Sawana 21", "Orphan 99"],
        value_prices: { "Monolith 84": 50, "Orphan 99": 77 },
      },
    ],
  };
  it("przelicza wartości z katalogu, zachowuje orphany i inne opcje", () => {
    const res = rebuildFabricValuePrices(variants, fabrics, surcharges);
    expect(res?.changed).toBe(true);
    const opt = res!.variants.options.find((o) => o.name === "Tkanina")!;
    expect(opt.value_prices).toEqual({
      "Monolith 84": 250,
      "Sawana 21": 10,
      "Orphan 99": 77,
    });
    expect(opt.values).toEqual(["Monolith 84", "Sawana 21", "Orphan 99"]);
    expect(res!.variants.options[0]).toEqual(variants.options[0]);
  });
  it("changed=false gdy nic się nie zmienia", () => {
    const first = rebuildFabricValuePrices(variants, fabrics, surcharges)!;
    const second = rebuildFabricValuePrices(first.variants, fabrics, surcharges)!;
    expect(second.changed).toBe(false);
  });
  it("null gdy brak wariantów lub opcji Tkanina", () => {
    expect(rebuildFabricValuePrices(null, fabrics, surcharges)).toBeNull();
    expect(
      rebuildFabricValuePrices({ options: [{ name: "Strona", values: ["Lewa"] }] }, fabrics, surcharges)
    ).toBeNull();
  });
  it("suma 0 → usuwa wpis (value_prices undefined gdy pusto)", () => {
    const v = {
      options: [{ name: "Tkanina", values: ["Sawana 21"], value_prices: { "Sawana 21": 10 } }],
    };
    const res = rebuildFabricValuePrices(v, [{ name: "Sawana", colors: ["21"], price: 0, group_id: "g-std" }], surcharges)!;
    expect(res.changed).toBe(true);
    expect(res.variants.options[0].value_prices).toBeUndefined();
  });
});

// Produkt ze zdjęciami per wartość opcji (value_images) — galeria wariantowa.
const productWithValueImages = {
  id: "p2", name: "Sofa", price: 2000, stock: 5,
  sale_price: null, omnibus_price: null, images: ["prod1.jpg", "prod2.jpg"],
  variants: {
    options: [
      {
        name: "Tkanina",
        values: ["Sawana 21", "Riviera 16"],
        value_images: { "Riviera 16": ["riv1.jpg", "riv2.jpg"] },
      },
      {
        name: "Strona",
        values: ["Lewa", "Prawa"],
        value_images: { Lewa: ["lewa.jpg", "prod1.jpg"] },
      },
    ],
  },
} as unknown as Product;

describe("getVariantImages — value_images tylko dla narożnika", () => {
  it("brak wyboru → galeria produktu", () => {
    expect(getVariantImages(productWithValueImages, {})).toEqual([
      "prod1.jpg", "prod2.jpg",
    ]);
  });
  it("opcja nie-narożnikowa (Tkanina) ze zdjęciami → tylko galeria produktu", () => {
    expect(
      getVariantImages(productWithValueImages, { Tkanina: "Riviera 16" })
    ).toEqual(["prod1.jpg", "prod2.jpg"]);
  });
  it("opcja narożnika (Strona) ze zdjęciami → zdjęcia narożnika + galeria, dedup", () => {
    expect(
      getVariantImages(productWithValueImages, { Strona: "Lewa" })
    ).toEqual(["lewa.jpg", "prod1.jpg", "prod2.jpg"]);
  });
  it("narożnik + nie-narożnik → scala tylko narożnik", () => {
    expect(
      getVariantImages(productWithValueImages, { Tkanina: "Riviera 16", Strona: "Lewa" })
    ).toEqual(["lewa.jpg", "prod1.jpg", "prod2.jpg"]);
  });
  it("wybrana wartość bez zdjęć → galeria produktu", () => {
    expect(
      getVariantImages(productWithValueImages, { Tkanina: "Sawana 21" })
    ).toEqual(["prod1.jpg", "prod2.jpg"]);
  });
  it("produkt bez variants → galeria produktu", () => {
    const p = { ...productWithValueImages, variants: null } as unknown as Product;
    expect(getVariantImages(p, {})).toEqual(["prod1.jpg", "prod2.jpg"]);
  });
});

describe("optionHasValueImages", () => {
  it("opcja z niepustymi value_images → true", () => {
    expect(
      optionHasValueImages({ name: "Kolor nóżek", values: ["Złote"], value_images: { "Złote": ["a.jpg"] } })
    ).toBe(true);
  });
  it("opcja bez value_images → false", () => {
    expect(optionHasValueImages({ name: "Rozmiar", values: ["M"] })).toBe(false);
  });
  it("opcja z samymi pustymi tablicami → false", () => {
    expect(optionHasValueImages({ name: "X", values: ["a"], value_images: { a: [] } })).toBe(false);
  });
});

describe("removeFabricFromVariants", () => {
  const sawana = { name: "Sawana", colors: ["21", "25"], price: 0, group_id: "g-std" };
  const variants = {
    options: [
      { name: "Strona", values: ["Lewa", "Prawa"] },
      {
        name: "Tkanina",
        values: ["Monolith 84", "Sawana 21", "Sawana 25"],
        value_prices: { "Monolith 84": 250, "Sawana 21": 10 },
        value_images: { "Sawana 21": ["saw.jpg"], "Monolith 84": ["mono.jpg"] },
        filterable: true,
      },
    ],
  };

  it("usuwa wartości tkaniny wraz z dopłatami i zdjęciami, resztę zostawia", () => {
    const res = removeFabricFromVariants(variants, sawana)!;
    expect(res.changed).toBe(true);
    const opt = res.variants.options.find((o) => o.name === "Tkanina")!;
    expect(opt.values).toEqual(["Monolith 84"]);
    expect(opt.value_prices).toEqual({ "Monolith 84": 250 });
    expect(opt.value_images).toEqual({ "Monolith 84": ["mono.jpg"] });
    // Pozostałe pola opcji i inne opcje nietknięte.
    expect(opt.filterable).toBe(true);
    expect(res.variants.options[0]).toEqual(variants.options[0]);
  });

  it("ostatnia tkanina → opcja Tkanina znika, inne opcje zostają", () => {
    const only = {
      options: [
        { name: "Strona", values: ["Lewa"] },
        { name: "Tkanina", values: ["Sawana 21", "Sawana 25"] },
      ],
    };
    const res = removeFabricFromVariants(only, sawana)!;
    expect(res.changed).toBe(true);
    expect(res.variants.options.map((o) => o.name)).toEqual(["Strona"]);
  });

  it("tkanina bez kolorów — wartością jest sama nazwa", () => {
    const v = { options: [{ name: "Tkanina", values: ["Velvet", "Monolith 84"] }] };
    const res = removeFabricFromVariants(v, { name: "Velvet", colors: [], price: 0, group_id: "g" })!;
    expect(res.variants.options[0].values).toEqual(["Monolith 84"]);
  });

  it("zabiera też kolory spoza katalogu — stary zapis nie zostaje w „Pozostałych\"", () => {
    const res = removeFabricFromVariants(
      { options: [{ name: "Tkanina", values: ["Monolith 84", "Sawana 21", "Sawana 99"] }] },
      sawana
    )!;
    // „Sawana 99" nie ma już wpisu w colors (np. przenumerowano kolory), ale to
    // wciąż Sawana — po usunięciu tkaniny nie może zostać jako sierota.
    expect(res.variants.options[0].values).toEqual(["Monolith 84"]);
  });

  it("nie zabiera kolorów innej tkaniny, której nazwa zaczyna się tak samo", () => {
    const magic = { name: "Magic", colors: ["01"], price: 0, group_id: "g" };
    const magicVelvet = { name: "Magic Velvet", colors: ["2239"], price: 0, group_id: "g" };
    const res = removeFabricFromVariants(
      { options: [{ name: "Tkanina", values: ["Magic 01", "Magic Velvet 2239"] }] },
      magic,
      [magicVelvet]
    )!;
    expect(res.variants.options[0].values).toEqual(["Magic Velvet 2239"]);
  });

  it("changed=false gdy produkt nie ma tej tkaniny", () => {
    const res = removeFabricFromVariants(
      { options: [{ name: "Tkanina", values: ["Monolith 84"] }] },
      sawana
    )!;
    expect(res.changed).toBe(false);
  });

  it("null gdy brak wariantów lub opcji Tkanina", () => {
    expect(removeFabricFromVariants(null, sawana)).toBeNull();
    expect(
      removeFabricFromVariants({ options: [{ name: "Strona", values: ["Lewa"] }] }, sawana)
    ).toBeNull();
  });
});

describe("remapFabricInVariants", () => {
  const poprzednia = { name: "Woolly", colors: ["1", "3"] };

  it("kolor wykreślony z katalogu znika z produktu (sedno usterki)", () => {
    // Przenumerowanie: „1" i „3" zastąpione przez „01" i „03". Stare wartości
    // nie mają odpowiednika, więc nie mogą zostać jako sieroty w „Pozostałych".
    const res = remapFabricInVariants(
      { options: [{ name: "Tkanina", values: ["Woolly 1", "Woolly 3", "Monolith 84"] }] },
      poprzednia,
      { name: "Woolly", colors: ["01", "03"], price: 0, group_id: "g" }
    )!;
    expect(res.changed).toBe(true);
    expect(res.variants.options[0].values).toEqual(["Monolith 84"]);
  });

  it("kolor, który został, zostaje nietknięty", () => {
    const res = remapFabricInVariants(
      { options: [{ name: "Tkanina", values: ["Woolly 1", "Woolly 3"] }] },
      poprzednia,
      { name: "Woolly", colors: ["1"], price: 0, group_id: "g" }
    )!;
    expect(res.variants.options[0].values).toEqual(["Woolly 1"]);
  });

  it("zmiana nazwy tkaniny PRZEPISUJE wartości razem z dopłatą i zdjęciem", () => {
    // Bez tego po zmianie nazwy KAŻDA wartość stałaby się sierotą, a katalog
    // nie miałby już jak jej odnaleźć — to jedyny moment na naprawę.
    const res = remapFabricInVariants(
      {
        options: [
          {
            name: "Tkanina",
            values: ["Woolly 1"],
            value_prices: { "Woolly 1": 250 },
            value_images: { "Woolly 1": ["w.jpg"] },
          },
        ],
      },
      poprzednia,
      { name: "Wooly", colors: ["1"], price: 0, group_id: "g" }
    )!;
    const opt = res.variants.options[0];
    expect(opt.values).toEqual(["Wooly 1"]);
    expect(opt.value_prices).toEqual({ "Wooly 1": 250 });
    expect(opt.value_images).toEqual({ "Wooly 1": ["w.jpg"] });
  });

  it("gdy nie zostaje żadna tkanina, opcja Tkanina znika", () => {
    const res = remapFabricInVariants(
      { options: [{ name: "Strona", values: ["Lewa"] }, { name: "Tkanina", values: ["Woolly 1"] }] },
      poprzednia,
      { name: "Woolly", colors: ["09"], price: 0, group_id: "g" }
    )!;
    expect(res.variants.options.map((o) => o.name)).toEqual(["Strona"]);
  });

  it("nie rusza tkaniny o nazwie zaczynającej się tak samo", () => {
    const res = remapFabricInVariants(
      { options: [{ name: "Tkanina", values: ["Magic 01", "Magic Velvet 2239"] }] },
      { name: "Magic", colors: ["01"] },
      { name: "Magic", colors: [], price: 0, group_id: "g" },
      [{ name: "Magic Velvet", colors: ["2239"], price: 0, group_id: "g" }]
    )!;
    expect(res.variants.options[0].values).toEqual(["Magic Velvet 2239"]);
  });

  it("przepisanie na istniejącą już wartość nie robi duplikatu", () => {
    const res = remapFabricInVariants(
      { options: [{ name: "Tkanina", values: ["Woolly 1", "Wooly 1"] }] },
      poprzednia,
      { name: "Wooly", colors: ["1"], price: 0, group_id: "g" }
    )!;
    expect(res.variants.options[0].values).toEqual(["Wooly 1"]);
  });

  it("changed=false gdy nazwa i kolory bez zmian", () => {
    const res = remapFabricInVariants(
      { options: [{ name: "Tkanina", values: ["Woolly 1", "Woolly 3"] }] },
      poprzednia,
      { name: "Woolly", colors: ["1", "3"], price: 0, group_id: "g" }
    )!;
    expect(res.changed).toBe(false);
  });

  it("null gdy produkt nie ma opcji Tkanina", () => {
    expect(
      remapFabricInVariants(null, poprzednia, { name: "Woolly", colors: [], price: 0, group_id: "g" })
    ).toBeNull();
  });
});
