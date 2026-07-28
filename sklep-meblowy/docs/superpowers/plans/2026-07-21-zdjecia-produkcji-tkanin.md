# Zdjęcia z produkcji na stronie tkaniny — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strona tkaniny zamiast bezsensownego linku „Zobacz produkty z tą tkaniną" pokazuje sekcję „Ta tkanina na naszych meblach" — ręcznie wgrywane zdjęcia z produkcji, opcjonalnie podpięte pod produkt (klikalna karta → `/produkt/[id]`).

**Architecture:** Kolumna JSONB `fabrics.production_photos` (tablica `{url, product_id|null}`, wzorzec `color_images`). Czysty parser w `app/_lib/fabric-production-photos.ts` (testowalny), zapis w akcjach admina z serwerową walidacją `product_id`, wiersze w formularzu tkaniny (upload + szukajka produktu przez datalist), sekcja na `/tkaniny/[slug]` z lookupem podpiętych produktów jednym zapytaniem. Spec: `docs/superpowers/specs/2026-07-21-zdjecia-produkcji-tkanin-design.md`.

**Tech Stack:** Next.js App Router (ZMODYFIKOWANY — patrz Global Constraints), Supabase, vitest, Tailwind (tokeny `var(--...)`).

## Global Constraints

- Repo root `sklep-meblowy/`, apka w `sklep-meblowy/sklep-meblowy/` — wszystkie ścieżki względem WEWNĘTRZNEGO folderu; komendy uruchamiaj stamtąd.
- `AGENTS.md`: zmodyfikowany Next.js — wzorce kopiować z istniejących stron/route'ów, nie z pamięci.
- Branch roboczy: `feat/zdjecia-produkcji-tkanin` (już istnieje, zawiera commit specu `e853cbb`; bazuje na main z PR #71/#72).
- Migracja `58_fabric_production_photos.sql` — NIE aplikować ręcznie przez MCP na etapie implementacji; weryfikacja po deployu przez `list_tables` (lekcja PR #71: auto-apply potrafi nie zadziałać — wtedy fallback MCP, ale to robi KONTROLER po merge).
- Weryfikacja per task: `npx tsc --noEmit` + `npm run lint` + `npm test`. NIE uruchamiać `npm run build`, gdy działa `next dev` (build tylko w Task 6).
- Teksty klienta PL + DE: klucz `fabrics.productionHeading` = PL „Ta tkanina na naszych meblach", DE „Dieser Stoff auf unseren Möbeln". Klucz `fabrics.seeProducts` USUWANY (PL typ+wartość, DE wartość).
- Twardy limit zdjęć per tkanina: `MAX_PRODUCTION_PHOTOS = 20` (nadmiar ucinany przy parsowaniu).
- Stopka commitów: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Push/PR: konto gh `Woodecky10`.

---

### Task 1: Migracja 58 + typy

**Files:**
- Create: `supabase/migrations/58_fabric_production_photos.sql`
- Modify: `app/_lib/types.ts` (nad typem `Fabric` + pole w `Fabric`)
- Modify: fixtury z literałami `Fabric` (znajdziesz przez `npx tsc --noEmit`; spodziewane: fabryka `fab()` w `app/_lib/__tests__/fabric-groups.test.ts`)

**Interfaces:**
- Produces: kolumna `fabrics.production_photos jsonb NOT NULL default '[]'`; typ `FabricProductionPhoto = { url: string; product_id: string | null }`; pole `Fabric.production_photos: FabricProductionPhoto[]`.

- [ ] **Step 1: Migracja**

Utwórz `supabase/migrations/58_fabric_production_photos.sql`:

```sql
-- Migracja 58: zdjęcia z produkcji na tkaninie (spec 2026-07-21-zdjecia-produkcji-tkanin).
-- production_photos = tablica {url, product_id|null}; kolejność = kolejność w tablicy.
-- JSONB jak color_images (bez FK) — martwe product_id (produkt usunięty) obsługiwane
-- przy renderze (zdjęcie bez linku).
alter table public.fabrics
  add column if not exists production_photos jsonb not null default '[]'::jsonb;
```

- [ ] **Step 2: Typy**

W `app/_lib/types.ts`, bezpośrednio NAD typem `Fabric`, dodaj:

```ts
// Zdjęcie z produkcji na stronie tkaniny (migracja 58) — mebel uszyty w tej
// tkaninie. product_id opcjonalnie linkuje do produktu (klikalna karta);
// null / produkt nieaktywny → samo zdjęcie bez linku.
export type FabricProductionPhoto = {
  url: string;
  product_id: string | null;
};
```

W typie `Fabric`, po polu `description_de: string | null;`, dodaj:

```ts
  // Zdjęcia z produkcji (kolejność = kolejność w tablicy; max 20 w adminie).
  production_photos: FabricProductionPhoto[];
```

- [ ] **Step 3: Fixtury**

Run: `npx tsc --noEmit`
Każdy failujący literał `Fabric` w testach uzupełnij polem `production_photos: [],`.
Run ponownie: `npx tsc --noEmit` → brak błędów; `npm test` → PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/58_fabric_production_photos.sql app/_lib/types.ts app/_lib/__tests__/
git commit -m "feat(tkaniny): migracja production_photos + typ FabricProductionPhoto"
```

---

### Task 2: Czysty parser `parseProductionPhotos` (TDD)

**Files:**
- Create: `app/_lib/fabric-production-photos.ts`
- Test: Create `app/_lib/__tests__/fabric-production-photos.test.ts`

**Interfaces:**
- Consumes: `FabricProductionPhoto` (Task 1).
- Produces (Task 3): `parseProductionPhotos(input: unknown): FabricProductionPhoto[]`, `MAX_PRODUCTION_PHOTOS = 20`.

- [ ] **Step 1: Failujący test**

`app/_lib/__tests__/fabric-production-photos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseProductionPhotos, MAX_PRODUCTION_PHOTOS } from "../fabric-production-photos";

describe("parseProductionPhotos", () => {
  it("parsuje poprawne wiersze; puste/brak product_id → null", () => {
    const input = JSON.stringify([
      { url: "https://x.co/a.jpg", product_id: "p1" },
      { url: "http://x.co/b.jpg", product_id: "" },
      { url: "https://x.co/c.jpg" },
    ]);
    expect(parseProductionPhotos(input)).toEqual([
      { url: "https://x.co/a.jpg", product_id: "p1" },
      { url: "http://x.co/b.jpg", product_id: null },
      { url: "https://x.co/c.jpg", product_id: null },
    ]);
  });
  it("odrzuca wiersze bez URL http(s) i nie-obiekty", () => {
    const input = JSON.stringify([
      { url: "javascript:alert(1)", product_id: "p1" },
      { url: "/wzgledny.jpg" },
      "tekst",
      null,
      { product_id: "p2" },
    ]);
    expect(parseProductionPhotos(input)).toEqual([]);
  });
  it("zły JSON / nie-string / nie-tablica → []", () => {
    expect(parseProductionPhotos("nie json")).toEqual([]);
    expect(parseProductionPhotos(undefined)).toEqual([]);
    expect(parseProductionPhotos(JSON.stringify({ url: "https://x.co/a.jpg" }))).toEqual([]);
  });
  it("tnie do MAX_PRODUCTION_PHOTOS", () => {
    const rows = Array.from({ length: MAX_PRODUCTION_PHOTOS + 5 }, (_, i) => ({
      url: `https://x.co/${i}.jpg`,
    }));
    expect(parseProductionPhotos(JSON.stringify(rows))).toHaveLength(MAX_PRODUCTION_PHOTOS);
  });
});
```

- [ ] **Step 2: Potwierdź FAIL**

Run: `npx vitest run app/_lib/__tests__/fabric-production-photos.test.ts`
Expected: FAIL — moduł nie istnieje.

- [ ] **Step 3: Implementacja**

`app/_lib/fabric-production-photos.ts`:

```ts
// Zdjęcia z produkcji tkaniny — CZYSTY parser wierszy z formularza admina
// (hidden input production_photos_json). Wzorzec parseColorRows z
// app/admin/tkaniny/actions.ts: zły JSON → [], tylko URL-e http(s),
// product_id = niepusty string albo null, twardy limit wierszy.
import type { FabricProductionPhoto } from "./types";

export const MAX_PRODUCTION_PHOTOS = 20;

export function parseProductionPhotos(input: unknown): FabricProductionPhoto[] {
  if (typeof input !== "string") return [];
  let rows: unknown;
  try {
    rows = JSON.parse(input);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out: FabricProductionPhoto[] = [];
  for (const r of rows) {
    if (out.length >= MAX_PRODUCTION_PHOTOS) break;
    if (!r || typeof r !== "object") continue;
    const rec = r as { url?: unknown; product_id?: unknown };
    const url = typeof rec.url === "string" ? rec.url.trim() : "";
    if (!/^https?:\/\//.test(url)) continue;
    const pid = typeof rec.product_id === "string" ? rec.product_id.trim() : "";
    out.push({ url, product_id: pid === "" ? null : pid });
  }
  return out;
}
```

- [ ] **Step 4: PASS + commit**

Run: `npx vitest run app/_lib/__tests__/fabric-production-photos.test.ts` → PASS; `npm test` → PASS; `npx tsc --noEmit` → czysto.

```bash
git add app/_lib/fabric-production-photos.ts app/_lib/__tests__/fabric-production-photos.test.ts
git commit -m "feat(tkaniny): parseProductionPhotos — czysty parser zdjec z produkcji"
```

---

### Task 3: Zapis w akcjach admina + walidacja produktów

**Files:**
- Modify: `app/admin/tkaniny/actions.ts` (`createFabric` :145-186, `updateFabric` :188-224)

**Interfaces:**
- Consumes: `parseProductionPhotos` (Task 2); istniejące `sanitize`, `createAdminClient`.
- Produces: `createFabric`/`updateFabric` czytają pole formularza `production_photos_json` i zapisują kolumnę `production_photos` (nieznane `product_id` → null).

- [ ] **Step 1: Implementacja**

Do importów `actions.ts` dodaj:

```ts
import { parseProductionPhotos } from "@/app/_lib/fabric-production-photos";
import type { FabricProductionPhoto } from "@/app/_lib/types";
```

Pod `parseRichHtml` dodaj helper:

```ts
// Walidacja serwerowa product_id w zdjęciach z produkcji: jedno zapytanie
// in(); nieznane id → null (zdjęcie zostaje, link nie). Mutuje kopię wejścia.
async function validatePhotoProducts(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  photos: FabricProductionPhoto[]
): Promise<FabricProductionPhoto[]> {
  const ids = [...new Set(photos.map((p) => p.product_id).filter((x): x is string => !!x))];
  if (ids.length === 0) return photos;
  const { data } = await supabase.from("products").select("id").in("id", ids);
  const known = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  return photos.map((p) =>
    p.product_id && !known.has(p.product_id) ? { ...p, product_id: null } : p
  );
}
```

W `createFabric`: po linii `const descriptionDe = parseRichHtml(...)` dodaj

```ts
  const rawPhotos = parseProductionPhotos(formData.get("production_photos_json"));
```

a po `const supabase = await createAdminClient();` (przed zapytaniem o slugi):

```ts
  const productionPhotos = await validatePhotoProducts(supabase, rawPhotos);
```

i rozszerz obiekt `insert` o `production_photos: productionPhotos,`.

W `updateFabric`: analogicznie — `rawPhotos` po `descriptionDe`, `productionPhotos` po `const supabase = ...`, i `production_photos: productionPhotos,` w obiekcie `.update({...})`.

- [ ] **Step 2: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm run lint && npm test` → czysto / PASS.

```bash
git add app/admin/tkaniny/actions.ts
git commit -m "feat(tkaniny): zapis production_photos w akcjach + serwerowa walidacja product_id"
```

---

### Task 4: Admin UI — wiersze „Zdjęcia z produkcji" + picker produktu

**Files:**
- Modify: `app/admin/tkaniny/page.tsx`, `app/admin/tkaniny/FabricsEditor.tsx`

**Interfaces:**
- Consumes: `uploadProductImageFile` (`app/admin/produkty/[id]/_shared.tsx:21`, sygnatura `(file: File) => Promise<{ok:true;url:string}|{ok:false;error:string}>` — NIE kompresuje, więc wywołaj `compressIfNeeded` przed); `compressIfNeeded` (już importowany w FabricsEditor); `FabricProductionPhoto` (Task 1).
- Produces: `FabricsEditor` przyjmuje dodatkowo `pickerProducts: FabricPickerProduct[]`; eksportowany typ `FabricPickerProduct = { id: string; name: string }`.

- [ ] **Step 1: `page.tsx`**

```tsx
import { requireAdmin } from "@/app/_lib/admin";
import { getAllFabrics, getFabricPriceGroups } from "@/app/_lib/fabrics";
import { createAdminClient } from "@/app/_lib/supabase/server";
import FabricsEditor, { type FabricPickerProduct } from "./FabricsEditor";

export const metadata = { title: "Tkaniny — Admin" };

export default async function AdminFabricsPage() {
  await requireAdmin();
  const supabase = await createAdminClient();
  const [fabrics, groups, { data: productRows }] = await Promise.all([
    getAllFabrics(),
    getFabricPriceGroups(),
    // Picker do zdjęć z produkcji: tylko aktywne, po nazwie (wzorzec zestawów).
    supabase
      .from("products")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);
  return (
    <FabricsEditor
      initialFabrics={fabrics}
      groups={groups}
      pickerProducts={(productRows ?? []) as FabricPickerProduct[]}
    />
  );
}
```

- [ ] **Step 2: `FabricsEditor.tsx`**

1. Import: `import { uploadProductImageFile } from "@/app/admin/produkty/[id]/_shared";` oraz typ `FabricProductionPhoto` do importu z types (obok `Fabric, FabricPriceGroup`).
2. Eksport typu (nad komponentem):

```tsx
// Produkt w pickerze zdjęć z produkcji (lista z page.tsx — tylko aktywne).
export type FabricPickerProduct = { id: string; name: string };
```

3. Sygnatura `FabricsEditor`: dodaj `pickerProducts: FabricPickerProduct[]` do propsów i przekaż `pickerProducts={pickerProducts}` do OBU użyć `<FabricForm>` (create + inline edit).
4. `FabricForm`: dodaj prop `pickerProducts: FabricPickerProduct[]` i stan (obok `rows`/`uploadingIdx`):

```tsx
  type PhotoRow = { url: string; productQuery: string; productId: string | null };
  const [photoRows, setPhotoRows] = useState<PhotoRow[]>(() =>
    (initial?.production_photos ?? []).map((p) => ({
      url: p.url,
      productId: p.product_id,
      productQuery: p.product_id
        ? pickerProducts.find((x) => x.id === p.product_id)?.name ?? ""
        : "",
    }))
  );
  const [uploadingPhotoIdx, setUploadingPhotoIdx] = useState<number | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const productListId = `fabric-photo-products-${initial?.id ?? "new"}`;

  function addPhotoRow() {
    setPhotoRows((r) => [...r, { url: "", productQuery: "", productId: null }]);
  }
  function removePhotoRow(i: number) {
    setPhotoRows((r) => r.filter((_, idx) => idx !== i));
  }
  // Dokładne dopasowanie nazwy z datalisty → productId; inaczej null.
  function setPhotoProduct(i: number, query: string) {
    const match = pickerProducts.find((p) => p.name === query) ?? null;
    setPhotoRows((r) =>
      r.map((row, idx) =>
        idx === i ? { ...row, productQuery: query, productId: match?.id ?? null } : row
      )
    );
  }
  async function uploadPhotoForRow(i: number, file: File) {
    setUploadingPhotoIdx(i);
    setPhotoError(null);
    try {
      const toSend = await compressIfNeeded(file);
      const res = await uploadProductImageFile(toSend);
      if (res.ok) {
        setPhotoRows((r) => r.map((row, idx) => (idx === i ? { ...row, url: res.url } : row)));
      } else {
        setPhotoError(res.error);
      }
    } finally {
      setUploadingPhotoIdx(null);
    }
  }
```

5. JSX — po bloku „Kolory / numery" (przed przyciskami submit) wstaw sekcję:

```tsx
      {/* Zdjęcia z produkcji — mebel uszyty w tej tkaninie, opcjonalnie
          podpięty produkt (strona tkaniny: klikalna karta → /produkt/[id]). */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          Zdjęcia z produkcji
        </span>
        <p className="text-[11px] text-[var(--muted)] -mt-1">
          Prawdziwe zdjęcia mebli w tej tkaninie (sekcja „Ta tkanina na naszych
          meblach" na stronie tkaniny). Produkt opcjonalny — z produktem zdjęcie
          jest klikalne. Max 20.
        </p>
        <input
          type="hidden"
          name="production_photos_json"
          readOnly
          value={JSON.stringify(
            photoRows
              .filter((r) => r.url)
              .map((r) => ({ url: r.url, product_id: r.productId }))
          )}
        />
        {photoError && <p className="text-xs text-red-600">{photoError}</p>}
        {photoRows.length === 0 && (
          <span className="text-xs text-[var(--muted)] italic">
            Brak zdjęć — dodaj pierwsze.
          </span>
        )}
        <datalist id={productListId}>
          {pickerProducts.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
        <div className="flex flex-col gap-2">
          {photoRows.map((row, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2 flex-wrap"
            >
              <span className="relative w-16 h-12 shrink-0 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--card-bg)]">
                {row.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-[10px] text-[var(--muted)]">
                    brak
                  </span>
                )}
              </span>
              <label className="shrink-0 px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors cursor-pointer">
                {uploadingPhotoIdx === i ? "Wgrywam…" : row.url ? "Zmień" : "Zdjęcie"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingPhotoIdx !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) uploadPhotoForRow(i, f);
                  }}
                />
              </label>
              <div className="flex-1 min-w-[12rem]">
                <input
                  value={row.productQuery}
                  onChange={(e) => setPhotoProduct(i, e.target.value)}
                  list={productListId}
                  placeholder="produkt na zdjęciu (opcjonalnie)"
                  className={inputCls}
                />
                <p className="text-[10px] mt-0.5 text-[var(--muted)]">
                  {row.productId
                    ? "✓ podpięty produkt"
                    : row.productQuery
                      ? "— nie rozpoznano (wybierz z listy)"
                      : "bez produktu"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removePhotoRow(i)}
                aria-label="Usuń zdjęcie"
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addPhotoRow}
          disabled={photoRows.length >= 20}
          className="self-start px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors disabled:opacity-50"
        >
          + Dodaj zdjęcie
        </button>
      </div>
```

- [ ] **Step 3: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm run lint && npm test` → czysto / PASS.

```bash
git add app/admin/tkaniny/page.tsx app/admin/tkaniny/FabricsEditor.tsx
git commit -m "feat(tkaniny): admin — wiersze zdjec z produkcji z pickerem produktu"
```

---

### Task 5: Strona tkaniny — sekcja zdjęć zamiast CTA + słownik

**Files:**
- Modify: `app/tkaniny/[slug]/page.tsx` (CTA :128-133 usuwany; sekcja po wzorniku), `app/_lib/dictionaries/pl.ts` (`seeProducts` typ :98 i wartość :443), `app/_lib/dictionaries/de.ts` (`seeProducts` :107)

**Interfaces:**
- Consumes: `Fabric.production_photos` (Task 1), `createAdminClient`, `pickLocalized`, `LocalizedLink` (już w pliku).
- Produces: klucz słownika `t.fabrics.productionHeading` (PL/DE); brak `t.fabrics.seeProducts`.

- [ ] **Step 1: Słownik**

`pl.ts`: w `PlShape.fabrics` zamień `seeProducts: string;` na `productionHeading: string;`; w obiekcie `pl.fabrics` zamień `seeProducts: "Zobacz produkty z tą tkaniną",` na `productionHeading: "Ta tkanina na naszych meblach",`.
`de.ts`: zamień `seeProducts: "Produkte mit diesem Stoff ansehen",` na `productionHeading: "Dieser Stoff auf unseren Möbeln",`.

- [ ] **Step 2: Strona tkaniny**

W `app/tkaniny/[slug]/page.tsx`:

1. Import: `import { createAdminClient } from "@/app/_lib/supabase/server";` i zaktualizuj komentarz nagłówkowy pliku (linki do sklepu → zdjęcia z produkcji).
2. W komponencie, po `const colors = ...`, dodaj:

```tsx
  // Zdjęcia z produkcji: defensywne ?? [] (stary cache bez kolumny) + tylko
  // http(s). Podpięte produkty jednym zapytaniem; nieaktywne/nieznane → bez linku.
  const photos = ((fabric.production_photos ?? []) as typeof fabric.production_photos).filter(
    (p) => /^https?:\/\//.test(p.url)
  );
  const linkedIds = [...new Set(photos.map((p) => p.product_id).filter((x): x is string => !!x))];
  let linkedProducts = new Map<string, { id: string; name: string; name_de: string | null }>();
  if (linkedIds.length > 0) {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("products")
      .select("id, name, name_de")
      .eq("is_active", true)
      .in("id", linkedIds);
    linkedProducts = new Map(
      ((data ?? []) as { id: string; name: string; name_de: string | null }[]).map((p) => [p.id, p])
    );
  }
```

3. USUŃ cały blok CTA (`<LocalizedLink href={`/sklep?tkanina=...` ... </LocalizedLink>`, :128-133) i w jego miejsce wstaw:

```tsx
      {photos.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-bold text-[var(--fg)] mb-6">
            {t.fabrics.productionHeading}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {photos.map((p, i) => {
              const product = p.product_id ? linkedProducts.get(p.product_id) : undefined;
              const alt = product
                ? pickLocalized(product.name, product.name_de, locale)
                : pickLocalized(fabric.name, fabric.name_de, locale);
              const img = (
                <span className="relative block aspect-[4/3] rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={alt} loading="lazy" className="w-full h-full object-cover" />
                </span>
              );
              return product ? (
                <LocalizedLink
                  key={i}
                  href={`/produkt/${product.id}`}
                  className="group flex flex-col gap-2"
                >
                  {img}
                  <span className="text-sm font-sans text-[var(--fg)] group-hover:text-[var(--color-gold)] transition-colors">
                    {pickLocalized(product.name, product.name_de, locale)}
                  </span>
                </LocalizedLink>
              ) : (
                <div key={i} className="flex flex-col gap-2">
                  {img}
                </div>
              );
            })}
          </div>
        </section>
      )}
```

- [ ] **Step 3: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm run lint && npm test` → czysto / PASS (tsc potwierdzi, że nic poza tą stroną nie używało `seeProducts`).

```bash
git add "app/tkaniny/[slug]/page.tsx" app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts
git commit -m "feat(tkaniny): sekcja 'Ta tkanina na naszych meblach' zamiast linku do sklepu"
```

---

### Task 6: Weryfikacja końcowa + PR + deploy check

**Files:** brak nowych.

- [ ] **Step 1: Pełne checki** (upewnij się, że `next dev` NIE działa)

```bash
npm test && npm run lint && npm run build
```

Expected: testy PASS, lint 0 błędów, build OK.

- [ ] **Step 2: Push + PR + merge (konto Woodecky10)**

```bash
git push -u origin feat/zdjecia-produkcji-tkanin
gh pr create --repo Woodecky10/sklep-meblowy --base main --head feat/zdjecia-produkcji-tkanin --title "feat(tkaniny): zdjecia z produkcji na stronie tkaniny (zamiast linku do sklepu)" --body "Spec: sklep-meblowy/docs/superpowers/specs/2026-07-21-zdjecia-produkcji-tkanin-design.md

- fabrics.production_photos (jsonb, migracja 58): zdjecia z produkcji + opcjonalny product_id
- admin: wiersze upload+picker produktu (datalist po nazwie) w formularzu tkaniny
- /tkaniny/[slug]: sekcja 'Ta tkanina na naszych meblach' (klikalne karty do produktow); usuniety link 'Zobacz produkty z ta tkanina' (kazdy produkt jest w kazdej tkaninie - filtr nic nie mowil)
- PL/DE, serwerowa walidacja product_id, limit 20 zdjec

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Merge robi KONTROLER (użytkownik zaakceptował flow merge=deploy przy tej rodzinie zmian).

- [ ] **Step 3: Po deployu (KONTROLER)**

1. `list_tables` (Supabase MCP): kolumna `fabrics.production_photos` istnieje? Jeśli NIE (lekcja PR #71) → MCP `apply_migration` z SQL-em migracji 58 (idempotentny `add column if not exists`).
2. Smoke (pojedyncze curl, bez pętli — rate limit): `https://mollien.pl/tkaniny/monolith` → 200, brak tekstu „Zobacz produkty z tą tkaniną"; sekcja zdjęć nie renderuje się (brak zdjęć) — strona wygląda jak dotąd bez przycisku.
3. Poinformuj użytkownika: zdjęcia wgrywa się w `/admin/tkaniny` → edycja tkaniny → „Zdjęcia z produkcji".

---

## Self-review (wykonany przy pisaniu planu)

- Spec coverage: migracja+typ (T1), parser (T2), akcje+walidacja (T3), admin UI+picker (T4), strona+słownik (T5), weryfikacja+deploy (T6). Przypadki brzegowe: martwy product_id (T3 walidacja + T5 lookup is_active), stary cache bez kolumny (T5 `?? []`), zły URL (T2 + T5 filtr), limit 20 (T2 + T4 disabled przycisk).
- Typy spójne: `FabricProductionPhoto`, `parseProductionPhotos`, `MAX_PRODUCTION_PHOTOS`, `FabricPickerProduct`, pole formularza `production_photos_json`, klucz `productionHeading` — jednolicie w T1-T5.
- Uwaga dla implementera T4: `uploadProductImageFile` NIE kompresuje — wywołanie poprzedzone `compressIfNeeded` (jest w kodzie kroku).
