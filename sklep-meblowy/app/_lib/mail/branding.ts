import {
  normalizeThemeSettings,
  resolveThemeTokens,
  type FontPairKey,
  type ThemeTokens,
} from "../theme";

// Fontów w mailu NIE DA SIĘ wymusić: Gmail wycina @font-face, Outlook go
// ignoruje. FONT_PAIRS z theme.ts trzyma referencje `var(--font-*)`, bezużyteczne
// w mailu — dlatego osobne mapowanie na stacki z realnym fallbackiem.
// Georgia jako szeryf jest dostępna na Windows/macOS/Androidzie.
const MAIL_FONT_STACKS: Record<FontPairKey, { sans: string; display: string }> = {
  "inter-playfair": {
    sans: "Inter, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    display: "'Playfair Display', Georgia, 'Times New Roman', serif",
  },
  "lato-cormorant": {
    sans: "Lato, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    display: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  },
  montserrat: {
    sans: "Montserrat, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    display: "Montserrat, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  },
  "nunito-lora": {
    sans: "'Nunito Sans', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    display: "Lora, Georgia, 'Times New Roman', serif",
  },
};

export type MailBranding = {
  colors: ThemeTokens;
  fonts: { sans: string; display: string };
};

export type ThemeRow = {
  theme_preset?: unknown;
  theme_overrides?: unknown;
  font_pair?: unknown;
};

// Czysta: surowy wiersz → gotowe tokeny. Maile używają palety `light` —
// dark mode w kliencie pocztowym jest nieprzewidywalny, nie próbujemy.
export function brandingFromRaw(raw: ThemeRow | null): MailBranding {
  const settings = normalizeThemeSettings(raw);
  const { light } = resolveThemeTokens(settings);
  return {
    colors: light,
    // Bez fallbacku: normalizeThemeSettings zwraca już zwalidowany FontPairKey,
    // a Record<FontPairKey, ...> wymusza obecność wszystkich kluczy — więc
    // TypeScript nie pozwoli dodać pary fontów w theme.ts bez dodania jej tutaj.
    fonts: MAIL_FONT_STACKS[settings.fontPair],
  };
}
