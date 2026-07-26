# Wybór już wgranego zdjęcia — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** W edytorze produktu w panelu admina obok „+ Dodaj zdjęcia" pojawia się „+ Wybierz z wgranych" — modal z miniaturami zdjęć już przypisanych do wartości opcji wariantów innych produktów, żeby to samo zdjęcie (np. rysunek stelaża) nie było wgrywane od nowa przy każdym produkcie.

**Architecture:** Czysty moduł `variant-image-suggestions.ts` zbiera i grupuje URL-e z `products.variants.options[].value_images` (z pominięciem opcji „Tkanina"); server helper w `products.ts` czyta wiersze admin clientem; `page.tsx` podaje gotową listę do `ProductEditor`, a wspólny klientowy `ImagePickerModal` obsługuje oba miejsca wyboru (panel 📷 przy wartości opcji + sekcja „Zdjęcia produktu"). Wybór dokłada istniejące URL-e do stanu edytora — zapis idzie istniejącymi przyciskami sekcji.

**Tech Stack:** Next.js 16.2.4 (App Router, Turbopack), React 19.2.4, TypeScript, Tailwind v4, Supabase (JSONB `products.variants`), Vitest.

Spec: `docs/superpowers/specs/2026-07-26-wybor-wgranych-zdjec-design.md`

## Global Constraints

- **To NIE jest Next.js, który znasz.** Przed pisaniem kodu przeczytaj właściwy guide w `node_modules/next/dist/docs/` (wymóg `AGENTS.md`). Wersje: `next` 16.2.4, `react` 19.2.4.
- **Zero migracji SQL, zero zmian schematu.** Feature tylko czyta istniejące `products.variants` i wstawia znane URL-e do `value_images` / `images`.
- **Zero zmian po stronie klienta sklepu.** Nie dotykamy `app/_components/**`, `app/produkt/**`, `getVariantImages`, `VariantSelector`.
- **Panel admina jest po polsku** — żadnego i18n/DE dla nowych tekstów. Komentarze w kodzie po polsku, w stylu otoczenia (wyjaśniają „dlaczego", nie „co").
- **Gotcha Turbopack:** `export type { X }` w pliku z `"use server"` wysypuje runtime. Nowy moduł `variant-image-suggestions.ts` i `products.ts` nie mają `"use server"` — nie dodawaj go.
- **Nazwy opcji mają mieszany casing** („STELAŻ"/„Stelaż"/„ stelaż ") — zawsze grupuj i porównuj przez `normalizeOptionName` / `optionParamSlug` z `app/_lib/option-filter.ts`. Wykluczenie tkaniny to gotowy `EXCLUDED_OPTION_SLUGS` (zawiera `"tkanina"`) — nie dopisuj własnej listy.
- **Weryfikacja przed każdym commitem:** `npm test` (na main 661 testów zielonych — liczba ma tylko rosnąć), `npx tsc --noEmit`, `npm run lint`.
- **Commity:** prefiksy jak w repo (`feat(admin):`, `test:`, `docs:`), wiadomość po polsku, ostatnia linia:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Gałąź robocza: `feat/wybor-wgranych-zdjec` (już istnieje, spec na niej zacommitowany).
- Nowego e2e nie dodajemy (mutacyjne e2e biją w prodową bazę).

---

## Mapa plików

| Plik | Odpowiedzialność |
|---|---|
| `app/_lib/variant-image-suggestions.ts` (nowy) | Czysta logika: zbieranie + grupowanie + dedupe URL-i, sortowanie pod kontekst, filtrowanie szukajką. Bez importów server-only. |
| `app/_lib/__tests__/variant-image-suggestions.test.ts` (nowy) | Testy jednostkowe powyższego. |
| `app/_lib/products.ts` (modyfikacja) | `getVariantImageSuggestionsAdmin()` — odczyt wierszy admin clientem, delegacja do czystej funkcji. |
| `app/admin/produkty/[id]/page.tsx` (modyfikacja) | Dokłada helper do `Promise.all` i przekazuje prop do edytora. |
| `app/admin/produkty/[id]/ImagePickerModal.tsx` (nowy) | Wspólny modal wyboru (siatka miniatur, szukajka, wielokrotne zaznaczanie). |
| `app/admin/produkty/[id]/ValueImagesPanel.tsx` (modyfikacja) | Drugi przycisk + modal przy wartości opcji. |
| `app/admin/produkty/[id]/VariantsEditor.tsx` (modyfikacja) | Przepuszcza prop do `OptionRow` → `ValueImagesPanel`. |
| `app/admin/produkty/[id]/ProductEditor.tsx` (modyfikacja) | Przyjmuje prop, przekazuje do `VariantsEditor`; drugi przycisk + modal w sekcji „Zdjęcia produktu". |

---

## Task 1: Czysta logika podpowiedzi zdjęć

**Files:**
- Create: `app/_lib/variant-image-suggestions.ts`
- Test: `app/_lib/__tests__/variant-image-suggestions.test.ts`

**Interfaces:**
- Consumes: `normalizeOptionName`, `displayOptionName`, `optionParamSlug`, `EXCLUDED_OPTION_SLUGS` z `app/_lib/option-filter.ts`; `normalizeSearchText` z `app/_lib/search-normalize.ts`.
- Produces:
  - `type VariantImageSuggestion = { url: string; value: string; productName: string }`
  - `type VariantImageGroup = { key: string; name: string; images: VariantImageSuggestion[] }`
  - `collectVariantImageSuggestions(rows: { name: unknown; variants: unknown }[]): VariantImageGroup[]`
  - `sortGroupsForContext(groups: VariantImageGroup[], contextOptionName: string | null | undefined): VariantImageGroup[]`
  - `filterGroups(groups: VariantImageGroup[], query: string): VariantImageGroup[]`

- [ ] **Step 1: Napisz plik testowy (ma się nie kompilować — modułu jeszcze nie ma)**

Utwórz `app/_lib/__tests__/variant-image-suggestions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  collectVariantImageSuggestions,
  sortGroupsForContext,
  filterGroups,
} from "../variant-image-suggestions";

// Skrót na wiersz produktu w formie surowej (jak z Supabase).
function row(name: string, options: unknown[]) {
  return { name, variants: { options } };
}

describe("collectVariantImageSuggestions", () => {
  it("zbiera zdjęcia wartości opcji i grupuje po nazwie opcji", () => {
    const out = collectVariantImageSuggestions([
      row("ROMA", [
        { name: "Stelaż", values: ["Drewniany"], value_images: { Drewniany: ["a.jpg"] } },
      ]),
      row("VEGAS", [
        { name: "Kolor nóżek", values: ["Czarny"], value_images: { Czarny: ["b.jpg"] } },
      ]),
    ]);
    expect(out).toEqual([
      { key: "kolor nóżek", name: "Kolor nóżek", images: [{ url: "b.jpg", value: "Czarny", productName: "VEGAS" }] },
      { key: "stelaż", name: "Stelaż", images: [{ url: "a.jpg", value: "Drewniany", productName: "ROMA" }] },
    ]);
  });

  it("scala mieszany casing nazwy opcji w jedną grupę", () => {
    const out = collectVariantImageSuggestions([
      row("A", [{ name: "STELAŻ", values: [], value_images: { X: ["1.jpg"] } }]),
      row("B", [{ name: " stelaż ", values: [], value_images: { Y: ["2.jpg"] } }]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Stelaż");
    expect(out[0].images.map((i) => i.url)).toEqual(["1.jpg", "2.jpg"]);
  });

  it("pomija opcję Tkanina w każdym casingu", () => {
    const out = collectVariantImageSuggestions([
      row("A", [
        { name: "Tkanina", values: [], value_images: { "Sawana 21": ["t1.jpg"] } },
        { name: "TKANINA", values: [], value_images: { "Sawana 22": ["t2.jpg"] } },
        { name: " tkanina ", values: [], value_images: { "Sawana 23": ["t3.jpg"] } },
        { name: "Stelaż", values: [], value_images: { Drewniany: ["ok.jpg"] } },
      ]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].images.map((i) => i.url)).toEqual(["ok.jpg"]);
  });

  it("deduplikuje ten sam URL — podpis z pierwszego wystąpienia", () => {
    const out = collectVariantImageSuggestions([
      row("PIERWSZY", [{ name: "Stelaż", values: [], value_images: { Drewniany: ["s.jpg"] } }]),
      row("DRUGI", [{ name: "Stelaż", values: [], value_images: { Metalowy: ["s.jpg"] } }]),
    ]);
    expect(out[0].images).toEqual([
      { url: "s.jpg", value: "Drewniany", productName: "PIERWSZY" },
    ]);
  });

  it("nie tworzy grupy dla opcji bez zdjęć i pustych tablic", () => {
    const out = collectVariantImageSuggestions([
      row("A", [
        { name: "Rozmiar", values: ["140"] },
        { name: "Strona", values: ["Lewa"], value_images: { Lewa: [] } },
      ]),
    ]);
    expect(out).toEqual([]);
  });

  it("znosi śmieciowy JSONB bez wyjątku", () => {
    const out = collectVariantImageSuggestions([
      { name: "A", variants: null },
      { name: "B", variants: "tekst" },
      { name: "C", variants: { options: "nie-tablica" } },
      { name: "D", variants: { options: [null, "tekst", 42] } },
      { name: "E", variants: { options: [{ name: 42, value_images: { X: ["x.jpg"] } }] } },
      { name: "F", variants: { options: [{ name: "  ", value_images: { X: ["y.jpg"] } }] } },
      { name: "G", variants: { options: [{ name: "Stelaż", value_images: "nie-obiekt" }] } },
      { name: "H", variants: { options: [{ name: "Stelaż", value_images: { X: "nie-tablica" } }] } },
      { name: "I", variants: { options: [{ name: "Stelaż", value_images: { X: [42, "", "  ", "ok.jpg"] } }] } },
      { name: 42, variants: { options: [{ name: "Stelaż", value_images: { X: ["bez-nazwy.jpg"] } }] } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].images).toEqual([
      { url: "ok.jpg", value: "X", productName: "I" },
      { url: "bez-nazwy.jpg", value: "X", productName: "" },
    ]);
  });

  it("pusta lista wierszy → pusta lista grup", () => {
    expect(collectVariantImageSuggestions([])).toEqual([]);
  });
});

describe("sortGroupsForContext", () => {
  const groups = [
    { key: "kolor nóżek", name: "Kolor nóżek", images: [] },
    { key: "stelaż", name: "Stelaż", images: [] },
  ];

  it("stawia grupę kontekstu na początku (mimo casingu)", () => {
    expect(sortGroupsForContext(groups, "STELAŻ").map((g) => g.key)).toEqual([
      "stelaż",
      "kolor nóżek",
    ]);
  });

  it("brak kontekstu lub kontekst bez grupy → kolejność bez zmian", () => {
    expect(sortGroupsForContext(groups, null).map((g) => g.key)).toEqual([
      "kolor nóżek",
      "stelaż",
    ]);
    expect(sortGroupsForContext(groups, "Rozmiar").map((g) => g.key)).toEqual([
      "kolor nóżek",
      "stelaż",
    ]);
  });
});

describe("filterGroups", () => {
  const groups = [
    {
      key: "stelaż",
      name: "Stelaż",
      images: [
        { url: "a.jpg", value: "Drewniany", productName: "Łóżko ROMA" },
        { url: "b.jpg", value: "Metalowy", productName: "Sofa VEGAS" },
      ],
    },
  ];

  it("puste zapytanie zwraca wejście", () => {
    expect(filterGroups(groups, "   ")).toEqual(groups);
  });

  it("filtruje po wartości, nazwie produktu i nazwie opcji", () => {
    expect(filterGroups(groups, "metalowy")[0].images.map((i) => i.url)).toEqual(["b.jpg"]);
    expect(filterGroups(groups, "vegas")[0].images.map((i) => i.url)).toEqual(["b.jpg"]);
    expect(filterGroups(groups, "stelaz")[0].images).toHaveLength(2);
  });

  it("znosi brak diakrytyków i dowolną kolejność tokenów", () => {
    expect(filterGroups(groups, "lozko drewniany")[0].images.map((i) => i.url)).toEqual(["a.jpg"]);
    expect(filterGroups(groups, "drewniany lozko")[0].images.map((i) => i.url)).toEqual(["a.jpg"]);
  });

  it("brak trafień → pusta lista grup", () => {
    expect(filterGroups(groups, "czegoś takiego nie ma")).toEqual([]);
  });
});
```

- [ ] **Step 2: Uruchom testy — muszą padać**

Run: `npx vitest run app/_lib/__tests__/variant-image-suggestions.test.ts`
Expected: FAIL — `Failed to resolve import "../variant-image-suggestions"`.

- [ ] **Step 3: Napisz moduł**

Utwórz `app/_lib/variant-image-suggestions.ts`:

```ts
// Podpowiedzi zdjęć dla edytora produktu: URL-e już przypisane do wartości
// opcji wariantów (`value_images`) WSZYSTKICH produktów. Admin wybiera z nich
// zamiast wgrywać ten sam plik (np. rysunek stelaża) przy każdym produkcie.
// Czysty modul bez importów server-only (wzorzec product-features.ts) —
// wejście defensywne, bo to surowy JSONB z Supabase.
//
// Świadomie POMIJAMY opcję „Tkanina" (EXCLUDED_OPTION_SLUGS): zdjęcie mebla
// w konkretnej tkaninie nie nadaje się do ponownego użycia, a przy ~20
// tkaninach × produkty lista miałaby setki pozycji. Galerie produktów
// (`products.images`) też nie są źródłem — decyzja właściciela w specu.

import {
  EXCLUDED_OPTION_SLUGS,
  displayOptionName,
  normalizeOptionName,
  optionParamSlug,
} from "./option-filter";
import { normalizeSearchText } from "./search-normalize";

export type VariantImageSuggestion = {
  url: string;
  // Wartość opcji i nazwa produktu z PIERWSZEGO wystąpienia URL-a — służą
  // wyłącznie za podpis miniatury („Drewniany · ROMA").
  value: string;
  productName: string;
};

export type VariantImageGroup = {
  // normalizeOptionName(nazwa) — klucz grupowania i dopasowania kontekstu.
  key: string;
  // Forma wyświetlana w nagłówku grupy („STELAŻ" → „Stelaż").
  name: string;
  images: VariantImageSuggestion[];
};

export function collectVariantImageSuggestions(
  rows: { name: unknown; variants: unknown }[]
): VariantImageGroup[] {
  const groups = new Map<string, VariantImageGroup>();
  // Dedupe GLOBALNY: ten sam URL wisi w wielu produktach (bliźniaki rozmiarowe
  // współdzielą zdjęcia), a w wybieraku ma być jedna miniatura.
  const seenUrls = new Set<string>();

  for (const rawRow of rows) {
    const productName =
      typeof rawRow.name === "string" ? rawRow.name.trim() : "";
    const variants = rawRow.variants;
    if (!variants || typeof variants !== "object") continue;
    const options = (variants as { options?: unknown }).options;
    if (!Array.isArray(options)) continue;

    for (const rawOption of options) {
      if (!rawOption || typeof rawOption !== "object") continue;
      const rawName = (rawOption as { name?: unknown }).name;
      if (typeof rawName !== "string") continue;
      const key = normalizeOptionName(rawName);
      if (!key || EXCLUDED_OPTION_SLUGS.has(optionParamSlug(rawName))) continue;
      const valueImages = (rawOption as { value_images?: unknown }).value_images;
      if (!valueImages || typeof valueImages !== "object") continue;

      for (const [rawValue, urls] of Object.entries(
        valueImages as Record<string, unknown>
      )) {
        if (!Array.isArray(urls)) continue;
        for (const url of urls) {
          if (typeof url !== "string" || !url.trim()) continue;
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);
          // Grupa powstaje dopiero przy pierwszym zdjęciu — dzięki temu opcje
          // bez zdjęć nie tworzą pustych nagłówków w wybieraku.
          let group = groups.get(key);
          if (!group) {
            group = { key, name: displayOptionName(rawName), images: [] };
            groups.set(key, group);
          }
          group.images.push({ url, value: rawValue.trim(), productName });
        }
      }
    }
  }

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

// Grupa zgodna z opcją, z której otwarto wybierak, idzie na początek
// (otwarte z „STELAŻ" → stelaże pierwsze). Reszta zachowuje kolejność.
export function sortGroupsForContext(
  groups: VariantImageGroup[],
  contextOptionName: string | null | undefined
): VariantImageGroup[] {
  const ctx = contextOptionName ? normalizeOptionName(contextOptionName) : "";
  if (!ctx) return groups;
  const match = groups.filter((g) => g.key === ctx);
  if (match.length === 0) return groups;
  return [...match, ...groups.filter((g) => g.key !== ctx)];
}

// Szukajka wybieraka: wszystkie tokeny zapytania muszą wystąpić w „nazwa opcji
// + wartość + produkt" (po normalizeSearchText → bez diakrytyków, dowolna
// kolejność słów). Grupy bez trafień wypadają.
export function filterGroups(
  groups: VariantImageGroup[],
  query: string
): VariantImageGroup[] {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return groups;
  const out: VariantImageGroup[] = [];
  for (const group of groups) {
    const images = group.images.filter((img) => {
      const haystack = normalizeSearchText(
        `${group.name} ${img.value} ${img.productName}`
      );
      return tokens.every((t) => haystack.includes(t));
    });
    if (images.length > 0) out.push({ ...group, images });
  }
  return out;
}
```

- [ ] **Step 4: Uruchom testy — muszą przejść**

Run: `npx vitest run app/_lib/__tests__/variant-image-suggestions.test.ts`
Expected: PASS (13 testów w 3 blokach `describe`: 7 + 2 + 4).

Jeśli test „scala mieszany casing" pada na nazwie grupy — sprawdź `displayOptionName` w `app/_lib/option-filter.ts:22` (zwraca formę z wielkiej litery po normalizacji, więc „STELAŻ" → „Stelaż"); nie zmieniaj tej funkcji, dopasuj oczekiwanie tylko jeśli zachowanie w kodzie produkcyjnym jest inne niż w specu.

- [ ] **Step 5: Pełna weryfikacja i commit**

Run: `npm test` (wszystkie testy zielone, licznik > 661), `npx tsc --noEmit`, `npm run lint`

```bash
git add app/_lib/variant-image-suggestions.ts app/_lib/__tests__/variant-image-suggestions.test.ts
git commit -m "feat(admin): collectVariantImageSuggestions — podpowiedzi zdjęć z wariantów

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Wybierak przy wartości opcji (panel 📷)

**Files:**
- Modify: `app/_lib/products.ts` (dopisz helper na końcu pliku, obok `getFeatureSuggestionsAdmin` w linii ~501)
- Modify: `app/admin/produkty/[id]/page.tsx:25-53`
- Create: `app/admin/produkty/[id]/ImagePickerModal.tsx`
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx` (propsy + przekazanie do `VariantsEditor`, linia ~704)
- Modify: `app/admin/produkty/[id]/VariantsEditor.tsx` (prop → `OptionRow` → `ValueImagesPanel`)
- Modify: `app/admin/produkty/[id]/ValueImagesPanel.tsx`

**Interfaces:**
- Consumes z Task 1: `collectVariantImageSuggestions`, `sortGroupsForContext`, `filterGroups`, typ `VariantImageGroup`.
- Produces:
  - `getVariantImageSuggestionsAdmin(): Promise<VariantImageGroup[]>` w `app/_lib/products.ts`
  - `ImagePickerModal` (default export) o propsach: `{ groups: VariantImageGroup[]; contextOptionName?: string | null; alreadyUsed: string[]; onPick: (urls: string[]) => void; onCancel: () => void }`
  - nowy prop `variantImageGroups: VariantImageGroup[]` w `ProductEditor` i `VariantsEditor`; `groups: VariantImageGroup[]` + `optionName: string` w `ValueImagesPanel`.

- [ ] **Step 1: Server helper — źródło listy**

W `app/_lib/products.ts` dopisz import przy pozostałych importach z `./product-features`:

```ts
import {
  collectVariantImageSuggestions,
  type VariantImageGroup,
} from "./variant-image-suggestions";
```

i helper na końcu pliku (zaraz po `getFeatureSuggestionsAdmin`):

```ts
// Podpowiedzi zdjęć dla wybieraka „+ Wybierz z wgranych" w edytorze produktu —
// zdjęcia przypisane do wartości opcji wariantów WSZYSTKICH produktów (też
// ukrytych, stąd admin client), bez opcji „Tkanina" (filtr w czystej funkcji).
// Błąd zapytania → pusta lista: edytor działa dalej, tylko bez wybieraka.
export async function getVariantImageSuggestionsAdmin(): Promise<
  VariantImageGroup[]
> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.from("products").select("name, variants");
  if (error) return [];
  return collectVariantImageSuggestions(
    (data ?? []) as { name: unknown; variants: unknown }[]
  );
}
```

- [ ] **Step 2: Podaj listę do edytora**

W `app/admin/produkty/[id]/page.tsx`:

1. Dopisz `getVariantImageSuggestionsAdmin` do importu z `@/app/_lib/products`.
2. Rozszerz `Promise.all` (kolejność destrukturyzacji musi odpowiadać kolejności promes):

```tsx
  const [
    product,
    categories,
    de,
    fabrics,
    fabricGroups,
    variantInfo,
    featureSuggestions,
    variantImageGroups,
  ] = await Promise.all([
    getProduct(id),
    getAllCategories(),
    getProductDe(id),
    getAllFabrics(),
    getFabricPriceGroups(),
    getVariantInfoMap(),
    getFeatureSuggestionsAdmin(),
    getVariantImageSuggestionsAdmin(),
  ]);
```

3. Dodaj prop w JSX: `variantImageGroups={variantImageGroups}`.

- [ ] **Step 3: Sprawdź, że kompiluje się i nic nie padło**

Run: `npx tsc --noEmit`
Expected: błąd wyłącznie o nieznanym propie `variantImageGroups` w `ProductEditor` (dodajemy go w Step 5). Innych błędów być nie może.

- [ ] **Step 4: Modal wyboru**

Utwórz `app/admin/produkty/[id]/ImagePickerModal.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  filterGroups,
  sortGroupsForContext,
  type VariantImageGroup,
} from "@/app/_lib/variant-image-suggestions";
import { inputClass } from "./_shared";

// Wybór już wgranego zdjęcia zamiast ponownego uploadu. Lista = zdjęcia
// przypisane do wartości opcji wariantów innych produktów (bez „Tkaniny",
// bez galerii) — zbiera je collectVariantImageSuggestions. Layout i klasy
// wzorowane na FabricPicker w VariantsEditor, żeby panel był spójny.
// Wybór NIE zapisuje do bazy — utrwala go przycisk zapisu sekcji, dokładnie
// jak przy uploadzie.
export default function ImagePickerModal({
  groups,
  contextOptionName,
  alreadyUsed,
  onPick,
  onCancel,
}: {
  groups: VariantImageGroup[];
  // Nazwa opcji, z której otwarto wybierak — jej grupa idzie na górę.
  contextOptionName?: string | null;
  // URL-e już obecne w docelowej liście — wyszarzone, nieklikalne.
  alreadyUsed: string[];
  onPick: (urls: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const used = useMemo(() => new Set(alreadyUsed), [alreadyUsed]);
  const visible = useMemo(
    () => filterGroups(sortGroupsForContext(groups, contextOptionName), query),
    [groups, contextOptionName, query]
  );

  function toggle(url: string) {
    setSelected((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col p-6 gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-[var(--fg)]">
            Wybierz z wgranych (zaznaczono: {selected.length})
          </h3>
          <input
            type="text"
            autoFocus
            placeholder="Szukaj…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Szukaj zdjęcia"
            className={`${inputClass} max-w-[10rem]`}
          />
        </div>

        <div className="flex-1 overflow-y-auto border border-[var(--border)] rounded-xl">
          {visible.length === 0 ? (
            <p className="p-4 text-xs text-[var(--muted)] italic">Brak dopasowań</p>
          ) : (
            visible.map((group) => (
              <div key={group.key}>
                <div className="p-2 bg-[var(--bg)] border-b border-[var(--border)] sticky top-0">
                  <span className="text-sm font-semibold text-[var(--fg)]">
                    {group.name}
                  </span>
                  <span className="text-[10px] text-[var(--muted)] ml-2">
                    {group.images.length}
                  </span>
                </div>
                <ul className="grid grid-cols-3 sm:grid-cols-4 gap-3 p-3">
                  {group.images.map((img) => {
                    const isUsed = used.has(img.url);
                    const isSelected = selected.includes(img.url);
                    return (
                      <li key={img.url}>
                        <button
                          type="button"
                          onClick={() => toggle(img.url)}
                          disabled={isUsed}
                          aria-pressed={isSelected}
                          className={`w-full text-left rounded-lg border-2 p-1 transition-colors ${
                            isUsed
                              ? "border-[var(--border)] opacity-40 cursor-not-allowed"
                              : isSelected
                                ? "border-[var(--color-gold)]"
                                : "border-transparent hover:border-[var(--border)]"
                          }`}
                        >
                          <span className="relative block aspect-square rounded-md overflow-hidden bg-stone-100 dark:bg-stone-800">
                            <Image
                              src={img.url}
                              alt={`${img.value} — ${img.productName}`}
                              fill
                              sizes="96px"
                              className="object-cover"
                            />
                            {isSelected && (
                              <span className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-[var(--color-gold)] text-white text-xs">
                                ✓
                              </span>
                            )}
                          </span>
                          <span className="block mt-1 text-[11px] text-[var(--fg)] truncate">
                            {img.value}
                          </span>
                          <span className="block text-[10px] text-[var(--muted)] truncate">
                            {isUsed ? "już dodane" : img.productName}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
          <p className="text-[11px] text-[var(--muted)]">
            Wybór trzeba jeszcze zapisać przyciskiem zapisu sekcji.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={() => onPick(selected)}
              disabled={selected.length === 0}
              className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
            >
              Dodaj wybrane ({selected.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

Uwaga na gotchę z pamięci projektu: `aspect-square` na elemencie inline (`<span>`) nie działa — dlatego miniatura ma `block` + `<Image fill>` w `relative` kontenerze. Nie zmieniaj tego na goły `<span>`.

- [ ] **Step 5: Przepuść prop przez ProductEditor i VariantsEditor**

W `app/admin/produkty/[id]/ProductEditor.tsx`:

1. Dopisz import typu: `import type { VariantImageGroup } from "@/app/_lib/variant-image-suggestions";`
2. Dodaj do listy propsów (destrukturyzacja + typ):

```tsx
  variantImageGroups,
```

```tsx
  // Zdjęcia wartości opcji z innych produktów — zasilają wybierak
  // „+ Wybierz z wgranych" (bez opcji „Tkanina", bez galerii).
  variantImageGroups: VariantImageGroup[];
```

3. Przekaż do `VariantsEditor` (linia ~704): dodaj `variantImageGroups={variantImageGroups}` do istniejących propsów.

W `app/admin/produkty/[id]/VariantsEditor.tsx`:

4. Import typu: `import type { VariantImageGroup } from "@/app/_lib/variant-image-suggestions";`
5. Dodaj prop `variantImageGroups: VariantImageGroup[]` do destrukturyzacji i typu propsów `VariantsEditor`.
6. W renderze `OptionRow` (mapowanie `variants.options`) dodaj `imageGroups={variantImageGroups}`.
7. W `OptionRow` dodaj do propsów `imageGroups: VariantImageGroup[]` i przekaż do `ValueImagesPanel`:

```tsx
                {imagesFor === v && (
                  <ValueImagesPanel
                    value={v}
                    urls={option.value_images?.[v] ?? []}
                    groups={imageGroups}
                    optionName={option.name}
                    onAdd={(urls) => onAddValueImages(v, urls)}
                    onRemove={(url) => onRemoveValueImage(v, url)}
                    onToast={onToast}
                  />
                )}
```

- [ ] **Step 6: Przycisk i modal w panelu 📷**

W `app/admin/produkty/[id]/ValueImagesPanel.tsx`:

1. Dopisz importy:

```tsx
import { useState } from "react";
import ImagePickerModal from "./ImagePickerModal";
import type { VariantImageGroup } from "@/app/_lib/variant-image-suggestions";
```

2. Dodaj propsy `groups: VariantImageGroup[]` i `optionName: string` (z komentarzem, że `optionName` służy tylko do wysunięcia właściwej grupy na górę wybieraka).
3. Dodaj stan `const [pickerOpen, setPickerOpen] = useState(false);`
4. Zamień pojedynczy `<label>` uploadu na wiersz dwóch akcji — upload zostaje bez zmian, obok dochodzi przycisk (renderowany tylko gdy jest z czego wybierać):

```tsx
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={`px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors cursor-pointer ${
            upload.uploading ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {upload.progressText ?? "+ Dodaj zdjęcia"}
          <input {...upload.inputProps} className="hidden" />
        </label>
        {groups.length > 0 && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold-text)] transition-colors"
          >
            + Wybierz z wgranych
          </button>
        )}
      </div>
```

5. Na końcu zwracanego JSX (po `<p>` z podpowiedzią) dodaj modal:

```tsx
      {pickerOpen && (
        <ImagePickerModal
          groups={groups}
          contextOptionName={optionName}
          alreadyUsed={urls}
          onPick={(picked) => {
            onAdd(picked);
            setPickerOpen(false);
          }}
          onCancel={() => setPickerOpen(false)}
        />
      )}
```

Dedupe przy wstawianiu jest już w `addValueImages` w `VariantsEditor` (`urls.filter((u) => !current.includes(u))`) — nie duplikuj go tutaj.

- [ ] **Step 7: Weryfikacja**

Run: `npm test` → wszystko zielone (bez nowych testów w tym tasku).
Run: `npx tsc --noEmit` → czysto.
Run: `npm run lint` → czysto.
Run: `npm run build` → sukces (łapie błędy podziału server/client, których `tsc` nie widzi).

Jeśli build krzyknie o `next/image` i nieznanym hoście — nie zmieniaj konfiguracji: URL-e pochodzą z tego samego bucketa co dotychczasowe miniatury w tym panelu, więc host jest już dozwolony w `next.config`.

- [ ] **Step 8: Commit**

```bash
git add app/_lib/products.ts "app/admin/produkty/[id]/page.tsx" "app/admin/produkty/[id]/ImagePickerModal.tsx" "app/admin/produkty/[id]/ProductEditor.tsx" "app/admin/produkty/[id]/VariantsEditor.tsx" "app/admin/produkty/[id]/ValueImagesPanel.tsx"
git commit -m "feat(admin): wybór już wgranego zdjęcia przy wartości opcji wariantu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wybierak w sekcji „Zdjęcia produktu"

**Files:**
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx` (sekcja „Zdjęcia produktu", linie ~601-699)

**Interfaces:**
- Consumes z Task 2: prop `variantImageGroups` w `ProductEditor`, komponent `ImagePickerModal`.
- Produces: nic dla dalszych tasków (ostatni task).

- [ ] **Step 1: Stan i import**

W `app/admin/produkty/[id]/ProductEditor.tsx`:

1. Dopisz import: `import ImagePickerModal from "./ImagePickerModal";`
2. Obok stanu galerii (`images`, `savedImages`, ~linia 50) dodaj:

```tsx
  // Wybierak „+ Wybierz z wgranych" dla globalnej galerii. Źródło to zdjęcia
  // wartości opcji wariantów (bez „Tkaniny") — patrz spec: galerie innych
  // produktów świadomie nie zasilają listy.
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);
```

- [ ] **Step 2: Drugi przycisk w nagłówku sekcji**

Zamień zawartość `headerAside` sekcji „Zdjęcia produktu" (dziś sam `<label>`) na wiersz dwóch akcji:

```tsx
        headerAside={
          <div className="shrink-0 flex flex-wrap items-center gap-2">
            <label
              className={`px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors cursor-pointer ${
                upload.uploading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {upload.progressText ?? "+ Dodaj zdjęcia"}
              <input {...upload.inputProps} className="hidden" />
            </label>
            {variantImageGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setGalleryPickerOpen(true)}
                className="px-5 py-3 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
              >
                + Wybierz z wgranych
              </button>
            )}
          </div>
        }
```

- [ ] **Step 3: Modal (poza `CollapsibleSection`, żeby zwinięcie sekcji go nie ukryło)**

Bezpośrednio po zamykającym `</CollapsibleSection>` sekcji „Zdjęcia produktu" (przed komentarzem sekcji „Warianty") dodaj:

```tsx
      {galleryPickerOpen && (
        <ImagePickerModal
          groups={variantImageGroups}
          alreadyUsed={images}
          onPick={(picked) => {
            // Dedupe: ten sam URL nie ma wejść do galerii dwa razy (upload
            // zawsze dawał nowe URL-e, więc dotąd nie było takiego ryzyka).
            setImages((prev) => [...prev, ...picked.filter((u) => !prev.includes(u))]);
            setGalleryPickerOpen(false);
          }}
          onCancel={() => setGalleryPickerOpen(false)}
        />
      )}
```

- [ ] **Step 4: Weryfikacja**

Run: `npm test` → zielone.
Run: `npx tsc --noEmit` → czysto.
Run: `npm run lint` → czysto.
Run: `npm run build` → sukces.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/produkty/[id]/ProductEditor.tsx"
git commit -m "feat(admin): wybór już wgranego zdjęcia w galerii produktu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Ręczny klik-test (po Task 3, na `npm run dev`)

⚠️ Lokalny dev używa TEJ SAMEJ bazy co produkcja — zapisy dotykają żywych danych. Do testu wybierz produkt testowy albo cofnij zmiany po sprawdzeniu.

1. `/admin/produkty/<id>` → sekcja „Warianty" → opcja „Stelaż" → 📷 przy wartości → widać „+ Wybierz z wgranych".
2. Modal: na górze grupa „Stelaż", niżej pozostałe grupy (np. „Kolor nóżek", „Strona"). Nigdzie nie ma tkanin.
3. Zaznacz 2 miniatury → „Dodaj wybrane (2)" → miniatury pojawiają się przy wartości → „Zapisz warianty" → F5 → zdjęcia na miejscu.
4. Otwórz wybierak ponownie — te dwa zdjęcia są wyszarzone z podpisem „już dodane" i nie da się ich kliknąć.
5. Szukajka „stelaz" (bez ogonków) znajduje grupę „STELAŻ"; „czegoś takiego nie ma" → „Brak dopasowań".
6. Sekcja „Zdjęcia produktu" → „+ Wybierz z wgranych" → wybór → „Zapisz zdjęcia" → F5 → zdjęcie w galerii.
7. Karta produktu na `/produkt/<id>` i `/de/produkt/<id>` wygląda jak przed zmianą.

---

## Self-review (wykonany przy pisaniu planu)

- **Pokrycie specu:** zachowania 1-2 → Task 2 Step 6 i Task 3 Step 2; 3 → Task 1 (filtr `EXCLUDED_OPTION_SLUGS`, brak `images` w źródle) + Task 2 Step 1; 4 → `sortGroupsForContext` + nagłówki grup; 5 → podpis `value` / `productName`; 6 → `selected` + „Dodaj wybrane (n)"; 7 → `alreadyUsed` + `disabled`; 8 → `filterGroups`; 9 → brak zapisu w modalu + tekst w stopce; 10 → `groups.length > 0` w obu miejscach; 11 → istniejący dedupe w `addValueImages` + nowy filtr w `setImages`. Model danych/migracje: brak zmian — nic do zrobienia. Testy specu → Task 1 Step 1. Kryteria akceptacji → sekcja klik-testu.
- **Placeholdery:** brak — każdy krok ma pełny kod lub dokładne polecenie.
- **Spójność typów:** `VariantImageGroup` / `VariantImageSuggestion` używane identycznie w Task 1, 2 i 3; nazwy propsów: `variantImageGroups` (ProductEditor, VariantsEditor), `imageGroups` (OptionRow — świadomie krótsza, lokalna nazwa), `groups` (ValueImagesPanel, ImagePickerModal); `getVariantImageSuggestionsAdmin` bez wariantów pisowni.
