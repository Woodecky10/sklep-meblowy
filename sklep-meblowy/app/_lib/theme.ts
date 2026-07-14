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
      cream: "#ece4d7", goldText: "#74612b", bg: "#ece4d7", fg: "#1a1a2e",
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
