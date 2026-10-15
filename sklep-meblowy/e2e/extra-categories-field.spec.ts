import { test, expect } from "@playwright/test";

// Pole „Dodatkowe kategorie" w edytorze produktu (spec 2026-10-15).
// NIE zapisuje — baza jest wspólna z produkcją. Sprawdza tylko UI: kategoria
// główna jest wyłączona na liście dodatkowych i podąża za selectem bez zapisu.
test("kategoria główna jest wyłączona na liście dodatkowych i podąża za selectem", async ({
  page,
}) => {
  await page.goto("/admin/produkty");
  await page.locator('a[href^="/admin/produkty/"]:not([href$="/nowy"])').first().click();
  await expect(page).toHaveURL(/\/admin\/produkty\/[0-9a-f-]+$/, { timeout: 15_000 });

  const select = page.locator('select[name="category"]');
  const box = (slug: string) =>
    page.locator(`input[name="extra_categories"][value="${slug}"]`);

  await expect(page.locator('input[name="extra_categories_present"]')).toHaveCount(1);
  const main = await select.inputValue();
  await expect(box(main)).toBeDisabled();

  const other = await select
    .locator(`option:not([value="${main}"])`)
    .first()
    .getAttribute("value");
  expect(other, "brak drugiej kategorii w systemie").toBeTruthy();
  await select.selectOption(other!);

  await expect(box(other!)).toBeDisabled();
  await expect(box(main)).toBeEnabled();
});
