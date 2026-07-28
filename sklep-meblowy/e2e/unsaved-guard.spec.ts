import { test, expect } from "@playwright/test";

// Regresja: strażnik niezapisanych zmian musi łapać przycisk „wstecz"
// przeglądarki (popstate), nie tylko kliknięcia linków. Wymaga sesji admina
// (storageState z auth.setup + .env.e2e) — opt-in, jak pozostałe testy admina.
//
// Astoria 140 — istniejący aktywny produkt (edytujemy pole, NIE zapisujemy).
const PRODUCT = "bb27c692-4d1f-46ea-8e02-3a57e050db54";
const dialog = (page: import("@playwright/test").Page) =>
  page.getByRole("alertdialog", { name: /Niezapisane zmiany/i });

async function openEditorWithHistory(page: import("@playwright/test").Page) {
  await page.goto("/admin/produkty");
  await page.goto(`/admin/produkty/${PRODUCT}`);
  await expect(page).not.toHaveURL(/\/logowanie/);
  const name = page.locator('input[name="name"]');
  await expect(name).toBeVisible();
  return name;
}

test("wstecz przy niezapisanych zmianach → dialog (pozostaje na edytorze)", async ({ page }) => {
  const name = await openEditorWithHistory(page);
  await name.fill((await name.inputValue()) + " (test niezapisane)");
  await page.goBack();
  await expect(dialog(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(PRODUCT));
  // sprzątanie: Zostań (bez zapisu)
  await page.getByRole("button", { name: "Zostań" }).click();
  await expect(dialog(page)).toBeHidden();
});

test("wstecz → Wyjdź bez zapisywania → wychodzi z edytora", async ({ page }) => {
  const name = await openEditorWithHistory(page);
  await name.fill((await name.inputValue()) + " (test wyjscie)");
  await page.goBack();
  await expect(dialog(page)).toBeVisible();
  await page.getByRole("button", { name: /Wyjdź bez zapisywania/i }).click();
  await expect(page).not.toHaveURL(new RegExp(PRODUCT));
  await expect(dialog(page)).toBeHidden();
});

test("wstecz bez zmian → normalna nawigacja (brak dialogu)", async ({ page }) => {
  await openEditorWithHistory(page);
  await page.goBack();
  await expect(dialog(page)).toBeHidden();
  await expect(page).not.toHaveURL(new RegExp(PRODUCT));
});
