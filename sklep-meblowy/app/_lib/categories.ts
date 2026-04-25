// Single source of truth dla kategorii i sekcji sklepu.
// Aby dodać nową kategorię: dopisz wpis do CATEGORIES (z odpowiednią sekcją).
// Aby dodać nową sekcję: dopisz wpis do SECTIONS i dodaj typ do SectionSlug.
// Po zmianie pamiętaj o migracji DB (check constraint na products.category).

export type SectionSlug = "salon" | "sypialnia";

export type CategorySlug =
  | "sofa-2-osobowa"
  | "sofa-3-osobowa"
  | "naroznik-l"
  | "naroznik-u"
  | "fotele"
  | "pufy"
  | "zestawy"
  | "lozko-kontynentalne"
  | "lozko-tapicerowane"
  | "materace";

export type Section = {
  slug: SectionSlug;
  label: string;
};

export type CategoryDef = {
  slug: CategorySlug;
  label: string;
  section: SectionSlug;
  // ID kategorii w BaseLinker (Inventory) — używane przy synchronizacji
  // produktów BL → Supabase. Patrz GET /api/baselinker/test żeby zobaczyć
  // aktualne ID w Twoim koncie BL.
  baselinkerCategoryId?: number;
};

export const SECTIONS: Section[] = [
  { slug: "salon", label: "Salon" },
  { slug: "sypialnia", label: "Sypialnia" },
];

// Uwaga: dla nowych kategorii (sofa-2-osobowa, sofa-3-osobowa, zestawy)
// trzeba w BaseLinkerze założyć osobne kategorie i uzupełnić tu ich ID.
// Stary baselinkerCategoryId = 7489757 ("Sofy") nie jest już używany —
// można go w BL przemianować lub zarchiwizować.
export const CATEGORIES: CategoryDef[] = [
  { slug: "sofa-2-osobowa", label: "Sofa 2-osobowa", section: "salon" },
  { slug: "sofa-3-osobowa", label: "Sofa 3-osobowa", section: "salon" },
  { slug: "naroznik-l", label: "Narożnik w kształcie L", section: "salon", baselinkerCategoryId: 7489758 },
  { slug: "naroznik-u", label: "Narożnik w kształcie U", section: "salon", baselinkerCategoryId: 7489759 },
  { slug: "fotele", label: "Fotele", section: "salon", baselinkerCategoryId: 7489760 },
  { slug: "pufy", label: "Pufy", section: "salon", baselinkerCategoryId: 7489761 },
  { slug: "zestawy", label: "Zestawy (narożnik + fotel + pufa)", section: "salon" },
  { slug: "lozko-kontynentalne", label: "Łóżka kontynentalne", section: "sypialnia", baselinkerCategoryId: 7489762 },
  { slug: "lozko-tapicerowane", label: "Łóżka tapicerowane", section: "sypialnia", baselinkerCategoryId: 7489763 },
  { slug: "materace", label: "Materace i toppery", section: "sypialnia", baselinkerCategoryId: 7489764 },
];

const categoryBySlug = new Map(CATEGORIES.map((c) => [c.slug, c]));
const sectionBySlug = new Map(SECTIONS.map((s) => [s.slug, s]));
const categoryByBlId = new Map(
  CATEGORIES
    .filter((c): c is CategoryDef & { baselinkerCategoryId: number } => !!c.baselinkerCategoryId)
    .map((c) => [c.baselinkerCategoryId, c])
);

export function getCategoryByBaselinkerId(blCategoryId: number): CategoryDef | undefined {
  return categoryByBlId.get(blCategoryId);
}

export function getCategory(slug: string | undefined | null): CategoryDef | undefined {
  if (!slug) return undefined;
  return categoryBySlug.get(slug as CategorySlug);
}

export function getCategoryLabel(slug: string | undefined | null): string | undefined {
  return getCategory(slug)?.label;
}

export function getSection(slug: string | undefined | null): Section | undefined {
  if (!slug) return undefined;
  return sectionBySlug.get(slug as SectionSlug);
}

export function getCategoriesBySection(sectionSlug: SectionSlug): CategoryDef[] {
  return CATEGORIES.filter((c) => c.section === sectionSlug);
}

export function isCategorySlug(value: string | undefined | null): value is CategorySlug {
  return !!value && categoryBySlug.has(value as CategorySlug);
}
