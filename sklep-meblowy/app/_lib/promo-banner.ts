// Czysta logika banera promocyjnego (bez server-only) — importowalna przez
// klienta (PromoBanner.tsx). Serwerowy odczyt z DB: promo-banner-server.ts.

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
