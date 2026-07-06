# Zdjęcia sekcji opisu bez ucinania + domyślna dostawa/gwarancja — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zdjęcia w sekcjach opisu produktu przestają być ucinane (domyślnie naturalne proporcje, per-zdjęcie opcjonalny kadr 16:9 w adminie), a nowe produkty startują z „21 dni roboczych" / „2 lata" zamiast pustych pól.

**Architecture:** Opcjonalne pole `display?: "wide"` w typie sekcji image (brak pola = naturalne proporcje — istniejące dane naprawiają się bez migracji); renderer karty rozgałęzia się na dwa tryby; edytor admina dostaje select per zdjęcie. Domyślne wartości pól jako stałe w `spec-format.ts` użyte w `buildNewProductPayload`.

**Tech Stack:** Next.js 16 App Router, React 19, vitest, Playwright (weryfikacja lokalna).

**Spec:** `docs/superpowers/specs/2026-07-06-zdjecia-opisu-i-domyslne-pola-design.md`

## Global Constraints

- Wartości domyślne DOKŁADNIE: `DEFAULT_DELIVERY_TIME = "21 dni roboczych"`, `DEFAULT_WARRANTY = "2 lata"` (muszą być kluczami map `DELIVERY_TIME_DE`/`WARRANTY_DE` — test pilnuje).
- Pole trybu DOKŁADNIE: `display?: "wide"` — jedyna dozwolona wartość `"wide"`; tryb naturalny = BRAK pola (nie zapisujemy `"natural"`).
- Etykiety selecta w adminie DOKŁADNIE: „Całe zdjęcie (bez przycinania)" / „Kadr panoramiczny 16:9".
- Zero nowych zależności npm; komentarze po polsku; Next 16 (wątpliwości API → `node_modules/next/dist/docs/`).
- Żadnych zapisów do produkcyjnej DB podczas weryfikacji (lokalny serwer gada z prod Supabase!).
- Gałąź robocza: `feat/zdjecia-opisu-domyslne-pola` (wszystkie taski na niej; merge w Task 4).

---

### Task 1: Domyślna dostawa i gwarancja nowego produktu (TDD)

**Files:**
- Modify: `app/_lib/spec-format.ts` (dopisz stałe na końcu pliku)
- Modify: `app/_lib/new-product.ts` (typ `NewProduct` ~linie 26-28, payload ~linie 83-84, import)
- Test: `app/_lib/__tests__/new-product.test.ts` (dopisz 2 testy do istniejącego describe)

**Interfaces:**
- Produces: `export const DEFAULT_DELIVERY_TIME = "21 dni roboczych"` i `export const DEFAULT_WARRANTY = "2 lata"` z `@/app/_lib/spec-format`.

- [ ] **Step 1: Dopisz failing testy** (do `describe("buildNewProductPayload", ...)` w `app/_lib/__tests__/new-product.test.ts`; dodaj importy na górze pliku):

```ts
import { DEFAULT_DELIVERY_TIME, DEFAULT_WARRANTY } from "@/app/_lib/spec-format";
import { DELIVERY_TIME_DE, WARRANTY_DE } from "@/app/_lib/de-content-maps";
```

```ts
  it("nowy produkt dostaje domyślny czas dostawy i gwarancję", () => {
    const r = buildNewProductPayload(valid);
    expect(r.ok && r.payload.delivery_time).toBe("21 dni roboczych");
    expect(r.ok && r.payload.warranty).toBe("2 lata");
  });

  it("domyślne wartości mają tłumaczenia DE (spójność z mapami)", () => {
    expect(DELIVERY_TIME_DE[DEFAULT_DELIVERY_TIME]).toBeTruthy();
    expect(WARRANTY_DE[DEFAULT_WARRANTY]).toBeTruthy();
  });
```

- [ ] **Step 2: Testy czerwone**

Run: `npx vitest run app/_lib/__tests__/new-product.test.ts`
Expected: FAIL — brak eksportów `DEFAULT_DELIVERY_TIME`/`DEFAULT_WARRANTY`; payload ma null.

- [ ] **Step 3: Implementacja**

Na końcu `app/_lib/spec-format.ts`:

```ts
// Kanoniczne domyślne wartości dla NOWYCH produktów (buildNewProductPayload) —
// admin nie wpisuje ich ręcznie za każdym razem, ale może edytować (zapis
// przechodzi przez normalizeDeliveryTime/normalizeWarranty wyżej). Muszą być
// kluczami map DELIVERY_TIME_DE / WARRANTY_DE (test new-product pilnuje).
export const DEFAULT_DELIVERY_TIME = "21 dni roboczych";
export const DEFAULT_WARRANTY = "2 lata";
```

W `app/_lib/new-product.ts`: dodaj import
`import { DEFAULT_DELIVERY_TIME, DEFAULT_WARRANTY } from "./spec-format";`,
w typie `NewProduct` zamień `delivery_time: null; warranty: null;` na
`delivery_time: string; warranty: string;`, w payloadzie zamień
`delivery_time: null,` / `warranty: null,` na:

```ts
      delivery_time: DEFAULT_DELIVERY_TIME,
      warranty: DEFAULT_WARRANTY,
```

- [ ] **Step 4: Testy zielone + typecheck**

Run: `npx vitest run app/_lib/__tests__/new-product.test.ts && npx tsc --noEmit`
Expected: PASS (wszystkie), tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/spec-format.ts app/_lib/new-product.ts app/_lib/__tests__/new-product.test.ts
git commit -m "feat(admin): domyślne 21 dni roboczych / 2 lata dla nowych produktów"
```

---

### Task 2: Pole `display` sekcji image — typ, przepuszczanie przy zapisie, renderer karty (TDD)

**Files:**
- Modify: `app/_lib/types.ts` (typ `ProductDescriptionSectionImage`, ~linie 74-79)
- Modify: `app/admin/produkty/actions.ts` (walidacja sekcji image, ~linie 461-467)
- Modify: `app/_components/ui/ProductDescriptionSections.tsx` (funkcja `ImageSection`, ~linie 114-135)
- Test: `app/_lib/__tests__/product-html.test.ts` (dopisz test przepuszczania `display`)

**Interfaces:**
- Produces: pole `display?: "wide"` na typie `ProductDescriptionSectionImage` — konsumowane przez Task 3 (edytor admina).

- [ ] **Step 1: Dopisz failing test** (do `app/_lib/__tests__/product-html.test.ts`; dopasuj importy do istniejących w pliku — `sanitizeSectionsHtml` i typ sekcji już mogą być importowane):

```ts
  it("image: przepuszcza display bez zmian (tryb wyświetlania na karcie)", () => {
    const sections: ProductDescriptionSection[] = [
      { kind: "image", image_url: "https://x/a.jpg", image_alt: "a", display: "wide" },
      { kind: "image", image_url: "https://x/b.jpg", image_alt: "b" },
    ];
    const out = sanitizeSectionsHtml(sections);
    expect(out[0]).toEqual(sections[0]);
    expect((out[1] as { display?: string }).display).toBeUndefined();
  });
```

- [ ] **Step 2: Test czerwony (błąd TYPU — pole nie istnieje)**

Run: `npx vitest run app/_lib/__tests__/product-html.test.ts`
Expected: FAIL na kompilacji testu („display" nie istnieje w typie) — to oczekiwana czerwień TDD dla zmiany typu.

- [ ] **Step 3: Implementacja**

`app/_lib/types.ts` — rozszerz typ:

```ts
export type ProductDescriptionSectionImage = {
  kind: "image";
  image_url: string;
  image_alt: string;
  caption?: string;
  // Tryb wyświetlania na karcie produktu. Brak pola = „całe zdjęcie"
  // (naturalne proporcje, nic nie ucinane). "wide" = kadr panoramiczny 16:9
  // z przycięciem (object-cover) — dawny, jedyny wygląd sprzed tego pola.
  display?: "wide";
};
```

`app/admin/produkty/actions.ts` — w bloku walidacji `else if (s.kind === "image")`, po walidacji `image_alt` dodaj:

```ts
      if (s.display !== undefined && s.display !== "wide") {
        return { ok: false, error: `Sekcja ${i + 1}: display musi być "wide" albo pominięte` };
      }
```

`app/_components/ui/ProductDescriptionSections.tsx` — zamień CAŁĄ funkcję `ImageSection` na:

```tsx
function ImageSection({
  section,
}: {
  section: Extract<ProductDescriptionSection, { kind: "image" }>;
}) {
  return (
    <figure className="flex flex-col gap-2">
      {section.display === "wide" ? (
        // Kadr panoramiczny 16:9 — równa ramka kosztem przycięcia (object-cover).
        <div className="relative aspect-[16/9] w-full bg-stone-100 dark:bg-stone-800 rounded-2xl overflow-hidden">
          <Image
            src={section.image_url}
            alt={section.image_alt}
            fill
            sizes="(max-width: 768px) 100vw, 800px"
            className="object-cover"
          />
        </div>
      ) : (
        // Tryb domyślny „całe zdjęcie": naturalne proporcje, nic nie ucinane.
        // Zwykły <img> — wymiary intrinsic nie są znane (next/image fill wymaga
        // sztywnego aspect ratio kontenera); precedens: FabricSwatchGroup.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={section.image_url}
          alt={section.image_alt}
          loading="lazy"
          className="w-full h-auto rounded-2xl bg-stone-100 dark:bg-stone-800"
        />
      )}
      {section.caption && (
        <figcaption className="text-sm text-[var(--muted)] text-center italic px-4">
          {section.caption}
        </figcaption>
      )}
    </figure>
  );
}
```

UWAGA: zachowaj istniejący `<figcaption>` DOKŁADNIE jak w obecnym pliku (przeczytaj oryginał — klasy figcaption powyżej skopiowano z niego; jeśli różnią się od stanu faktycznego, wygrywa stan faktyczny pliku).

- [ ] **Step 4: Testy zielone + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: wszystkie testy PASS, tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/types.ts app/admin/produkty/actions.ts app/_components/ui/ProductDescriptionSections.tsx app/_lib/__tests__/product-html.test.ts
git commit -m "feat(produkt): sekcje image bez ucinania — pole display (domyślnie całe zdjęcie)"
```

---

### Task 3: Przełącznik trybu w edytorze sekcji (admin)

**Files:**
- Modify: `app/admin/produkty/[id]/DescriptionSectionsEditor.tsx` — call-site `<ImageSectionRow>` (~linia 188) i komponent `ImageSectionRow` (~linie 412-478)

**Interfaces:**
- Consumes: pole `display?: "wide"` z Task 2; helper `patchSection(idx, patch)` istniejący w pliku (rozsyła `{...section, ...patch}` — `display: undefined` czyści pole przy JSON-serializacji).

- [ ] **Step 1: Call-site — przekaż handler** (przy istniejących `onAltChange`/`onCaptionChange`, ~linia 188):

```tsx
              <ImageSectionRow
                section={s}
                onAltChange={(v) => patchSection(idx, { image_alt: v })}
                onCaptionChange={(v) =>
                  patchSection(idx, { caption: v.trim() === "" ? undefined : v })
                }
                onDisplayChange={(v) => patchSection(idx, { display: v })}
                /* pozostałe propsy (onRemove/onMoveUp/onMoveDown) BEZ ZMIAN */
```

(Przeczytaj call-site w pliku i dodaj wyłącznie `onDisplayChange` — reszta propów zostaje jak jest.)

- [ ] **Step 2: ImageSectionRow — prop, select, miniatura wg trybu**

W sygnaturze dodaj prop:

```tsx
  onDisplayChange: (v: "wide" | undefined) => void;
```

(i do destrukturyzacji). Miniatura: zamień `className="object-cover"` (~linia 435) na:

```tsx
          className={section.display === "wide" ? "object-cover" : "object-contain"}
```

Po inpucie podpisu (po `~linii 457`) dodaj select trybu:

```tsx
        <label className="flex items-center gap-2 text-xs font-sans text-[var(--muted)]">
          <span className="uppercase tracking-widest shrink-0">Wyświetlanie</span>
          <select
            value={section.display ?? "natural"}
            onChange={(e) =>
              onDisplayChange(e.target.value === "wide" ? "wide" : undefined)
            }
            className={inputClass}
          >
            <option value="natural">Całe zdjęcie (bez przycinania)</option>
            <option value="wide">Kadr panoramiczny 16:9</option>
          </select>
        </label>
```

- [ ] **Step 3: Weryfikacja**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: exit 0, testy zielone, build OK.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/produkty/[id]/DescriptionSectionsEditor.tsx"
git commit -m "feat(admin): przełącznik trybu wyświetlania zdjęcia sekcji (całe / kadr 16:9)"
```

---

### Task 4: Weryfikacja e2e (lokalny build) + integracja

**Files:** skrypty tymczasowe w scratchpadzie sesji (poza repo).

**Interfaces:**
- Consumes: działający lokalny build; storageState admina `e2e/.auth/admin.json`; produkt z sekcją image — kontroler poda ID (SQL przez Supabase MCP: `select id from products where description_sections::text like '%"kind": "image"%' limit 1` — uwaga na wariant bez spacji `"kind":"image"`).

- [ ] **Step 1: Build + serwer lokalny**

```bash
npm run build
npx next start -p 3210   # w tle; poll aż 200
```

- [ ] **Step 2: Scenariusze (Playwright, viewport 1440×900)**

1. **Karta produktu (public):** strona `/produkt/<id-z-sekcją-image>` → obraz sekcji NIE jest w kontenerze `aspect-[16/9]` (tryb naturalny): selektor `figure img.w-full.h-auto` istnieje; brak elementu `figure div.aspect-\[16\/9\]` dla tej sekcji.
2. **Admin (storageState):** `/admin/produkty/<to-samo-id>` → sekcja zdjęciowa w edytorze ma select „Wyświetlanie" z wartością `natural`; zmień na „Kadr panoramiczny 16:9" → **NIE zapisuj** (żadnych zapisów do prod DB) → kliknij link w sidebarze → dialog guarda „Niezapisane zmiany" → „Wyjdź bez zapisywania". (Przy okazji potwierdza, że select brudzi sekcję guarda.)
3. **Domyślne pola:** pokryte testami unit (Task 1) — bez tworzenia produktu na prodzie.

Expected: 1-2 zgodnie z opisem; zrzuty ekranu przy niepowodzeniu.

- [ ] **Step 3: Merge + deploy + prod check** (konwencje: push kontem **Woodecky10**; bez pętli curl — rate-limit):

```bash
git checkout main && git merge --no-ff feat/zdjecia-opisu-domyslne-pola -m "Merge branch 'feat/zdjecia-opisu-domyslne-pola'"
git push origin main
# po ~2,5 min:
curl -s -o /dev/null -w "%{http_code}" https://www.mollien.pl/          # 200
curl -s -o /dev/null -w "%{http_code}" https://www.mollien.pl/produkt/<id>  # 200
```

Po deployu powtórz scenariusz 1 na produkcji (ten sam selektor na żywej stronie).
