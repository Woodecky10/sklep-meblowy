import type { ProductDescriptionSection } from "./types";

export type TranslateFn = (texts: string[], opts?: { html?: boolean }) => Promise<string[]>;

type ProductPl = {
  name: string;
  description: string;
  color?: string | null;
  material?: string | null;
  description_sections?: ProductDescriptionSection[] | null;
};
type ProductDe = {
  name_de: string;
  description_de: string;
  color_de: string | null;
  material_de: string | null;
  description_sections_de: ProductDescriptionSection[] | null;
};

// Tłumaczy pojedynczy string przez batcha (zachowuje pusty input bez wywołania).
async function one(t: string | null | undefined, fn: TranslateFn, html = false): Promise<string | null> {
  const s = (t ?? "").trim();
  if (!s) return t == null ? null : "";
  return (await fn([s], { html }))[0];
}

export async function translateProductFields(p: ProductPl, fn: TranslateFn): Promise<ProductDe> {
  const [name_de, description_de, color_de, material_de] = await Promise.all([
    one(p.name, fn).then((v) => v ?? ""),
    one(p.description, fn, true).then((v) => v ?? ""),
    one(p.color, fn),
    one(p.material, fn),
  ]);

  let sections_de: ProductDescriptionSection[] | null = null;
  const secs = p.description_sections;
  if (secs && secs.length > 0) {
    sections_de = await Promise.all(
      secs.map(async (s) => {
        if (s.kind === "text") {
          return {
            ...s,
            title: (await one(s.title, fn)) ?? s.title,
            body: (await one(s.body, fn, true)) ?? s.body,
            admin_title: s.admin_title ? (await one(s.admin_title, fn)) ?? s.admin_title : s.admin_title,
            admin_body: s.admin_body ? (await one(s.admin_body, fn, true)) ?? s.admin_body : s.admin_body,
          } as ProductDescriptionSection;
        }
        return {
          ...s,
          image_alt: (await one(s.image_alt, fn)) ?? s.image_alt,
          caption: s.caption ? (await one(s.caption, fn)) ?? s.caption : s.caption,
        } as ProductDescriptionSection;
      })
    );
  }

  return { name_de, description_de, color_de, material_de, description_sections_de: sections_de };
}

// Analogiczne, prostsze:
export async function translateLabel(label: string, fn: TranslateFn): Promise<string> {
  return (await one(label, fn)) ?? "";
}
export async function translateComment(comment: string | null, fn: TranslateFn): Promise<string | null> {
  return one(comment, fn, false);
}
