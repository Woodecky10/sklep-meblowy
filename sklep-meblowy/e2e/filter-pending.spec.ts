import { test, expect } from "@playwright/test";

// Regresja płynności filtrów: po kliknięciu opcji tkaniny UI reaguje
// NATYCHMIAST (optymistyczne podświetlenie + aria-busy na kontenerze),
// zanim serwer odpowie. Dławimy odpowiedzi nawigacji z ?tkanina= o ~1,5 s,
// żeby okno pending było deterministycznie obserwowalne.
test("filtr tkaniny — natychmiastowy feedback przed odpowiedzią serwera", async ({ page }) => {
  await page.route("**/sklep*", async (route) => {
    if (route.request().url().includes("tkanina=")) {
      await new Promise((r) => setTimeout(r, 1500));
    }
    await route.continue();
  });

  await page.goto("/sklep");

  // Otwórz dropdown "Tkanina" i kliknij pierwszą opcję.
  await page.getByRole("button", { name: "Tkanina", exact: false }).first().click();
  const option = page
    .locator("div.flex.flex-wrap.gap-1\\.5 > button")
    .first();
  const optionLabel = (await option.textContent())?.trim() ?? "";
  await option.click();

  // NATYCHMIAST (przed upływem dławienia): kontener FilterBara w stanie busy
  // i kliknięta opcja optymistycznie aktywna (złote tło).
  const busy = page.locator('div[aria-busy="true"]');
  await expect(busy).toBeVisible({ timeout: 500 });
  await expect(option).toHaveClass(/bg-\[var\(--color-gold\)\]/, { timeout: 500 });

  // Po zatwierdzeniu nawigacji: URL niesie ?tkanina=, busy znika.
  await expect(page).toHaveURL(/tkanina=/, { timeout: 10_000 });
  await expect(page.locator('div[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
  expect(optionLabel.length).toBeGreaterThan(0);
});
