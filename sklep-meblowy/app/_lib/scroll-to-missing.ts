// Przewija do pierwszej opcji oznaczonej data-missing="true" (patrz
// VariantSelector) i przenosi na nią fokus. Przy prefers-reduced-motion bez
// animacji. "start" (a nie "center"): wysoka opcja (np. otwarta grupa tkanin)
// przy "center" chowała nagłówek pod sticky headerem; scroll-padding-top
// na <html> zostawia dla niego miejsce.
export function scrollToFirstMissing(root: HTMLElement | null): void {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root?.querySelector('[data-missing="true"]')?.scrollIntoView({
    block: "start",
    behavior: reduce ? "auto" : "smooth",
  });
}

// Fokus na pierwszej widocznej, wykonalnej kontrolce w pierwszej brakującej
// opcji (przycisk wartości albo rozwijana grupa), bez dodatkowego przewijania.
export function focusFirstMissing(root: HTMLElement | null): void {
  const wrapper = root?.querySelector('[data-missing="true"]');
  if (!wrapper) return;
  const candidates = wrapper.querySelectorAll<HTMLElement>(
    '[aria-pressed="false"], button[aria-expanded="false"]'
  );
  for (const el of candidates) {
    if (el.offsetParent !== null) {
      el.focus({ preventScroll: true });
      return;
    }
  }
}
