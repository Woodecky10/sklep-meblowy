# Pasek zaufania + teksty ogólne (TopBar/stopka) z DB — plan implementacji (krok 2/3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pozycje paska zaufania (ikona + etykieta + dopiska, PL+DE) oraz slogan TopBaru i tagline stopki edytowalne z `/admin/strona-glowna`; zmiana obejmuje wszystkie 3 miejsca osadzenia paska (home, karta produktu, stopka).

**Architecture:** Dwie nowe tabele: `trust_items` (pozycje paska, wzorzec `home_tiles`) i `site_texts` (klucz→wartość PL+DE). `TrustBar` staje się async i pobiera pozycje z cache'owanego fetcha; ikony to rejestr 10 SVG w kodzie mapowany po kluczu. TopBar/Footer czytają `site_texts` z fallbackiem na słownik. Hub `/admin/strona-glowna` (z kroku 1) zostaje rozszerzony o edycję pozycji paska (w rozwinięciu sekcji „Pasek zaufania") i kartę „Teksty ogólne".

**Tech Stack:** Next.js 16.2.4, Supabase, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-07-13-edycja-home-motyw-design.md`
**Wymaga:** zmergowany plan `2026-07-13-home-sekcje-hub.md` (hub istnieje, migracja 49 na prodzie).

## Global Constraints

- **Next 16 ≠ Next z treningu** — przy wątpliwościach czytaj `node_modules/next/dist/docs/`. `revalidateTag(tag, "max")` — sygnatura dwuargumentowa.
- **Turbopack gotcha:** w plikach `"use server"` tylko async akcje, zero `export type`.
- **`unstable_cache`:** bez `cookies()` w środku; `createAdminClient()` OK (wzorzec `slides.ts`).
- **Numeracja migracji: ta faza = `50_trust_items_site_texts.sql`** (47/48 zarezerwowane przez PR #48 P24; 49 zajęte przez krok 1).
- **Baza Supabase = PRODUKCJA.** Migracja na prod przez Supabase MCP dopiero po pokazaniu SQL i potwierdzeniu użytkownika.
- **Rozdział klient/serwer:** `app/_components/ui/trust-icons.tsx` to moduł PREZENTACYJNY (zero importów serwerowych) — używany i przez serwerowy `TrustBar`, i przez kliencki picker ikon w adminie. `app/_lib/trust-items.ts` (importuje `next/cache` + supabase) wolno importować TYLKO w kodzie serwerowym.
- Panel admina PL-only; komentarze po polsku; importy `@/app/...`; TDD.
- Komendy: `npx vitest run <plik>`, `npm test`, `npx tsc --noEmit`, `npm run build`.
- **Branch:** `feat/trust-items-teksty` od `main` (po merge kroku 1). Na końcu superpowers:finishing-a-development-branch.

## File Structure

- Create: `supabase/migrations/50_trust_items_site_texts.sql` — obie tabele + seed + RLS + RPC reorder
- Create: `app/_components/ui/trust-icons.tsx` — rejestr 10 ikon (klucze, etykiety PL, komponenty SVG)
- Create: `app/_lib/trust-items.ts` — typy, lokalizacja, przygotowanie listy, fetch+cache+inwalidacja
- Create: `app/_lib/__tests__/trust-items.test.ts`
- Create: `app/_lib/site-texts.ts` — typy, `siteText()`, fetch+cache+inwalidacja
- Create: `app/_lib/__tests__/site-texts.test.ts`
- Create: `app/admin/strona-glowna/TrustItemsEditor.tsx` — kliencki edytor pozycji paska
- Create: `app/admin/strona-glowna/SiteTextsCard.tsx` — kliencka karta „Teksty ogólne"
- Modify: `app/_components/ui/TrustBar.tsx` — async, pozycje z DB, ikony z rejestru, dynamiczna liczba kolumn
- Modify: `app/_components/layout/TopBar.tsx` — slogan z `site_texts`
- Modify: `app/_components/layout/Footer.tsx` — tagline z `site_texts`
- Modify: `app/admin/strona-glowna/actions.ts` — akcje trust items + site texts
- Modify: `app/admin/strona-glowna/page.tsx` — fetch trust items + site texts
- Modify: `app/admin/strona-glowna/HomeSectionsEditor.tsx` — edytor pozycji w rozwinięciu sekcji trust_bar

---

### Task 1: Migracja `50_trust_items_site_texts.sql`

**Files:**
- Create: `supabase/migrations/50_trust_items_site_texts.sql`

**Interfaces:**
- Produces: tabele `public.trust_items`, `public.site_texts`, funkcja `public.reorder_trust_items(uuid[])`.

- [ ] **Step 1: Napisz migrację**

```sql
-- supabase/migrations/50_trust_items_site_texts.sql
-- Pasek zaufania (pozycje) + teksty globalne (TopBar/stopka) edytowalne
-- w /admin/strona-glowna. Seed = dzisiejsza treść ze słowników 1:1.

-- ── trust_items ─────────────────────────────────────────────────────────
create table if not exists public.trust_items (
  id uuid primary key default gen_random_uuid(),
  icon text not null,
  label text not null,
  label_de text,
  subline text,
  subline_de text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed tylko do pustej tabeli (id losowe — nie ma jak on conflict).
insert into public.trust_items (icon, label, label_de, subline, subline_de, sort_order, active)
select * from (values
  ('medal-pl',     'Polski producent',   'Polnischer Hersteller', null::text,                null::text,       0, true),
  ('shield-check', 'Gwarancja jakości',  'Qualitätsgarantie',     null,                      null,             1, true),
  ('truck-free',   'Darmowa dostawa',    'Kostenlose Lieferung',  'na terenie całej Polski', 'in ganz Polen',  2, true),
  ('warranty-2y',  '2 lata gwarancji',   '2 Jahre Garantie',      null,                      null,             3, true)
) as seed(icon, label, label_de, subline, subline_de, sort_order, active)
where not exists (select 1 from public.trust_items);

alter table public.trust_items enable row level security;
drop policy if exists trust_items_read on public.trust_items;
create policy trust_items_read on public.trust_items
  for select using (true);
revoke insert, update, delete on public.trust_items from anon, authenticated;

-- Atomowy reorder (wzorzec migracji 28).
create or replace function public.reorder_trust_items(p_ids uuid[])
returns void language sql as $$
  update public.trust_items t
     set sort_order = (o.ord - 1)::int,
         updated_at = now()
    from unnest(p_ids) with ordinality as o(id, ord)
   where t.id = o.id;
$$;
revoke execute on function public.reorder_trust_items(uuid[]) from public;
grant execute on function public.reorder_trust_items(uuid[]) to service_role;

-- ── site_texts ──────────────────────────────────────────────────────────
create table if not exists public.site_texts (
  key text primary key,
  value text,
  value_de text,
  updated_at timestamptz not null default now()
);

insert into public.site_texts (key, value, value_de) values
  ('topbar_slogan',  'Polski producent mebli tapicerowanych', 'Polnischer Hersteller von Polstermöbeln'),
  ('footer_tagline', 'Tworzymy przestrzenie, w których chce się żyć. Meble najwyższej jakości, z pasją do detalu.', 'Wir schaffen Räume, in denen man leben möchte. Möbel von höchster Qualität, mit Liebe zum Detail.')
on conflict (key) do nothing;

alter table public.site_texts enable row level security;
drop policy if exists site_texts_read on public.site_texts;
create policy site_texts_read on public.site_texts
  for select using (true);
revoke insert, update, delete on public.site_texts from anon, authenticated;
```

- [ ] **Step 2: Sanity-check seeda ze słownikami**

Wartości seeda muszą być identyczne co do znaku z `app/_lib/dictionaries/pl.ts`
(`trustBar.producer/quality/delivery/deliveryScope/warranty`, `topbar.slogan`,
`footer.tagline`) i `de.ts` (odpowiedniki). Porównaj ręcznie.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/50_trust_items_site_texts.sql
git commit -m "feat(db): migracja 50 - trust_items + site_texts + seed + RLS + RPC reorder"
```

---

### Task 2: Rejestr ikon `trust-icons.tsx`

**Files:**
- Create: `app/_components/ui/trust-icons.tsx`

**Interfaces:**
- Consumes: nic serwerowego (moduł prezentacyjny — importowalny z klienta i serwera).
- Produces (dla Tasków 3, 4, 8):
  - `TRUST_ICON_KEYS: readonly ["medal-pl","shield-check","truck-free","warranty-2y","star","leaf","headset","wallet","hand-heart","clock"]`
  - `type TrustIconKey = (typeof TRUST_ICON_KEYS)[number]`
  - `isTrustIconKey(v: string): v is TrustIconKey`
  - `type TrustIconTexts = { iconFree: string; iconYears: string; iconYearsWord: string }`
  - `TRUST_ICONS: Record<TrustIconKey, (t: TrustIconTexts) => ReactNode>`
  - `TRUST_ICON_LABELS: Record<TrustIconKey, string>` — etykiety PL do pickera w adminie

- [ ] **Step 1: Napisz moduł ikon**

Przenieś 4 istniejące ikony z `app/_components/ui/TrustBar.tsx` (`MedalPL`,
`ShieldCheck`, `TruckFree`, `ShieldYears` — kod 1:1, wraz ze stałą `GOLD`)
i dodaj 6 nowych w tym samym stylu (kontur `currentColor` strokeWidth 5,
akcent złoty, viewBox 104):

```tsx
// app/_components/ui/trust-icons.tsx
// Rejestr ikon paska zaufania — klucz z DB (trust_items.icon) → SVG.
// Moduł czysto prezentacyjny: używa go serwerowy TrustBar ORAZ kliencki
// picker ikon w adminie — nie wolno tu importować niczego serwerowego.

import type { ReactNode } from "react";

const GOLD = "var(--color-gold)";

export const TRUST_ICON_KEYS = [
  "medal-pl",
  "shield-check",
  "truck-free",
  "warranty-2y",
  "star",
  "leaf",
  "headset",
  "wallet",
  "hand-heart",
  "clock",
] as const;

export type TrustIconKey = (typeof TRUST_ICON_KEYS)[number];

export function isTrustIconKey(v: string): v is TrustIconKey {
  return (TRUST_ICON_KEYS as readonly string[]).includes(v);
}

// Teksty osadzone w ikonach (0 zł / 2 LATA|JAHRE) — ze słownika trustBar.
export type TrustIconTexts = {
  iconFree: string;
  iconYears: string;
  iconYearsWord: string;
};

// Etykiety PL do pickera w adminie.
export const TRUST_ICON_LABELS: Record<TrustIconKey, string> = {
  "medal-pl": "Medal PL",
  "shield-check": "Tarcza z ptaszkiem",
  "truck-free": "Ciężarówka (0 zł)",
  "warranty-2y": "Tarcza „2 lata”",
  star: "Gwiazdka",
  leaf: "Liść (eko)",
  headset: "Słuchawki (obsługa)",
  wallet: "Portfel",
  "hand-heart": "Serce w dłoni",
  clock: "Zegar",
};

export const TRUST_ICONS: Record<TrustIconKey, (t: TrustIconTexts) => ReactNode> = {
  "medal-pl": () => <MedalPL />,
  "shield-check": () => <ShieldCheck />,
  "truck-free": (t) => <TruckFree free={t.iconFree} />,
  "warranty-2y": (t) => <ShieldYears years={t.iconYears} word={t.iconYearsWord} />,
  star: () => <StarBadge />,
  leaf: () => <Leaf />,
  headset: () => <Headset />,
  wallet: () => <Wallet />,
  "hand-heart": () => <HandHeart />,
  clock: () => <Clock />,
};

// ── 4 istniejące ikony: przenieś 1:1 z TrustBar.tsx ──
// function MedalPL() { ... }        (bez zmian)
// function ShieldCheck() { ... }    (bez zmian)
// function TruckFree({ free }: { free: string }) { ... }   (bez zmian)
// function ShieldYears({ years, word }: { years: string; word: string }) { ... } (bez zmian)

// ── 6 nowych ikon (ten sam język wizualny) ──

// Duża gwiazda z mniejszą złotą w środku.
function StarBadge() {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden>
      <path d="M52 10l12.4 25.2 27.8 4-20.1 19.6 4.7 27.7L52 73.4 27.2 86.5l4.7-27.7L11.8 39.2l27.8-4L52 10z" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      <path d="M52 38l5.4 11 12.1 1.7-8.7 8.5 2 12L52 65.5l-10.8 5.7 2-12-8.7-8.5 12.1-1.7 5.4-11z" stroke={GOLD} strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

// Liść ze złotą żyłką.
function Leaf() {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden>
      <path d="M20 84C20 44 48 20 88 20c0 40-24 68-64 68" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      <path d="M26 78C42 62 58 46 80 28" stroke={GOLD} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// Słuchawki ze złotym mikrofonem.
function Headset() {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden>
      <path d="M20 62v-8a32 32 0 0 1 64 0v8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <rect x="14" y="58" width="14" height="24" rx="6" stroke="currentColor" strokeWidth="5" />
      <rect x="76" y="58" width="14" height="24" rx="6" stroke="currentColor" strokeWidth="5" />
      <path d="M83 82v2a10 10 0 0 1-10 10H62" stroke={GOLD} strokeWidth="5" strokeLinecap="round" />
      <circle cx="58" cy="94" r="4" fill={GOLD} />
    </svg>
  );
}

// Portfel ze złotym zapięciem.
function Wallet() {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden>
      <rect x="14" y="30" width="76" height="50" rx="8" stroke="currentColor" strokeWidth="5" />
      <path d="M14 44h76" stroke="currentColor" strokeWidth="5" />
      <rect x="64" y="52" width="26" height="16" rx="5" stroke={GOLD} strokeWidth="4" />
      <circle cx="77" cy="60" r="3" fill={GOLD} />
    </svg>
  );
}

// Dłoń ze złotym sercem.
function HandHeart() {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden>
      <path d="M18 70h14l12 8h20a6 6 0 0 0 0-12H50" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 92h18l16 6 30-10" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M52 40c-7-12 7-21 12-11 5-10 19-1 12 11-4 7-12 11-12 11s-8-4-12-11z" stroke={GOLD} strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

// Zegar ze złotymi wskazówkami.
function Clock() {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden>
      <circle cx="52" cy="52" r="40" stroke="currentColor" strokeWidth="5" />
      <path d="M52 30v22l16 10" stroke={GOLD} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

(W miejscach oznaczonych „przenieś 1:1" wklej dokładny kod funkcji z
aktualnego `app/_components/ui/TrustBar.tsx` — łącznie z komentarzami.)

- [ ] **Step 2: Weryfikacja typów**

Run: `npx tsc --noEmit`
Expected: zero błędów (TrustBar jeszcze używa swoich lokalnych kopii — usunie je Task 4).

- [ ] **Step 3: Commit**

```bash
git add app/_components/ui/trust-icons.tsx
git commit -m "feat(trustbar): rejestr 10 ikon paska zaufania (4 istniejace + 6 nowych)"
```

---

### Task 3: Logika `trust-items` (lokalizacja, przygotowanie listy) + fetch — TDD

**Files:**
- Create: `app/_lib/trust-items.ts`
- Test: `app/_lib/__tests__/trust-items.test.ts`

**Interfaces:**
- Consumes: `isTrustIconKey`, `type TrustIconKey` z `@/app/_components/ui/trust-icons`; słowniki `pl`/`de`; `Locale`.
- Produces (dla Tasków 4, 7, 8):
  - `type TrustItemRow = { id: string; icon: string; label: string; label_de: string | null; subline: string | null; subline_de: string | null; sort_order: number; active: boolean }`
  - `type LocalizedTrustItem = { id: string; icon: TrustIconKey; label: string; subline: string | null }`
  - `prepareTrustItems(rows: TrustItemRow[] | null, locale: Locale): LocalizedTrustItem[]`
  - `TRUST_ITEMS_CACHE_TAG = "trust-items"`
  - `getTrustItems(): Promise<TrustItemRow[] | null>` (cache; `null` = błąd odczytu → fallback)
  - `getAllTrustItems(): Promise<TrustItemRow[]>` (admin, bez cache)
  - `invalidateTrustItemsCache(): void`

- [ ] **Step 1: Napisz failing test**

```ts
// app/_lib/__tests__/trust-items.test.ts
import { describe, it, expect } from "vitest";
import { prepareTrustItems, type TrustItemRow } from "@/app/_lib/trust-items";
import { pl } from "@/app/_lib/dictionaries/pl";
import { de } from "@/app/_lib/dictionaries/de";

const row = (over: Partial<TrustItemRow>): TrustItemRow => ({
  id: "x",
  icon: "star",
  label: "Etykieta",
  label_de: null,
  subline: null,
  subline_de: null,
  sort_order: 0,
  active: true,
  ...over,
});

describe("prepareTrustItems", () => {
  it("null (błąd odczytu / brak migracji) → 4 domyślne pozycje ze słownika", () => {
    const items = prepareTrustItems(null, "pl");
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.icon)).toEqual([
      "medal-pl",
      "shield-check",
      "truck-free",
      "warranty-2y",
    ]);
    expect(items[0].label).toBe(pl.trustBar.producer);
    expect(items[2].subline).toBe(pl.trustBar.deliveryScope);
  });

  it("defaulty po niemiecku dla locale de", () => {
    const items = prepareTrustItems(null, "de");
    expect(items[3].label).toBe(de.trustBar.warranty);
    expect(items[2].subline).toBe(de.trustBar.deliveryScope);
  });

  it("pusta lista z DB (admin usunął wszystko) → pusta lista, BEZ fallbacku", () => {
    expect(prepareTrustItems([], "pl")).toEqual([]);
  });

  it("filtruje nieaktywne i nieznane ikony, sortuje po sort_order", () => {
    const items = prepareTrustItems(
      [
        row({ id: "b", sort_order: 2, label: "B" }),
        row({ id: "off", active: false }),
        row({ id: "bad", icon: "nie-ma-takiej" }),
        row({ id: "a", sort_order: 1, label: "A" }),
      ],
      "pl"
    );
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("de: label_de/subline_de z fallbackiem na PL przy pustych", () => {
    const items = prepareTrustItems(
      [row({ label: "Polska", label_de: "Deutsch", subline: "dopiska", subline_de: "" })],
      "de"
    );
    expect(items[0].label).toBe("Deutsch");
    expect(items[0].subline).toBe("dopiska"); // "" → fallback PL
  });
});
```

- [ ] **Step 2: Uruchom test — FAIL**

Run: `npx vitest run app/_lib/__tests__/trust-items.test.ts`
Expected: FAIL — moduł nie istnieje.

- [ ] **Step 3: Zaimplementuj**

```ts
// app/_lib/trust-items.ts
// Pozycje paska zaufania (tabela trust_items, migracja 50) — edytowane
// w /admin/strona-glowna, renderowane w TrustBar (home / karta produktu /
// stopka). Fallback: null z fetcha (błąd/brak tabeli) → dzisiejsze 4 pozycje
// ze słowników; pusta lista (celowe usunięcie w adminie) → pusty pasek.

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import type { Locale } from "./i18n";
import { pl } from "./dictionaries/pl";
import { de } from "./dictionaries/de";
import { isTrustIconKey, type TrustIconKey } from "../_components/ui/trust-icons";

export type TrustItemRow = {
  id: string;
  icon: string;
  label: string;
  label_de: string | null;
  subline: string | null;
  subline_de: string | null;
  sort_order: number;
  active: boolean;
};

export type LocalizedTrustItem = {
  id: string;
  icon: TrustIconKey;
  label: string;
  subline: string | null;
};

function defaultTrustItems(locale: Locale): LocalizedTrustItem[] {
  const t = locale === "de" ? de.trustBar : pl.trustBar;
  return [
    { id: "default-producer", icon: "medal-pl", label: t.producer, subline: null },
    { id: "default-quality", icon: "shield-check", label: t.quality, subline: null },
    { id: "default-delivery", icon: "truck-free", label: t.delivery, subline: t.deliveryScope },
    { id: "default-warranty", icon: "warranty-2y", label: t.warranty, subline: null },
  ];
}

export function prepareTrustItems(
  rows: TrustItemRow[] | null,
  locale: Locale
): LocalizedTrustItem[] {
  if (rows === null) return defaultTrustItems(locale);
  const pick = (deCol: string | null, plCol: string | null) =>
    locale === "de" && deCol && deCol.trim() ? deCol : plCol;
  return rows
    .filter((r) => r.active && isTrustIconKey(r.icon))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      id: r.id,
      icon: r.icon as TrustIconKey,
      label: pick(r.label_de, r.label) ?? r.label,
      subline: pick(r.subline_de, r.subline),
    }));
}

export const TRUST_ITEMS_CACHE_TAG = "trust-items";

// Cache'ujemy SUROWE wiersze (wszystkie, też nieaktywne — filtruje
// prepareTrustItems per locale). null = błąd odczytu → sygnał fallbacku.
const fetchTrustItems = unstable_cache(
  async (): Promise<TrustItemRow[] | null> => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("trust_items")
      .select("id, icon, label, label_de, subline, subline_de, sort_order, active")
      .order("sort_order", { ascending: true });
    if (error || !data) return null;
    return data as TrustItemRow[];
  },
  ["trust-items"],
  { tags: [TRUST_ITEMS_CACHE_TAG], revalidate: 60 }
);

export const getTrustItems = cache(fetchTrustItems);

// Admin: świeży odczyt bez cache.
export async function getAllTrustItems(): Promise<TrustItemRow[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("trust_items")
    .select("id, icon, label, label_de, subline, subline_de, sort_order, active")
    .order("sort_order", { ascending: true });
  return (data ?? []) as TrustItemRow[];
}

export function invalidateTrustItemsCache() {
  revalidateTag(TRUST_ITEMS_CACHE_TAG, "max");
}
```

- [ ] **Step 4: Uruchom test — PASS**

Run: `npx vitest run app/_lib/__tests__/trust-items.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/trust-items.ts app/_lib/__tests__/trust-items.test.ts
git commit -m "feat(trustbar): logika pozycji paska zaufania + fetch z cache (TDD)"
```

---

### Task 4: `TrustBar` renderuje pozycje z DB

**Files:**
- Modify: `app/_components/ui/TrustBar.tsx`

**Interfaces:**
- Consumes: `getTrustItems`, `prepareTrustItems` (Task 3); `TRUST_ICONS` (Task 2). Propsy `heading`/`eyebrow` z kroku 1 zostają bez zmian.
- Produces: `TrustBar` — async server component; sygnatura propsów NIEZMIENIONA (wywołania w page/produkt/stopce działają bez modyfikacji).

- [ ] **Step 1: Przebuduj komponent**

```tsx
// app/_components/ui/TrustBar.tsx
// Pasek zaufania „Dlaczego warto kupować u nas?” — pozycje z tabeli
// trust_items (/admin/strona-glowna), ikony z rejestru trust-icons.
// Server component, zero JS klienta. Fallback (null z fetcha) = dzisiejsze
// 4 pozycje ze słowników.

import type { Locale } from "@/app/_lib/i18n";
import { getDictionary } from "@/app/_lib/dictionaries";
import { getTrustItems, prepareTrustItems } from "@/app/_lib/trust-items";
import { TRUST_ICONS } from "./trust-icons";

type Props = {
  locale: Locale;
  withHeading?: boolean;
  // Nagłówek sekcji z home_sections (admin) — fallback na słownik.
  heading?: string | null;
  eyebrow?: string | null;
};

export default async function TrustBar({
  locale,
  withHeading = false,
  heading,
  eyebrow,
}: Props) {
  const t = getDictionary(locale).trustBar;
  const rows = await getTrustItems();
  const items = prepareTrustItems(rows, locale);
  if (items.length === 0) return null;

  const resolvedHeading = heading ?? t.heading;
  const resolvedEyebrow = eyebrow ?? t.eyebrow;

  // Liczba kolumn na lg dopasowana do liczby pozycji (Tailwind wymaga
  // literalnych klas — stąd mapa zamiast interpolacji).
  const lgCols =
    items.length >= 4
      ? "lg:grid-cols-4"
      : items.length === 3
        ? "lg:grid-cols-3"
        : items.length === 2
          ? "lg:grid-cols-2"
          : "lg:grid-cols-1";

  return (
    <div className="text-[var(--fg)]">
      {withHeading && (
        <div className="text-center mb-14">
          {resolvedEyebrow && (
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
              {resolvedEyebrow}
            </p>
          )}
          {resolvedHeading && (
            <h2 className="font-display text-4xl font-bold">{resolvedHeading}</h2>
          )}
        </div>
      )}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${lgCols} gap-10 lg:gap-0 lg:divide-x lg:divide-[var(--border)]`}
      >
        {items.map((it) => (
          <div key={it.id} className="flex flex-col items-center gap-8 px-6">
            <span className="h-28 flex items-center">{TRUST_ICONS[it.icon](t)}</span>
            <span className="flex items-start gap-3 text-left">
              <CheckBadge />
              <span className="font-sans font-bold text-lg leading-snug">
                {it.label}
                {it.subline && (
                  <span className="block font-normal text-base text-[var(--muted)]">
                    {it.subline}
                  </span>
                )}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Złoty kwadracik z ✓ przy etykiecie (zostaje tu — to nie jest ikona
// wybieralna, tylko stały element układu pozycji).
function CheckBadge() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="2.2" className="shrink-0 mt-0.5" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="m8.5 12.5 2.5 2.5 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

Usuwasz z pliku: stałą `GOLD`, funkcje `MedalPL`, `ShieldCheck`, `TruckFree`,
`ShieldYears` oraz import `ReactNode` (przeniesione do `trust-icons.tsx`
w Task 2) i lokalną tablicę `items` budowaną ze słownika.

- [ ] **Step 2: Weryfikacja — typy + testy + build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: zielono. Async komponent w children (`FooterTrustBar` w stopce)
kompiluje się bez zmian — React 19 obsługuje async server components
przekazywane jako children.

- [ ] **Step 3: Weryfikacja wizualna**

Run: `npm run dev` → home, dowolna karta produktu, stopka na `/o-nas`, oraz `/de`.
Expected: pasek wygląda IDENTYCZNIE jak dotąd (fallback — tabela jeszcze nie
istnieje na prodzie). Po migracji (Task 9) treść pójdzie z DB.

- [ ] **Step 4: Commit**

```bash
git add app/_components/ui/TrustBar.tsx
git commit -m "feat(trustbar): pozycje z tabeli trust_items + dynamiczne kolumny"
```

---

### Task 5: Logika `site-texts` + fetch — TDD

**Files:**
- Create: `app/_lib/site-texts.ts`
- Test: `app/_lib/__tests__/site-texts.test.ts`

**Interfaces:**
- Consumes: `Locale`, `createAdminClient`, `unstable_cache`/`revalidateTag`, `cache`.
- Produces (dla Tasków 6, 7, 8):
  - `SITE_TEXT_KEYS = ["topbar_slogan", "footer_tagline"] as const`, `type SiteTextKey`
  - `type SiteTextsMap = Record<string, { value: string | null; value_de: string | null }>`
  - `siteText(map: SiteTextsMap, key: SiteTextKey, locale: Locale, fallback: string): string`
  - `SITE_TEXTS_CACHE_TAG = "site-texts"`
  - `getSiteTexts(): Promise<SiteTextsMap>` (cache; `{}` przy błędzie)
  - `invalidateSiteTextsCache(): void`

- [ ] **Step 1: Napisz failing test**

```ts
// app/_lib/__tests__/site-texts.test.ts
import { describe, it, expect } from "vitest";
import { siteText, type SiteTextsMap } from "@/app/_lib/site-texts";

describe("siteText", () => {
  const map: SiteTextsMap = {
    topbar_slogan: { value: "Polski producent", value_de: "Polnischer Hersteller" },
    footer_tagline: { value: "Tagline PL", value_de: "  " },
  };

  it("pl → value", () => {
    expect(siteText(map, "topbar_slogan", "pl", "fallback")).toBe("Polski producent");
  });

  it("de → value_de", () => {
    expect(siteText(map, "topbar_slogan", "de", "fallback")).toBe("Polnischer Hersteller");
  });

  it("de z pustym value_de → fallback na value PL", () => {
    expect(siteText(map, "footer_tagline", "de", "fallback")).toBe("Tagline PL");
  });

  it("brak klucza w mapie → fallback (słownik)", () => {
    expect(siteText({}, "topbar_slogan", "pl", "ze słownika")).toBe("ze słownika");
  });

  it("pusty value → fallback", () => {
    expect(
      siteText({ topbar_slogan: { value: " ", value_de: null } }, "topbar_slogan", "pl", "f")
    ).toBe("f");
  });
});
```

- [ ] **Step 2: Uruchom test — FAIL**

Run: `npx vitest run app/_lib/__tests__/site-texts.test.ts`
Expected: FAIL — moduł nie istnieje.

- [ ] **Step 3: Zaimplementuj**

```ts
// app/_lib/site-texts.ts
// Krótkie teksty globalne (slogan TopBaru, tagline stopki) — tabela
// site_texts (migracja 50), edycja w /admin/strona-glowna. Fallback na
// słownik i18n przekazywany przez wołającego (TopBar/Footer).

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import type { Locale } from "./i18n";

export const SITE_TEXT_KEYS = ["topbar_slogan", "footer_tagline"] as const;
export type SiteTextKey = (typeof SITE_TEXT_KEYS)[number];

export type SiteTextsMap = Record<
  string,
  { value: string | null; value_de: string | null }
>;

// Wybór wartości: DE → value_de → value → fallback; PL → value → fallback.
export function siteText(
  map: SiteTextsMap,
  key: SiteTextKey,
  locale: Locale,
  fallback: string
): string {
  const row = map[key];
  if (!row) return fallback;
  const val =
    locale === "de" && row.value_de && row.value_de.trim()
      ? row.value_de
      : row.value;
  return val && val.trim() ? val : fallback;
}

export const SITE_TEXTS_CACHE_TAG = "site-texts";

const fetchSiteTexts = unstable_cache(
  async (): Promise<SiteTextsMap> => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("site_texts")
      .select("key, value, value_de");
    if (error || !data) return {};
    const map: SiteTextsMap = {};
    for (const row of data as { key: string; value: string | null; value_de: string | null }[]) {
      map[row.key] = { value: row.value, value_de: row.value_de };
    }
    return map;
  },
  ["site-texts"],
  { tags: [SITE_TEXTS_CACHE_TAG], revalidate: 60 }
);

export const getSiteTexts = cache(fetchSiteTexts);

export function invalidateSiteTextsCache() {
  revalidateTag(SITE_TEXTS_CACHE_TAG, "max");
}
```

- [ ] **Step 4: Uruchom test — PASS**

Run: `npx vitest run app/_lib/__tests__/site-texts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/site-texts.ts app/_lib/__tests__/site-texts.test.ts
git commit -m "feat(teksty): site_texts - logika wyboru + fetch z cache (TDD)"
```

---

### Task 6: TopBar i Footer czytają `site_texts`

**Files:**
- Modify: `app/_components/layout/TopBar.tsx`
- Modify: `app/_components/layout/Footer.tsx`

**Interfaces:**
- Consumes: `getSiteTexts`, `siteText` (Task 5).

- [ ] **Step 1: TopBar**

W `app/_components/layout/TopBar.tsx` dodaj import:

```tsx
import { getSiteTexts, siteText } from "@/app/_lib/site-texts";
```

w ciele komponentu (po `const t = getDictionary(locale);`):

```tsx
const texts = await getSiteTexts();
const slogan = siteText(texts, "topbar_slogan", locale, t.topbar.slogan);
```

i w JSX podmień `{t.topbar.slogan}` → `{slogan}`.

- [ ] **Step 2: Footer**

W `app/_components/layout/Footer.tsx` dodaj ten sam import; w `Promise.all`
dodaj `getSiteTexts()`:

```tsx
const [sections, categories, texts] = await Promise.all([
  getSections(locale),
  getCategories(locale),
  getSiteTexts(),
]);
const tagline = siteText(texts, "footer_tagline", locale, t.footer.tagline);
```

i w JSX podmień `{t.footer.tagline}` → `{tagline}`.

- [ ] **Step 3: Weryfikacja**

Run: `npx tsc --noEmit && npm run dev`
Expected: TopBar/stopka wyglądają jak dotąd (fallback na słownik do czasu migracji).

- [ ] **Step 4: Commit**

```bash
git add app/_components/layout/TopBar.tsx app/_components/layout/Footer.tsx
git commit -m "feat(teksty): slogan TopBaru i tagline stopki z site_texts (fallback slownik)"
```

---

### Task 7: Akcje admina — trust items + site texts

**Files:**
- Modify: `app/admin/strona-glowna/actions.ts` (dopisz na końcu)

**Interfaces:**
- Consumes: `invalidateTrustItemsCache` (Task 3), `invalidateSiteTextsCache`, `SITE_TEXT_KEYS` (Task 5), `isTrustIconKey` (Task 2), istniejące helpery `sanitize`/`emptyToNull`/`revalidateHome` z kroku 1.
- Produces (dla Task 8):
  - `createTrustItem(formData)` — pola: `icon`, `label`, `label_de`, `subline`, `subline_de`, `active`("1")
  - `updateTrustItem(formData)` — j.w. + `id`
  - `deleteTrustItem(formData)` — `id`
  - `toggleTrustItemActive(formData)` — `id`, `active`("1"/"0")
  - `reorderTrustItems(ids: string[])`
  - `updateSiteTexts(formData)` — pola: `topbar_slogan`, `topbar_slogan_de`, `footer_tagline`, `footer_tagline_de`
  - wszystkie: `Promise<ActionResult>`

- [ ] **Step 1: Dopisz akcje**

```ts
// (dopisz do app/admin/strona-glowna/actions.ts; uzupełnij importy:)
import { isTrustIconKey } from "@/app/_components/ui/trust-icons";
import { invalidateTrustItemsCache } from "@/app/_lib/trust-items";
import { invalidateSiteTextsCache, SITE_TEXT_KEYS } from "@/app/_lib/site-texts";

// ── Pasek zaufania — pozycje ────────────────────────────────────────────

function readTrustItemFields(formData: FormData) {
  const icon = sanitize(formData.get("icon"), 50);
  const label = sanitize(formData.get("label"), 200);
  return {
    icon,
    label,
    label_de: emptyToNull(sanitize(formData.get("label_de"), 200)),
    subline: emptyToNull(sanitize(formData.get("subline"), 200)),
    subline_de: emptyToNull(sanitize(formData.get("subline_de"), 200)),
    active: formData.get("active") === "1",
  };
}

export async function createTrustItem(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const fields = readTrustItemFields(formData);
  if (!isTrustIconKey(fields.icon)) return { ok: false, error: "Wybierz ikonę z listy" };
  if (!fields.label) return { ok: false, error: "Etykieta jest wymagana" };

  const supabase = await createAdminClient();
  // Nowa pozycja na końcu.
  const { data: maxRow } = await supabase
    .from("trust_items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from("trust_items")
    .insert({ ...fields, sort_order: nextOrder } as never);
  if (error) return { ok: false, error: error.message };

  invalidateTrustItemsCache();
  revalidateHome();
  return { ok: true, message: `Pozycja "${fields.label}" dodana` };
}

export async function updateTrustItem(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id pozycji" };
  const fields = readTrustItemFields(formData);
  if (!isTrustIconKey(fields.icon)) return { ok: false, error: "Wybierz ikonę z listy" };
  if (!fields.label) return { ok: false, error: "Etykieta jest wymagana" };

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("trust_items")
    .update({ ...fields, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateTrustItemsCache();
  revalidateHome();
  return { ok: true, message: "Pozycja zaktualizowana" };
}

export async function deleteTrustItem(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id pozycji" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("trust_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateTrustItemsCache();
  revalidateHome();
  return { ok: true, message: "Pozycja usunięta" };
}

export async function toggleTrustItemActive(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };
  const active = formData.get("active") === "1";

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("trust_items")
    .update({ active, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateTrustItemsCache();
  revalidateHome();
  return { ok: true, message: active ? "Pozycja włączona" : "Pozycja ukryta" };
}

export async function reorderTrustItems(ids: string[]): Promise<ActionResult> {
  await requireAdmin();

  if (!Array.isArray(ids) || ids.length === 0 || new Set(ids).size !== ids.length) {
    return { ok: false, error: "Nieprawidłowa lista pozycji" };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("reorder_trust_items", { p_ids: ids });
  if (error) return { ok: false, error: `Reorder zawiódł: ${error.message}` };

  invalidateTrustItemsCache();
  revalidateHome();
  return { ok: true, message: "Kolejność zapisana" };
}

// ── Teksty ogólne (TopBar / stopka) ─────────────────────────────────────
export async function updateSiteTexts(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const rows = SITE_TEXT_KEYS.map((key) => ({
    key,
    value: emptyToNull(sanitize(formData.get(key), 500)),
    value_de: emptyToNull(sanitize(formData.get(`${key}_de`), 500)),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("site_texts")
    .upsert(rows as never[], { onConflict: "key" });
  if (error) return { ok: false, error: error.message };

  invalidateSiteTextsCache();
  revalidateHome();
  return { ok: true, message: "Teksty zapisane" };
}
```

- [ ] **Step 2: Weryfikacja typów**

Run: `npx tsc --noEmit`
Expected: zero błędów.

- [ ] **Step 3: Commit**

```bash
git add app/admin/strona-glowna/actions.ts
git commit -m "feat(admin): akcje pozycji paska zaufania i tekstow ogolnych"
```

---

### Task 8: Hub — edytor pozycji paska + karta „Teksty ogólne"

**Files:**
- Create: `app/admin/strona-glowna/TrustItemsEditor.tsx`
- Create: `app/admin/strona-glowna/SiteTextsCard.tsx`
- Modify: `app/admin/strona-glowna/page.tsx`
- Modify: `app/admin/strona-glowna/HomeSectionsEditor.tsx`

**Interfaces:**
- Consumes: akcje (Task 7), `getAllTrustItems`/`TrustItemRow` (Task 3), `getSiteTexts`-odpowiednik admina (dołożony niżej), `TRUST_ICONS`/`TRUST_ICON_LABELS`/`TRUST_ICON_KEYS` (Task 2), `Card`/`Field`/`inputCls` z `_shared`, `useConfirm` z `@/app/_context/ConfirmContext`, słownik `pl` (teksty ikon w podglądzie).
- Produces: hub edytuje pozycje paska w rozwinięciu sekcji „Pasek zaufania" oraz teksty TopBar/stopki w karcie na dole strony.

- [ ] **Step 1: Admin-odczyt site_texts (bez cache)**

Dopisz do `app/_lib/site-texts.ts`:

```ts
// Admin: świeży odczyt bez cache (formularz musi widzieć zapis po refresh).
export async function getAllSiteTexts(): Promise<SiteTextsMap> {
  const supabase = await createAdminClient();
  const { data } = await supabase.from("site_texts").select("key, value, value_de");
  const map: SiteTextsMap = {};
  for (const row of (data ?? []) as { key: string; value: string | null; value_de: string | null }[]) {
    map[row.key] = { value: row.value, value_de: row.value_de };
  }
  return map;
}
```

- [ ] **Step 2: `TrustItemsEditor`**

```tsx
// app/admin/strona-glowna/TrustItemsEditor.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, inputCls } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";
import {
  TRUST_ICONS,
  TRUST_ICON_KEYS,
  TRUST_ICON_LABELS,
  type TrustIconKey,
} from "@/app/_components/ui/trust-icons";
import type { TrustItemRow } from "@/app/_lib/trust-items";
import type { ActionResult } from "@/app/_lib/types";
import { pl } from "@/app/_lib/dictionaries/pl";
import {
  createTrustItem,
  updateTrustItem,
  deleteTrustItem,
  toggleTrustItemActive,
  reorderTrustItems,
} from "./actions";

// Teksty osadzone w ikonach — panel admina jest PL-only.
const ICON_TEXTS = pl.trustBar;

export default function TrustItemsEditor({
  initialItems,
  onResult,
}: {
  initialItems: TrustItemRow[];
  onResult: (r: ActionResult) => void;
}) {
  const [items, setItems] = useState(initialItems);
  const [prevInitial, setPrevInitial] = useState(initialItems);
  if (initialItems !== prevInitial) {
    setPrevInitial(initialItems);
    setItems(initialItems);
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();
  const confirm = useConfirm();
  const router = useRouter();

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    const prev = items;
    setItems(next);
    startTransition(async () => {
      const res = await reorderTrustItems(next.map((i) => i.id));
      if (!res.ok) setItems(prev);
      onResult(res);
    });
  }

  function toggle(item: TrustItemRow) {
    const fd = new FormData();
    fd.set("id", item.id);
    fd.set("active", item.active ? "0" : "1");
    startTransition(async () => {
      const res = await toggleTrustItemActive(fd);
      onResult(res);
      if (res.ok) router.refresh();
    });
  }

  async function remove(item: TrustItemRow) {
    const ok = await confirm({
      title: "Usunąć pozycję?",
      message: `Pozycja "${item.label}" zniknie z paska zaufania na całej stronie.`,
    });
    if (!ok) return;
    const fd = new FormData();
    fd.set("id", item.id);
    startTransition(async () => {
      const res = await deleteTrustItem(fd);
      onResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="mt-6 pt-6 border-t border-[var(--border)] flex flex-col gap-4">
      <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        Pozycje paska zaufania
      </p>

      {items.map((item, i) => (
        <div key={item.id} className="border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Wyżej" className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Niżej" className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            </div>

            {/* Miniatura ikony (rejestr rysuje 104px — skalujemy przez CSS) */}
            <span className="w-12 h-12 flex items-center justify-center text-[var(--fg)] [&_svg]:w-10 [&_svg]:h-10 shrink-0">
              {TRUST_ICONS[item.icon as TrustIconKey]?.(ICON_TEXTS)}
            </span>

            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${item.active ? "text-[var(--fg)]" : "text-[var(--muted)] line-through"}`}>
                {item.label}
              </p>
              {item.subline && <p className="text-xs text-[var(--muted)]">{item.subline}</p>}
            </div>

            <button type="button" onClick={() => toggle(item)} role="switch" aria-checked={item.active} aria-label={`Widoczność pozycji ${item.label}`} className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${item.active ? "bg-[var(--color-gold)]" : "bg-[var(--border)]"}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${item.active ? "left-[22px]" : "left-0.5"}`} />
            </button>
            <button type="button" onClick={() => setEditingId(editingId === item.id ? null : item.id)} className="text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] hover:underline shrink-0">
              Edytuj
            </button>
            <button type="button" onClick={() => remove(item)} className="text-xs font-sans uppercase tracking-widest text-red-600 hover:underline shrink-0">
              Usuń
            </button>
          </div>

          {editingId === item.id && (
            <TrustItemForm
              mode="edit"
              item={item}
              onResult={(r) => {
                onResult(r);
                if (r.ok) {
                  setEditingId(null);
                  router.refresh();
                }
              }}
            />
          )}
        </div>
      ))}

      {creating ? (
        <div className="border border-dashed border-[var(--border)] rounded-xl p-4">
          <TrustItemForm
            mode="create"
            onResult={(r) => {
              onResult(r);
              if (r.ok) {
                setCreating(false);
                router.refresh();
              }
            }}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="self-start text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] hover:underline">
          + Dodaj pozycję
        </button>
      )}
    </div>
  );
}

// Formularz pozycji: picker ikony (siatka), etykieta+dopiska PL/DE.
function TrustItemForm({
  mode,
  item,
  onResult,
}: {
  mode: "create" | "edit";
  item?: TrustItemRow;
  onResult: (r: ActionResult) => void;
}) {
  const [icon, setIcon] = useState<TrustIconKey>(
    (item?.icon as TrustIconKey) ?? "star"
  );
  const [saving, startSave] = useTransition();

  function submit(formData: FormData) {
    formData.set("icon", icon);
    if (mode === "edit" && item) formData.set("id", item.id);
    formData.set("active", mode === "edit" ? (item!.active ? "1" : "0") : "1");
    startSave(async () => {
      onResult(mode === "create" ? await createTrustItem(formData) : await updateTrustItem(formData));
    });
  }

  return (
    <form action={submit} className="mt-4 pt-4 border-t border-[var(--border)] flex flex-col gap-4" data-guard-section>
      <Field label="Ikona" required>
        <div className="grid grid-cols-5 gap-2">
          {TRUST_ICON_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setIcon(k)}
              title={TRUST_ICON_LABELS[k]}
              aria-pressed={icon === k}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[var(--fg)] [&_svg]:w-10 [&_svg]:h-10 ${
                icon === k ? "border-[var(--color-gold)] bg-[var(--bg)]" : "border-[var(--border)]"
              }`}
            >
              {TRUST_ICONS[k](ICON_TEXTS)}
              <span className="text-[10px] text-[var(--muted)] leading-tight text-center">{TRUST_ICON_LABELS[k]}</span>
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Etykieta" required>
          <input name="label" defaultValue={item?.label ?? ""} required className={inputCls} />
        </Field>
        <Field label="Etykieta DE">
          <input name="label_de" defaultValue={item?.label_de ?? ""} className={inputCls} />
        </Field>
        <Field label="Dopiska (mała szara linijka)" hint="np. „na terenie całej Polski” — można zostawić puste">
          <input name="subline" defaultValue={item?.subline ?? ""} className={inputCls} />
        </Field>
        <Field label="Dopiska DE">
          <input name="subline_de" defaultValue={item?.subline_de ?? ""} className={inputCls} />
        </Field>
      </div>
      <button type="submit" disabled={saving} data-guard-save className="self-start px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50">
        {saving ? "Zapisuję..." : mode === "create" ? "Dodaj pozycję" : "Zapisz pozycję"}
      </button>
    </form>
  );
}
```

Uwaga: `const ICON_TEXTS = pl.trustBar;` — obiekt `pl.trustBar` zawiera
`iconFree/iconYears/iconYearsWord` (nadzbiór `TrustIconTexts`) i jest
strukturalnie zgodny z typem.

- [ ] **Step 3: `SiteTextsCard`**

```tsx
// app/admin/strona-glowna/SiteTextsCard.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, inputCls } from "@/app/admin/_shared";
import type { SiteTextsMap } from "@/app/_lib/site-texts";
import type { ActionResult } from "@/app/_lib/types";
import { updateSiteTexts } from "./actions";

// Teksty ogólne: slogan w pasku nad menu + opis marki w stopce (PL i DE).
export default function SiteTextsCard({
  initialTexts,
  onResult,
}: {
  initialTexts: SiteTextsMap;
  onResult: (r: ActionResult) => void;
}) {
  const [saving, startSave] = useTransition();
  const router = useRouter();

  function submit(formData: FormData) {
    startSave(async () => {
      const res = await updateSiteTexts(formData);
      onResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <Card>
      <h2 className="font-display text-xl font-semibold text-[var(--fg)] mb-2">Teksty ogólne</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        Slogan w cienkim pasku nad menu oraz krótki opis marki w stopce.
        Puste pole = tekst domyślny.
      </p>
      <form action={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-guard-section>
        <Field label="Slogan w pasku górnym">
          <input name="topbar_slogan" defaultValue={initialTexts.topbar_slogan?.value ?? ""} className={inputCls} />
        </Field>
        <Field label="Slogan w pasku górnym DE">
          <input name="topbar_slogan_de" defaultValue={initialTexts.topbar_slogan?.value_de ?? ""} className={inputCls} />
        </Field>
        <Field label="Opis marki w stopce">
          <textarea name="footer_tagline" rows={3} defaultValue={initialTexts.footer_tagline?.value ?? ""} className={inputCls} />
        </Field>
        <Field label="Opis marki w stopce DE">
          <textarea name="footer_tagline_de" rows={3} defaultValue={initialTexts.footer_tagline?.value_de ?? ""} className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          <button type="submit" disabled={saving} data-guard-save className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50">
            {saving ? "Zapisuję..." : "Zapisz teksty"}
          </button>
        </div>
      </form>
    </Card>
  );
}
```

- [ ] **Step 4: Spięcie w page + HomeSectionsEditor**

`app/admin/strona-glowna/page.tsx`:

```tsx
import { getAllHomeSections } from "@/app/_lib/home-sections";
import { getAllTrustItems } from "@/app/_lib/trust-items";
import { getAllSiteTexts } from "@/app/_lib/site-texts";
import HomeSectionsEditor from "./HomeSectionsEditor";

// Panel admina jest PL-only. Guard admina w layoucie; akcje wołają requireAdmin().
export default async function AdminHomePageSettings() {
  const [sections, trustItems, siteTexts] = await Promise.all([
    getAllHomeSections(),
    getAllTrustItems(),
    getAllSiteTexts(),
  ]);
  return (
    <HomeSectionsEditor
      initialSections={sections}
      initialTrustItems={trustItems}
      initialSiteTexts={siteTexts}
    />
  );
}
```

`HomeSectionsEditor.tsx` — zmiany:
1. Nowe propsy i importy:

```tsx
import TrustItemsEditor from "./TrustItemsEditor";
import SiteTextsCard from "./SiteTextsCard";
import type { TrustItemRow } from "@/app/_lib/trust-items";
import type { SiteTextsMap } from "@/app/_lib/site-texts";

export default function HomeSectionsEditor({
  initialSections,
  initialTrustItems,
  initialSiteTexts,
}: {
  initialSections: HomeSectionRow[];
  initialTrustItems: TrustItemRow[];
  initialSiteTexts: SiteTextsMap;
}) {
```

2. W rozwinięciu sekcji (`{expanded && meta.hasHeadings && (...)}`) — dla
   `trust_bar` dodaj edytor pozycji POD formularzem nagłówków:

```tsx
{expanded && meta.hasHeadings && (
  <>
    <SectionHeadingsForm section={s} onResult={handleResult} />
    {s.key === "trust_bar" && (
      <TrustItemsEditor initialItems={initialTrustItems} onResult={handleResult} />
    )}
  </>
)}
```

3. Na końcu głównego `<div className="flex flex-col gap-8">` (po liście
   sekcji) dodaj kartę tekstów:

```tsx
<SiteTextsCard initialTexts={initialSiteTexts} onResult={handleResult} />
```

- [ ] **Step 5: Weryfikacja manualna**

Run: `npx tsc --noEmit && npm run dev`
Expected: `/admin/strona-glowna` — rozwinięcie „Pasek zaufania" pokazuje
4 pozycje (po migracji) lub pustą listę z „+ Dodaj pozycję" (przed);
karta „Teksty ogólne" na dole renderuje się z pustymi/aktualnymi polami.

- [ ] **Step 6: Commit**

```bash
git add app/admin/strona-glowna/ app/_lib/site-texts.ts
git commit -m "feat(admin): edytor pozycji paska zaufania + karta tekstow ogolnych w hubie"
```

---

### Task 9: Weryfikacja końcowa fazy 2 + migracja na prod + domknięcie brancha

**Files:** brak nowych.

- [ ] **Step 1: Pełna weryfikacja lokalna**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: wszystko zielone.

- [ ] **Step 2: Migracja 50 na prod (Supabase MCP) — WYMAGA POTWIERDZENIA UŻYTKOWNIKA**

Pokaż SQL z `supabase/migrations/50_trust_items_site_texts.sql`, po
potwierdzeniu `mcp__supabase__apply_migration` (nazwa: `trust_items_site_texts`).
Weryfikacja read-only: `select icon, label, sort_order, active from public.trust_items order by sort_order;`
(4 wiersze) oraz `select key from public.site_texts;` (2 wiersze).

- [ ] **Step 3: Weryfikacja end-to-end (żywa baza)**

Użyj skilla `verify` / `superpowers:verification-before-completion`:
1. Home / karta produktu / stopka: pasek wygląda jak dotąd (teraz z DB).
2. Admin: zmień etykietę pozycji → widać we wszystkich 3 miejscach; dodaj
   pozycję z nową ikoną (np. zegar) → pasek pokazuje 5 pozycji; ukryj ją
   z powrotem/usuń. Zmień slogan TopBaru i tagline stopki (PL i DE) →
   widoczne na `/` i `/de`.
3. **Przywróć oryginalną treść** — to żywy sklep.

- [ ] **Step 4: Domknięcie brancha**

Skill superpowers:finishing-a-development-branch → PR do `main`.

---

## Self-review planu (wykonany przy pisaniu)

- Spec coverage (część „krok 2"): tabele `trust_items`+`site_texts` z seedem i RLS ✓ (Task 1), rejestr 10 ikon (4 istniejące + 6 nowych: star, leaf, headset, wallet, hand-heart, clock) ✓ (Task 2), TrustBar z DB z fallbackiem i obsługą wszystkich 3 osadzeń ✓ (Task 3-4), nieznana ikona pomijana ✓ (filtr w `prepareTrustItems`), TopBar/stopka z `site_texts` + fallback słownik ✓ (Task 5-6), edycja w hubie (picker ikon, PL+DE, kolejność, aktywność, dodawanie/usuwanie) ✓ (Task 7-8), tagi cache `trust-items`/`site-texts` + inwalidacja w akcjach ✓, testy lokalizacji/fallbacków/sortowania/walidacji ✓.
- Typy spójne: `TrustItemRow`/`LocalizedTrustItem`/`prepareTrustItems` (Task 3) używane w 4/7/8; `TrustIconKey`/`TRUST_ICONS`/`TRUST_ICON_LABELS` (Task 2) w 3/4/8; `SiteTextsMap`/`siteText`/`SITE_TEXT_KEYS` (Task 5) w 6/7/8 ✓.
- Decyzja projektowa utrwalona w testach: `null` z fetcha (błąd/brak tabeli) → defaulty; `[]` (celowo usunięte w adminie) → pusty pasek (TrustBar zwraca null).
- Bez placeholderów: jedyne „przenieś 1:1" dotyczy istniejących funkcji SVG z `TrustBar.tsx` (kod jest w repo).
