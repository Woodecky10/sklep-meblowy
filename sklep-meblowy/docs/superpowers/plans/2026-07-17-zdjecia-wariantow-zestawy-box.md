# Zdjęcia per wariant + widoczność zestawów — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin może przypisać zdjęcia do każdej wartości opcji produktu (pokazują się na początku galerii po wyborze), a box „Kup w zestawie" na karcie produktu pokazuje pełny skład zestawu z cenami i bezpośrednimi linkami do produktów składowych.

**Architecture:** Zdjęcia wariantów żyją w istniejącym JSONB `products.variants` jako `ProductOption.value_images` (zero migracji DB); logika galerii to jedna funkcja `getVariantImages()`. Box zestawu to przebudowa client-komponentu `BundleOffer.tsx` + nowy czysty helper cenowy w `bundles.ts`. Spec: `docs/superpowers/specs/2026-07-17-zdjecia-wariantow-zestawy-box-design.md`.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Supabase (JSONB + Storage bucket `products`), vitest, Tailwind.

## Global Constraints

- **ZERO migracji DB** — `value_images` żyje w istniejącej kolumnie JSONB `products.variants`.
- **Upload wyłącznie przez istniejącą akcję** `uploadProductImage` (`app/admin/produkty/actions.ts:65`) — bucket `products`, walidacje MIME/8MB, kompresja client-side przez `useImageUpload`/`uploadImageFiles`.
- **Czysty JSONB**: puste struktury nie są zapisywane — brak zdjęć = brak klucza `value_images` (wzorzec jak `value_prices`/`filterable` w `VariantsEditor.save()`).
- **Teksty klienckie przez słowniki** (`app/_lib/dictionaries/pl.ts` typ+wartości, `de.ts` nadpisania). Teksty admina po polsku, hardkod (jak reszta admina).
- **Testy**: `npm test` (vitest run). NIE uruchamiać `npm run test:e2e` (default `E2E_BASE_URL` = PROD).
- **Gotcha tsc**: stale `.next` psuje `npx tsc --noEmit` po przełączeniu gałęzi — gdy posypią się dziwne błędy z `.next/types`, usuń katalog `.next` i powtórz.
- **Repo root to `C:\Users\wood1`** (katalog domowy!) — CWD `C:\Users\wood1\sklep-meblowy` to podkatalog repo. Wszystkie komendy uruchamiaj z CWD; w komunikatach gita ścieżki będą miały prefiks `sklep-meblowy/`. NIE używać `git add -A` / `git add .` z poziomu repo root.
- **Commity**: konwencja `feat(warianty): ...` / `feat(zestawy): ...` po polsku, stopka `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **AGENTS.md**: to nie jest znany Ci Next.js — przy wątpliwościach co do API czytaj `node_modules/next/dist/docs/` (ten plan nie dodaje nowych API Nexta, tylko istniejące wzorce projektu).

**Kolejność tasków:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Taski 2-5 zależą od typu z Taska 1; Task 7 zależy od helpera z Taska 6.

**Przed Taskiem 1:** utwórz gałąź feature:

```bash
git checkout -b feat/zdjecia-wariantow-zestawy-box
```

---

### Task 1: Typ `value_images` + galeria wariantowa w `getVariantImages`

**Files:**
- Modify: `app/_lib/types.ts:20-27` (typ `ProductOption`)
- Modify: `app/_lib/variants.ts:68-74` (funkcja `getVariantImages`)
- Test: `app/_lib/__tests__/variants.test.ts`

**Interfaces:**
- Consumes: istniejący `ProductVariants`/`Product` z `types.ts`.
- Produces: `ProductOption.value_images?: Record<string, string[]>` (mapa: wartość opcji → lista URL-i) oraz `getVariantImages(product, selectedValues): string[]` — zdjęcia wybranych wartości (w kolejności opcji) + galeria produktu, dedup; fallback `product.images`. Taski 2-5 i 7 polegają na tym kształcie.

- [ ] **Step 1: Write the failing tests**

Dopisz na końcu `app/_lib/__tests__/variants.test.ts`:

```ts
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

describe("getVariantImages — zdjęcia per wartość opcji (value_images)", () => {
  it("brak wyboru → galeria produktu", () => {
    expect(getVariantImages(productWithValueImages, {})).toEqual([
      "prod1.jpg", "prod2.jpg",
    ]);
  });
  it("wybrana wartość ze zdjęciami → zdjęcia wariantu na początku + galeria produktu", () => {
    expect(
      getVariantImages(productWithValueImages, { Tkanina: "Riviera 16" })
    ).toEqual(["riv1.jpg", "riv2.jpg", "prod1.jpg", "prod2.jpg"]);
  });
  it("wybrana wartość bez zdjęć → galeria produktu jak dotychczas", () => {
    expect(
      getVariantImages(productWithValueImages, { Tkanina: "Sawana 21" })
    ).toEqual(["prod1.jpg", "prod2.jpg"]);
  });
  it("dwie opcje ze zdjęciami → kolejność wg kolejności opcji + dedup z galerią", () => {
    expect(
      getVariantImages(productWithValueImages, { Tkanina: "Riviera 16", Strona: "Lewa" })
    ).toEqual(["riv1.jpg", "riv2.jpg", "lewa.jpg", "prod1.jpg", "prod2.jpg"]);
  });
  it("produkt bez variants → galeria produktu", () => {
    const p = { ...productWithValueImages, variants: null } as unknown as Product;
    expect(getVariantImages(p, {})).toEqual(["prod1.jpg", "prod2.jpg"]);
  });
});
```

Uwaga: istniejący test `"getVariantImages -> galeria produktu"` (linia ~49) MA zostać — produkt bez `value_images` dalej zwraca galerię produktu.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/_lib/__tests__/variants.test.ts`
Expected: FAIL — nowe testy z `value_images` dostają `["prod1.jpg","prod2.jpg"]` zamiast list ze zdjęciami wariantu (stara implementacja ignoruje wybór).

- [ ] **Step 3: Add `value_images` to `ProductOption` type**

W `app/_lib/types.ts` w typie `ProductOption` (po `value_prices`, przed `filterable`):

```ts
export type ProductOption = {
  name: string;
  values: string[];
  value_prices?: Record<string, number>;
  // Zdjęcia per wartość opcji (np. mebel w danej tkaninie) — po wyborze
  // wartości idą na początek galerii na karcie produktu (getVariantImages).
  // Brak wpisu = brak zdjęć wariantowych. Puste tablice nie są zapisywane.
  value_images?: Record<string, string[]>;
  // Admin zaznaczył „Filtr w sklepie" — opcja pojawia się jako filtr na /sklep
  // (facety liczone w getFacetSource). Brak/false = opcja nie filtruje.
  filterable?: boolean;
};
```

- [ ] **Step 4: Implement `getVariantImages`**

W `app/_lib/variants.ts` zastąp całą funkcję `getVariantImages` (linie 68-74):

```ts
// Zdjęcia do pokazania klientowi: zdjęcia wybranych wartości opcji
// (value_images, w kolejności opcji) na początku, po nich galeria produktu;
// deduplikacja URL-i (pierwsze wystąpienie wygrywa). Brak wyboru / brak zdjęć
// wariantowych → galeria produktu jak dotychczas.
export function getVariantImages(
  product: Product,
  selectedValues: Record<string, string>
): string[] {
  const variantImages: string[] = [];
  for (const opt of product.variants?.options ?? []) {
    const v = selectedValues[opt.name];
    if (v == null) continue;
    const imgs = opt.value_images?.[v];
    if (!Array.isArray(imgs)) continue;
    for (const url of imgs) {
      if (typeof url === "string" && url) variantImages.push(url);
    }
  }
  if (variantImages.length === 0) return product.images ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [...variantImages, ...(product.images ?? [])]) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
```

Parametr zmienia nazwę z `_selectedValues` na `selectedValues` (teraz używany).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/_lib/__tests__/variants.test.ts`
Expected: PASS (wszystkie, w tym stare testy).

- [ ] **Step 6: Commit**

```bash
git add app/_lib/types.ts app/_lib/variants.ts app/_lib/__tests__/variants.test.ts
git commit -m "feat(warianty): value_images w ProductOption + galeria wariantowa w getVariantImages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Czyszczenie `value_images` przy zapisie — helper + `updateProductVariants`

**Files:**
- Modify: `app/_lib/product-images.ts` (nowy czysty helper `cleanValueImages`)
- Modify: `app/admin/produkty/actions.ts:240-293` (akcja `updateProductVariants`)
- Test: `app/_lib/__tests__/product-images.test.ts`

**Interfaces:**
- Consumes: `ProductOption.value_images` z Taska 1.
- Produces: `cleanValueImages(values: string[], valueImages: unknown): Record<string, string[]> | undefined` — czysta funkcja; Task 4 (editor) polega na tym, że akcja przyjmie i wyczyści `value_images` serwerowo.

- [ ] **Step 1: Write the failing tests**

Dopisz na końcu `app/_lib/__tests__/product-images.test.ts` (rozszerz istniejący import):

```ts
import { imageUrlsToDelete, cleanValueImages } from "@/app/_lib/product-images";
```

(zastępując istniejącą linię importu na górze pliku), a na końcu pliku:

```ts
describe("cleanValueImages — czyszczenie zdjęć wartości przy zapisie wariantów", () => {
  it("zostawia tylko wpisy dla istniejących wartości (pruning)", () => {
    expect(
      cleanValueImages(["A"], { A: ["https://x/a.jpg"], B: ["https://x/b.jpg"] })
    ).toEqual({ A: ["https://x/a.jpg"] });
  });
  it("odrzuca nie-stringi, puste stringi i URL-e bez http(s)", () => {
    expect(
      cleanValueImages(["A"], {
        A: ["https://x/a.jpg", "", 123, "javascript:alert(1)", "ftp://x/z.jpg"],
      })
    ).toEqual({ A: ["https://x/a.jpg"] });
  });
  it("puste tablice znikają; nic nie zostało → undefined", () => {
    expect(cleanValueImages(["A"], { A: [] })).toBeUndefined();
    expect(cleanValueImages(["A"], {})).toBeUndefined();
    expect(cleanValueImages(["A"], { B: ["https://x/b.jpg"] })).toBeUndefined();
  });
  it("śmieciowe wejście (nie-obiekt / tablica / undefined) → undefined", () => {
    expect(cleanValueImages(["A"], undefined)).toBeUndefined();
    expect(cleanValueImages(["A"], "x")).toBeUndefined();
    expect(cleanValueImages(["A"], ["https://x/a.jpg"])).toBeUndefined();
    expect(cleanValueImages(["A"], null)).toBeUndefined();
  });
  it("wartość z tablicą zawierającą śmieci → zostają tylko poprawne URL-e", () => {
    expect(
      cleanValueImages(["A", "B"], { A: ["https://x/a.jpg"], B: "nie-tablica" })
    ).toEqual({ A: ["https://x/a.jpg"] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/_lib/__tests__/product-images.test.ts`
Expected: FAIL — `cleanValueImages is not a function` (brak eksportu).

- [ ] **Step 3: Implement `cleanValueImages`**

Dopisz na końcu `app/_lib/product-images.ts`:

```ts
// Czyści value_images opcji przy zapisie wariantów (updateProductVariants):
// zostawia tylko wpisy dla istniejących wartości opcji, tylko poprawne URL-e
// http(s) (max 2000 znaków), bez pustych tablic. Zwraca undefined gdy nic nie
// zostało — klucz znika z JSONB (wzorzec jak value_prices).
export function cleanValueImages(
  values: string[],
  valueImages: unknown
): Record<string, string[]> | undefined {
  if (
    typeof valueImages !== "object" ||
    valueImages === null ||
    Array.isArray(valueImages)
  ) {
    return undefined;
  }
  const valueSet = new Set(values);
  const out: Record<string, string[]> = {};
  for (const [value, urls] of Object.entries(
    valueImages as Record<string, unknown>
  )) {
    if (!valueSet.has(value) || !Array.isArray(urls)) continue;
    const clean = urls.filter(
      (u): u is string =>
        typeof u === "string" &&
        u.length > 0 &&
        u.length <= 2000 &&
        /^https?:\/\//.test(u)
    );
    if (clean.length > 0) out[value] = clean;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/_lib/__tests__/product-images.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `updateProductVariants`**

W `app/admin/produkty/actions.ts`:

(a) rozszerz istniejący import z `@/app/_lib/product-images` (linia 14):

```ts
import { imageUrlsToDelete, cleanValueImages } from "@/app/_lib/product-images";
```

(b) w pętli walidacyjnej `for (const opt of variants.options)` — po bloku walidacji `value_prices`, przed walidacją `filterable` — dodaj:

```ts
      if (opt.value_images !== undefined) {
        if (
          typeof opt.value_images !== "object" ||
          opt.value_images === null ||
          Array.isArray(opt.value_images)
        ) {
          return { ok: false, error: "Nieprawidłowa struktura zdjęć wartości" };
        }
      }
```

(c) zastąp linię `variantsToSave = { options: variants.options, overrides: variants.overrides };` (z komentarzem `// Zapisujemy tylko opcje + overrides.`) przez:

```ts
    // Zapisujemy tylko opcje + overrides. value_images czyszczone serwerowo:
    // tylko istniejące wartości, tylko URL-e http(s), bez pustych tablic —
    // klient wysyła stan edytora, akcja jest źródłem prawdy.
    const cleanedOptions = variants.options.map((opt) => {
      const { value_images: rawValueImages, ...rest } = opt;
      const value_images = cleanValueImages(opt.values, rawValueImages);
      return { ...rest, ...(value_images ? { value_images } : {}) };
    });
    variantsToSave = { options: cleanedOptions, overrides: variants.overrides };
```

- [ ] **Step 6: Typecheck + full unit tests**

Run: `npx tsc --noEmit` (przy błędach z `.next/types` → usuń `.next`, powtórz)
Run: `npm test`
Expected: zielono.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/product-images.ts app/_lib/__tests__/product-images.test.ts "app/admin/produkty/actions.ts"
git commit -m "feat(warianty): serwerowe czyszczenie value_images w updateProductVariants

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Sprzątanie Storage przy usuwaniu produktu (galeria + value_images)

**Files:**
- Modify: `app/_lib/product-images.ts` (nowy czysty helper `collectProductImageUrls`)
- Modify: `app/admin/produkty/actions.ts:306-383` (akcja `deleteProduct`)
- Test: `app/_lib/__tests__/product-images.test.ts`

**Interfaces:**
- Consumes: kształt `value_images` z Taska 1; istniejący `imageUrlsToDelete(targetImages, otherProductsImages)`.
- Produces: `collectProductImageUrls(images: unknown, variants: unknown): string[]` — wszystkie URL-e zdjęć produktu (galeria + value_images), odporny na śmieciowe kształty z DB.

Kontekst: `deleteProduct` już dziś pobiera `variants` w selekcie (`select("name, images, variants")`, linia ~317) i komentarz twierdzi „Czyścimy też zdjęcia variantów" — ale kod używa tylko `images`. Ten task urealnia komentarz.

- [ ] **Step 1: Write the failing tests**

Dopisz na końcu `app/_lib/__tests__/product-images.test.ts` (rozszerz import o `collectProductImageUrls`):

```ts
import {
  imageUrlsToDelete,
  cleanValueImages,
  collectProductImageUrls,
} from "@/app/_lib/product-images";
```

(zastępując linię importu), a na końcu pliku:

```ts
describe("collectProductImageUrls — galeria + zdjęcia wartości opcji", () => {
  it("łączy galerię i value_images wszystkich opcji (kolejność: galeria, potem opcje)", () => {
    expect(
      collectProductImageUrls(["g.jpg"], {
        options: [
          { name: "Tkanina", values: ["A"], value_images: { A: ["a1.jpg", "a2.jpg"] } },
          { name: "Strona", values: ["L"], value_images: { L: ["l.jpg"] } },
        ],
      })
    ).toEqual(["g.jpg", "a1.jpg", "a2.jpg", "l.jpg"]);
  });
  it("znosi śmieciowe kształty (null / nie-tablice / nie-stringi)", () => {
    expect(collectProductImageUrls(null, null)).toEqual([]);
    expect(
      collectProductImageUrls([42, "g.jpg"], {
        options: [{ name: "X", values: ["A"], value_images: { A: "nope" } }],
      })
    ).toEqual(["g.jpg"]);
  });
  it("variants bez value_images → sama galeria", () => {
    expect(
      collectProductImageUrls(["g.jpg"], {
        options: [{ name: "Kolor", values: ["Beż"] }],
      })
    ).toEqual(["g.jpg"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/_lib/__tests__/product-images.test.ts`
Expected: FAIL — `collectProductImageUrls is not a function`.

- [ ] **Step 3: Implement `collectProductImageUrls`**

Dopisz na końcu `app/_lib/product-images.ts`:

```ts
// Wszystkie URL-e zdjęć produktu: galeria (images) + zdjęcia wartości opcji
// (variants.options[].value_images). Do czyszczenia Storage przy usuwaniu
// produktu (deleteProduct). Przyjmuje unknown — dane prosto z DB (JSONB może
// mieć dowolny kształt), śmieci są pomijane.
export function collectProductImageUrls(
  images: unknown,
  variants: unknown
): string[] {
  const out: string[] = [];
  if (Array.isArray(images)) {
    for (const u of images) {
      if (typeof u === "string" && u) out.push(u);
    }
  }
  const options = (variants as { options?: unknown } | null)?.options;
  if (Array.isArray(options)) {
    for (const opt of options) {
      const vi = (opt as { value_images?: unknown } | null)?.value_images;
      if (typeof vi !== "object" || vi === null || Array.isArray(vi)) continue;
      for (const urls of Object.values(vi)) {
        if (!Array.isArray(urls)) continue;
        for (const u of urls) {
          if (typeof u === "string" && u) out.push(u);
        }
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/_lib/__tests__/product-images.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `deleteProduct`**

W `app/admin/produkty/actions.ts`:

(a) rozszerz import:

```ts
import {
  imageUrlsToDelete,
  cleanValueImages,
  collectProductImageUrls,
} from "@/app/_lib/product-images";
```

(b) w `deleteProduct` rozszerz typ `productRow` (linia ~344) o `variants`:

```ts
  const productRow = product as {
    name: string;
    images: string[] | null;
    variants: unknown;
  };
```

(c) zastąp blok liczenia `targetImages` (linie ~362-364):

```ts
  const targetImages = collectProductImageUrls(productRow.images, productRow.variants);
```

(d) w bloku `if (targetImages.length > 0)` zmień select innych produktów i mapowanie:

```ts
    const { data: others } = await supabase
      .from("products")
      .select("images, variants")
      .neq("id", id);
    const otherImages = (
      (others ?? []) as { images: string[] | null; variants: unknown }[]
    ).map((r) => collectProductImageUrls(r.images, r.variants));
```

(`urlsToDelete = imageUrlsToDelete(targetImages, otherImages)` i reszta bez zmian — ochrona URL-i współdzielonych działa teraz także dla zdjęć wariantów.)

- [ ] **Step 6: Typecheck + full unit tests**

Run: `npx tsc --noEmit`
Run: `npm test`
Expected: zielono.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/product-images.ts app/_lib/__tests__/product-images.test.ts "app/admin/produkty/actions.ts"
git commit -m "feat(warianty): deleteProduct czyści ze Storage też zdjęcia value_images

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Admin UI — panel zdjęć per wartość w edytorze wariantów

**Files:**
- Create: `app/admin/produkty/[id]/ValueImagesPanel.tsx`
- Modify: `app/admin/produkty/[id]/VariantsEditor.tsx`

**Interfaces:**
- Consumes: `useImageUpload` (`app/admin/produkty/[id]/useImageUpload.ts` — daje `inputProps`/`dropProps`/`uploading`/`progressText`/`isDragging`), typ `Toast` z `./_shared`, `ProductOption.value_images` z Taska 1, akcja z Taska 2.
- Produces: UI admina; brak nowych API dla innych tasków.

To task czysto UI — w tym repo komponenty React nie mają testów jednostkowych (testowana jest czysta logika w `_lib`); weryfikacja = tsc + istniejące testy + klik-test w Tasku 8.

- [ ] **Step 1: Create `ValueImagesPanel.tsx`**

Nowy plik `app/admin/produkty/[id]/ValueImagesPanel.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useImageUpload } from "./useImageUpload";
import type { Toast } from "./_shared";

// Panel zdjęć jednej wartości opcji wariantu — rozwijany pod wierszem wartości
// w VariantsEditor: miniatury z usuwaniem + upload (multi-select i drag&drop,
// przez wspólny useImageUpload → uploadProductImage). Stan trzyma rodzic
// (VariantsEditor) — utrwalenie dopiero przyciskiem „Zapisz warianty".
export default function ValueImagesPanel({
  value,
  urls,
  onAdd,
  onRemove,
  onToast,
}: {
  value: string;
  urls: string[];
  onAdd: (urls: string[]) => void;
  onRemove: (url: string) => void;
  onToast: (t: Toast) => void;
}) {
  const upload = useImageUpload({
    onUploaded: onAdd,
    onToast,
    successHint: "Kliknij „Zapisz warianty” żeby utrwalić.",
  });

  return (
    <div
      {...upload.dropProps}
      className={`flex flex-col gap-2 p-3 bg-[var(--bg)] border border-dashed rounded-lg transition-colors ${
        upload.isDragging ? "border-[var(--color-gold)]" : "border-[var(--border)]"
      }`}
    >
      {urls.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {urls.map((url) => (
            <li
              key={url}
              className="relative w-16 h-16 rounded-lg overflow-hidden border border-[var(--border)]"
            >
              <Image
                src={url}
                alt={`Zdjęcie wartości ${value}`}
                fill
                sizes="64px"
                className="object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(url)}
                aria-label={`Usuń zdjęcie wartości ${value}`}
                className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors"
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <label
        className={`self-start px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors cursor-pointer ${
          upload.uploading ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {upload.progressText ?? "+ Dodaj zdjęcia"}
        <input {...upload.inputProps} className="hidden" />
      </label>
      <p className="text-[11px] text-[var(--muted)]">
        Zdjęcia tej wartości pokażą się na początku galerii, gdy klient ją
        wybierze na karcie produktu. Możesz też przeciągnąć pliki tutaj.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Add state mutations in `VariantsEditor.tsx`**

Po funkcji `setValuePrice` (linia ~144) dodaj dwie funkcje:

```ts
  // Dodaj wgrane zdjęcia do wartości opcji (dopisywane na koniec, bez duplikatów).
  function addValueImages(optIdx: number, value: string, urls: string[]) {
    if (!variants) return;
    const nextOptions = variants.options.map((o, i) => {
      if (i !== optIdx) return o;
      const current = o.value_images?.[value] ?? [];
      const merged = [...current, ...urls.filter((u) => !current.includes(u))];
      return { ...o, value_images: { ...(o.value_images ?? {}), [value]: merged } };
    });
    setVariants({ ...variants, options: nextOptions });
  }

  // Usuń zdjęcie wartości (pusta lista → wpis znika; pusta mapa → klucz znika).
  function removeValueImage(optIdx: number, value: string, url: string) {
    if (!variants) return;
    const nextOptions = variants.options.map((o, i) => {
      if (i !== optIdx) return o;
      const nextImages = { ...(o.value_images ?? {}) };
      const kept = (nextImages[value] ?? []).filter((u) => u !== url);
      if (kept.length > 0) nextImages[value] = kept;
      else delete nextImages[value];
      return {
        ...o,
        value_images: Object.keys(nextImages).length > 0 ? nextImages : undefined,
      };
    });
    setVariants({ ...variants, options: nextOptions });
  }
```

- [ ] **Step 3: Drop images of removed values in `removeValue`**

Zastąp istniejącą funkcję `removeValue` (linie ~114-128):

```ts
  function removeValue(optIdx: number, value: string) {
    if (!variants) return;
    const nextOptions = variants.options.map((o, i) => {
      if (i !== optIdx) return o;
      // Usuń też ewentualną dopłatę i zdjęcia tej wartości.
      const nextPrices = { ...(o.value_prices ?? {}) };
      delete nextPrices[value];
      const nextImages = { ...(o.value_images ?? {}) };
      delete nextImages[value];
      return {
        ...o,
        values: o.values.filter((v) => v !== value),
        value_prices: Object.keys(nextPrices).length > 0 ? nextPrices : undefined,
        value_images: Object.keys(nextImages).length > 0 ? nextImages : undefined,
      };
    });
    setVariants({ ...variants, options: nextOptions });
  }
```

- [ ] **Step 4: Keep `value_images` of surviving values in `save()`**

W `save()` w bloku `cleanOptions` — po bloku liczącym `value_prices`, przed `return` — dodaj analogiczny blok i rozszerz zwracany obiekt:

```ts
            let value_images: Record<string, string[]> | undefined;
            if (o.value_images) {
              const keptImages: Record<string, string[]> = {};
              for (const v of values) {
                const imgs = o.value_images[v];
                if (Array.isArray(imgs) && imgs.length > 0) keptImages[v] = imgs;
              }
              if (Object.keys(keptImages).length > 0) value_images = keptImages;
            }
            return {
              name: o.name.trim(),
              values,
              ...(value_prices ? { value_prices } : {}),
              ...(value_images ? { value_images } : {}),
              ...(o.filterable ? { filterable: true } : {}),
            };
```

- [ ] **Step 5: Wire panel into `OptionRow`**

(a) Import na górze `VariantsEditor.tsx`:

```ts
import ValueImagesPanel from "./ValueImagesPanel";
```

(b) W wywołaniu `<OptionRow ...>` (linia ~317) dodaj propsy:

```tsx
          <OptionRow
            key={i}
            option={opt}
            onNameChange={(name) => setOptionName(i, name)}
            onAddValue={(v) => addValue(i, v)}
            onRemoveValue={(v) => removeValue(i, v)}
            onSetValuePrice={(v, p) => setValuePrice(i, v, p)}
            onRemoveOption={() => removeOption(i)}
            onToggleFilterable={(v) => setOptionFilterable(i, v)}
            onAddValueImages={(v, urls) => addValueImages(i, v, urls)}
            onRemoveValueImage={(v, url) => removeValueImage(i, v, url)}
            onToast={onToast}
          />
```

(c) W definicji `OptionRow` rozszerz propsy (sygnatura + destrukturyzacja):

```ts
function OptionRow({
  option,
  onNameChange,
  onAddValue,
  onRemoveValue,
  onSetValuePrice,
  onRemoveOption,
  onToggleFilterable,
  onAddValueImages,
  onRemoveValueImage,
  onToast,
}: {
  option: ProductOption;
  onNameChange: (name: string) => void;
  onAddValue: (v: string) => void;
  onRemoveValue: (v: string) => void;
  onSetValuePrice: (value: string, price: number | null) => void;
  onRemoveOption: () => void;
  onToggleFilterable: (v: boolean) => void;
  onAddValueImages: (value: string, urls: string[]) => void;
  onRemoveValueImage: (value: string, url: string) => void;
  onToast: (t: Toast) => void;
}) {
```

(d) W `OptionRow` dodaj stan rozwiniętego panelu (obok `newValue`):

```ts
  const [imagesFor, setImagesFor] = useState<string | null>(null);
```

(e) Zastąp render pojedynczego wiersza wartości (`{option.values.map((v) => (...))}`, linie ~458-491) wersją z przyciskiem 📷 i panelem pod wierszem:

```tsx
          {option.values.map((v) => {
            const imgCount = option.value_images?.[v]?.length ?? 0;
            return (
              <div key={v} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg px-3 py-1.5">
                  <span className="flex-1 text-sm truncate">{v}</span>
                  <button
                    type="button"
                    onClick={() => setImagesFor(imagesFor === v ? null : v)}
                    aria-expanded={imagesFor === v}
                    aria-label={`Zdjęcia wartości ${v} (${imgCount})`}
                    title="Zdjęcia tej wartości"
                    className={`shrink-0 px-2 py-1 text-[11px] font-sans rounded-full border transition-colors ${
                      imagesFor === v || imgCount > 0
                        ? "border-[var(--color-gold)] text-[var(--color-gold-text)]"
                        : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold-text)]"
                    }`}
                  >
                    📷{imgCount > 0 ? ` ${imgCount}` : ""}
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-[var(--muted)]">+</span>
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={option.value_prices?.[v] ?? ""}
                      onChange={(e) =>
                        onSetValuePrice(v, e.target.value === "" ? null : Number(e.target.value))
                      }
                      placeholder="0"
                      aria-label={`Dopłata za ${v} (zł)`}
                      className="w-20 px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-right focus:border-[var(--color-gold)] focus:outline-none"
                    />
                    <span className="text-xs text-[var(--muted)]">zł</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveValue(v)}
                    aria-label={`Usuń ${v}`}
                    className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-950 text-red-600 shrink-0"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {imagesFor === v && (
                  <ValueImagesPanel
                    value={v}
                    urls={option.value_images?.[v] ?? []}
                    onAdd={(urls) => onAddValueImages(v, urls)}
                    onRemove={(url) => onRemoveValueImage(v, url)}
                    onToast={onToast}
                  />
                )}
              </div>
            );
          })}
```

(Zmiany vs oryginał: wiersz opakowany w `<div key={v}>` z kolumną, dodany przycisk 📷 po nazwie wartości, panel pod wierszem. Input dopłaty i przycisk usuwania bez zmian.)

- [ ] **Step 6: Update section copy**

W `VariantsEditor.tsx` zastąp akapit opisu sekcji (linia ~301-303):

```tsx
      <p className="text-sm text-[var(--muted)] max-w-2xl">
        Dodaj opcje (np. „Kolor”, „Tkanina”, „Strona”) i ich wartości — klient wybiera po jednej wartości z każdej opcji. Przy wartości możesz ustawić dopłatę „+zł” (np. droższa tkanina) oraz zdjęcia (📷) — pokażą się na początku galerii, gdy klient wybierze tę wartość. Stan magazynowy i cena promocyjna są wspólne dla całego produktu — ustawiasz je w „Podstawowych danych”; globalna galeria w „Zdjęciach produktu” wyżej.
      </p>
```

- [ ] **Step 7: Typecheck + tests**

Run: `npx tsc --noEmit`
Run: `npm test`
Expected: zielono.

- [ ] **Step 8: Commit**

```bash
git add "app/admin/produkty/[id]/ValueImagesPanel.tsx" "app/admin/produkty/[id]/VariantsEditor.tsx"
git commit -m "feat(warianty): panel zdjęć per wartość opcji w edytorze wariantów

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Koszyk — pozycja dostaje zdjęcie wybranego wariantu

**Files:**
- Modify: `app/_components/ui/AddToCartButton.tsx:49-60`

**Interfaces:**
- Consumes: `getVariantImages` z Taska 1 (pierwszy element = zdjęcie wariantowe gdy wybrane, inaczej pierwsze zdjęcie produktu).
- Produces: `CartItem.image` wariantowo-świadome; brak zmian typów.

- [ ] **Step 1: Use variant-aware image in `handleAdd`**

(a) Import na górze `AddToCartButton.tsx`:

```ts
import { getVariantImages } from "@/app/_lib/variants";
```

(b) W `handleAdd` zastąp linię `image: product.images?.[0] ?? "",`:

```ts
      // Zdjęcie pozycji = pierwsze zdjęcie aktualnej galerii (wariantowe, gdy
      // wybrana wartość ma value_images; inaczej pierwsze zdjęcie produktu).
      image: getVariantImages(product, selectedValues ?? {})[0] ?? "",
```

(Wariant compact/quick-add nie ma wyboru — `selectedValues` puste → zachowanie jak dotychczas.)

- [ ] **Step 2: Typecheck + tests**

Run: `npx tsc --noEmit`
Run: `npm test`
Expected: zielono (logika pokryta testami `getVariantImages` z Taska 1).

- [ ] **Step 3: Commit**

```bash
git add app/_components/ui/AddToCartButton.tsx
git commit -m "feat(warianty): zdjęcie wariantu w pozycji koszyka

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: `minBundlePricing` — cennik zestawu (czysta logika)

**Files:**
- Modify: `app/_lib/bundles.ts:134-143` (nowy helper + refaktor `minBundleSavings`)
- Test: `app/_lib/__tests__/bundles.test.ts`

**Interfaces:**
- Consumes: istniejący `computeBundleDiscount(base, qty, type, value)` i `BundleDiscountType`.
- Produces: `minBundlePricing(componentBasePrices: number[], type: BundleDiscountType, value: number): { base: number; discounted: number; savings: number }` — Task 7 (BundleOffer) używa wszystkich trzech pól. `minBundleSavings` zachowuje sygnaturę (używane w innych miejscach).

- [ ] **Step 1: Write the failing tests**

W `app/_lib/__tests__/bundles.test.ts` rozszerz import o `minBundlePricing` i dopisz na końcu pliku:

```ts
describe("minBundlePricing", () => {
  it("percent: baza, cena po rabacie i oszczędność", () => {
    expect(minBundlePricing([3000, 2200], "percent", 10)).toEqual({
      base: 5200,
      discounted: 4680,
      savings: 520,
    });
  });
  it("amount: rabat kwotowy z clampem do bazy (cena nie spada poniżej 0)", () => {
    expect(minBundlePricing([300, 200], "amount", 10000)).toEqual({
      base: 500,
      discounted: 0,
      savings: 500,
    });
  });
  it("grosze zaokrąglane do 2 miejsc", () => {
    // Jednoelementowa baza — bez sumowania floatów w asercie (99.99+100
    // w double nie musi być dokładnie 199.99).
    expect(minBundlePricing([199.99], "percent", 33)).toEqual({
      base: 199.99,
      discounted: 133.99,
      savings: 66,
    });
  });
  it("spójny z minBundleSavings", () => {
    expect(minBundlePricing([3000, 2200], "percent", 10).savings).toBe(
      minBundleSavings([3000, 2200], "percent", 10)
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/_lib/__tests__/bundles.test.ts`
Expected: FAIL — brak eksportu `minBundlePricing`.

- [ ] **Step 3: Implement**

W `app/_lib/bundles.ts` zastąp blok `minBundleSavings` (linie 134-143, wraz z komentarzem) przez:

```ts
// Cennik zestawu na kartę produktu: suma bazowych cen efektywnych składników
// (bez dopłat opcji, qty=1 — stąd „od" w UI), cena po rabacie i oszczędność.
// discounted zaokrąglone do groszy (savings zaokrągla computeBundleDiscount).
export function minBundlePricing(
  componentBasePrices: number[],
  type: BundleDiscountType,
  value: number
): { base: number; discounted: number; savings: number } {
  const base = componentBasePrices.reduce((s, p) => s + p, 0);
  const savings = computeBundleDiscount(base, 1, type, value);
  return {
    base,
    discounted: Math.round((base - savings) * 100) / 100,
    savings,
  };
}

// „Oszczędzasz od X zł" na kartach produktów: minimalny rabat od sumy
// bazowych cen efektywnych składników (patrz minBundlePricing).
export function minBundleSavings(
  componentBasePrices: number[],
  type: BundleDiscountType,
  value: number
): number {
  return minBundlePricing(componentBasePrices, type, value).savings;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/_lib/__tests__/bundles.test.ts`
Expected: PASS (także istniejące testy `minBundleSavings`).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/bundles.ts app/_lib/__tests__/bundles.test.ts
git commit -m "feat(zestawy): minBundlePricing — baza/cena po rabacie/oszczędność zestawu

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Przebudowa `BundleOffer` — skład zestawu z linkami + i18n

**Files:**
- Modify: `app/_lib/dictionaries/pl.ts` (typ `PlShape` sekcja `bundle` ~linia 130 + wartości ~linia 459)
- Modify: `app/_lib/dictionaries/de.ts` (sekcja `bundle` ~linia 140)
- Modify: `app/_components/ui/BundleOffer.tsx` (pełna przebudowa renderu)

**Interfaces:**
- Consumes: `minBundlePricing` z Taska 6; istniejące `effectivePrice`, `formatMoney(pln, locale, rate)`, `LocalizedLink` (dokleja prefiks `/de`), `Modal`, `BundleConfigurator`; komponenty zestawu są już zlokalizowane serwerowo (`localizeProduct` w `bundles-server.ts`) — `p.name` jest DE na /de.
- Produces: nowe klucze słownika `t.bundle.thisProduct`, `t.bundle.bundlePriceFrom`; UI boxu. Propsy `BundleOffer` BEZ zmian (`bundles`, `currentProduct`, `selected`) — `ProductMainSection.tsx:162` nie wymaga zmian.

- [ ] **Step 1: Add dictionary keys**

(a) `app/_lib/dictionaries/pl.ts` — w TYPIE `PlShape`, sekcja `bundle` (po `promoExcluded: string;`):

```ts
    thisProduct: string;
    bundlePriceFrom: string;
```

(b) `pl.ts` — w WARTOŚCIACH obiektu `pl`, sekcja `bundle` (po `promoExcluded: ...`):

```ts
    thisProduct: "ten produkt",
    bundlePriceFrom: "Cena zestawu: od",
```

(c) `app/_lib/dictionaries/de.ts` — sekcja `bundle` (po `promoExcluded: ...`):

```ts
    thisProduct: "dieses Produkt",
    bundlePriceFrom: "Set-Preis: ab",
```

- [ ] **Step 2: Run dictionary tests**

Run: `npx vitest run app/_lib/__tests__/dictionaries.test.ts`
Expected: PASS (typ wymusza spójność; DE jest DeepPartial — nadpisania kompletne).

- [ ] **Step 3: Rewrite `BundleOffer.tsx`**

Zastąp CAŁĄ zawartość `app/_components/ui/BundleOffer.tsx`:

```tsx
"use client";

// Box „Kup w zestawie" na karcie produktu — widoczny od razu (pod
// ProductActions). Max 3 zestawy; pokazuje PEŁNY skład zestawu (miniatura +
// nazwa + cena „od" per składnik) — składniki inne niż bieżący produkt
// linkują bezpośrednio na ich karty, bieżący oznaczony „ten produkt".
// Pod składem: cena zestawu po rabacie (przekreślona suma) + oszczędność.
// „Kup w zestawie" otwiera modal z konfiguratorem, „Zobacz zestaw" prowadzi
// na stronę zestawu. Modal reużywa wspólny shell `Modal` (useModal:
// scroll-lock tła, Escape, focus-trap) — spójnie z InquiryModal.

import { useState } from "react";
import Image from "next/image";
import type { BundleWithComponents, Product } from "@/app/_lib/types";
import { effectivePrice } from "@/app/_lib/pricing";
import { minBundlePricing } from "@/app/_lib/bundles";
import BundleConfigurator from "./BundleConfigurator";
import LocalizedLink from "./LocalizedLink";
import { Modal } from "./Modal";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { formatMoney } from "@/app/_lib/money";
import { useEurRate } from "@/app/_lib/rate-context";

export default function BundleOffer({
  bundles,
  currentProduct,
  selected,
}: {
  bundles: BundleWithComponents[];
  currentProduct: Product;
  // Aktualnie wybrane opcje bieżącego produktu (z ProductMainSection) —
  // pre-wypełniają jego konfigurację w modalu.
  selected: Record<string, string>;
}) {
  const locale = useClientLocale();
  const rate = useEurRate();
  const t = getDictionary(locale);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  if (bundles.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {bundles.map((b) => {
        const pricing = minBundlePricing(
          b.components.map((p) => effectivePrice(Number(p.price), p.sale_price)),
          b.discount_type,
          Number(b.discount_value)
        );
        return (
          <div
            key={b.id}
            className="p-5 border-2 border-[var(--color-gold)]/50 rounded-2xl bg-[var(--card-bg)] flex flex-col gap-3"
          >
            <p className="font-sans text-xs uppercase tracking-[0.25em] text-[var(--color-gold-text)]">
              {t.bundle.badge}
            </p>
            <p className="text-sm text-[var(--fg)] font-semibold">{b.name}</p>

            {/* Skład zestawu: każdy składnik z miniaturą, nazwą i ceną „od";
                bieżący produkt bez linku (oznaczony), pozostałe klikalne. */}
            <ul className="flex flex-col">
              {b.components.map((p, i) => {
                const isCurrent = p.id === currentProduct.id;
                const price = effectivePrice(Number(p.price), p.sale_price);
                const row = (
                  <div className="flex items-center gap-3 py-1.5">
                    <Image
                      src={p.images?.[0] ?? "/placeholder.jpg"}
                      alt={p.name}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-lg object-cover border border-[var(--border)] shrink-0"
                    />
                    <span className="flex-1 min-w-0 text-sm text-[var(--fg)] line-clamp-2">
                      {p.name}
                      {isCurrent && (
                        <span className="ml-2 text-[10px] font-sans uppercase tracking-widest text-[var(--muted)] whitespace-nowrap">
                          ({t.bundle.thisProduct})
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm text-[var(--muted)]">
                      {formatMoney(price, locale, rate)}
                    </span>
                    {!isCurrent && (
                      <span aria-hidden className="shrink-0 text-[var(--muted)]">
                        →
                      </span>
                    )}
                  </div>
                );
                return (
                  <li key={p.id}>
                    {i > 0 && (
                      <div
                        aria-hidden
                        className="pl-5 text-[var(--muted)] text-sm leading-none"
                      >
                        +
                      </div>
                    )}
                    {isCurrent ? (
                      row
                    ) : (
                      <LocalizedLink
                        href={`/produkt/${p.id}`}
                        aria-label={p.name}
                        className="block rounded-lg -mx-2 px-2 hover:bg-[var(--bg)] transition-colors"
                      >
                        {row}
                      </LocalizedLink>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="pt-3 border-t border-[var(--border)] flex flex-col gap-1">
              <p className="text-sm text-[var(--fg)]">
                {t.bundle.bundlePriceFrom}{" "}
                <strong className="font-sans">
                  {formatMoney(pricing.discounted, locale, rate)}
                </strong>{" "}
                <span className="text-[var(--muted)] line-through">
                  {formatMoney(pricing.base, locale, rate)}
                </span>
              </p>
              <p className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">
                {t.bundle.savesFrom} {formatMoney(pricing.savings, locale, rate)}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setOpenSlug(b.slug)}
                className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans text-xs font-semibold uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
              >
                {t.bundle.buy}
              </button>
              <LocalizedLink
                href={`/zestaw/${b.slug}`}
                className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
              >
                {t.bundle.see} →
              </LocalizedLink>
            </div>

            <Modal
              open={openSlug === b.slug}
              onClose={() => setOpenSlug(null)}
              ariaLabel={b.name}
              eyebrow={t.bundle.badge}
              heading={b.name}
              closeLabel={t.common.close}
            >
              <BundleConfigurator
                bundle={b}
                initialSelections={{ [currentProduct.id]: selected }}
                onAdded={() => setOpenSlug(null)}
              />
            </Modal>
          </div>
        );
      })}
    </div>
  );
}
```

(Usunięty import `minBundleSavings` — zastąpiony `minBundlePricing`. Przyciski, Modal i propsy bez zmian. Klucz słownika `t.bundle.withProducts` przestaje być używany w tym komponencie — NIE usuwaj go ze słownika, może być używany gdzie indziej.)

- [ ] **Step 4: Typecheck + full tests**

Run: `npx tsc --noEmit`
Run: `npm test`
Expected: zielono.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts app/_components/ui/BundleOffer.tsx
git commit -m "feat(zestawy): pełny skład zestawu z linkami i cenami w boxie na karcie produktu

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Weryfikacja końcowa (build + smoke)

**Files:** brak zmian kodu (chyba że coś się wysypie).

- [ ] **Step 1: Full test suite + lint + build**

Run: `npm test` — Expected: wszystkie testy PASS (587+ nowe).
Run: `npm run lint` — Expected: bez errorów.
Run: `npm run build` — Expected: build OK (łapie błędy split pure/server, których nie widzi vitest).

- [ ] **Step 2: Smoke lokalny (dev, ręcznie lub przez skill superpowers:verification-before-completion / verify)**

⚠️ localhost używa TEJ SAMEJ bazy Supabase co PROD — do testu edycji użyj produktu testowego/nieaktywnego, a zapisane zmiany COFNIJ po teście.

Checklist:
1. `/admin/produkty/[id]` → Warianty: przy wartości opcji przycisk 📷; klik rozwija panel; upload (wybór plików i drag&drop) dodaje miniatury; krzyżyk usuwa; „Zapisz warianty" utrwala (licznik 📷 N po odświeżeniu).
2. Karta produktu `/produkt/[id]`: wybór wartości ze zdjęciami → zdjęcia wariantu na początku galerii (główne zdjęcie się zmienia); wybór wartości bez zdjęć → galeria jak dotychczas.
3. Dodanie do koszyka z wybranym wariantem ze zdjęciami → pozycja w koszyku ma zdjęcie wariantu.
4. Karta produktu będącego w zestawie: box pokazuje wszystkie składniki z miniaturami i cenami; bieżący produkt oznaczony „(ten produkt)" i nieklikalny; pozostałe linkują na `/produkt/[id]`; cena zestawu po rabacie + przekreślona suma + „Oszczędzasz od"; „Kup w zestawie" (modal) i „Zobacz zestaw" działają jak dotychczas.
5. To samo na `/de/produkt/[id]`: ceny w EUR, teksty DE („dieses Produkt", „Set-Preis: ab"), linki składników z prefiksem `/de`.
6. Cofnij testowe zmiany danych (usuń testowe zdjęcia wariantu, zapisz).

- [ ] **Step 3: Zakończenie gałęzi**

Użyj skilla `superpowers:finishing-a-development-branch` (opcje: merge do main / PR). Domyślnie w tym repo: PR na GitHub (`gh pr create`) z checklistą klik-testów dla Mikołaja, jak w PR #58-63.

---

## Spec coverage (self-check)

| Wymaganie specu | Task |
|---|---|
| `value_images` w `ProductOption` (JSONB, bez migracji) | 1 |
| Galeria: wariantowe na początku + dedup + fallback | 1 |
| Walidacja/pruning serwerowy w `updateProductVariants` | 2 |
| Sprzątanie Storage przy usunięciu produktu (z ochroną współdzielonych) | 3 |
| Parytet z galerią: brak kasowania plików przy edycji | (zachowanie domyślne — nic nie robimy) |
| Admin: panel 📷 per wartość, upload multi + drag&drop, usuwanie, zapis „Zapisz warianty" | 4 |
| Pruning `value_images` przy usuwaniu wartości/opcji w edytorze | 4 |
| Koszyk: zdjęcie wariantu w pozycji | 5 |
| Helper cenowy zestawu (czysty, testowany) | 6 |
| Box: pełny skład, miniatury, ceny „od", linki, „ten produkt", suma przekreślona, cena po rabacie, oszczędność, przyciski bez zmian | 7 |
| i18n `thisProduct`/`bundlePriceFrom` PL+DE | 7 |
| Kryteria akceptacji 1-5 | 8 (smoke) |
