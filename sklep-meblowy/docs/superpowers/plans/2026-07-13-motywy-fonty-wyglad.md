# Motywy kolorów + pary fontów + /admin/wyglad — plan implementacji (krok 3/3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nietechniczna administratorka zmienia wygląd całego sklepu na `/admin/wyglad`: 4 gotowe motywy kolorów, opcjonalne własne kolory z automatyczną korektą kontrastu (WCAG AA), 4 pary fontów — z podglądem na żywo przed zapisem.

**Architecture:** Definicje motywów (pełne palety light+dark) i par fontów w kodzie (`app/_lib/theme.ts` — moduł CZYSTY, używany przez layout serwerowy i kliencki podgląd). W bazie tylko wybór (3 kolumny w `store_settings`). Root layout czyta wybór (cache tag `theme`), generuje blok `<style>` z selektorami `:root:root`/`:root:root.dark` — specyficzność (0,2,0)/(0,3,0) wygrywa z `:root`/`.dark` z `globals.css` niezależnie od kolejności CSS. Ponieważ komponenty używają `var(--color-*)`/`var(--bg)` itd. (~183 miejsca), cały sklep przemalowuje się bez zmian w komponentach, server-side (zero FOUC).

**Tech Stack:** Next.js 16.2.4, next/font/google, Supabase, Tailwind v4 (`@theme inline`), vitest.

**Spec:** `docs/superpowers/specs/2026-07-13-edycja-home-motyw-design.md`
**Wymaga:** zmergowane kroki 1-2 (hub istnieje; niezależne technicznie od trust_items — twarda zależność to tylko kolejność migracji: 51 po 50).

## Global Constraints

- **Next 16 ≠ Next z treningu** — czytaj `node_modules/next/dist/docs/` (fonty: `01-app/03-api-reference/02-components/font.md`; cache: `04-functions/unstable_cache.md`, `revalidateTag.md`). Zweryfikowane: `revalidateTag(tag, "max")`; fonty niezmiennoosiowe (Lato, Cormorant Garamond) WYMAGAJĄ `weight`.
- **Turbopack gotcha:** pliki `"use server"` — tylko async akcje, zero `export type`.
- **`unstable_cache`:** bez `cookies()` — kurs/theme czytamy czystym klientem anon (wzorzec `store-settings.ts`); fallback per wywołanie, nie w cache.
- **CSP:** `style-src` ma `'unsafe-inline'` (patrz `app/_lib/csp.ts`) — inline `<style>` bez nonce jest OK.
- **Rozdział klient/serwer:** `app/_lib/theme.ts` i `app/_lib/color-utils.ts` muszą pozostać CZYSTE (zero importów serwerowych) — importuje je kliencki `ThemeEditor`. Warstwa IO w osobnym `app/_lib/theme-settings.ts` (z `server-only`).
- **Numeracja migracji: ta faza = `51_theme_settings.sql`** (49/50 zajęte przez kroki 1-2; 47/48 przez PR #48 P24).
- **Baza Supabase = PRODUKCJA.** Migracja przez Supabase MCP po potwierdzeniu użytkownika.
- Panel admina PL-only; komentarze po polsku; importy `@/app/...`; TDD.
- Komendy: `npx vitest run <plik>`, `npm test`, `npx tsc --noEmit`, `npm run build`.
- **Branch:** `feat/motywy-fonty-wyglad` od `main`. Na końcu superpowers:finishing-a-development-branch.

## File Structure

- Create: `app/_lib/color-utils.ts` — czyste funkcje kolorów (hex↔rgb, mix, luminancja, kontrast, auto-kontrast)
- Create: `app/_lib/__tests__/color-utils.test.ts`
- Create: `app/_lib/theme.ts` — presety (4 pełne palety light+dark), pary fontów, normalizacja ustawień, `resolveThemeTokens`, `buildThemeCss` (czysty moduł)
- Create: `app/_lib/__tests__/theme.test.ts`
- Create: `supabase/migrations/51_theme_settings.sql` — 3 kolumny w `store_settings`
- Create: `app/_lib/theme-settings.ts` — fetch+cache (tag `theme`) + odczyt admina + inwalidacja
- Create: `app/admin/wyglad/actions.ts` — zapis/reset motywu
- Create: `app/admin/wyglad/page.tsx`
- Create: `app/admin/wyglad/ThemeEditor.tsx` — kafle motywów, pickery, fonty, podgląd na żywo
- Modify: `app/globals.css` — pośrednie zmienne fontów (`--font-sans-active`/`--font-display-active`)
- Modify: `app/layout.tsx` — 5 nowych fontów (bez preloadu), wstrzyknięcie `<style>` motywu
- Modify: `app/admin/AdminShell.tsx` — pozycja „Wygląd"
- Modify: `app/admin/page.tsx` — karta „Wygląd"

---

### Task 1: `color-utils.ts` — czyste funkcje kolorów — TDD

**Files:**
- Create: `app/_lib/color-utils.ts`
- Test: `app/_lib/__tests__/color-utils.test.ts`

**Interfaces:**
- Produces (dla Tasków 2, 7):
  - `isHexColor(v: unknown): v is string` — `#rrggbb` (6 znaków hex)
  - `hexToRgb(hex: string): { r: number; g: number; b: number }`
  - `rgbToHex(r: number, g: number, b: number): string`
  - `mix(a: string, b: string, t: number): string` — interpolacja liniowa
  - `lighten(hex: string, t: number): string`, `darken(hex: string, t: number): string`
  - `relativeLuminance(hex: string): number` — wzór WCAG (sRGB)
  - `contrastRatio(a: string, b: string): number` — 1..21
  - `ensureContrast(color: string, bg: string, min?: number): string` — domyślnie 4.5

- [ ] **Step 1: Napisz failing test**

```ts
// app/_lib/__tests__/color-utils.test.ts
import { describe, it, expect } from "vitest";
import {
  isHexColor,
  hexToRgb,
  rgbToHex,
  mix,
  lighten,
  darken,
  relativeLuminance,
  contrastRatio,
  ensureContrast,
} from "@/app/_lib/color-utils";

describe("isHexColor", () => {
  it("akceptuje #rrggbb, odrzuca resztę", () => {
    expect(isHexColor("#c9a84c")).toBe(true);
    expect(isHexColor("#C9A84C")).toBe(true);
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("c9a84c")).toBe(false);
    expect(isHexColor("#c9a84g")).toBe(false);
    expect(isHexColor(null)).toBe(false);
    expect(isHexColor(42)).toBe(false);
  });
});

describe("hex ↔ rgb", () => {
  it("roundtrip", () => {
    expect(hexToRgb("#1a1a2e")).toEqual({ r: 26, g: 26, b: 46 });
    expect(rgbToHex(26, 26, 46)).toBe("#1a1a2e");
  });
  it("rgbToHex clampuje i zaokrągla", () => {
    expect(rgbToHex(300, -5, 12.6)).toBe("#ff000d");
  });
});

describe("mix / lighten / darken", () => {
  it("środek czerni i bieli to szarość", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
  it("t=0 zwraca pierwszy kolor, t=1 drugi", () => {
    expect(mix("#c9a84c", "#000000", 0)).toBe("#c9a84c");
    expect(mix("#c9a84c", "#000000", 1)).toBe("#000000");
  });
  it("lighten zwiększa luminancję, darken zmniejsza", () => {
    const base = "#c9a84c";
    expect(relativeLuminance(lighten(base, 0.3))).toBeGreaterThan(relativeLuminance(base));
    expect(relativeLuminance(darken(base, 0.3))).toBeLessThan(relativeLuminance(base));
  });
});

describe("relativeLuminance / contrastRatio (WCAG)", () => {
  it("biel=1, czerń=0, kontrast biel/czerń=21", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });
  it("kontrast jest symetryczny", () => {
    expect(contrastRatio("#c9a84c", "#ece4d7")).toBeCloseTo(
      contrastRatio("#ece4d7", "#c9a84c"),
      5
    );
  });
  it("znany problem z audytu: złoto na kremie ~1.84 (za mało)", () => {
    expect(contrastRatio("#c9a84c", "#ece4d7")).toBeLessThan(3);
  });
});

describe("ensureContrast", () => {
  it("kolor już kontrastowy → bez zmian", () => {
    expect(ensureContrast("#1a1a2e", "#ece4d7")).toBe("#1a1a2e");
  });
  it("złoto na jasnym kremie → przyciemnione do >=4.5", () => {
    const fixed = ensureContrast("#c9a84c", "#ece4d7");
    expect(contrastRatio(fixed, "#ece4d7")).toBeGreaterThanOrEqual(4.5);
    expect(relativeLuminance(fixed)).toBeLessThan(relativeLuminance("#c9a84c"));
  });
  it("ciemny kolor na ciemnym tle → rozjaśniony do >=4.5", () => {
    const fixed = ensureContrast("#1a1a2e", "#0f0f1a");
    expect(contrastRatio(fixed, "#0f0f1a")).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 2: Uruchom test — FAIL**

Run: `npx vitest run app/_lib/__tests__/color-utils.test.ts`
Expected: FAIL — moduł nie istnieje.

- [ ] **Step 3: Zaimplementuj**

```ts
// app/_lib/color-utils.ts
// Czyste funkcje kolorów dla motywów (/admin/wyglad): konwersje, mieszanie
// i kontrast wg WCAG 2.x. Zero zależności — używane po stronie serwera
// (generowanie CSS motywu) i klienta (podgląd na żywo w adminie).

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

// Interpolacja liniowa a→b w przestrzeni sRGB (t: 0..1).
export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(
    ca.r + (cb.r - ca.r) * t,
    ca.g + (cb.g - ca.g) * t,
    ca.b + (cb.b - ca.b) * t
  );
}

export function lighten(hex: string, t: number): string {
  return mix(hex, "#ffffff", t);
}

export function darken(hex: string, t: number): string {
  return mix(hex, "#000000", t);
}

// Luminancja względna wg WCAG (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance).
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// Koryguje kolor aż osiągnie kontrast >= min wobec tła: na jasnym tle
// przyciemnia, na ciemnym rozjaśnia (kroki 6%, max 24 iteracje).
// Dzięki temu nie da się zapisać nieczytelnego tekstu z color-pickera.
export function ensureContrast(color: string, bg: string, min = 4.5): string {
  if (contrastRatio(color, bg) >= min) return color;
  const bgIsLight = relativeLuminance(bg) > 0.5;
  let c = color;
  for (let i = 0; i < 24; i++) {
    c = bgIsLight ? darken(c, 0.06) : lighten(c, 0.06);
    if (contrastRatio(c, bg) >= min) return c;
  }
  return bgIsLight ? "#000000" : "#ffffff";
}
```

- [ ] **Step 4: Uruchom test — PASS**

Run: `npx vitest run app/_lib/__tests__/color-utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/color-utils.ts app/_lib/__tests__/color-utils.test.ts
git commit -m "feat(motyw): funkcje kolorow - mix, luminancja, kontrast WCAG, auto-kontrast (TDD)"
```

---

### Task 2: `theme.ts` — presety, pary fontów, tokeny, generowanie CSS — TDD

**Files:**
- Create: `app/_lib/theme.ts`
- Test: `app/_lib/__tests__/theme.test.ts`

**Interfaces:**
- Consumes: `color-utils` (Task 1).
- Produces (dla Tasków 4, 5, 6, 7):
  - `type ThemeTokens = { navy; navyLight; gold; goldLight; cream; goldText; bg; fg; cardBg; border; muted: string }` (wszystkie `string`)
  - `type ThemePresetKey = "klasyczny" | "butelkowa-zielen" | "bez-braz" | "grafit-miedz"`
  - `THEME_PRESETS: Record<ThemePresetKey, { key; label: string; light: ThemeTokens; dark: ThemeTokens }>`
  - `DEFAULT_THEME_PRESET: ThemePresetKey`, `isThemePresetKey(v: string)`
  - `type ThemeOverrides = { navy?: string; gold?: string; cream?: string }`
  - `FONT_PAIRS: Record<FontPairKey, { label: string; sans: string; display: string }>` (wartości `sans`/`display` = `var(--font-...)`)
  - `type FontPairKey = "inter-playfair" | "lato-cormorant" | "montserrat" | "nunito-lora"`, `DEFAULT_FONT_PAIR`, `isFontPairKey(v: string)`
  - `type ThemeSettings = { preset: ThemePresetKey; overrides: ThemeOverrides; fontPair: FontPairKey }`, `DEFAULT_THEME_SETTINGS`
  - `normalizeThemeSettings(raw: { theme_preset?: unknown; theme_overrides?: unknown; font_pair?: unknown } | null): ThemeSettings`
  - `resolveThemeTokens(s: ThemeSettings): { light: ThemeTokens; dark: ThemeTokens }`
  - `buildThemeCss(s: ThemeSettings): string`

- [ ] **Step 1: Napisz failing test**

```ts
// app/_lib/__tests__/theme.test.ts
import { describe, it, expect } from "vitest";
import {
  THEME_PRESETS,
  DEFAULT_THEME_SETTINGS,
  normalizeThemeSettings,
  resolveThemeTokens,
  buildThemeCss,
  type ThemePresetKey,
} from "@/app/_lib/theme";
import { contrastRatio, relativeLuminance } from "@/app/_lib/color-utils";

describe("THEME_PRESETS — jakość palet (WCAG)", () => {
  const keys = Object.keys(THEME_PRESETS) as ThemePresetKey[];

  it("są dokładnie 4 presety, klasyczny = obecne wartości strony", () => {
    expect(keys).toHaveLength(4);
    const k = THEME_PRESETS.klasyczny;
    expect(k.light.gold).toBe("#c9a84c");
    expect(k.light.bg).toBe("#ece4d7");
    expect(k.light.goldText).toBe("#92681c");
    expect(k.dark.bg).toBe("#0f0f1a");
    expect(k.dark.cardBg).toBe("#1a1a2e");
  });

  it.each(keys)("%s: goldText czytelny na tle (>=4.5) w light i dark", (key) => {
    const p = THEME_PRESETS[key];
    expect(contrastRatio(p.light.goldText, p.light.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.light.goldText, p.light.cardBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.dark.goldText, p.dark.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(keys)("%s: tekst główny bardzo czytelny (>=7) w light i dark", (key) => {
    const p = THEME_PRESETS[key];
    expect(contrastRatio(p.light.fg, p.light.bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(p.dark.fg, p.dark.bg)).toBeGreaterThanOrEqual(7);
  });

  it.each(keys)("%s: dark bg jest ciemne, light bg jasne", (key) => {
    const p = THEME_PRESETS[key];
    expect(relativeLuminance(p.light.bg)).toBeGreaterThan(0.5);
    expect(relativeLuminance(p.dark.bg)).toBeLessThan(0.1);
  });
});

describe("normalizeThemeSettings", () => {
  it("null / nieznane wartości → defaulty", () => {
    expect(normalizeThemeSettings(null)).toEqual(DEFAULT_THEME_SETTINGS);
    expect(
      normalizeThemeSettings({ theme_preset: "neon", theme_overrides: "zepsute", font_pair: "comic-sans" })
    ).toEqual(DEFAULT_THEME_SETTINGS);
  });

  it("odfiltrowuje złe hexy i nieznane klucze z overrides", () => {
    const s = normalizeThemeSettings({
      theme_preset: "bez-braz",
      theme_overrides: { gold: "#b87333", navy: "nie-hex", tlo: "#ffffff" },
      font_pair: "montserrat",
    });
    expect(s.preset).toBe("bez-braz");
    expect(s.overrides).toEqual({ gold: "#b87333" });
    expect(s.fontPair).toBe("montserrat");
  });
});

describe("resolveThemeTokens — nadpisania z pochodnymi", () => {
  it("bez overrides → tokeny presetu 1:1", () => {
    const { light, dark } = resolveThemeTokens(DEFAULT_THEME_SETTINGS);
    expect(light).toEqual(THEME_PRESETS.klasyczny.light);
    expect(dark).toEqual(THEME_PRESETS.klasyczny.dark);
  });

  it("override gold → goldLight/goldText pochodne, kontrast trzymany", () => {
    const { light, dark } = resolveThemeTokens({
      ...DEFAULT_THEME_SETTINGS,
      overrides: { gold: "#b87333" },
    });
    expect(light.gold).toBe("#b87333");
    expect(light.goldLight).not.toBe(THEME_PRESETS.klasyczny.light.goldLight);
    expect(contrastRatio(light.goldText, light.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark.goldText, dark.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("override cream → bg/cardBg/border pochodne (cardBg jaśniejszy, border ciemniejszy)", () => {
    const { light } = resolveThemeTokens({
      ...DEFAULT_THEME_SETTINGS,
      overrides: { cream: "#e8ded2" },
    });
    expect(light.bg).toBe("#e8ded2");
    expect(relativeLuminance(light.cardBg)).toBeGreaterThan(relativeLuminance(light.bg));
    expect(relativeLuminance(light.border)).toBeLessThan(relativeLuminance(light.bg));
  });

  it("override navy → fg/navyLight w light i cardBg/bg w dark pochodne", () => {
    const { light, dark } = resolveThemeTokens({
      ...DEFAULT_THEME_SETTINGS,
      overrides: { navy: "#22304a" },
    });
    expect(light.navy).toBe("#22304a");
    expect(light.fg).toBe("#22304a");
    expect(dark.cardBg).toBe("#22304a");
    expect(relativeLuminance(dark.bg)).toBeLessThan(relativeLuminance(dark.cardBg));
  });
});

describe("buildThemeCss", () => {
  it("emituje :root:root i :root:root.dark z tokenami i fontami", () => {
    const css = buildThemeCss(DEFAULT_THEME_SETTINGS);
    expect(css).toContain(":root:root{");
    expect(css).toContain(":root:root.dark{");
    expect(css).toContain("--color-gold:#c9a84c");
    expect(css).toContain("--font-sans-active:var(--font-inter)");
    expect(css).toContain("--font-display-active:var(--font-playfair)");
  });

  it("para montserrat ustawia oba fonty na montserrat", () => {
    const css = buildThemeCss({ ...DEFAULT_THEME_SETTINGS, fontPair: "montserrat" });
    expect(css).toContain("--font-sans-active:var(--font-montserrat)");
    expect(css).toContain("--font-display-active:var(--font-montserrat)");
  });
});
```

- [ ] **Step 2: Uruchom test — FAIL**

Run: `npx vitest run app/_lib/__tests__/theme.test.ts`
Expected: FAIL — moduł nie istnieje.

- [ ] **Step 3: Zaimplementuj**

```ts
// app/_lib/theme.ts
// Motywy wyglądu sklepu (/admin/wyglad). Palety i pary fontów mieszkają
// W KODZIE (każda przetestowana na kontrast WCAG) — w bazie tylko wybór
// (store_settings: theme_preset, theme_overrides, font_pair).
// Moduł CZYSTY: importuje go layout serwerowy ORAZ kliencki podgląd.

import { contrastRatio, darken, ensureContrast, isHexColor, lighten } from "./color-utils";

export type ThemeTokens = {
  navy: string;
  navyLight: string;
  gold: string;
  goldLight: string;
  cream: string;
  goldText: string;
  bg: string;
  fg: string;
  cardBg: string;
  border: string;
  muted: string;
};

export type ThemePresetKey =
  | "klasyczny"
  | "butelkowa-zielen"
  | "bez-braz"
  | "grafit-miedz";

export type ThemePreset = {
  key: ThemePresetKey;
  label: string;
  light: ThemeTokens;
  dark: ThemeTokens;
};

// Wartości „klasyczny" = dokładnie dzisiejsze zmienne z globals.css.
// Pozostałe palety dobrane ręcznie; test wymusza kontrast (goldText>=4.5,
// fg>=7 na bg, w obu trybach) — jeśli po korekcie wartości test nie
// przechodzi, przyciemnij/rozjaśnij goldText/fg do progu i uruchom ponownie.
export const THEME_PRESETS: Record<ThemePresetKey, ThemePreset> = {
  klasyczny: {
    key: "klasyczny",
    label: "Klasyczny (granat + złoto)",
    light: {
      navy: "#1a1a2e", navyLight: "#16213e", gold: "#c9a84c", goldLight: "#e0c070",
      cream: "#ece4d7", goldText: "#92681c", bg: "#ece4d7", fg: "#1a1a2e",
      cardBg: "#f7f1e6", border: "#d2c5ab", muted: "#5a544e",
    },
    dark: {
      navy: "#1a1a2e", navyLight: "#16213e", gold: "#c9a84c", goldLight: "#e0c070",
      cream: "#ece4d7", goldText: "#c9a84c", bg: "#0f0f1a", fg: "#f0ece4",
      cardBg: "#1a1a2e", border: "#2a2a3e", muted: "#9490a0",
    },
  },
  "butelkowa-zielen": {
    key: "butelkowa-zielen",
    label: "Butelkowa zieleń + mosiądz",
    light: {
      navy: "#1d332a", navyLight: "#244035", gold: "#a8863c", goldLight: "#c8ab66",
      cream: "#eae7dc", goldText: "#6f591f", bg: "#eae7dc", fg: "#1d332a",
      cardBg: "#f5f3ea", border: "#cec9b4", muted: "#55594f",
    },
    dark: {
      navy: "#1d332a", navyLight: "#244035", gold: "#a8863c", goldLight: "#c8ab66",
      cream: "#eae7dc", goldText: "#c8ab66", bg: "#0c1512", fg: "#ecefe8",
      cardBg: "#1d332a", border: "#2c4438", muted: "#96a29a",
    },
  },
  "bez-braz": {
    key: "bez-braz",
    label: "Beż + ciepły brąz",
    light: {
      navy: "#3d2f26", navyLight: "#4f3d31", gold: "#a2703f", goldLight: "#c39a6b",
      cream: "#f1eae0", goldText: "#7a5424", bg: "#f1eae0", fg: "#3d2f26",
      cardBg: "#f9f4ec", border: "#d8ccba", muted: "#5f564d",
    },
    dark: {
      navy: "#3d2f26", navyLight: "#4f3d31", gold: "#a2703f", goldLight: "#c39a6b",
      cream: "#f1eae0", goldText: "#c39a6b", bg: "#14100d", fg: "#f1ece4",
      cardBg: "#3d2f26", border: "#52443a", muted: "#a1968a",
    },
  },
  "grafit-miedz": {
    key: "grafit-miedz",
    label: "Grafit + miedź",
    light: {
      navy: "#23262b", navyLight: "#2e3238", gold: "#b06a3e", goldLight: "#d0946c",
      cream: "#eae8e4", goldText: "#8c4f27", bg: "#eae8e4", fg: "#23262b",
      cardBg: "#f5f4f1", border: "#cfccc5", muted: "#565a60",
    },
    dark: {
      navy: "#23262b", navyLight: "#2e3238", gold: "#b06a3e", goldLight: "#d0946c",
      cream: "#eae8e4", goldText: "#d0946c", bg: "#101215", fg: "#eceae6",
      cardBg: "#23262b", border: "#35393f", muted: "#9a9da3",
    },
  },
};

export const DEFAULT_THEME_PRESET: ThemePresetKey = "klasyczny";

export function isThemePresetKey(v: string): v is ThemePresetKey {
  return v in THEME_PRESETS;
}

export type ThemeOverrides = { navy?: string; gold?: string; cream?: string };

const OVERRIDE_KEYS = ["navy", "gold", "cream"] as const;

// Pary fontów: wartości = referencje do zmiennych next/font z layoutu.
export const FONT_PAIRS = {
  "inter-playfair": {
    label: "Klasyczna elegancja (Inter + Playfair Display)",
    sans: "var(--font-inter)",
    display: "var(--font-playfair)",
  },
  "lato-cormorant": {
    label: "Delikatna szeryfowa (Lato + Cormorant Garamond)",
    sans: "var(--font-lato)",
    display: "var(--font-cormorant)",
  },
  montserrat: {
    label: "Nowoczesna (Montserrat)",
    sans: "var(--font-montserrat)",
    display: "var(--font-montserrat)",
  },
  "nunito-lora": {
    label: "Ciepła (Nunito Sans + Lora)",
    sans: "var(--font-nunito)",
    display: "var(--font-lora)",
  },
} as const;

export type FontPairKey = keyof typeof FONT_PAIRS;

export const DEFAULT_FONT_PAIR: FontPairKey = "inter-playfair";

export function isFontPairKey(v: string): v is FontPairKey {
  return v in FONT_PAIRS;
}

export type ThemeSettings = {
  preset: ThemePresetKey;
  overrides: ThemeOverrides;
  fontPair: FontPairKey;
};

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  preset: DEFAULT_THEME_PRESET,
  overrides: {},
  fontPair: DEFAULT_FONT_PAIR,
};

// Normalizacja surowego wiersza store_settings → bezpieczne ustawienia.
// Nieznany preset/font → default; overrides: tylko znane klucze + poprawny hex.
export function normalizeThemeSettings(
  raw: { theme_preset?: unknown; theme_overrides?: unknown; font_pair?: unknown } | null
): ThemeSettings {
  const preset =
    typeof raw?.theme_preset === "string" && isThemePresetKey(raw.theme_preset)
      ? raw.theme_preset
      : DEFAULT_THEME_PRESET;
  const fontPair =
    typeof raw?.font_pair === "string" && isFontPairKey(raw.font_pair)
      ? raw.font_pair
      : DEFAULT_FONT_PAIR;
  const overrides: ThemeOverrides = {};
  if (raw?.theme_overrides && typeof raw.theme_overrides === "object") {
    for (const key of OVERRIDE_KEYS) {
      const val = (raw.theme_overrides as Record<string, unknown>)[key];
      if (isHexColor(val)) overrides[key] = val;
    }
  }
  return { preset, overrides, fontPair };
}

// Preset + nadpisania → finalne tokeny (light i dark) z pochodnymi:
// cream → tła/obramowanie; navy → tekst/fg + ciemne tła; gold → warianty
// i goldText z gwarancją kontrastu (ensureContrast — patrz color-utils).
// Kolejność: cream przed gold, bo goldText liczy się wobec finalnego tła.
export function resolveThemeTokens(settings: ThemeSettings): {
  light: ThemeTokens;
  dark: ThemeTokens;
} {
  const preset = THEME_PRESETS[settings.preset] ?? THEME_PRESETS[DEFAULT_THEME_PRESET];
  const light: ThemeTokens = { ...preset.light };
  const dark: ThemeTokens = { ...preset.dark };
  const o = settings.overrides;

  if (o.cream) {
    light.cream = o.cream;
    light.bg = o.cream;
    light.cardBg = lighten(o.cream, 0.45);
    light.border = darken(o.cream, 0.12);
    dark.cream = o.cream;
  }
  if (o.navy) {
    light.navy = o.navy;
    light.navyLight = lighten(o.navy, 0.12);
    light.fg = o.navy;
    dark.navy = o.navy;
    dark.navyLight = lighten(o.navy, 0.12);
    dark.cardBg = o.navy;
    dark.bg = darken(o.navy, 0.45);
    dark.border = lighten(darken(o.navy, 0.45), 0.16);
  }
  if (o.gold) {
    light.gold = o.gold;
    light.goldLight = lighten(o.gold, 0.25);
    dark.gold = o.gold;
    dark.goldLight = lighten(o.gold, 0.25);
  }
  // goldText zawsze przeliczany wobec finalnych teł (także gdy zmienił się
  // tylko cream/navy) — czytelność ma pierwszeństwo przed wiernością barwy.
  light.goldText = ensureContrast(light.gold, light.bg);
  if (contrastRatio(light.goldText, light.cardBg) < 4.5) {
    light.goldText = ensureContrast(light.goldText, light.cardBg);
  }
  dark.goldText = ensureContrast(dark.gold, dark.bg);

  return { light, dark };
}

function tokensToCss(t: ThemeTokens): string {
  return (
    `--color-navy:${t.navy};--color-navy-light:${t.navyLight};` +
    `--color-gold:${t.gold};--color-gold-light:${t.goldLight};` +
    `--color-cream:${t.cream};--color-gold-text:${t.goldText};` +
    `--bg:${t.bg};--fg:${t.fg};--card-bg:${t.cardBg};` +
    `--border:${t.border};--muted:${t.muted};`
  );
}

// Blok <style> wstrzykiwany w root layoucie. Selektory :root:root (0,2,0)
// i :root:root.dark (0,3,0) wygrywają z :root/.dark z globals.css (0,1,0)
// niezależnie od kolejności arkuszy — bez wojen o source order.
export function buildThemeCss(settings: ThemeSettings): string {
  const { light, dark } = resolveThemeTokens(settings);
  const fonts = FONT_PAIRS[settings.fontPair] ?? FONT_PAIRS[DEFAULT_FONT_PAIR];
  return (
    `:root:root{${tokensToCss(light)}` +
    `--font-sans-active:${fonts.sans};--font-display-active:${fonts.display};}` +
    `:root:root.dark{${tokensToCss(dark)}}`
  );
}
```

- [ ] **Step 4: Uruchom test — PASS (koryguj palety, jeśli kontrast nie przejdzie)**

Run: `npx vitest run app/_lib/__tests__/theme.test.ts`
Expected: PASS. Jeśli któryś test kontrastu palet nie przejdzie — to test
działa poprawnie: przyciemnij `goldText` (light) / rozjaśnij (dark) o 1-2
kroki hex w TYM presecie i uruchom ponownie. Nie zmieniaj progów w testach.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/theme.ts app/_lib/__tests__/theme.test.ts
git commit -m "feat(motyw): 4 presety palet + pary fontow + resolver z auto-kontrastem (TDD)"
```

---

### Task 3: Migracja `51_theme_settings.sql`

**Files:**
- Create: `supabase/migrations/51_theme_settings.sql`

- [ ] **Step 1: Napisz migrację**

```sql
-- supabase/migrations/51_theme_settings.sql
-- Wybór motywu wyglądu (/admin/wyglad). Palety i fonty w kodzie
-- (app/_lib/theme.ts); tu tylko wybór. Defaulty = dzisiejszy wygląd.
-- RLS store_settings już ustawione w migracji 33 (odczyt publiczny,
-- zapis service_role) — nowe kolumny dziedziczą polityki tabeli.

alter table public.store_settings
  add column if not exists theme_preset text not null default 'klasyczny',
  add column if not exists theme_overrides jsonb not null default '{}'::jsonb,
  add column if not exists font_pair text not null default 'inter-playfair';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/51_theme_settings.sql
git commit -m "feat(db): migracja 51 - kolumny motywu w store_settings"
```

---

### Task 4: `theme-settings.ts` — odczyt wyboru motywu (cache tag `theme`)

**Files:**
- Create: `app/_lib/theme-settings.ts`

**Interfaces:**
- Consumes: `normalizeThemeSettings`, `DEFAULT_THEME_SETTINGS`, `type ThemeSettings` (Task 2); wzorzec `store-settings.ts` (bare anon client).
- Produces (dla Tasków 5, 6, 7):
  - `THEME_CACHE_TAG = "theme"`
  - `getThemeSettings(): Promise<ThemeSettings>` — cache; fallback default per wywołanie
  - `getThemeSettingsUncached(): Promise<ThemeSettings>` — admin, świeży odczyt
  - `invalidateThemeCache(): void`

- [ ] **Step 1: Zaimplementuj (wzorzec `store-settings.ts` 1:1)**

```ts
// app/_lib/theme-settings.ts
import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { createClient as createBareAnonClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/server";
import {
  DEFAULT_THEME_SETTINGS,
  normalizeThemeSettings,
  type ThemeSettings,
} from "./theme";

export const THEME_CACHE_TAG = "theme";

// Wybór motywu zmienia się WYŁĄCZNIE w /admin/wyglad (tam revalidateTag).
// Wewnątrz unstable_cache nie wolno używać cookies() → czysty klient anon
// (store_settings ma publiczny odczyt RLS). Rzucamy przy błędzie, żeby cache
// nie zapamiętał wartości awaryjnej — fallback jest per wywołanie niżej.
const fetchThemeSettings = unstable_cache(
  async (): Promise<ThemeSettings> => {
    const supabase = createBareAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .from("store_settings")
      .select("theme_preset, theme_overrides, font_pair")
      .eq("id", true)
      .single();
    if (error) throw error;
    return normalizeThemeSettings(data);
  },
  ["theme-settings"],
  { tags: [THEME_CACHE_TAG], revalidate: 300 }
);

export async function getThemeSettings(): Promise<ThemeSettings> {
  try {
    return await fetchThemeSettings();
  } catch (err) {
    console.error("[theme-settings] getThemeSettings failed, using defaults", err);
    return DEFAULT_THEME_SETTINGS;
  }
}

// Admin: świeży odczyt bez cache (formularz po zapisie ma widzieć stan z DB).
export async function getThemeSettingsUncached(): Promise<ThemeSettings> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("store_settings")
    .select("theme_preset, theme_overrides, font_pair")
    .eq("id", true)
    .maybeSingle();
  return normalizeThemeSettings(data ?? null);
}

export function invalidateThemeCache() {
  revalidateTag(THEME_CACHE_TAG, "max");
}
```

- [ ] **Step 2: Weryfikacja typów**

Run: `npx tsc --noEmit`
Expected: zero błędów.

- [ ] **Step 3: Commit**

```bash
git add app/_lib/theme-settings.ts
git commit -m "feat(motyw): odczyt wyboru motywu z cache (tag theme) + odczyt admina"
```

---

### Task 5: `globals.css` (pośrednie zmienne fontów) + `layout.tsx` (fonty, wstrzyknięcie motywu)

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `buildThemeCss` (Task 2), `getThemeSettings` (Task 4).
- Produces: cały sklep renderuje się w wybranym motywie server-side; zmienne `--font-inter/--font-lato/--font-cormorant/--font-montserrat/--font-nunito/--font-lora/--font-playfair` dostępne na `<html>` (konsumowane przez `FONT_PAIRS` i podgląd w adminie).

- [ ] **Step 1: Pośrednie zmienne fontów w `globals.css`**

W bloku `@theme inline` podmień definicje fontów:

```css
@theme inline {
  --color-navy: #1a1a2e;
  --color-navy-light: #16213e;
  --color-gold: #c9a84c;
  --color-gold-light: #e0c070;
  --color-cream: #ece4d7;

  /* Pośrednie zmienne -active: ustawia je blok motywu z layoutu
     (/admin/wyglad). Fallback = dotychczasowa para Inter+Playfair.
     @theme inline wkleja tę wartość do utilities font-sans/font-display,
     więc podmiana -active działa w runtime bez rebuild-u. */
  --font-sans: var(--font-sans-active, var(--font-inter));
  --font-display: var(--font-display-active, var(--font-playfair));
}
```

(Sekcje `:root` / `.dark` w `globals.css` zostają BEZ ZMIAN — to defaulty,
motyw nadpisuje je specyficznością `:root:root`.)

- [ ] **Step 2: Fonty + motyw w `app/layout.tsx`**

1. Rozszerz import fontów i dodaj instancje (po istniejących `inter`/`playfair`):

```tsx
import {
  Inter,
  Playfair_Display,
  Lato,
  Cormorant_Garamond,
  Montserrat,
  Nunito_Sans,
  Lora,
} from "next/font/google";
import { getThemeSettings } from "@/app/_lib/theme-settings";
import { buildThemeCss } from "@/app/_lib/theme";
```

```tsx
// Pary alternatywne dla /admin/wyglad. preload:false — przeglądarka pobiera
// pliki fontu dopiero, gdy motyw faktycznie go używa (via --font-*-active);
// preloadujemy tylko parę domyślną (inter/playfair wyżej). Lato i Cormorant
// nie są variable fonts — wymagają jawnych wag (patrz docs next: font.md).
const lato = Lato({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-lato",
  display: "swap",
  preload: false,
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
  preload: false,
});

const montserrat = Montserrat({
  subsets: ["latin", "latin-ext"],
  variable: "--font-montserrat",
  display: "swap",
  preload: false,
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-nunito",
  display: "swap",
  preload: false,
});

const lora = Lora({
  subsets: ["latin", "latin-ext"],
  variable: "--font-lora",
  display: "swap",
  preload: false,
});
```

2. W `RootLayout` pobierz motyw i wstrzyknij CSS; dodaj klasy zmiennych
   wszystkich fontów na `<html>`:

```tsx
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const locale = await getLocale();
  const eurRate = await getEurRate();
  const fabricMap = await getFabricDeMap();
  const themeSettings = await getThemeSettings();
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${playfair.variable} ${lato.variable} ${cormorant.variable} ${montserrat.variable} ${nunitoSans.variable} ${lora.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col antialiased">
        {/* Motyw z /admin/wyglad — nadpisuje defaulty z globals.css
            specyficznością :root:root. SSR = zero mignięcia. CSP: style-src
            ma 'unsafe-inline' (csp.ts), nonce niepotrzebny. */}
        <style dangerouslySetInnerHTML={{ __html: buildThemeCss(themeSettings) }} />
        <ThemeProvider nonce={nonce}>
          {/* ...reszta drzewa BEZ ZMIAN... */}
```

- [ ] **Step 3: Weryfikacja — build + wizualna**

Run: `npx tsc --noEmit && npm test && npm run build && npm run dev`
Expected: build zielony; strona wygląda IDENTYCZNIE jak dotąd (motyw
klasyczny = te same wartości); dark mode toggle działa (blok `:root:root.dark`
przejmuje wartości); w devtools na `<html>` widać zmienne `--font-lato` itd.
Sieć: NIE pobiera plików Lato/Cormorant/Montserrat/Nunito/Lora (nieużywane).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat(motyw): wstrzykiwanie CSS motywu w layoucie + 5 par fontow bez preloadu"
```

---

### Task 6: Akcje `/admin/wyglad`

**Files:**
- Create: `app/admin/wyglad/actions.ts`

**Interfaces:**
- Consumes: `isThemePresetKey`, `isFontPairKey`, `DEFAULT_THEME_SETTINGS` (Task 2), `isHexColor` (Task 1), `invalidateThemeCache` (Task 4), `requireAdmin`, `createAdminClient`, `ActionResult`.
- Produces (dla Task 7):
  - `updateThemeSettings(input: { preset: string; overrides: Record<string, string>; fontPair: string }): Promise<ActionResult>`
  - `resetThemeSettings(): Promise<ActionResult>`

- [ ] **Step 1: Napisz akcje**

```ts
// app/admin/wyglad/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { isHexColor } from "@/app/_lib/color-utils";
import {
  DEFAULT_THEME_SETTINGS,
  isFontPairKey,
  isThemePresetKey,
} from "@/app/_lib/theme";
import { invalidateThemeCache } from "@/app/_lib/theme-settings";
import type { ActionResult } from "@/app/_lib/types";

const OVERRIDE_KEYS = ["navy", "gold", "cream"];

// Motyw renderuje się w root layoucie na każdej stronie → po zapisie
// revalidacja całego layoutu (jak przy kursie EUR).
function revalidateTheme() {
  invalidateThemeCache();
  revalidatePath("/", "layout");
  revalidatePath("/admin/wyglad");
}

export async function updateThemeSettings(input: {
  preset: string;
  overrides: Record<string, string>;
  fontPair: string;
}): Promise<ActionResult> {
  await requireAdmin();

  if (!isThemePresetKey(input.preset)) {
    return { ok: false, error: "Nieznany motyw" };
  }
  if (!isFontPairKey(input.fontPair)) {
    return { ok: false, error: "Nieznana para fontów" };
  }
  // Odrzucamy (nie „cicho czyścimy”) złe dane — to bug UI, nie decyzja usera.
  for (const [key, val] of Object.entries(input.overrides ?? {})) {
    if (!OVERRIDE_KEYS.includes(key)) {
      return { ok: false, error: `Nieznany kolor: ${key}` };
    }
    if (!isHexColor(val)) {
      return { ok: false, error: `Nieprawidłowy kolor (#rrggbb): ${val}` };
    }
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("store_settings")
    .update({
      theme_preset: input.preset,
      theme_overrides: input.overrides ?? {},
      font_pair: input.fontPair,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", true);
  if (error) return { ok: false, error: error.message };

  revalidateTheme();
  return { ok: true, message: "Wygląd zapisany — zmiany są już na sklepie" };
}

export async function resetThemeSettings(): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("store_settings")
    .update({
      theme_preset: DEFAULT_THEME_SETTINGS.preset,
      theme_overrides: {},
      font_pair: DEFAULT_THEME_SETTINGS.fontPair,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", true);
  if (error) return { ok: false, error: error.message };

  revalidateTheme();
  return { ok: true, message: "Przywrócono domyślny wygląd" };
}
```

- [ ] **Step 2: Weryfikacja typów**

Run: `npx tsc --noEmit`
Expected: zero błędów.

- [ ] **Step 3: Commit**

```bash
git add app/admin/wyglad/actions.ts
git commit -m "feat(admin): akcje zapisu i resetu motywu wygladu"
```

---

### Task 7: `/admin/wyglad` — strona + `ThemeEditor` z podglądem na żywo + nawigacja

**Files:**
- Create: `app/admin/wyglad/page.tsx`
- Create: `app/admin/wyglad/ThemeEditor.tsx`
- Modify: `app/admin/AdminShell.tsx` (NAV_ITEMS + ikona)
- Modify: `app/admin/page.tsx` (CARDS)

**Interfaces:**
- Consumes: `getThemeSettingsUncached` (Task 4), akcje (Task 6), `THEME_PRESETS`/`FONT_PAIRS`/`resolveThemeTokens`/typy (Task 2), `Card`/`Field`/`ToastView`/`Toast` z `_shared`, `useConfirm`.

- [ ] **Step 1: Strona serwerowa**

```tsx
// app/admin/wyglad/page.tsx
import { getThemeSettingsUncached } from "@/app/_lib/theme-settings";
import ThemeEditor from "./ThemeEditor";

// Panel admina jest PL-only. Guard w layoucie; akcje wołają requireAdmin().
export default async function AdminThemePage() {
  const settings = await getThemeSettingsUncached();
  return <ThemeEditor initialSettings={settings} />;
}
```

- [ ] **Step 2: `ThemeEditor`**

```tsx
// app/admin/wyglad/ThemeEditor.tsx
"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, ToastView, type Toast } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";
import {
  DEFAULT_THEME_SETTINGS,
  FONT_PAIRS,
  THEME_PRESETS,
  resolveThemeTokens,
  type FontPairKey,
  type ThemeOverrides,
  type ThemePresetKey,
  type ThemeSettings,
  type ThemeTokens,
} from "@/app/_lib/theme";
import { resetThemeSettings, updateThemeSettings } from "./actions";

// Tokeny → zmienne CSS scope'owane na kontener podglądu. Elementy w środku
// używają var(--...) tak samo jak realna strona — podgląd = prawdziwy render.
function cssVars(t: ThemeTokens): CSSProperties {
  return {
    "--color-navy": t.navy,
    "--color-navy-light": t.navyLight,
    "--color-gold": t.gold,
    "--color-gold-light": t.goldLight,
    "--color-cream": t.cream,
    "--color-gold-text": t.goldText,
    "--bg": t.bg,
    "--fg": t.fg,
    "--card-bg": t.cardBg,
    "--border": t.border,
    "--muted": t.muted,
  } as CSSProperties;
}

const OVERRIDE_FIELDS: { key: keyof ThemeOverrides; label: string; hint: string }[] = [
  { key: "navy", label: "Kolor główny (nagłówki, przyciski, stopka)", hint: "Domyślnie granat" },
  { key: "gold", label: "Kolor akcentu (linki, wyróżnienia, ceny)", hint: "Domyślnie złoto" },
  { key: "cream", label: "Tło strony", hint: "Domyślnie krem" },
];

export default function ThemeEditor({
  initialSettings,
}: {
  initialSettings: ThemeSettings;
}) {
  const [preset, setPreset] = useState<ThemePresetKey>(initialSettings.preset);
  const [overrides, setOverrides] = useState<ThemeOverrides>(initialSettings.overrides);
  const [fontPair, setFontPair] = useState<FontPairKey>(initialSettings.fontPair);
  const [toast, setToast] = useState<Toast>(null);
  const [saving, startSave] = useTransition();
  const confirm = useConfirm();
  const router = useRouter();

  const settings: ThemeSettings = { preset, overrides, fontPair };
  const tokens = resolveThemeTokens(settings);
  const fonts = FONT_PAIRS[fontPair];

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }

  function save() {
    startSave(async () => {
      const res = await updateThemeSettings({
        preset,
        overrides: overrides as Record<string, string>,
        fontPair,
      });
      showToast(
        res.ok
          ? { type: "success", message: res.message ?? "Zapisano" }
          : { type: "error", message: res.error }
      );
      if (res.ok) router.refresh();
    });
  }

  async function reset() {
    const ok = await confirm({
      title: "Przywrócić domyślny wygląd?",
      message: "Motyw, kolory i fonty wrócą do ustawień początkowych (granat + złoto, Inter + Playfair).",
    });
    if (!ok) return;
    startSave(async () => {
      const res = await resetThemeSettings();
      if (res.ok) {
        setPreset(DEFAULT_THEME_SETTINGS.preset);
        setOverrides({});
        setFontPair(DEFAULT_THEME_SETTINGS.fontPair);
        router.refresh();
      }
      showToast(
        res.ok
          ? { type: "success", message: res.message ?? "Przywrócono" }
          : { type: "error", message: res.error }
      );
    });
  }

  return (
    <div className="flex flex-col gap-8" data-guard-section>
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Mollien
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Wygląd</h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
          Wybierz motyw kolorów i fonty całego sklepu. Podgląd poniżej pokazuje
          zmiany od razu — na sklep trafią dopiero po kliknięciu „Zapisz”.
        </p>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {/* ── Motywy ── */}
      <Card>
        <h2 className="font-display text-xl font-semibold text-[var(--fg)] mb-4">Motyw kolorów</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.values(THEME_PRESETS).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setPreset(p.key);
                setOverrides({}); // zmiana motywu czyści ręczne kolory
              }}
              aria-pressed={preset === p.key}
              className={`flex flex-col gap-3 p-4 rounded-2xl border text-left transition-colors ${
                preset === p.key
                  ? "border-[var(--color-gold)] ring-1 ring-[var(--color-gold)]"
                  : "border-[var(--border)] hover:border-[var(--color-gold)]"
              }`}
            >
              <span className="flex gap-1.5">
                <span className="w-8 h-8 rounded-full border border-black/10" style={{ background: p.light.navy }} />
                <span className="w-8 h-8 rounded-full border border-black/10" style={{ background: p.light.gold }} />
                <span className="w-8 h-8 rounded-full border border-black/10" style={{ background: p.light.bg }} />
              </span>
              <span className="text-sm font-semibold text-[var(--fg)]">{p.label}</span>
            </button>
          ))}
        </div>

        {/* ── Własne kolory ── */}
        <details className="mt-6">
          <summary className="cursor-pointer text-xs font-sans uppercase tracking-widest text-[var(--color-gold-text)]">
            Dostosuj pojedyncze kolory (opcjonalnie)
          </summary>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {OVERRIDE_FIELDS.map(({ key, label, hint }) => (
              <Field key={key} label={label} hint={hint}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={overrides[key] ?? THEME_PRESETS[preset].light[key]}
                    onChange={(e) => setOverrides({ ...overrides, [key]: e.target.value })}
                    className="w-12 h-10 rounded-lg border border-[var(--border)] bg-transparent cursor-pointer"
                    aria-label={label}
                  />
                  {overrides[key] && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...overrides };
                        delete next[key];
                        setOverrides(next);
                      }}
                      className="text-xs text-[var(--muted)] hover:text-[var(--fg)] underline"
                    >
                      Wyczyść
                    </button>
                  )}
                </div>
              </Field>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)] mt-3">
            Czytelność tekstu jest chroniona automatycznie — odcień akcentu do
            tekstu przyciemniamy/rozjaśniamy, aż spełni normę kontrastu (WCAG AA).
          </p>
        </details>
      </Card>

      {/* ── Fonty ── */}
      <Card>
        <h2 className="font-display text-xl font-semibold text-[var(--fg)] mb-4">Fonty</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.entries(FONT_PAIRS) as [FontPairKey, (typeof FONT_PAIRS)[FontPairKey]][]).map(
            ([key, pair]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFontPair(key)}
                aria-pressed={fontPair === key}
                className={`p-4 rounded-2xl border text-left transition-colors ${
                  fontPair === key
                    ? "border-[var(--color-gold)] ring-1 ring-[var(--color-gold)]"
                    : "border-[var(--border)] hover:border-[var(--color-gold)]"
                }`}
              >
                <span className="block text-2xl text-[var(--fg)]" style={{ fontFamily: pair.display }}>
                  Meble Mollien
                </span>
                <span className="block text-sm text-[var(--muted)] mt-1" style={{ fontFamily: pair.sans }}>
                  Sofy, narożniki i łóżka premium. {pair.label}
                </span>
              </button>
            )
          )}
        </div>
      </Card>

      {/* ── Podgląd na żywo ── */}
      <Card>
        <h2 className="font-display text-xl font-semibold text-[var(--fg)] mb-4">Podgląd</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PreviewPanel title="Tryb jasny" tokens={tokens.light} fonts={fonts} />
          <PreviewPanel title="Tryb ciemny" tokens={tokens.dark} fonts={fonts} />
        </div>
      </Card>

      {/* ── Akcje ── */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          data-guard-save
          className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {saving ? "Zapisuję..." : "Zapisz wygląd"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={saving}
          className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--fg)] underline"
        >
          Przywróć domyślne
        </button>
      </div>
    </div>
  );
}

// Makieta fragmentu strony w danym zestawie tokenów (scoped CSS vars).
function PreviewPanel({
  title,
  tokens,
  fonts,
}: {
  title: string;
  tokens: ThemeTokens;
  fonts: { sans: string; display: string };
}) {
  return (
    <div>
      <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">{title}</p>
      <div
        style={{ ...cssVars(tokens), fontFamily: fonts.sans }}
        className="rounded-2xl overflow-hidden border border-[var(--border)]"
      >
        {/* Pasek nawigacji */}
        <div className="bg-[var(--color-navy)] text-white/85 text-xs px-4 py-2 flex justify-between">
          <span>kontakt@mollien.pl</span>
          <span>Polski producent mebli</span>
        </div>
        <div className="bg-[var(--bg)] p-5 flex flex-col gap-4">
          {/* Nagłówek sekcji */}
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-1">
              Kolekcje
            </p>
            <p className="text-xl font-bold text-[var(--fg)]" style={{ fontFamily: fonts.display }}>
              Znajdź swój styl
            </p>
          </div>
          {/* Karta produktu */}
          <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4 max-w-[240px] mx-auto w-full">
            <div className="aspect-[4/3] rounded-lg bg-[var(--color-navy)] mb-3 flex items-center justify-center">
              <span className="text-[var(--color-gold)] text-2xl" style={{ fontFamily: fonts.display }}>M</span>
            </div>
            <p className="text-sm font-semibold text-[var(--fg)]" style={{ fontFamily: fonts.display }}>
              Sofa VEGAS
            </p>
            <p className="text-xs text-[var(--muted)]">Tkanina · 3 rozmiary</p>
            <p className="text-sm font-bold text-[var(--color-gold-text)] mt-1">3 299 zł</p>
          </div>
          {/* Przycisk */}
          <button
            type="button"
            className="self-center px-5 py-2.5 bg-[var(--color-navy)] text-white text-xs uppercase tracking-widest rounded-full"
          >
            Przeglądaj kolekcję
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Nawigacja**

`app/admin/AdminShell.tsx` — w `NAV_ITEMS` po pozycji „Strona główna" dodaj:

```tsx
  { href: "/admin/wyglad", label: "Wygląd", icon: PaletteIcon },
```

i na końcu pliku:

```tsx
function PaletteIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M12 2a10 10 0 0 0 0 20h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1-2-2c0-1 .8-2 2-2h4a6 6 0 0 0 6-6c0-3-4-5-10-5z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="12" cy="7" r="1" fill="currentColor" />
      <circle cx="16.5" cy="10.5" r="1" fill="currentColor" />
    </svg>
  );
}
```

`app/admin/page.tsx` — w `CARDS` po „Strona główna" dodaj:

```tsx
  { href: "/admin/wyglad", title: "Wygląd (motyw i fonty)", cta: "Zmień wygląd sklepu" },
```

- [ ] **Step 4: Weryfikacja manualna**

Run: `npx tsc --noEmit && npm run dev`
Expected: `/admin/wyglad` — kliknięcie motywu „Grafit + miedź" natychmiast
przemalowuje OBA panele podglądu (bez zapisu); wybór fontu zmienia typografię
podglądu i etykiet par; color-picker akcentu zmienia cenę/eyebrow w podglądzie
(z auto-korektą odcienia do kontrastu). Zapis przed migracją 51 zwróci błąd
kolumny — to oczekiwane do Task 8.

- [ ] **Step 5: Commit**

```bash
git add app/admin/wyglad/ app/admin/AdminShell.tsx app/admin/page.tsx
git commit -m "feat(admin): /admin/wyglad - motywy, wlasne kolory, fonty, podglad na zywo"
```

---

### Task 8: Weryfikacja końcowa fazy 3 + migracja na prod + domknięcie brancha

**Files:** brak nowych.

- [ ] **Step 1: Pełna weryfikacja lokalna**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: wszystko zielone.

- [ ] **Step 2: Migracja 51 na prod (Supabase MCP) — WYMAGA POTWIERDZENIA UŻYTKOWNIKA**

Pokaż SQL z `supabase/migrations/51_theme_settings.sql`, po potwierdzeniu
`mcp__supabase__apply_migration` (nazwa: `theme_settings`). Weryfikacja
read-only: `select theme_preset, theme_overrides, font_pair from public.store_settings;`
Expected: 1 wiersz `klasyczny / {} / inter-playfair`.

- [ ] **Step 3: Weryfikacja end-to-end (żywa baza)**

Użyj skilla `verify` / `superpowers:verification-before-completion`:
1. Sklep wygląda jak dotąd (motyw klasyczny z DB).
2. `/admin/wyglad`: wybierz „Butelkowa zieleń" → Zapisz → strona główna,
   sklep, karta produktu, stopka przemalowane; przełącz dark mode → spójny
   ciemny wariant; sprawdź czytelność cen (goldText) na jasnym i ciemnym.
3. Zmień parę fontów na Montserrat → nagłówki i tekst w nowym foncie;
   w devtools/network widać pobrany font Montserrat.
4. Własny kolor akcentu (np. miedź #b87333) → ceny/eyebrow czytelne
   (auto-kontrast), przyciski w nowym akcencie.
5. `/de` — wszystko działa identycznie (motyw jest locale-agnostyczny).
6. **„Przywróć domyślne"** → sklep wraca do granat+złoto+Inter/Playfair —
   to żywy sklep, zostaw w stanie domyślnym (chyba że użytkownik zdecyduje
   inaczej).

- [ ] **Step 4: Domknięcie brancha**

Skill superpowers:finishing-a-development-branch → PR do `main`.

---

## Self-review planu (wykonany przy pisaniu)

- Spec coverage (część „krok 3" + korekta speca o zmiennych semantycznych): 4 presety z pełnymi paletami light+dark (w tym `--bg`/`--fg`/`--card-bg`/`--border`/`--muted`) ✓ (Task 2), własne nadpisania navy/gold/cream z pochodnymi i auto-kontrastem ≥4.5 ✓ (Task 1-2), 4 pary fontów latin-ext przez next/font (Lato/Cormorant z jawnymi wagami — nie są variable) ✓ (Task 5), wstrzyknięcie server-side bez FOUC + dark mode ✓ (Task 5, selektory `:root:root`), kolumny `theme_preset`/`theme_overrides`/`font_pair` ✓ (Task 3), cache tag `theme` + inwalidacja w akcjach ✓ (Task 4/6), `/admin/wyglad` z kaflami, pickerami, fontami, podglądem na żywo, Zapisz/Przywróć ✓ (Task 7), walidacja akcji (nieznany preset/font/klucz, zły hex → odrzucone) ✓ (Task 6), testy: palety WCAG, pochodne, normalizacja, generowanie CSS ✓, karta+menu w adminie ✓.
- Typy spójne: `ThemeTokens`/`ThemeSettings`/`resolveThemeTokens`/`buildThemeCss` (Task 2) używane w 4/5/6/7 pod tymi samymi nazwami; `cssVars` mapuje tokeny na te same nazwy zmiennych co `tokensToCss` ✓.
- Kluczowa decyzja techniczna utrwalona: `@theme inline` wkleja wartości do utilities, więc fonty przełączane przez POŚREDNIE zmienne `--font-*-active` (fallback = obecna para), a kolory przez runtime `var(--color-*)`/`var(--bg)` — nadpisanie `:root:root` działa bez zmian w komponentach.
- Bez placeholderów: każdy krok kodowy ma pełny kod; wartości palet są konkretne, a test kontrastu jest mechanizmem korekty (instrukcja co zrobić przy FAIL).
