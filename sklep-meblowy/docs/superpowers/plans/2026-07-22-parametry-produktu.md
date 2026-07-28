# Parametry produktu + sticky lewa kolumna — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin w sekcji „Podstawowe dane" tworzy dowolne parametry produktu (klucz → wartość) trafiające do sekcji „Specyfikacja" pod zdjęciem, a lewa kolumna karty produktu jest sticky, więc pusta przestrzeń pod galerią znika.

**Architecture:** Czysty parser `parseFeatureRows` (wzorzec `parseFeaturedProductIds`), dynamiczne wiersze w istniejącym formularzu „Podstawowe dane" (`ProductEditor.tsx`) serializowane do hidden `features_json`, zapis w `updateProductBasics` do ISTNIEJĄCEJ kolumny `products.features` (bez migracji). Render na karcie już dokleja `features` — bez zmian. Sticky: 1 linia klas w `ProductMainSection.tsx`. Spec: `docs/superpowers/specs/2026-07-22-parametry-produktu-design.md`.

**Tech Stack:** Next.js App Router (ZMODYFIKOWANY — patrz Global Constraints), React client components, Supabase, vitest, Tailwind.

## Global Constraints

- Repo root `sklep-meblowy/`, apka w `sklep-meblowy/sklep-meblowy/` — ścieżki względem WEWNĘTRZNEGO folderu; komendy stamtąd (`cd` jawnie, cwd potrafi być na outer root).
- `AGENTS.md`: zmodyfikowany Next.js — wzorce z istniejącego kodu.
- Branch: `feat/parametry-produktu` (istnieje, zawiera commit specu; bazuje na main @ 6c26f38).
- ZERO migracji (kolumna `features jsonb` istnieje), ZERO nowych stringów słownika (admin-only teksty inline PL, jak reszta panelu; storefront bez zmian tekstów).
- Limity parsera: `MAX_FEATURES = 30`, klucz ≤ 100 zn., wartość ≤ 300 zn., dedupe kluczy case-insensitive (pierwszy wygrywa). Limit w UI przycisku BRAĆ Z `MAX_FEATURES` (import), nie literal.
- Sticky: `lg:sticky lg:top-40 lg:self-start` na lewej kolumnie (ta sama wartość offsetu co `app/zestaw/[slug]/page.tsx`); mobile bez zmian.
- Weryfikacja per task: `npx tsc --noEmit` + `npm run lint` + `npm test`. NIE `npm run build` gdy działa `next dev` (build w Task 4).
- Push/PR/merge: konto gh `Woodecky10` (sprawdzić `gh auth status`). Stopka commitów: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Czysty `parseFeatureRows` (TDD)

**Files:**
- Create: `app/_lib/product-features.ts`
- Test: Create `app/_lib/__tests__/product-features.test.ts`

**Interfaces:**
- Consumes: `ProductFeature` z `app/_lib/types.ts` (`{ key: string; value: string }`).
- Produces (Task 2): `parseFeatureRows(input: unknown): ProductFeature[]`, `MAX_FEATURES = 30`.

- [ ] **Step 1: Failujący test**

`app/_lib/__tests__/product-features.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseFeatureRows, MAX_FEATURES } from "../product-features";

describe("parseFeatureRows", () => {
  it("parsuje poprawne wiersze z trim", () => {
    const input = JSON.stringify([
      { key: " Wypełnienie ", value: " Pianka HR " },
      { key: "Stelaż", value: "Drewno bukowe" },
    ]);
    expect(parseFeatureRows(input)).toEqual([
      { key: "Wypełnienie", value: "Pianka HR" },
      { key: "Stelaż", value: "Drewno bukowe" },
    ]);
  });
  it("pomija wiersze bez klucza lub wartości i nie-obiekty", () => {
    const input = JSON.stringify([
      { key: "", value: "x" },
      { key: "K", value: "   " },
      "tekst",
      null,
      { key: "OK", value: "tak" },
    ]);
    expect(parseFeatureRows(input)).toEqual([{ key: "OK", value: "tak" }]);
  });
  it("dedupe kluczy case-insensitive — pierwszy wygrywa", () => {
    const input = JSON.stringify([
      { key: "Wypełnienie", value: "Pianka" },
      { key: "wypełnienie", value: "Sprężyny" },
    ]);
    expect(parseFeatureRows(input)).toEqual([{ key: "Wypełnienie", value: "Pianka" }]);
  });
  it("tnie długości (klucz 100, wartość 300) i limit MAX_FEATURES", () => {
    const long = JSON.stringify([{ key: "a".repeat(150), value: "b".repeat(400) }]);
    const [row] = parseFeatureRows(long);
    expect(row.key).toHaveLength(100);
    expect(row.value).toHaveLength(300);
    const many = JSON.stringify(
      Array.from({ length: MAX_FEATURES + 5 }, (_, i) => ({ key: `k${i}`, value: "v" }))
    );
    expect(parseFeatureRows(many)).toHaveLength(MAX_FEATURES);
  });
  it("zły JSON / nie-string / nie-tablica → []", () => {
    expect(parseFeatureRows("nie json")).toEqual([]);
    expect(parseFeatureRows(undefined)).toEqual([]);
    expect(parseFeatureRows(JSON.stringify({ key: "a", value: "b" }))).toEqual([]);
  });
});
```

- [ ] **Step 2: Potwierdź FAIL**

Run: `npx vitest run app/_lib/__tests__/product-features.test.ts`
Expected: FAIL — moduł nie istnieje.

- [ ] **Step 3: Implementacja**

`app/_lib/product-features.ts`:

```ts
// Parametry produktu (sekcja „Specyfikacja" pod zdjęciem) — CZYSTY parser
// wierszy z formularza admina (hidden input features_json, JSON [{key,value}]).
// Wzorzec parseFeaturedProductIds: zły JSON → [], trim + limity długości,
// puste pomijane, dedupe kluczy case-insensitive (duplikat = kolizja React key
// w <dl> na karcie — pierwszy wygrywa), twardy limit wierszy.
import type { ProductFeature } from "./types";

export const MAX_FEATURES = 30;

export function parseFeatureRows(input: unknown): ProductFeature[] {
  if (typeof input !== "string") return [];
  let rows: unknown;
  try {
    rows = JSON.parse(input);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out: ProductFeature[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (out.length >= MAX_FEATURES) break;
    if (!r || typeof r !== "object") continue;
    const rec = r as { key?: unknown; value?: unknown };
    const key = typeof rec.key === "string" ? rec.key.trim().slice(0, 100) : "";
    const value = typeof rec.value === "string" ? rec.value.trim().slice(0, 300) : "";
    if (!key || !value) continue;
    const dedupeKey = key.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({ key, value });
  }
  return out;
}
```

- [ ] **Step 4: PASS + commit**

Run: `npx vitest run app/_lib/__tests__/product-features.test.ts` → PASS; `npm test` → PASS; `npx tsc --noEmit` → czysto.

```bash
git add app/_lib/product-features.ts app/_lib/__tests__/product-features.test.ts
git commit -m "feat(produkty): parseFeatureRows — czysty parser parametrow produktu"
```

---

### Task 2: Admin — blok „Parametry produktu" + zapis

**Files:**
- Modify: `app/admin/produkty/actions.ts` (`updateProductBasics`, obiekt `updates` :174-190)
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx` (sekcja „Podstawowe dane" :172-330)

**Interfaces:**
- Consumes: `parseFeatureRows`, `MAX_FEATURES` (Task 1); `ProductFeature` z types; istniejące `Field`, `inputClass` z `./_shared`.
- Produces: formularz wysyła pole `features_json` (JSON `[{key,value}]` tylko niepustych wierszy); akcja zapisuje kolumnę `features`.

- [ ] **Step 1: `actions.ts`**

Do importów dodaj:

```ts
import { parseFeatureRows } from "@/app/_lib/product-features";
```

W obiekcie `updates` w `updateProductBasics`, po linii `sale_price: salePriceToSave,` dodaj:

```ts
    // Parametry produktu (sekcja Specyfikacja) — pełny stan wierszy z
    // formularza nadpisuje całą tablicę (spójnie z resztą pól sekcji).
    features: parseFeatureRows(formData.get("features_json")),
```

- [ ] **Step 2: `ProductEditor.tsx` — stan i handlery**

Do importów dodaj `MAX_FEATURES` z `@/app/_lib/product-features` (import wartości, moduł czysty — bezpieczny w kliencie).

W komponencie `ProductEditor`, obok istniejących stanów (po `const [savedImages, ...]`), dodaj:

```tsx
  // Parametry produktu (specyfikacja) — wiersze klucz→wartość, seed z
  // product.features (importowane nie giną); serializacja do hidden
  // features_json w formularzu „Podstawowe dane" (wspólny przycisk zapisu).
  type FeatureRow = { key: string; value: string };
  const [featureRows, setFeatureRows] = useState<FeatureRow[]>(() =>
    (product.features ?? []).map((f) => ({ key: f.key, value: f.value }))
  );
  function addFeatureRow() {
    setFeatureRows((r) => [...r, { key: "", value: "" }]);
  }
  function removeFeatureRow(i: number) {
    setFeatureRows((r) => r.filter((_, idx) => idx !== i));
  }
  function setFeatureKey(i: number, key: string) {
    setFeatureRows((r) => r.map((row, idx) => (idx === i ? { ...row, key } : row)));
  }
  function setFeatureValue(i: number, value: string) {
    setFeatureRows((r) => r.map((row, idx) => (idx === i ? { ...row, value } : row)));
  }
```

- [ ] **Step 3: `ProductEditor.tsx` — JSX bloku**

W formularzu „Podstawowe dane", bezpośrednio PRZED `<div className="md:col-span-2 flex justify-end pt-2">` (przycisk „Zapisz podstawowe dane"), wstaw:

```tsx
          {/* Parametry produktu — dowolne pary klucz→wartość doklejane do
              sekcji „Specyfikacja" pod zdjęciem (kolumna products.features). */}
          <div className="md:col-span-2 flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
            <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
              Parametry produktu
            </span>
            <p className="text-[11px] text-[var(--muted)] -mt-1">
              Wyświetlane w sekcji &bdquo;Specyfikacja&rdquo; pod zdjęciem. Nazwy: Kolor,
              Materiał, Wymiary, Waga, Konstrukcja, Czas realizacji, Gwarancja są na
              karcie pomijane (mają dedykowane pola wyżej) &mdash; nie dubluj. Max {MAX_FEATURES}.
            </p>
            <input
              type="hidden"
              name="features_json"
              readOnly
              value={JSON.stringify(
                featureRows.filter((r) => r.key.trim() && r.value.trim())
              )}
            />
            {featureRows.length === 0 && (
              <span className="text-xs text-[var(--muted)] italic">
                Brak parametrów &mdash; dodaj pierwszy.
              </span>
            )}
            <div className="flex flex-col gap-2">
              {featureRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={row.key}
                    onChange={(e) => setFeatureKey(i, e.target.value)}
                    placeholder="np. Wypełnienie"
                    maxLength={100}
                    className={`${inputClass} w-2/5`}
                  />
                  <input
                    value={row.value}
                    onChange={(e) => setFeatureValue(i, e.target.value)}
                    placeholder="np. Pianka HR"
                    maxLength={300}
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => removeFeatureRow(i)}
                    aria-label="Usuń parametr"
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
              onClick={addFeatureRow}
              disabled={featureRows.length >= MAX_FEATURES}
              className="self-start px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors disabled:opacity-50"
            >
              + Dodaj parametr
            </button>
          </div>
```

- [ ] **Step 4: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm run lint && npm test` → czysto / PASS.

```bash
git add app/admin/produkty/actions.ts "app/admin/produkty/[id]/ProductEditor.tsx"
git commit -m "feat(produkty): edytor parametrow produktu w sekcji Podstawowe dane"
```

---

### Task 3: Sticky lewa kolumna karty produktu

**Files:**
- Modify: `app/_components/ui/ProductMainSection.tsx` (lewa kolumna :74, komentarz :30-33)

**Interfaces:** brak nowych (1 linia klas + komentarz).

- [ ] **Step 1: Zmiana klas**

W `ProductMainSection.tsx` zamień otwarcie lewej kolumny:

```tsx
      <div className="flex flex-col gap-8">
```

na:

```tsx
      <div className="flex flex-col gap-8 lg:sticky lg:top-40 lg:self-start">
```

oraz zaktualizuj komentarz nagłówkowy (linie ~30-33) — po zdaniu o specyfikacji
w lewej kolumnie dopisz:

```
// Lewa kolumna jest sticky (lg:top-40, jak konfigurator na /zestaw/[slug]) —
// przy dłuższej prawej kolumnie galeria podąża za scrollem i pod nią nie
// widać pustej przestrzeni.
```

- [ ] **Step 2: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm run lint && npm test` → czysto / PASS.

```bash
git add app/_components/ui/ProductMainSection.tsx
git commit -m "fix(produkt): sticky lewa kolumna (galeria+specyfikacja) — bez pustki pod galeria"
```

---

### Task 4: Weryfikacja końcowa + PR + merge + smoke (KONTROLER)

**Files:** brak nowych.

- [ ] **Step 1: Pełne checki** (upewnij się, że `next dev` NIE działa)

```bash
npm test && npm run lint && npm run build
```

Expected: testy PASS (dotychczasowe + 5 nowych), lint 0 błędów, build OK.

- [ ] **Step 2: Push + PR + merge (konto Woodecky10)**

```bash
gh auth switch --user Woodecky10
git push -u origin feat/parametry-produktu
gh pr create --repo Woodecky10/sklep-meblowy --base main --head feat/parametry-produktu --title "feat(produkty): parametry produktu w adminie + sticky lewa kolumna karty" --body "Spec: sklep-meblowy/docs/superpowers/specs/2026-07-22-parametry-produktu-design.md

- admin Podstawowe dane: blok 'Parametry produktu' (wiersze klucz->wartosc, max 30, dedupe kluczy, seed z istniejacych features) zapisywany wspolnym przyciskiem sekcji do istniejacej kolumny products.features (BEZ migracji)
- karta produktu: lewa kolumna (galeria+specyfikacja) lg:sticky — pustka pod galeria niewidoczna przy dlugiej prawej kolumnie
- czysty parseFeatureRows + testy; render specyfikacji bez zmian (juz dokleja features)

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Merge robi KONTROLER (flow merge=deploy zaakceptowany). Bez migracji → po merge tylko smoke.

- [ ] **Step 3: Po deployu (KONTROLER)** — smoke Playwright na produkcie z tkaninami (długa prawa kolumna): scroll → galeria podąża (sticky), brak pustki; sekcja „Specyfikacja" renderuje istniejące pola. Dodanie parametru w adminie wymaga logowania — jeśli brak dostępu, poprosić użytkownika o szybki test (dodaj parametr → sprawdź kartę), zapis zweryfikować pośrednio: `select features from products where id=...` po teście użytkownika.

---

## Self-review (wykonany przy pisaniu planu)

- Spec coverage: parser+limity+dedupe (T1), blok w adminie + hint + seed + hidden input + zapis w akcji (T2), sticky (T3), weryfikacja/PR/smoke (T4). Brzegi: brak parametrów (empty state T2), duplikaty (parser T1), puste wiersze (filtr serializacji + parser), lewa kolumna dłuższa od viewportu (naturalne zachowanie sticky — bez kodu).
- Typy spójne: `parseFeatureRows`/`MAX_FEATURES`/`features_json`/`FeatureRow` jednolicie w T1-T2; limit w UI z importu `MAX_FEATURES` (nie literal — lekcja z review lightboxa).
- Placeholdery: brak — komponenty i parser w całości.
- YAGNI: bez DE, bez reorderu, bez migracji.
