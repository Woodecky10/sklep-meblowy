import { describe, it, expect, vi, beforeEach } from "vitest";

// Błąd Supabase NIE MOŻE zostać zapisany w unstable_cache jako „pusta lista".
//
// 2026-10-09 /tkaniny pokazało nagłówek bez ani jednej tkaniny, a minutę później
// wszystkie 17 — w bazie bez zmian. 2026-10-06 tak samo zniknęły kategorie.
// Loader połykał błąd (`const { data } = await …; return data ?? []`), a cache
// zapisywał [] jak poprawny wynik na całe okno revalidate.
//
// Atrapa unstable_cache odtwarza dokładnie tę cechę Nexta, na której opiera się
// naprawa (node_modules/next/dist/server/web/spec-extension/unstable-cache.js):
// wynik zapisuje, wyjątku nie. Atrapa Supabase oddaje dla tabeli albo wiersze,
// albo błąd PostgREST — tak jak supabase-js, który błędów nie rzuca.

const { stan } = vi.hoisted(() => ({
  stan: {
    db: {} as Record<string, unknown[] | { message: string; code: string }>,
    zapisane: new Map<string, unknown>(),
  },
}));

const BLAD = { message: "canceling statement due to statement timeout", code: "57014" };

function zapytanie(table: string) {
  let tryb: "wiele" | "jeden" | "moze" = "wiele";
  const builder: Record<string, unknown> = {};
  for (const m of [
    "select", "eq", "neq", "is", "in", "or", "order", "limit",
    "gt", "gte", "lt", "lte", "not", "filter", "match", "range",
  ]) {
    builder[m] = () => builder;
  }
  builder.single = () => ((tryb = "jeden"), builder);
  builder.maybeSingle = () => ((tryb = "moze"), builder);
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve().then(() => wynik(table, tryb)).then(resolve, reject);
  return builder;
}

function wynik(table: string, tryb: "wiele" | "jeden" | "moze") {
  const t = stan.db[table];
  if (t === undefined) throw new Error(`test nie ustawił tabeli ${table}`);
  if (!Array.isArray(t)) return { data: null, error: t };
  if (tryb === "wiele") return { data: t, error: null };
  if (tryb === "moze") return { data: t[0] ?? null, error: null };
  return t.length === 1
    ? { data: t[0], error: null }
    : { data: null, error: { message: "JSON object requested", code: "PGRST116" } };
}

const klient = { from: zapytanie };

vi.mock("../supabase/server", () => ({
  createAdminClient: async () => klient,
  createClient: async () => klient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => klient,
}));

vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => Promise<unknown>, keyParts: string[] = []) =>
    async (...args: unknown[]) => {
      const klucz = JSON.stringify([keyParts, args]);
      if (stan.zapisane.has(klucz)) return stan.zapisane.get(klucz);
      const w = await fn(...args); // wyjątek leci dalej i nic się nie zapisuje — jak w Next
      stan.zapisane.set(klucz, w);
      return w;
    },
  revalidateTag: () => {},
  revalidatePath: () => {},
}));

import { getAllFabrics, getFabricPriceGroups, getFabricPropertyDefs } from "../fabrics";
import { getCategories } from "../categories";
import { getAllCollections } from "../collections";
import { getHomeBlocks, getPageBlocks } from "../blocks-server";
import { getBundleBySlug } from "../bundles-server";
import { getFeaturedItems } from "../featured";
import { getActiveTiles } from "../home-tiles";
import { getMenuItems } from "../menu-server";
import { getPageBySlug } from "../pages-server";
import { getFilterFacets } from "../products";
import { getSiteTexts } from "../site-texts";
import { getActiveSlides } from "../slides";
import { getTrustItems } from "../trust-items";
import { getVariantInfoMap } from "../variant-info-data";
import { GET as feedGET } from "@/app/feed.xml/route";
import sitemap from "@/app/sitemap";
import { mergeHomeBlocks } from "../blocks";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const produkt = {
  id: "p1",
  name: "Sofa Lena",
  description: "Opis",
  description_sections: null,
  price: 2999,
  sale_price: null,
  images: ["https://example.com/sofa.jpg"],
  category: "sofy",
  size_group: null,
  is_active: true,
  variants: [],
  features: null,
  dimensions: { width: 220, depth: 95, height: 85 },
};

const kategoria = {
  id: "c1",
  slug: "sofy",
  label: "Sofy",
  label_de: null,
  parent_id: null,
  cross_sell_categories: null,
  sort_order: 0,
  active: true,
};

type Przypadek = {
  nazwa: string;
  // Wartość zapasowa sprzed naprawy — ta sama, ale już tylko dla jednego żądania.
  zapas: unknown;
  tabele: Record<string, unknown[]>;
  awaria: string[];
  wywolaj: () => Promise<unknown>;
};

const przypadki: Przypadek[] = [
  {
    nazwa: "tkaniny",
    zapas: [],
    tabele: { fabrics: [{ id: "f1", name: "Baloo", slug: "baloo", group_id: "g1", colors: [], sort_order: 0 }] },
    awaria: ["fabrics"],
    wywolaj: () => getAllFabrics(),
  },
  {
    nazwa: "grupy cenowe tkanin",
    zapas: [],
    tabele: { fabric_groups: [{ id: "g1", code: "standard", name: "Standard", surcharge: 0, sort_order: 0 }] },
    awaria: ["fabric_groups"],
    wywolaj: () => getFabricPriceGroups(),
  },
  {
    nazwa: "cechy tkanin",
    zapas: [],
    tabele: { fabric_property_defs: [{ code: "pet", label: "Dla zwierząt", label_de: null, icon: null, sort_order: 0 }] },
    awaria: ["fabric_property_defs"],
    wywolaj: () => getFabricPropertyDefs(),
  },
  {
    nazwa: "kategorie",
    zapas: [],
    tabele: { categories: [kategoria] },
    awaria: ["categories"],
    wywolaj: () => getCategories("pl"),
  },
  {
    nazwa: "kolekcje",
    zapas: [],
    tabele: { collections: [{ id: "k1", slug: "lena", label: "Lena", updated_at: "2026-10-01" }] },
    awaria: ["collections"],
    wywolaj: () => getAllCollections(),
  },
  {
    nazwa: "bloki strony głównej",
    zapas: mergeHomeBlocks(null),
    tabele: {
      page_blocks: [{ id: "b1", page_id: null, block_type: "text", sort_order: 0, visible: true, content: { html: "x" } }],
    },
    awaria: ["page_blocks"],
    wywolaj: () => getHomeBlocks(),
  },
  {
    nazwa: "bloki podstrony",
    zapas: [],
    tabele: {
      page_blocks: [{ id: "b2", page_id: "s1", block_type: "text", sort_order: 0, visible: true, content: { html: "x" } }],
    },
    awaria: ["page_blocks"],
    wywolaj: () => getPageBlocks("s1"),
  },
  {
    nazwa: "zestawy",
    zapas: null,
    tabele: {
      bundles: [
        {
          id: "z1",
          slug: "salon-lena",
          is_active: true,
          bundle_items: [
            { product_id: "p1", position: 0 },
            { product_id: "p2", position: 1 },
          ],
        },
      ],
      products: [{ id: "p1" }, { id: "p2" }],
    },
    awaria: ["bundles"],
    // getActiveBundleSlugs rzuca celowo (tylko sitemapa) — tu getter strony.
    wywolaj: () => getBundleBySlug("salon-lena", "pl"),
  },
  {
    nazwa: "polecane — lista polecanych",
    zapas: [],
    tabele: {
      featured_products: [{ id: "w1", product_id: "p1", badge: null, sort_order: 0 }],
      products: [produkt],
    },
    awaria: ["featured_products"],
    wywolaj: () => getFeaturedItems(),
  },
  {
    nazwa: "polecane — produkty polecanych",
    zapas: [],
    tabele: {
      featured_products: [{ id: "w1", product_id: "p1", badge: null, sort_order: 0 }],
      products: [produkt],
    },
    awaria: ["products"],
    wywolaj: () => getFeaturedItems(),
  },
  {
    nazwa: "kafelki strony głównej",
    zapas: [],
    tabele: { home_tiles: [{ id: "t1", label: "Sofy", href: "/sklep", sort_order: 0, active: true }] },
    awaria: ["home_tiles"],
    wywolaj: () => getActiveTiles(),
  },
  {
    nazwa: "menu",
    zapas: null,
    tabele: { menu_items: [{ id: "m1", location: "header", page_id: null, href: "/sklep", label: "Sklep", sort_order: 0, visible: true }] },
    awaria: ["menu_items"],
    wywolaj: () => getMenuItems(),
  },
  {
    nazwa: "podstrona CMS",
    zapas: null,
    tabele: { pages: [{ id: "s1", slug: "regulamin", title: "Regulamin", published: true }] },
    awaria: ["pages"],
    wywolaj: () => getPageBySlug("regulamin"),
  },
  {
    nazwa: "filtry sklepu",
    zapas: { options: [], dimensions: { width: null, depth: null, height: null }, features: [] },
    tabele: { products: [produkt] },
    awaria: ["products"],
    wywolaj: () => getFilterFacets("pl"),
  },
  {
    nazwa: "teksty strony",
    zapas: {},
    tabele: { site_texts: [{ key: "home.hero", value: "Witaj", value_de: null }] },
    awaria: ["site_texts"],
    wywolaj: () => getSiteTexts(),
  },
  {
    nazwa: "slajdy",
    zapas: [],
    tabele: { home_slides: [{ id: "h1", image_url: "https://example.com/h.jpg", title: "Jesień", sort_order: 0, active: true }] },
    awaria: ["home_slides"],
    wywolaj: () => getActiveSlides(),
  },
  {
    nazwa: "pasek zaufania",
    zapas: null,
    tabele: { trust_items: [{ id: "u1", icon: "truck", label: "Darmowa dostawa", sort_order: 0, active: true }] },
    awaria: ["trust_items"],
    wywolaj: () => getTrustItems(),
  },
  {
    nazwa: "opisy wariantów",
    zapas: {},
    tabele: { variant_info: [{ option_name: "Tkanina", value: "Baloo 01", info: "Bouclé", info_de: null }] },
    awaria: ["variant_info"],
    wywolaj: () => getVariantInfoMap(),
  },
];

beforeEach(() => {
  stan.db = {};
  stan.zapisane.clear();
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// Strażnik na przyszłość: nowy loader napisany po staremu (`return data ?? []`
// bez rzucania) nie trafi do listy przypadków wyżej, ale tu padnie. Każde
// unstable_cache( w app/_lib musi mieć w swoim ciele throw.
describe("każdy unstable_cache w app/_lib rzuca przy błędzie", () => {
  const katalog = join(__dirname, "..");
  const ciala: { plik: string; nazwa: string; cialo: string }[] = [];
  for (const plik of readdirSync(katalog).filter((p) => p.endsWith(".ts"))) {
    const tekst = readFileSync(join(katalog, plik), "utf8").replace(/\r\n/g, "\n");
    for (const m of tekst.matchAll(/const (\w+) = unstable_cache\(([\s\S]*?)\n\);/g)) {
      ciala.push({ plik, nazwa: m[1], cialo: m[2] });
    }
  }

  it("znajduje wszystkie miejsca (gdyby regex przestał łapać, test nic by nie pilnował)", () => {
    expect(ciala.length).toBeGreaterThanOrEqual(23);
  });

  it.each(ciala.map((c) => [`${c.plik} → ${c.nazwa}`, c.cialo]))("%s", (_nazwa, cialo) => {
    expect(cialo).toMatch(/\bthrow\b/);
  });
});

describe("loadery z unstable_cache — błąd bazy nie zostaje w cache", () => {
  it.each(przypadki)("$nazwa: po awarii następne wywołanie czyta bazę na nowo", async (p) => {
    stan.db = { ...p.tabele };
    const zdrowy = await p.wywolaj();

    stan.zapisane.clear();
    for (const t of p.awaria) stan.db[t] = BLAD;
    const wAwarii = await p.wywolaj(); // strona ma się wyrenderować, nie wysypać
    // Bez tego test niczego by nie dowodził: wiersze z bazy muszą zmieniać wynik.
    expect(wAwarii).not.toEqual(zdrowy);
    // Zapas bez zmian: np. menu null → menu zastępcze, a nie puste.
    expect(wAwarii).toEqual(p.zapas);

    stan.db = { ...p.tabele };
    expect(await p.wywolaj()).toEqual(zdrowy);

    // Błąd ma być widać w logach Vercela — wcześniej znikał bez śladu.
    expect(console.error).toHaveBeenCalled();
  });
});

// Trasy ISR (feed.xml, sitemap.xml) cache'ują CAŁĄ odpowiedź — także 503 i wersję
// okrojoną (node_modules/next/dist/build/templates/app-route.js ~306-331). W działającym
// sklepie błąd bazy ma więc RZUCIĆ: Next zostawia wtedy ostatnią dobrą wersję
// (server/response-cache/index.js ~290-306). Przy buildzie rzucenie wywaliłoby deploy,
// dlatego tylko tam zostaje wersja awaryjna.
function wBuildzie<T>(fn: () => Promise<T>): Promise<T> {
  const przed = process.env.NEXT_PHASE;
  process.env.NEXT_PHASE = "phase-production-build";
  return fn().finally(() => {
    if (przed === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = przed;
  });
}

describe("feed.xml", () => {
  it.each(["categories", "products"])(
    "%s niedostępne w działającym sklepie → wyjątek (Next zostawia ostatni dobry feed)",
    async (tabela) => {
      stan.db = { products: [produkt], categories: [kategoria] };
      stan.db[tabela] = BLAD;
      await expect(feedGET()).rejects.toBeDefined();
    }
  );

  it("baza niedostępna przy buildzie → 503, deploy nie pada", async () => {
    stan.db = { products: [produkt], categories: BLAD };
    const res = await wBuildzie(() => feedGET());
    expect(res.status).toBe(503);
  });

  it("baza zdrowa → 200 z produktem", async () => {
    stan.db = { products: [produkt], categories: [kategoria] };
    const res = await feedGET();
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Sofa Lena");
  });
});

describe("sitemap.xml", () => {
  const zdrowe = () => ({
    categories: [kategoria],
    collections: [{ id: "k1", slug: "lena", label: "Lena", updated_at: "2026-10-01" }],
    products: [{ ...produkt, created_at: "2026-09-01", needs_translation: true }, { id: "p2", is_active: true, created_at: "2026-09-01" }],
    pages: [{ slug: "o-firmie", updated_at: "2026-09-01", title_de: null }],
    bundles: [
      {
        id: "z1",
        slug: "salon-lena",
        is_active: true,
        bundle_items: [
          { product_id: "p1", position: 0 },
          { product_id: "p2", position: 1 },
        ],
      },
    ],
    fabrics: [{ slug: "baloo", name_de: null, created_at: "2026-09-01" }],
  });

  it("baza zdrowa → wszystkie dynamiczne wpisy", async () => {
    stan.db = zdrowe();
    const urls = (await sitemap()).map((e) => e.url);
    for (const fragment of ["kategoria=sofy", "kolekcja=lena", "/produkt/p1", "/o-firmie", "/zestaw/salon-lena", "/tkaniny/baloo"]) {
      expect(urls.some((u) => u.includes(fragment))).toBe(true);
    }
  });

  it.each(["categories", "collections", "products", "pages", "bundles", "fabrics"])(
    "%s niedostępne w działającym sklepie → wyjątek, nie okrojona sitemapa w cache",
    async (tabela) => {
      stan.db = zdrowe();
      stan.db[tabela] = BLAD;
      await expect(sitemap()).rejects.toBeDefined();
    }
  );

  it("baza niedostępna przy buildzie → same trasy statyczne, deploy nie pada", async () => {
    stan.db = { ...zdrowe(), categories: BLAD };
    const urls = (await wBuildzie(() => sitemap())).map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/tkaniny"))).toBe(true);
    expect(urls.some((u) => u.includes("kategoria="))).toBe(false);
  });
});
