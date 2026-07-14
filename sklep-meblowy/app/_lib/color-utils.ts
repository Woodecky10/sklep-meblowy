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
