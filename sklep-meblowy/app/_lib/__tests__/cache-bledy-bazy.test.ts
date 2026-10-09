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
import { getActiveBundleSlugs } from "../bundles-server";
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
  tabele: Record<string, unknown[]>;
  awaria: string[];
  wywolaj: () => Promise<unknown>;
};

const przypadki: Przypadek[] = [
  {
    nazwa: "tkaniny",
    tabele: { fabrics: [{ id: "f1", name: "Baloo", slug: "baloo", group_id: "g1", colors: [], sort_order: 0 }] },
    awaria: ["fabrics"],
    wywolaj: () => getAllFabrics(),
  },
  {
    nazwa: "grupy cenowe tkanin",
    tabele: { fabric_groups: [{ id: "g1", code: "standard", name: "Standard", surcharge: 0, sort_order: 0 }] },
    awaria: ["fabric_groups"],
    wywolaj: () => getFabricPriceGroups(),
  },
  {
    nazwa: "cechy tkanin",
    tabele: { fabric_property_defs: [{ code: "pet", label: "Dla zwierząt", label_de: null, icon: null, sort_order: 0 }] },
    awaria: ["fabric_property_defs"],
    wywolaj: () => getFabricPropertyDefs(),
  },
  {
    nazwa: "kategorie",
    tabele: { categories: [kategoria] },
    awaria: ["categories"],
    wywolaj: () => getCategories("pl"),
  },
  {
    nazwa: "kolekcje",
    tabele: { collections: [{ id: "k1", slug: "lena", label: "Lena", updated_at: "2026-10-01" }] },
    awaria: ["collections"],
    wywolaj: () => getAllCollections(),
  },
  {
    nazwa: "bloki strony głównej",
    tabele: {
      page_blocks: [{ id: "b1", page_id: null, block_type: "text", sort_order: 0, visible: true, content: { html: "x" } }],
    },
    awaria: ["page_blocks"],
    wywolaj: () => getHomeBlocks(),
  },
  {
    nazwa: "bloki podstrony",
    tabele: {
      page_blocks: [{ id: "b2", page_id: "s1", block_type: "text", sort_order: 0, visible: true, content: { html: "x" } }],
    },
    awaria: ["page_blocks"],
    wywolaj: () => getPageBlocks("s1"),
  },
  {
    nazwa: "zestawy",
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
    wywolaj: () => getActiveBundleSlugs(),
  },
  {
    nazwa: "polecane — lista polecanych",
    tabele: {
      featured_products: [{ id: "w1", product_id: "p1", badge: null, sort_order: 0 }],
      products: [produkt],
    },
    awaria: ["featured_products"],
    wywolaj: () => getFeaturedItems(),
  },
  {
    nazwa: "polecane — produkty polecanych",
    tabele: {
      featured_products: [{ id: "w1", product_id: "p1", badge: null, sort_order: 0 }],
      products: [produkt],
    },
    awaria: ["products"],
    wywolaj: () => getFeaturedItems(),
  },
  {
    nazwa: "kafelki strony głównej",
    tabele: { home_tiles: [{ id: "t1", label: "Sofy", href: "/sklep", sort_order: 0, active: true }] },
    awaria: ["home_tiles"],
    wywolaj: () => getActiveTiles(),
  },
  {
    nazwa: "menu",
    tabele: { menu_items: [{ id: "m1", location: "header", page_id: null, href: "/sklep", label: "Sklep", sort_order: 0, visible: true }] },
    awaria: ["menu_items"],
    wywolaj: () => getMenuItems(),
  },
  {
    nazwa: "podstrona CMS",
    tabele: { pages: [{ id: "s1", slug: "regulamin", title: "Regulamin", published: true }] },
    awaria: ["pages"],
    wywolaj: () => getPageBySlug("regulamin"),
  },
  {
    nazwa: "filtry sklepu",
    tabele: { products: [produkt] },
    awaria: ["products"],
    wywolaj: () => getFilterFacets("pl"),
  },
  {
    nazwa: "teksty strony",
    tabele: { site_texts: [{ key: "home.hero", value: "Witaj", value_de: null }] },
    awaria: ["site_texts"],
    wywolaj: () => getSiteTexts(),
  },
  {
    nazwa: "slajdy",
    tabele: { home_slides: [{ id: "h1", image_url: "https://example.com/h.jpg", title: "Jesień", sort_order: 0, active: true }] },
    awaria: ["home_slides"],
    wywolaj: () => getActiveSlides(),
  },
  {
    nazwa: "pasek zaufania",
    tabele: { trust_items: [{ id: "u1", icon: "truck", label: "Darmowa dostawa", sort_order: 0, active: true }] },
    awaria: ["trust_items"],
    wywolaj: () => getTrustItems(),
  },
  {
    nazwa: "opisy wariantów",
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

describe("loadery z unstable_cache — błąd bazy nie zostaje w cache", () => {
  it.each(przypadki)("$nazwa: po awarii następne wywołanie czyta bazę na nowo", async (p) => {
    stan.db = { ...p.tabele };
    const zdrowy = await p.wywolaj();

    stan.zapisane.clear();
    for (const t of p.awaria) stan.db[t] = BLAD;
    const wAwarii = await p.wywolaj(); // strona ma się wyrenderować, nie wysypać
    // Bez tego test niczego by nie dowodził: wiersze z bazy muszą zmieniać wynik.
    expect(wAwarii).not.toEqual(zdrowy);

    stan.db = { ...p.tabele };
    expect(await p.wywolaj()).toEqual(zdrowy);

    // Błąd ma być widać w logach Vercela — wcześniej znikał bez śladu.
    expect(console.error).toHaveBeenCalled();
  });
});

describe("feed.xml", () => {
  it("kategorie niedostępne → 503, a nie feed bez kategorii Google", async () => {
    stan.db = { products: [produkt], categories: BLAD as never };
    const res = await feedGET();
    expect(res.status).toBe(503);
  });

  it("baza zdrowa → 200 z produktem", async () => {
    stan.db = { products: [produkt], categories: [kategoria] };
    const res = await feedGET();
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Sofa Lena");
  });
});
