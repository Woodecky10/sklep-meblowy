// Single source of truth dla kategorii i sekcji sklepu.
// Aby dodać nową kategorię: dopisz wpis do CATEGORIES (z odpowiednią sekcją).
// Aby dodać nową sekcję: dopisz wpis do SECTIONS i dodaj typ do SectionSlug.
// Po zmianie pamiętaj o migracji DB (check constraint na products.category).

export type SectionSlug = "salon" | "sypialnia";

export type CategorySlug =
  | "sofy"
  | "naroznik-l"
  | "naroznik-u"
  | "fotele"
  | "pufy"
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
};

export const SECTIONS: Section[] = [
  { slug: "salon", label: "Salon" },
  { slug: "sypialnia", label: "Sypialnia" },
];

export const CATEGORIES: CategoryDef[] = [
  { slug: "sofy", label: "Sofy", section: "salon" },
  { slug: "naroznik-l", label: "Narożniki L", section: "salon" },
  { slug: "naroznik-u", label: "Narożniki U", section: "salon" },
  { slug: "fotele", label: "Fotele", section: "salon" },
  { slug: "pufy", label: "Pufy", section: "salon" },
  { slug: "lozko-kontynentalne", label: "Łóżka kontynentalne", section: "sypialnia" },
  { slug: "lozko-tapicerowane", label: "Łóżka tapicerowane", section: "sypialnia" },
  { slug: "materace", label: "Materace i toppery", section: "sypialnia" },
];

const categoryBySlug = new Map(CATEGORIES.map((c) => [c.slug, c]));
const sectionBySlug = new Map(SECTIONS.map((s) => [s.slug, s]));

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
