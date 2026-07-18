# Edycja górnego paska (kontakt + baner promocyjny) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nietechniczny admin może z `/admin/strona-glowna` zmienić numer telefonu/email (obowiązują w całym serwisie) oraz włączyć/edytować baner promocyjny na górze strony.

**Architecture:** Wszystko na istniejącej jednowierszowej tabeli `store_settings` (nowe kolumny, migracja 56) — bez nowych tabel. Odczyt wg konwencji repo: pure moduł `X.ts` (logika, testy, bezpieczny dla klienta) + serwerowy `X-server.ts` (fetch przez `unstable_cache` + bare anon client, wzorzec `store-settings.ts`/`theme-settings.ts`). Baner = kliencki `PromoBanner` (dane z serwera propsami, dismiss w localStorage). Kontakt = helper `getContactInfo()` z fallbackiem do configu `COMPANY`, podmieniony w 6 serwerowych konsumentach.

**Tech Stack:** Next.js 16 (App Router, server components + server actions), React 19, Supabase (Postgres `store_settings`, RLS: publiczny odczyt / zapis service_role), Tailwind, vitest.

## Global Constraints

- **Zero nowych tabel** — tylko nowe kolumny na `store_settings` (migracja 56, addytywna). RLS dziedziczona (odczyt publiczny anon, zapis service_role) — bez zmian w politykach.
- **Split pure/server (KRYTYCZNE):** moduł importowany przez komponent kliencki NIE może zawierać fetchy serwerowych (`unstable_cache`, `createAdminClient`, `import "server-only"`) — inaczej `next/headers`/server-only trafia do bundla klienta i **build pada** (tsc/vitest tego NIE łapią). Dlatego: `promo.ts`/`contact.ts` = pure (klient je importuje), `promo-server.ts`/`contact-server.ts` = server. Wzorzec: `bundles.ts`/`bundles-server.ts`, `blocks.ts`/`blocks-server.ts`.
- **Fallback do `COMPANY`:** puste pole kontaktu w adminie = NULL w DB = wartość z `app/_lib/company.ts`. Dane rejestrowe (NIP/adres/legalName) i konteksty P24/faktur zostają na `COMPANY` — poza zakresem.
- **Kolory promo:** dokładnie `'gold' | 'navy' | 'red'` (check w migracji + walidacja w akcji, kolor spoza listy → `'gold'`).
- **`store_settings` to jeden wiersz** czytany/pisany przez `.eq("id", true)`.
- **Teksty klienta** (promo) = wpisywane przez admina PL/DE, bez słownika. Aria-label X = istniejący `t.common.close`. Etykiety admina = polski hardkod (jak reszta panelu).
- **Repo root = katalog domowy** `C:\Users\wood1` (CWD `sklep-meblowy` to podkatalog). NIGDY `git add -A`/`git add .` — staguj wyłącznie wymienione pliki. Ścieżki z `[id]`/nawiasami cytuj.
- **Gotchas:** stale `.next` psuje `tsc`/`build` po zmianie gałęzi (usuń `.next`, powtórz); cudzysłowy typograficzne/escape'y Unicode psują się w emisji modeli — przy problemie naprawiaj skryptem, nie ręcznie. NIE odpalać `npm run test:e2e` (default base = PROD).
- **Testy:** `npm test` = `vitest run` (baza 614 przed tą pracą). Commity: `feat(pasek): ...` po polsku, stopka `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Migracja 56 NA PROD** dopiero w Tasku 7, przez kontrolera **za zgodą Mikołaja** (Supabase MCP). Preview dzieli bazę z prodem.

**Kolejność:** 1 → 2 → 3 → 4 → 5 → 6 → 7. T4 zależy od T3; T5 od T2; T6 od T2/T3 (inwalidacje) + własny pure. 

**Przed Taskiem 1:** gałąź już istnieje (`feat/edycja-gornego-paska`, ze specem). Pracuj na niej.

---

### Task 1: Migracja 56 — kolumny kontakt + promo na `store_settings`

**Files:**
- Create: `supabase/migrations/56_topbar_contact_promo.sql`

**Interfaces:**
- Produces: kolumny `contact_phone`, `contact_email`, `promo_enabled`, `promo_text`, `promo_text_de`, `promo_link`, `promo_color` na `store_settings`. Taski 2/3/6 na nich polegają.

- [ ] **Step 1: Utwórz plik migracji**

`supabase/migrations/56_topbar_contact_promo.sql`:

```sql
-- supabase/migrations/56_topbar_contact_promo.sql
-- Edycja górnego paska: kontakt (telefon/email) + baner promocyjny.
-- Kolumny na istniejącej jednowierszowej store_settings (id = true).
-- RLS store_settings już ustawione (odczyt publiczny, zapis service_role)
-- — nowe kolumny dziedziczą polityki tabeli. NULL kontaktu = fallback COMPANY.

alter table public.store_settings
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists promo_enabled boolean not null default false,
  add column if not exists promo_text text,
  add column if not exists promo_text_de text,
  add column if not exists promo_link text,
  add column if not exists promo_color text not null default 'gold';

-- Walidacja koloru (idempotentnie: dodaj constraint tylko gdy go nie ma).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'store_settings_promo_color_check'
  ) then
    alter table public.store_settings
      add constraint store_settings_promo_color_check
      check (promo_color in ('gold','navy','red'));
  end if;
end $$;
```

- [ ] **Step 2: Weryfikacja składni (bez uruchamiania na DB)**

Migracja NIE jest uruchamiana w tym tasku (idzie na prod w Tasku 7 za zgodą). Sprawdź tylko wzrokowo: `add column if not exists` (idempotentne), constraint dodawany warunkowo, defaulty wypełnią istniejący wiersz. Porównaj strukturę z `supabase/migrations/51_theme_settings.sql` (ten sam wzorzec).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/56_topbar_contact_promo.sql
git commit -m "feat(pasek): migracja 56 — kolumny kontakt + promo na store_settings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Warstwa odczytu kontaktu (`contact.ts` pure + `contact-server.ts`)

**Files:**
- Create: `app/_lib/contact.ts`
- Create: `app/_lib/contact-server.ts`
- Test: `app/_lib/__tests__/contact.test.ts`

**Interfaces:**
- Consumes: `COMPANY` z `app/_lib/company.ts` (`COMPANY.phone: string | null`, `COMPANY.email: string`); kolumny z Taska 1.
- Produces:
  - (pure) `pickContact(override: string | null | undefined, fallback: string | null): string | null`
  - (pure) `type ContactInfo = { phone: string | null; email: string }`
  - (server) `getContactInfo(): Promise<ContactInfo>` — Task 5 (konsumenci) tego używa.
  - (server) `CONTACT_CACHE_TAG = "contact"`, `invalidateContactCache(): void` — Task 6 (akcja) tego używa.

- [ ] **Step 1: Napisz failing test**

`app/_lib/__tests__/contact.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickContact } from "@/app/_lib/contact";

describe("pickContact — override z DB lub fallback z COMPANY", () => {
  it("niepusty override wygrywa", () => {
    expect(pickContact("+48 111 222 333", "+48 000")).toBe("+48 111 222 333");
    expect(pickContact("nowy@x.pl", "stary@x.pl")).toBe("nowy@x.pl");
  });
  it("null/undefined/pusty/whitespace → fallback", () => {
    expect(pickContact(null, "+48 000")).toBe("+48 000");
    expect(pickContact(undefined, "+48 000")).toBe("+48 000");
    expect(pickContact("", "+48 000")).toBe("+48 000");
    expect(pickContact("   ", "+48 000")).toBe("+48 000");
  });
  it("override przycinany z białych znaków", () => {
    expect(pickContact("  +48 1  ", "+48 000")).toBe("+48 1");
  });
  it("fallback null przechodzi (telefon może nie istnieć)", () => {
    expect(pickContact(null, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom — RED**

Run: `npx vitest run app/_lib/__tests__/contact.test.ts`
Expected: FAIL — `pickContact is not a function` (brak modułu).

- [ ] **Step 3: Zaimplementuj pure `contact.ts`**

`app/_lib/contact.ts`:

```ts
// Czysta logika kontaktu (bez zależności server-only) — importowalna też
// przez klienta. Serwerowy odczyt z DB: contact-server.ts.

export type ContactInfo = { phone: string | null; email: string };

// Override z DB (contact_phone/contact_email) gdy niepusty, inaczej fallback
// z configu COMPANY. Przycina białe znaki; puste/whitespace = brak override.
export function pickContact(
  override: string | null | undefined,
  fallback: string | null
): string | null {
  const o = typeof override === "string" ? override.trim() : "";
  return o !== "" ? o : fallback;
}
```

- [ ] **Step 4: Uruchom — GREEN**

Run: `npx vitest run app/_lib/__tests__/contact.test.ts`
Expected: PASS.

- [ ] **Step 5: Zaimplementuj serwerowy `contact-server.ts`**

`app/_lib/contact-server.ts` (wzorzec `store-settings.ts`):

```ts
import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { createClient as createBareAnonClient } from "@supabase/supabase-js";
import { COMPANY } from "./company";
import { pickContact, type ContactInfo } from "./contact";

export const CONTACT_CACHE_TAG = "contact";

// Kontakt zmienia się WYŁĄCZNIE w /admin/strona-glowna (tam revalidateTag).
// Wewnątrz unstable_cache nie wolno cookies() → bare anon client
// (store_settings ma publiczny odczyt RLS). Rzucamy przy błędzie, żeby cache
// nie zapamiętał awaryjnej wartości — fallback jest per wywołanie niżej.
const fetchContact = unstable_cache(
  async (): Promise<{ contact_phone: string | null; contact_email: string | null }> => {
    const supabase = createBareAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .from("store_settings")
      .select("contact_phone, contact_email")
      .eq("id", true)
      .single();
    if (error) throw error;
    return data as { contact_phone: string | null; contact_email: string | null };
  },
  ["contact-info"],
  { tags: [CONTACT_CACHE_TAG], revalidate: 300 }
);

// Telefon/email do wyświetlenia klientowi. Override z DB lub fallback COMPANY.
// Fallback per wywołanie (nie zamraża błędu na 300 s).
export async function getContactInfo(): Promise<ContactInfo> {
  try {
    const raw = await fetchContact();
    return {
      phone: pickContact(raw.contact_phone, COMPANY.phone),
      email: pickContact(raw.contact_email, COMPANY.email) ?? COMPANY.email,
    };
  } catch (err) {
    console.error("[contact-server] getContactInfo failed, using COMPANY", err);
    return { phone: COMPANY.phone, email: COMPANY.email };
  }
}

export function invalidateContactCache() {
  revalidateTag(CONTACT_CACHE_TAG, "max");
}
```

- [ ] **Step 6: Typecheck + testy**

Run: `npx tsc --noEmit`
Run: `npm test`
Expected: zielono.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/contact.ts app/_lib/contact-server.ts app/_lib/__tests__/contact.test.ts
git commit -m "feat(pasek): warstwa odczytu kontaktu (pickContact + getContactInfo, fallback COMPANY)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Warstwa odczytu promo (`promo.ts` pure + `promo-server.ts`)

**Files:**
- Create: `app/_lib/promo.ts`
- Create: `app/_lib/promo-server.ts`
- Test: `app/_lib/__tests__/promo.test.ts`

**Interfaces:**
- Consumes: kolumny promo z Taska 1.
- Produces:
  - (pure) `type PromoColor = "gold" | "navy" | "red"`, `PROMO_COLORS: readonly PromoColor[]`
  - (pure) `type PromoBannerData = { enabled: boolean; text: string | null; text_de: string | null; link: string | null; color: PromoColor }`
  - (pure) `normalizePromo(row: unknown): PromoBannerData`
  - (pure) `promoKey(text: string | null): string`
  - (pure) `PROMO_COLOR_CLASSES: Record<PromoColor, string>`
  - (server) `getPromoBanner(): Promise<PromoBannerData>` — Task 4 (layout) tego używa.
  - (server) `PROMO_CACHE_TAG = "promo"`, `invalidatePromoCache(): void` — Task 6 (akcja) tego używa.
  - `promo.ts` jest importowany przez `PromoBanner.tsx` (klient) — MUSI być pure (bez server-only).

- [ ] **Step 1: Napisz failing test**

`app/_lib/__tests__/promo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  normalizePromo,
  promoKey,
  PROMO_COLOR_CLASSES,
  PROMO_COLORS,
} from "@/app/_lib/promo";

describe("normalizePromo", () => {
  it("pełny wiersz → znormalizowane pola", () => {
    expect(
      normalizePromo({
        promo_enabled: true,
        promo_text: "-20% do niedzieli",
        promo_text_de: "-20% bis Sonntag",
        promo_link: "/sklep",
        promo_color: "red",
      })
    ).toEqual({
      enabled: true,
      text: "-20% do niedzieli",
      text_de: "-20% bis Sonntag",
      link: "/sklep",
      color: "red",
    });
  });
  it("enabled=true ale pusty tekst → enabled=false", () => {
    expect(normalizePromo({ promo_enabled: true, promo_text: "  " }).enabled).toBe(false);
  });
  it("kolor spoza listy → gold", () => {
    expect(normalizePromo({ promo_enabled: true, promo_text: "x", promo_color: "pink" }).color).toBe("gold");
    expect(normalizePromo({ promo_enabled: true, promo_text: "x" }).color).toBe("gold");
  });
  it("puste/whitespace stringi → null; przycinanie", () => {
    const r = normalizePromo({ promo_enabled: true, promo_text: "  Hej  ", promo_text_de: "", promo_link: "   " });
    expect(r.text).toBe("Hej");
    expect(r.text_de).toBeNull();
    expect(r.link).toBeNull();
  });
  it("null/śmieciowe wejście → wyłączony baner", () => {
    expect(normalizePromo(null)).toEqual({ enabled: false, text: null, text_de: null, link: null, color: "gold" });
    expect(normalizePromo("x").enabled).toBe(false);
  });
});

describe("promoKey", () => {
  it("deterministyczny i różny dla różnych tekstów", () => {
    expect(promoKey("A")).toBe(promoKey("A"));
    expect(promoKey("A")).not.toBe(promoKey("B"));
  });
  it("null i pusty → stabilny klucz", () => {
    expect(promoKey(null)).toBe(promoKey(""));
    expect(typeof promoKey(null)).toBe("string");
  });
});

describe("PROMO_COLOR_CLASSES", () => {
  it("każdy dozwolony kolor mapuje na niepustą klasę", () => {
    for (const c of PROMO_COLORS) {
      expect(PROMO_COLOR_CLASSES[c]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Uruchom — RED**

Run: `npx vitest run app/_lib/__tests__/promo.test.ts`
Expected: FAIL — brak modułu `promo`.

- [ ] **Step 3: Zaimplementuj pure `promo.ts`**

`app/_lib/promo.ts`:

```ts
// Czysta logika banera promocyjnego (bez server-only) — importowalna przez
// klienta (PromoBanner.tsx). Serwerowy odczyt z DB: promo-server.ts.

export type PromoColor = "gold" | "navy" | "red";
export const PROMO_COLORS: readonly PromoColor[] = ["gold", "navy", "red"];

export type PromoBannerData = {
  enabled: boolean;
  text: string | null;
  text_de: string | null;
  link: string | null;
  color: PromoColor;
};

// Klasy tła+tekstu per kolor (Tailwind). Współdzielone przez PromoBanner.
export const PROMO_COLOR_CLASSES: Record<PromoColor, string> = {
  gold: "bg-[var(--color-gold)] text-[var(--color-navy)]",
  navy: "bg-[var(--color-navy)] text-white",
  red: "bg-red-600 text-white",
};

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

// Surowy wiersz z DB → bezpieczny PromoBannerData. Kolor spoza listy → gold;
// enabled tylko gdy flaga true ORAZ jest niepusty tekst PL.
export function normalizePromo(row: unknown): PromoBannerData {
  const r = (typeof row === "object" && row !== null ? row : {}) as Record<string, unknown>;
  const text = str(r.promo_text);
  const color = PROMO_COLORS.includes(r.promo_color as PromoColor)
    ? (r.promo_color as PromoColor)
    : "gold";
  return {
    enabled: r.promo_enabled === true && text !== null,
    text,
    text_de: str(r.promo_text_de),
    link: str(r.promo_link),
    color,
  };
}

// Deterministyczny krótki klucz treści promo (do zapamiętania „zamknięte"
// w localStorage). Zmiana tekstu → inny klucz → baner pokazuje się znów.
export function promoKey(text: string | null): string {
  const s = text ?? "";
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
```

- [ ] **Step 4: Uruchom — GREEN**

Run: `npx vitest run app/_lib/__tests__/promo.test.ts`
Expected: PASS.

- [ ] **Step 5: Zaimplementuj serwerowy `promo-server.ts`**

`app/_lib/promo-server.ts`:

```ts
import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { createClient as createBareAnonClient } from "@supabase/supabase-js";
import { normalizePromo, type PromoBannerData } from "./promo";

export const PROMO_CACHE_TAG = "promo";

// Baner zmienia się WYŁĄCZNIE w /admin/strona-glowna (tam revalidateTag).
// Bare anon client (store_settings publiczny odczyt). Fallback per wywołanie:
// przy błędzie baner po prostu się nie pokaże (enabled=false).
const fetchPromo = unstable_cache(
  async (): Promise<PromoBannerData> => {
    const supabase = createBareAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .from("store_settings")
      .select("promo_enabled, promo_text, promo_text_de, promo_link, promo_color")
      .eq("id", true)
      .single();
    if (error) throw error;
    return normalizePromo(data);
  },
  ["promo-banner"],
  { tags: [PROMO_CACHE_TAG], revalidate: 300 }
);

export async function getPromoBanner(): Promise<PromoBannerData> {
  try {
    return await fetchPromo();
  } catch (err) {
    console.error("[promo-server] getPromoBanner failed, banner off", err);
    return { enabled: false, text: null, text_de: null, link: null, color: "gold" };
  }
}

export function invalidatePromoCache() {
  revalidateTag(PROMO_CACHE_TAG, "max");
}
```

- [ ] **Step 6: Typecheck + testy**

Run: `npx tsc --noEmit`
Run: `npm test`
Expected: zielono.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/promo.ts app/_lib/promo-server.ts app/_lib/__tests__/promo.test.ts
git commit -m "feat(pasek): warstwa odczytu promo (normalizePromo/promoKey/kolory + getPromoBanner)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Komponent `PromoBanner` + osadzenie w layoucie

**Files:**
- Create: `app/_components/layout/PromoBanner.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `PromoBannerData`, `PROMO_COLOR_CLASSES`, `promoKey` z `promo.ts` (Task 3, pure); `getPromoBanner` z `promo-server.ts` (Task 3); istniejące `LocalizedLink`, `getDictionary`, `getLocale`, `HideOnAdmin`.
- Produces: baner renderowany nad topbarem (ukryty na `/admin`).

To task UI — repo nie testuje jednostkowo komponentów React (logika pokryta w `promo.ts`). Weryfikacja = `tsc` + `npm test` zielone + `npm run build` zielony.

- [ ] **Step 1: Utwórz `PromoBanner.tsx`**

`app/_components/layout/PromoBanner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import LocalizedLink from "../ui/LocalizedLink";
import type { Locale } from "@/app/_lib/i18n";
import {
  type PromoBannerData,
  PROMO_COLOR_CLASSES,
  promoKey,
} from "@/app/_lib/promo";

// Baner promocyjny nad topbarem. Dane z serwera (layout). Tekst wg locale
// (DE z fallbackiem na PL). Zamknięcie (X) zapamiętane w localStorage kluczem
// = hash treści PL → zmiana tekstu przez admina pokazuje baner znów.
const DISMISS_STORAGE_KEY = "promo-dismissed";

export default function PromoBanner({
  data,
  locale,
  closeLabel,
}: {
  data: PromoBannerData;
  locale: Locale;
  closeLabel: string;
}) {
  const text =
    locale === "de" ? data.text_de ?? data.text : data.text;
  const key = promoKey(data.text);

  // SSR i pierwszy render klienta: widoczny (spójne z serwerem → brak
  // hydration mismatch). useEffect po mount chowa, jeśli zdismissowany.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_STORAGE_KEY) === key) setDismissed(true);
    } catch {
      /* brak localStorage (prywatny tryb) — trudno, pokaż baner */
    }
  }, [key]);

  if (!data.enabled || !text || dismissed) return null;

  function close() {
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, key);
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  const colorCls = PROMO_COLOR_CLASSES[data.color];
  const inner = (
    <span className="flex-1 text-center px-4 truncate">{text}</span>
  );

  return (
    <div className={`relative text-xs sm:text-sm font-medium ${colorCls}`}>
      <div className="max-w-7xl mx-auto px-10 h-9 flex items-center justify-center">
        {data.link ? (
          data.link.startsWith("/") ? (
            <LocalizedLink href={data.link} className="flex-1 text-center px-4 truncate hover:underline">
              {text}
            </LocalizedLink>
          ) : (
            <a href={data.link} target="_blank" rel="noopener noreferrer" className="flex-1 text-center px-4 truncate hover:underline">
              {text}
            </a>
          )
        ) : (
          inner
        )}
      </div>
      <button
        type="button"
        onClick={close}
        aria-label={closeLabel}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/10"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Osadź w `app/layout.tsx`**

(a) Dodaj importy (obok istniejących importów layoutu):

```ts
import PromoBanner from "./_components/layout/PromoBanner";
import { getPromoBanner } from "@/app/_lib/promo-server";
```

(b) W `RootLayout`, po `const themeSettings = await getThemeSettings();` dodaj:

```ts
  const t = getDictionary(locale);
  const promo = await getPromoBanner();
```

(`getDictionary` jest już importowany w layout.tsx; `locale` już policzony.)

(c) Wewnątrz istniejącego `<HideOnAdmin>` (tego ze sticky-divem) wstaw `<PromoBanner>` PRZED sticky-divem:

```tsx
                    <HideOnAdmin>
                      <PromoBanner data={promo} locale={locale} closeLabel={t.common.close} />
                      {/* Wspólny sticky na oba paski — jeden element zamiast
                          dwóch osobnych sticky eliminuje 1px szczeliny przy
                          ułamkowym zoomie. */}
                      <div className="sticky top-0 z-50">
                        <TopBar />
                        <Navbar />
                      </div>
                    </HideOnAdmin>
```

(Baner jest PRZED sticky-divem → przy scrollu znika, a pasek+nawigacja zostają przyklejone. `HideOnAdmin` ukrywa go na `/admin` razem z topbarem.)

- [ ] **Step 3: Typecheck + testy + build**

Run: `npx tsc --noEmit`
Run: `npm test`
Run: `npm run build` (KLUCZOWE — łapie ewentualny przeciek server-only do bundla klienta; `PromoBanner` importuje tylko `promo.ts` pure + `LocalizedLink`).
Expected: wszystko zielone.

- [ ] **Step 4: Commit**

```bash
git add app/_components/layout/PromoBanner.tsx app/layout.tsx
git commit -m "feat(pasek): baner promocyjny (PromoBanner) nad topbarem + osadzenie w layoucie

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Kontakt z DB w 6 konsumentach

**Files:**
- Modify: `app/_components/layout/TopBar.tsx`
- Modify: `app/_components/layout/Footer.tsx`
- Modify: `app/(legal)/kontakt/page.tsx`
- Modify: `app/(legal)/regulamin/page.tsx`
- Modify: `app/(legal)/prywatnosc/page.tsx`
- Modify: `app/(legal)/zwroty/page.tsx`

**Interfaces:**
- Consumes: `getContactInfo(): Promise<{ phone: string | null; email: string }>` z `contact-server.ts` (Task 2).
- Produces: telefon/email wyświetlane z DB (fallback COMPANY) wszędzie.

Wszystkie 6 to komponenty/strony SERWEROWE (async). Wzorzec zmiany identyczny: dodać import, pobrać `const contact = await getContactInfo()` w ciele funkcji, zamienić `COMPANY.phone`→`contact.phone` i `COMPANY.email`→`contact.email` (zachowując `tel:`/`mailto:`, warunki `contact.phone && ...`, formatowanie). `COMPANY` może zostać zaimportowane (używane też do innych pól) — usuwaj import tylko jeśli po zmianie nie jest już nigdzie w pliku używany.

Brak testów jednostkowych (strony serwerowe). Weryfikacja = `tsc` + `npm test` + `npm run build`.

- [ ] **Step 1: TopBar.tsx**

Dodaj import: `import { getContactInfo } from "@/app/_lib/contact-server";`
W `TopBar()` po `const texts = await getSiteTexts();` dodaj: `const contact = await getContactInfo();`
Zamień w JSX:
- `mailto:${COMPANY.email}` → `mailto:${contact.email}`
- `{COMPANY.email}` (span sm:inline) → `{contact.email}`
- `{COMPANY.phone && (` → `{contact.phone && (`
- `tel:${COMPANY.phone.replace(/\s/g, "")}` → `tel:${contact.phone.replace(/\s/g, "")}`
- `{COMPANY.phone}` → `{contact.phone}`

`COMPANY` nie jest już używane w TopBar.tsx po tej zmianie → usuń import `import { COMPANY } from "@/app/_lib/company";`.

- [ ] **Step 2: Footer.tsx**

Dodaj import `getContactInfo`. Footer jest async (`export default async function Footer()`); po istniejących awaitach dodaj `const contact = await getContactInfo();`. Zamień blok kontaktu (obecnie linie ~53-61):

```tsx
          <p className="text-xs text-white/70 leading-relaxed">
            {contact.email}
            {contact.phone && (
              <>
                <br />
                {contact.phone}
              </>
            )}
          </p>
```

`COMPANY` w Footer.tsx jest używane też do `COMPANY.brandName` — ZOSTAW import.

- [ ] **Step 3: kontakt/page.tsx**

Dodaj import `getContactInfo`; pobierz `const contact = await getContactInfo();` (strona jest async). Zamień:
- `href={`mailto:${COMPANY.email}`}` → `mailto:${contact.email}`
- `{COMPANY.email}` → `{contact.email}`
- `{COMPANY.phone && (` → `{contact.phone && (`
- `href={`tel:${COMPANY.phone.replace(/\s/g, "")}`}` → `tel:${contact.phone.replace(/\s/g, "")}`
- `{COMPANY.phone}` → `{contact.phone}`

Sprawdź czy `COMPANY` nadal używane (np. `contactHours`) — jeśli tak, zostaw import; jeśli nie, usuń.

- [ ] **Step 4: regulamin/page.tsx**

Dodaj import `getContactInfo`; `const contact = await getContactInfo();`. Zamień wystąpienia `{COMPANY.email}` → `{contact.email}`, `{COMPANY.phone && (` → `{contact.phone && (`, `{COMPANY.phone}` → `{contact.phone}` (linie ~322-326, 401, 419). `COMPANY` używane też do danych rejestrowych (`formatCompanyHeader` itd.) — ZOSTAW import.

- [ ] **Step 5: prywatnosc/page.tsx**

Dodaj import `getContactInfo`; `const contact = await getContactInfo();`. Zamień `{COMPANY.email}` → `{contact.email}` (linie ~311, 441). `COMPANY` prawdopodobnie używane do adresu/nazwy — ZOSTAW import jeśli tak.

- [ ] **Step 6: zwroty/page.tsx**

Dodaj import `getContactInfo`; `const contact = await getContactInfo();`. Zamień `${COMPANY.email}` (w template stringach, linie ~75, 141) → `${contact.email}` i `{COMPANY.email}` (linie ~176, 212, 226) → `{contact.email}`. `COMPANY` — zostaw import jeśli używane gdzie indziej.

- [ ] **Step 7: Typecheck + testy + build**

Run: `npx tsc --noEmit` (wyłapie ewentualne `contact.phone` gdzie `phone` może być null — użycia są za `contact.phone && ...`, więc zawężenie działa; w template `tel:` też pod warunkiem).
Run: `npm test`
Run: `npm run build`
Expected: zielono.

- [ ] **Step 8: Commit**

```bash
git add app/_components/layout/TopBar.tsx app/_components/layout/Footer.tsx "app/(legal)/kontakt/page.tsx" "app/(legal)/regulamin/page.tsx" "app/(legal)/prywatnosc/page.tsx" "app/(legal)/zwroty/page.tsx"
git commit -m "feat(pasek): telefon/email z DB (getContactInfo) w pasku, stopce, kontakcie i dokumentach

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Admin — parser, akcja, reader, karta, osadzenie

**Files:**
- Create: `app/_lib/topbar-settings.ts` (pure parser)
- Test: `app/_lib/__tests__/topbar-settings.test.ts`
- Create: `app/admin/strona-glowna/TopBarSettingsCard.tsx`
- Modify: `app/admin/strona-glowna/actions.ts` (akcja + reader)
- Modify: `app/admin/strona-glowna/page.tsx` (pobranie danych)
- Modify: `app/admin/strona-glowna/BlocksEditor.tsx` (render karty)

**Interfaces:**
- Consumes: `PROMO_COLORS`, `PromoColor` z `promo.ts` (Task 3); `invalidateContactCache` (Task 2), `invalidatePromoCache` (Task 3); istniejące `Card`, `Field`, `inputCls` z `@/app/admin/_shared`, `requireAdmin`, `createAdminClient`, `ActionResult`, `COMPANY`.
- Produces:
  - (pure) `parseTopBarSettings(input): TopBarSettingsRow`
  - (server action) `updateTopBarSettings(formData): Promise<ActionResult>`
  - (server reader) `getTopBarSettingsForAdmin(): Promise<TopBarSettingsRow | null>`
  - (client) `TopBarSettingsCard`

- [ ] **Step 1: Napisz failing test dla parsera**

`app/_lib/__tests__/topbar-settings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseTopBarSettings } from "@/app/_lib/topbar-settings";

describe("parseTopBarSettings — FormData → wiersz store_settings", () => {
  it("pełne wejście", () => {
    expect(
      parseTopBarSettings({
        contact_phone: "  +48 111 222 333 ",
        contact_email: "kontakt@x.pl",
        promo_enabled: "1",
        promo_text: "  -20%  ",
        promo_text_de: "-20% DE",
        promo_link: "/sklep",
        promo_color: "red",
      })
    ).toEqual({
      contact_phone: "+48 111 222 333",
      contact_email: "kontakt@x.pl",
      promo_enabled: true,
      promo_text: "-20%",
      promo_text_de: "-20% DE",
      promo_link: "/sklep",
      promo_color: "red",
    });
  });
  it("puste stringi → null; brak checkboxa → enabled=false", () => {
    expect(
      parseTopBarSettings({
        contact_phone: "",
        contact_email: "   ",
        promo_enabled: null,
        promo_text: "",
        promo_text_de: "",
        promo_link: "",
        promo_color: "gold",
      })
    ).toEqual({
      contact_phone: null,
      contact_email: null,
      promo_enabled: false,
      promo_text: null,
      promo_text_de: null,
      promo_link: null,
      promo_color: "gold",
    });
  });
  it("kolor spoza listy → gold", () => {
    expect(parseTopBarSettings({ promo_color: "pink" }).promo_color).toBe("gold");
    expect(parseTopBarSettings({}).promo_color).toBe("gold");
  });
  it("promo_enabled='1' → true, inne → false", () => {
    expect(parseTopBarSettings({ promo_enabled: "1" }).promo_enabled).toBe(true);
    expect(parseTopBarSettings({ promo_enabled: "on" }).promo_enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom — RED**

Run: `npx vitest run app/_lib/__tests__/topbar-settings.test.ts`
Expected: FAIL — brak modułu.

- [ ] **Step 3: Zaimplementuj pure `topbar-settings.ts`**

`app/_lib/topbar-settings.ts`:

```ts
// Czysty parser ustawień górnego paska (FormData → wiersz store_settings).
// Wydzielony z akcji, żeby był testowalny bez Supabase. Importuje tylko
// pure promo.ts (lista kolorów) — bezpieczny.
import { PROMO_COLORS, type PromoColor } from "./promo";

export type TopBarSettingsRow = {
  contact_phone: string | null;
  contact_email: string | null;
  promo_enabled: boolean;
  promo_text: string | null;
  promo_text_de: string | null;
  promo_link: string | null;
  promo_color: PromoColor;
};

// Wejście: surowe wartości (np. z FormData.get, więc string | File | null).
export type TopBarSettingsInput = Partial<Record<keyof TopBarSettingsRow, unknown>>;

function trimOrNull(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t === "" ? null : t;
}

export function parseTopBarSettings(input: TopBarSettingsInput): TopBarSettingsRow {
  const color = PROMO_COLORS.includes(input.promo_color as PromoColor)
    ? (input.promo_color as PromoColor)
    : "gold";
  return {
    contact_phone: trimOrNull(input.contact_phone, 100),
    contact_email: trimOrNull(input.contact_email, 200),
    promo_enabled: input.promo_enabled === "1",
    promo_text: trimOrNull(input.promo_text, 300),
    promo_text_de: trimOrNull(input.promo_text_de, 300),
    promo_link: trimOrNull(input.promo_link, 500),
    promo_color: color,
  };
}
```

- [ ] **Step 4: Uruchom — GREEN**

Run: `npx vitest run app/_lib/__tests__/topbar-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Dodaj akcję + reader w `actions.ts`**

W `app/admin/strona-glowna/actions.ts`:

(a) Dodaj importy (obok istniejących):

```ts
import { parseTopBarSettings, type TopBarSettingsRow } from "@/app/_lib/topbar-settings";
import { invalidateContactCache } from "@/app/_lib/contact-server";
import { invalidatePromoCache } from "@/app/_lib/promo-server";
```

(b) Na końcu pliku dodaj reader (uncached, dla formularza) i akcję:

```ts
// ── Górny pasek: kontakt + baner promocyjny (store_settings) ────────────

// Świeży odczyt dla formularza admina (bez cache — po zapisie widzi stan DB).
export async function getTopBarSettingsForAdmin(): Promise<TopBarSettingsRow | null> {
  await requireAdmin();
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("store_settings")
    .select("contact_phone, contact_email, promo_enabled, promo_text, promo_text_de, promo_link, promo_color")
    .eq("id", true)
    .maybeSingle();
  return (data as TopBarSettingsRow | null) ?? null;
}

export async function updateTopBarSettings(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const row = parseTopBarSettings({
    contact_phone: formData.get("contact_phone"),
    contact_email: formData.get("contact_email"),
    promo_enabled: formData.get("promo_enabled"),
    promo_text: formData.get("promo_text"),
    promo_text_de: formData.get("promo_text_de"),
    promo_link: formData.get("promo_link"),
    promo_color: formData.get("promo_color"),
  });

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("store_settings")
    .update(row as never)
    .eq("id", true);
  if (error) return { ok: false, error: error.message };

  invalidateContactCache();
  invalidatePromoCache();
  revalidatePath("/", "layout");
  revalidatePath("/admin/strona-glowna");
  return { ok: true, message: "Zapisano ustawienia paska" };
}
```

(Uwaga: `actions.ts` to `"use server"` — wszystkie eksporty tu są async (akcje/reader), więc zgodne z regułą. `parseTopBarSettings`/typ importujemy z pure modułu, nie eksportujemy ich stąd.)

- [ ] **Step 6: Utwórz `TopBarSettingsCard.tsx`**

`app/admin/strona-glowna/TopBarSettingsCard.tsx` (wzorzec `SiteTextsCard`):

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, inputCls } from "@/app/admin/_shared";
import type { ActionResult } from "@/app/_lib/types";
import type { TopBarSettingsRow } from "@/app/_lib/topbar-settings";
import { updateTopBarSettings } from "./actions";

// Górny pasek: kontakt (telefon/email — działają w całym serwisie) + baner
// promocyjny (PL/DE, kolor, link, włącz/wyłącz). Placeholdery kontaktu =
// wartości domyślne z configu (puste pole = domyślne).
export default function TopBarSettingsCard({
  initial,
  contactDefaults,
  onResult,
}: {
  initial: TopBarSettingsRow | null;
  contactDefaults: { phone: string; email: string };
  onResult: (r: ActionResult) => void;
}) {
  const [saving, startSave] = useTransition();
  const router = useRouter();

  function submit(formData: FormData) {
    startSave(async () => {
      const res = await updateTopBarSettings(formData);
      onResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <Card>
      <h2 className="font-display text-xl font-semibold text-[var(--fg)] mb-2">Górny pasek</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        Numer telefonu i email (działają w całym serwisie: pasek, stopka, kontakt, regulamin) oraz baner promocyjny na samej górze strony.
      </p>
      <form action={submit} className="flex flex-col gap-6" data-guard-section>
        {/* Kontakt */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Telefon" hint="Puste = domyślny numer z konfiguracji.">
            <input name="contact_phone" defaultValue={initial?.contact_phone ?? ""} placeholder={contactDefaults.phone} className={inputCls} />
          </Field>
          <Field label="Email" hint="Puste = domyślny email z konfiguracji.">
            <input name="contact_email" defaultValue={initial?.contact_email ?? ""} placeholder={contactDefaults.email} className={inputCls} />
          </Field>
        </div>

        {/* Baner promocyjny */}
        <div className="pt-4 border-t border-[var(--border)] flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm text-[var(--fg)] cursor-pointer">
            <input type="checkbox" name="promo_enabled" value="1" defaultChecked={initial?.promo_enabled ?? false} className="h-4 w-4 accent-[var(--color-gold)]" />
            Pokaż baner promocyjny na górze strony
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Tekst promocji">
              <input name="promo_text" defaultValue={initial?.promo_text ?? ""} placeholder="np. -20% na wszystko do niedzieli!" className={inputCls} />
            </Field>
            <Field label="Tekst promocji DE">
              <input name="promo_text_de" defaultValue={initial?.promo_text_de ?? ""} className={inputCls} />
            </Field>
            <Field label="Link (opcjonalnie)" hint="np. /sklep albo pełny adres. Puste = baner nieklikalny.">
              <input name="promo_link" defaultValue={initial?.promo_link ?? ""} placeholder="/sklep" className={inputCls} />
            </Field>
            <Field label="Kolor tła">
              <select name="promo_color" defaultValue={initial?.promo_color ?? "gold"} className={inputCls}>
                <option value="gold">Złoty</option>
                <option value="navy">Navy (granatowy)</option>
                <option value="red">Czerwony (wyprzedaż)</option>
              </select>
            </Field>
          </div>
        </div>

        <div>
          <button type="submit" disabled={saving} data-guard-save className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50">
            {saving ? "Zapisuję..." : "Zapisz ustawienia paska"}
          </button>
        </div>
      </form>
    </Card>
  );
}
```

Uwaga do checkboxa: standardowy HTML nie wysyła niezaznaczonego checkboxa → `formData.get("promo_enabled")` = `null` gdy odznaczony, `"1"` gdy zaznaczony. `parseTopBarSettings` mapuje `"1"` → true, resztę → false. Zgodne.

- [ ] **Step 7: Pobierz dane na stronie i przekaż do BlocksEditor**

W `app/admin/strona-glowna/page.tsx`:

(a) Dodaj import: `import { getTopBarSettingsForAdmin } from "./actions";` oraz `import { COMPANY } from "@/app/_lib/company";`

(b) Dodaj do `Promise.all` (i destrukturyzacji) `getTopBarSettingsForAdmin()`:

```ts
  const [blocks, trustItems, siteTexts, products, collections, categories, topBar] =
    await Promise.all([
      getAllHomeBlocksAdmin(),
      getAllTrustItems(),
      getAllSiteTexts(),
      getProductsForBlockPicker(),
      getAllCollections(),
      getCategories(),
      getTopBarSettingsForAdmin(),
    ]);
```

(c) Przekaż do `BlocksEditor` nowe propsy:

```tsx
    <BlocksEditor
      initialBlocks={blocks}
      initialTrustItems={trustItems}
      initialSiteTexts={siteTexts}
      initialTopBar={topBar}
      contactDefaults={{ phone: COMPANY.phone ?? "", email: COMPANY.email }}
      picker={{
        products,
        collections: collections.map((c) => ({ slug: c.slug, label: c.label })),
        categories: categories.map((c) => ({ slug: c.slug, label: c.label })),
      }}
    />
```

- [ ] **Step 8: Wyrenderuj kartę w `BlocksEditor.tsx`**

W `app/admin/strona-glowna/BlocksEditor.tsx`:

(a) Dodaj import: `import TopBarSettingsCard from "./TopBarSettingsCard";` oraz typu: `import type { TopBarSettingsRow } from "@/app/_lib/topbar-settings";`

(b) Rozszerz propsy komponentu `BlocksEditor` (sygnatura destrukturyzacji + typ):

```ts
export default function BlocksEditor({
  initialBlocks,
  initialTrustItems,
  initialSiteTexts,
  initialTopBar,
  contactDefaults,
  picker,
}: {
  initialBlocks: PageBlockRow[];
  initialTrustItems: TrustItemRow[];
  initialSiteTexts: SiteTextsMap;
  initialTopBar: TopBarSettingsRow | null;
  contactDefaults: { phone: string; email: string };
  picker: BlockPickerData;
}) {
```

(c) Wyrenderuj kartę obok istniejącej `<SiteTextsCard>` (linia ~363), przed nią (górny pasek to pierwsza rzecz na stronie):

```tsx
      <TopBarSettingsCard initial={initialTopBar} contactDefaults={contactDefaults} onResult={handleResult} />

      <SiteTextsCard initialTexts={initialSiteTexts} onResult={handleResult} />
```

- [ ] **Step 9: Typecheck + testy + build**

Run: `npx tsc --noEmit`
Run: `npm test`
Run: `npm run build`
Expected: zielono.

- [ ] **Step 10: Commit**

```bash
git add app/_lib/topbar-settings.ts app/_lib/__tests__/topbar-settings.test.ts app/admin/strona-glowna/TopBarSettingsCard.tsx app/admin/strona-glowna/actions.ts app/admin/strona-glowna/page.tsx app/admin/strona-glowna/BlocksEditor.tsx
git commit -m "feat(pasek): karta admina (kontakt + baner) w /admin/strona-glowna + akcja updateTopBarSettings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Weryfikacja + migracja na prod + finish

**Files:** brak zmian kodu (chyba że coś się wysypie).

- [ ] **Step 1: Pełna weryfikacja**

Run: `npm test` — Expected: wszystkie PASS (baza 614 + nowe testy contact/promo/topbar-settings).
Run: `npm run lint` — Expected: 0 errorów.
Run: `npm run build` — Expected: zielony (łapie przeciek server-only do klienta — `PromoBanner`/`TopBarSettingsCard` importują tylko pure moduły).

- [ ] **Step 2: Migracja 56 na prod (KONTROLER, za zgodą Mikołaja)**

Kontroler pokazuje SQL z `56_topbar_contact_promo.sql`, prosi o zgodę, po zgodzie uruchamia przez Supabase MCP (`mcp__supabase__apply_migration`). Weryfikacja read-only: `select contact_phone, promo_enabled, promo_color from store_settings where id = true;` → wiersz z defaultami (promo_enabled=false, promo_color='gold', kontakt NULL). Bez zgody — NIE uruchamiać; feature działa po deployu dopiero po migracji (do tego czasu getContactInfo/getPromoBanner łapią błąd braku kolumn → fallback COMPANY / baner off — bezpiecznie).

- [ ] **Step 3: Smoke (dev, ręcznie / po deployu na prodzie)**

⚠️ localhost = TA SAMA baza co prod. Do testu zmian użyj wartości, które potem przywrócisz (albo testuj po migracji na żywej, z cofnięciem).
1. `/admin/strona-glowna` → karta „Górny pasek": zmień telefon → zapisz → sprawdź nowy numer na pasku, w stopce, `/kontakt`, `/regulamin` (PL i `/de`). Wyczyść pole → wraca domyślny.
2. Włącz baner z tekstem PL/DE + kolor + link → baner na górze każdej strony (poza `/admin`), właściwy język/kolor, klik prowadzi pod link.
3. Zamknij baner (X) → znika, po odświeżeniu nie wraca; zmień tekst w adminie → baner wraca.
4. Odznacz „Pokaż baner" → znika.
5. Przywróć testowe wartości.

- [ ] **Step 4: Finish**

Użyj `superpowers:finishing-a-development-branch` → PR na GitHub z checklistą klik-testów (jak poprzednie). Migracja 56 to część wdrożenia (Step 2).

---

## Spec coverage (self-check)

| Wymaganie specu | Task |
|---|---|
| Migracja 56 (kontakt + promo na store_settings, addytywna, check koloru) | 1 |
| `getContactInfo` + `pickContact` (fallback COMPANY) | 2 |
| Kontakt w 6 konsumentach (pasek, stopka, kontakt, regulamin, prywatność, zwroty) | 5 |
| `getPromoBanner` + `normalizePromo`/`promoKey`/kolory (pure/server split) | 3 |
| `PromoBanner` (kolor, link wewn./zewn., X+localStorage kluczem=hash) + layout nad topbarem, ukryty na /admin | 4 |
| Karta admina „Górny pasek" w /admin/strona-glowna + `updateTopBarSettings` + reader | 6 |
| Walidacja (kolor z listy, puste→NULL, bool z checkboxa) + testy | 6 |
| Slogan/przełącznik/dane rejestrowe bez zmian | (nie ruszane) |
| Testy jednostkowe (pickContact, normalizePromo, promoKey, kolory, parser) | 2,3,6 |
| Migracja na prod za zgodą + smoke PL/de | 7 |
