// Zamknięta lista czcionek dla opisów produktu — JEDNO źródło prawdy dla
// toolbaru edytora (RichTextEditor) i sanitizera HTML (product-html).
// var(--font-display) = Playfair Display z next/font (literal „Playfair
// Display" NIE zadziała — next/font nadaje rodzinie unikalną nazwę; zmienna
// jest zdefiniowana na :root, więc działa w adminie i na karcie produktu).
export type FontOption = { label: string; stack: string };

export const FONT_OPTIONS: FontOption[] = [
  { label: "Elegancka (serif)", stack: "var(--font-display), serif" },
  { label: "Georgia", stack: "Georgia, serif" },
  { label: "Arial", stack: "Arial, Helvetica, sans-serif" },
  { label: "Courier", stack: "'Courier New', monospace" },
];

// Normalizacja do porównań w sanitizerze: trim, lowercase, cudzysłowy " → '.
export function normalizeFontStack(v: string): string {
  return v.trim().toLowerCase().replace(/"/g, "'");
}

export const ALLOWED_FONT_STACKS = new Set(
  FONT_OPTIONS.map((o) => normalizeFontStack(o.stack))
);
