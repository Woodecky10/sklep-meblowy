# Krótkie info o tkaninie obok „szczegóły" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin dodaje krótkie info o tkaninie w `/admin/tkaniny`; klient w pickerze (widok rozwinięty) widzi obok „szczegóły" ikonę ⓘ z tym tekstem.

**Architecture:** Nowe kolumny `short_info`/`short_info_de` w `fabrics`. Płyną istniejącą ścieżką (Fabric → `buildFabricMetaMap` → `FabricValueMeta` → `getFabricMetaMap` → `FabricMetaProvider` → `useFabricMeta`) do pickera, gdzie renderujemy istniejący `ValueInfoTip` obok „szczegóły". Admin: dwa `<textarea>` w edytorze tkaniny + odczyt/zapis w `createFabric`/`updateFabric`.

**Tech Stack:** Next.js 16 / React 19 / TS / Tailwind v4, Supabase (RLS admin-only, odczyt service-role + `unstable_cache`), vitest (node, `*.test.ts`), Playwright do UI.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-24-info-tkaniny-picker-design.md`.
- Krótkie info = zwykły tekst, limit **200** znaków, PL + DE (DE puste → fallback PL). Osobne od `description` (rich text, `/tkaniny`).
- ⓘ obok „szczegóły" tylko w **rozwiniętym** widoku pickera; widok kompaktowy i `/tkaniny` bez zmian.
- Migracja `62_fabric_short_info.sql` — NIE auto-aplikuje się; **kontroler aplikuje do PROD przez Supabase MCP** (`list_tables` → `apply_migration`) między zadaniami (po Task 1, przed Task 3) — potwierdzić z userem (zmiana schematu prod; addytywna). Connected project = produkcja.
- `getAllFabrics` używa `select("*")` — nowe kolumny dojdą automatycznie po migracji; nie zmieniamy zapytań.
- Ścieżki git pod `sklep-meblowy/…`; komendy i `git add` z katalogu aplikacji (INNER `sklep-meblowy/sklep-meblowy`) ścieżkami względem cwd.
- Commit: konwencjonalny PL + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Migracja + typy + `buildFabricMetaMap` (pure)

**Files:**
- Create: `supabase/migrations/62_fabric_short_info.sql`
- Modify: `app/_lib/types.ts` (`Fabric`)
- Modify: `app/_lib/variants.ts` (`FabricValueMeta` + `buildFabricMetaMap`)
- Test: `app/_lib/__tests__/variants.test.ts`

**Interfaces (Produces):**
- `Fabric` z `short_info: string | null; short_info_de: string | null`.
- `FabricValueMeta` z `shortInfo: string | null; shortInfoDe: string | null`.
- `buildFabricMetaMap(fabrics, groups)` — wejściowy typ fabryk rozszerzony o `short_info?`/`short_info_de?`; ustawia `shortInfo`/`shortInfoDe` w meta.

- [ ] **Step 1: Test `buildFabricMetaMap` — short info w meta**

W `app/_lib/__tests__/variants.test.ts` dodaj (import `buildFabricMetaMap` prawdopodobnie już jest; jeśli nie — dodaj do importu z `@/app/_lib/variants`):

```ts
describe("buildFabricMetaMap — krótkie info", () => {
  const groups = [
    { id: "g1", code: "standard", name: "Standard", name_de: null, surcharge: 0, sort_order: 0 },
  ];
  it("shortInfo/shortInfoDe trafiają do meta każdej wartości tkaniny; puste → null", () => {
    const map = buildFabricMetaMap(
      [
        { name: "Baloo", colors: ["01", "02"], slug: "baloo", group_id: "g1", short_info: "  Miękki welur ", short_info_de: " Velours " },
        { name: "Sawana", colors: ["21"], slug: "sawana", group_id: "g1", short_info: "  ", short_info_de: null },
        { name: "Riviera", colors: [], slug: "riviera", group_id: "g1" },
      ],
      groups
    );
    expect(map["Baloo 01"].shortInfo).toBe("Miękki welur");
    expect(map["Baloo 01"].shortInfoDe).toBe("Velours");
    expect(map["Baloo 02"].shortInfo).toBe("Miękki welur"); // wszystkie kolory dostają to samo
    expect(map["Sawana 21"].shortInfo).toBeNull(); // whitespace → null
    expect(map["Riviera"].shortInfo).toBeNull(); // brak pól → null
    expect(map["Riviera"].shortInfoDe).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom test — FAIL**

Run: `npx vitest run app/_lib/__tests__/variants.test.ts`
Expected: FAIL — `shortInfo` nie istnieje na meta (undefined ≠ oczekiwane), TS może też zgłosić brak pola w typie wejściowym.

- [ ] **Step 3: `app/_lib/types.ts` — pola w `Fabric`**

Po `description_de: string | null;` (w typie `Fabric`) dodaj:

```ts
  // Krótkie info o tkaninie (dymek obok „szczegóły" w pickerze). Zwykły tekst,
  // osobne od description. short_info_de null → fallback PL.
  short_info: string | null;
  short_info_de: string | null;
```

- [ ] **Step 4: `app/_lib/variants.ts` — `FabricValueMeta` + `buildFabricMetaMap`**

W typie `FabricValueMeta` dodaj (po `groupSort: number;`):

```ts
  shortInfo: string | null;
  shortInfoDe: string | null;
```

W `buildFabricMetaMap` rozszerz typ parametru `fabrics` i ustaw pola w `meta`. Zastąp sygnaturę i obiekt `meta`:

```ts
export function buildFabricMetaMap(
  fabrics: {
    name: string;
    colors: string[];
    slug: string;
    group_id: string;
    short_info?: string | null;
    short_info_de?: string | null;
  }[],
  groups: { id: string; code: string; name: string; name_de: string | null; surcharge: number; sort_order: number }[]
): Record<string, FabricValueMeta> {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const map: Record<string, FabricValueMeta> = {};
  for (const f of fabrics) {
    const g = byId.get(f.group_id);
    const name = f.name.trim();
    if (!g || !name) continue;
    const colors = (f.colors ?? []).map((c) => c.trim()).filter(Boolean);
    const values = colors.length > 0 ? colors.map((c) => `${name} ${c}`) : [name];
    const meta: FabricValueMeta = {
      fabricName: name,
      slug: f.slug,
      groupCode: g.code,
      groupName: g.name,
      groupNameDe: g.name_de,
      groupSurcharge: g.surcharge,
      groupSort: g.sort_order,
      shortInfo: (f.short_info ?? "").trim() || null,
      shortInfoDe: (f.short_info_de ?? "").trim() || null,
    };
    for (const v of values) map[v] = meta;
  }
  return map;
}
```

(`getFabricMetaMap` w `fabrics.ts` woła `buildFabricMetaMap(getAllFabrics(), groups)` — pełne obiekty `Fabric` mają teraz `short_info`/`short_info_de`, więc bez zmian.)

- [ ] **Step 5: Uruchom test — PASS**

Run: `npx vitest run app/_lib/__tests__/variants.test.ts`
Expected: PASS.

- [ ] **Step 6: Utwórz migrację `supabase/migrations/62_fabric_short_info.sql`**

```sql
-- Migracja 62: krotkie info o tkaninie (dymek obok "szczegoly" w pickerze).
-- Nullable text; osobne od description (rich text na /tkaniny). PL + DE.
alter table fabrics
  add column if not exists short_info text,
  add column if not exists short_info_de text;
```

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit` → exit 0.

```bash
git add app/_lib/types.ts app/_lib/variants.ts app/_lib/__tests__/variants.test.ts supabase/migrations/62_fabric_short_info.sql
git commit -m "feat(tkaniny): short_info tkaniny — migracja + typy + buildFabricMetaMap

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **Kontroler po Task 1 (przed Task 3):** zaaplikuj migrację 62 do produkcji (Supabase MCP `apply_migration` treścią z 62_fabric_short_info.sql; wcześniej `list_tables`/sprawdź brak kolumn). Zaseeduj wpis testowy dla Playwright w Task 3, np. `update fabrics set short_info='Miękki welur, łatwy w czyszczeniu', short_info_de='Weicher Cord, pflegeleicht' where name='Baloo';` (Baloo występuje w pickerze Fotela Montes). To zmiana schematu na PROD (addytywna, odwracalna `drop column`).

---

### Task 2: Admin — pola w edytorze tkaniny + zapis

**Files:**
- Modify: `app/admin/tkaniny/FabricsEditor.tsx` (formularz `FabricForm`)
- Modify: `app/admin/tkaniny/actions.ts` (`createFabric`, `updateFabric`)

**Interfaces:** Consumes `Fabric.short_info`/`short_info_de` (Task 1). Formularz wysyła pola `short_info`/`short_info_de` w `FormData`.

- [ ] **Step 1: `FabricsEditor.tsx` — dwa pola textarea**

W `FabricForm`, bezpośrednio PO bloku `Field label="Opis (DE)"` (RichTextEditor `description_de`), dodaj:

```tsx
      <Field label="Krótkie info" hint="Krótki tekst w dymku obok „szczegóły” w pickerze (maks. 200 znaków).">
        <textarea
          name="short_info"
          defaultValue={initial?.short_info ?? ""}
          maxLength={200}
          rows={2}
          className={inputCls}
          placeholder="np. Miękki welur, łatwy w czyszczeniu"
        />
      </Field>
      <Field label="Krótkie info (DE)" hint="Puste → na /de pokaże się PL.">
        <textarea
          name="short_info_de"
          defaultValue={initial?.short_info_de ?? ""}
          maxLength={200}
          rows={2}
          className={inputCls}
        />
      </Field>
```

(`Field` i `inputCls` są już importowane z `@/app/admin/_shared`. Pola są niekontrolowane — `<textarea name>` wysyła wartość sam, bez hidden-input/state.)

- [ ] **Step 2: `actions.ts` — odczyt + zapis w `createFabric` i `updateFabric`**

W OBU funkcjach, po linii `const descriptionDe = parseRichHtml(formData.get("description_de"));`, dodaj:

```ts
  const shortInfo = emptyToNull(sanitize(formData.get("short_info"), 200));
  const shortInfoDe = emptyToNull(sanitize(formData.get("short_info_de"), 200));
```

W `createFabric` w obiekcie `.insert({ … })` oraz w `updateFabric` w obiekcie `.update({ … })` dodaj pola (obok `description, description_de`):

```ts
      short_info: shortInfo,
      short_info_de: shortInfoDe,
```

(Inwalidacja cache `invalidateFabricsCache()` + `revalidatePath` już są — bez zmian.)

- [ ] **Step 3: Typecheck + lint + pełny vitest**

Run: `npx tsc --noEmit` → 0.
Run: `npx eslint app/admin/tkaniny/FabricsEditor.tsx app/admin/tkaniny/actions.ts` → 0.
Run: `npx vitest run` → wszystko zielone.

- [ ] **Step 4: Playwright (admin, jeśli sesja dostępna)**

Jeśli jest sesja admina (dev :3000): `/admin/tkaniny` → edytuj tkaninę „Baloo" → pola „Krótkie info" prefillowane wartością z Task 1 seed → zmień, zapisz → odśwież → utrwalone. Jeśli brak sesji — pomiń i zaznacz w raporcie (zapis pokryty wzorcem `createFabric`/`updateFabric` + review; render ⓘ pokryty Task 3).

- [ ] **Step 5: Commit**

```bash
git add app/admin/tkaniny/FabricsEditor.tsx app/admin/tkaniny/actions.ts
git commit -m "feat(tkaniny): admin — pola Krotkie info (PL/DE) w edytorze tkaniny

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Picker — ⓘ obok „szczegóły"

**Files:**
- Modify: `app/_components/ui/VariantSelector.tsx` (`FabricSwatchGroup`, widok rozwinięty)

**Interfaces:** Consumes `FabricValueMeta.shortInfo`/`shortInfoDe` (Task 1) przez `useFabricMeta`. `pickLocalized`, `useFabricMeta`, `ValueInfoTip` — już importowane w pliku.

- [ ] **Step 1: Rozszerz `GroupBucket.fabrics` entry o `shortInfo`**

W typie `GroupBucket` (pole `fabrics`) zmień wpis mapy:

```tsx
    fabrics: Map<string, { slug: string | null; shortInfo: string | null; values: string[] }>;
```

- [ ] **Step 2: Uzupełnij `shortInfo` przy budowaniu kubełków**

W pętli budującej kubełki, w gałęzi tworzącej nowy wpis tkaniny, zmień `bucket.fabrics.set(...)`:

```tsx
    const fabricName = m?.fabricName ?? v;
    const entry = bucket.fabrics.get(fabricName);
    if (entry) entry.values.push(v);
    else
      bucket.fabrics.set(fabricName, {
        slug: m?.slug ?? null,
        shortInfo: m ? pickLocalized(m.shortInfo ?? "", m.shortInfoDe, locale) || null : null,
        values: [v],
      });
```

(`pickLocalized(pl, de, locale)` — dla PL zwraca `pl`, dla DE `de ?? pl`; pusty wynik → `null`, więc brak info = brak ⓘ.)

- [ ] **Step 3: Render `ValueInfoTip` obok „szczegóły"**

W nagłówku `<p>` tkaniny (nazwa + link „szczegóły"), po bloku `{entry.slug && (<Link …>…</Link>)}`, dodaj (wewnątrz tego samego `<p className="… flex items-center gap-2">`):

```tsx
                      {entry.shortInfo && <ValueInfoTip text={entry.shortInfo} />}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit` → 0. `npx eslint app/_components/ui/VariantSelector.tsx` → 0.

- [ ] **Step 5: Playwright (dev :3000; wymaga zaaplikowanej migracji 62 + seed Baloo z Task 1)**

- Otwórz produkt z tkaniną „Baloo" w pickerze — Fotel Montes `http://localhost:3000/produkt/115fe5b6-ec13-4589-ad88-8f238a921dd3`.
- W sekcji „Tkanina" kliknij „Zobacz więcej" (rozwiń picker). Znajdź kartę grupy z tkaniną „Baloo".
- Przy nazwie „Baloo" obok „szczegóły" jest ikona `button[aria-label="Informacja o wariancie"]`; hover/tap pokazuje tekst „Miękki welur, łatwy w czyszczeniu".
- Tkanina bez `short_info` (inna) — brak ⓘ.
Zrób screenshot.

- [ ] **Step 6: Pełny vitest + commit**

Run: `npx vitest run` → zielone.

```bash
git add app/_components/ui/VariantSelector.tsx
git commit -m "feat(tkaniny): picker — ikona info obok 'szczegoly' z krotkim opisem tkaniny

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Kolumny `short_info`/`short_info_de` → Task 1 (migracja + typy).
- `FabricValueMeta`/`buildFabricMetaMap` niosą short info → Task 1 + test.
- Admin pola + zapis → Task 2.
- Picker ⓘ obok „szczegóły" (widok rozwinięty), PL/DE fallback → Task 3.
- Kompaktowy/`/tkaniny`/warianty bez zmian → żadne zadanie ich nie rusza.
- Limit 200, plain text → `sanitize(...,200)` + `maxLength={200}`.

**2. Placeholder scan:** brak TBD/TODO; pełny kod w krokach; komendy z oczekiwanym wynikiem; migracja aplikowana przez kontrolera (nota po Task 1).

**3. Type consistency:** `shortInfo`/`shortInfoDe` (camelCase) w `FabricValueMeta` + entry pickera; `short_info`/`short_info_de` (snake_case) w DB/`Fabric`/FormData/actions — spójnie rozdzielone. `buildFabricMetaMap` input rozszerzony o opcjonalne `short_info?`/`short_info_de?` — zgodne z `Fabric` (które ma je jako `string|null`, przypisywalne do `string|null|undefined`). `pickLocalized(m.shortInfo ?? "", m.shortInfoDe, locale)` — pierwszy arg `string`, drugi `string|null` (zgodne z użyciem `groupName`/`groupNameDe`).
