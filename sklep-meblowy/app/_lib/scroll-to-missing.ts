// Przewija do pierwszej opcji oznaczonej data-missing="true" (patrz
// VariantSelector). Przy prefers-reduced-motion bez animacji.
export function scrollToFirstMissing(root: HTMLElement | null): void {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root?.querySelector('[data-missing="true"]')?.scrollIntoView({
    block: "center",
    behavior: reduce ? "auto" : "smooth",
  });
}
