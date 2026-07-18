// Czysty parser ustawień górnego paska (FormData → wiersz store_settings).
// Wydzielony z akcji, żeby był testowalny bez Supabase. Importuje tylko
// pure promo-banner.ts (lista kolorów) — bezpieczny.
import { PROMO_COLORS, type PromoColor } from "./promo-banner";

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

// Normalizuje link banera: wewnętrzna ścieżka „/…" bez zmian; „//host"
// (protocol-relative) i goła domena → https://; pełny http(s) bez zmian;
// inny schemat (javascript:, data:, mailto:…) → null (odrzucony). Chroni
// nietechnicznego admina przed wklejeniem „mollien.pl/x" → 404.
export function normalizePromoLink(raw: string | null): string | null {
  const v = (raw ?? "").trim();
  if (v === "") return null;
  if (v.startsWith("//")) return "https:" + v;
  if (v.startsWith("/")) return v;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null; // inny schemat → odrzuć
  return "https://" + v;
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
    promo_link: normalizePromoLink(trimOrNull(input.promo_link, 500)),
    promo_color: color,
  };
}
