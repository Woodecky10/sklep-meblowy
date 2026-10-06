import { test, expect } from "@playwright/test";

// Edycja zamówienia (spec 2026-10-06). Baza wspólna z produkcją — test
// NIGDY nie klika „Zapisz zmiany". Sprawdza: przycisk na karcie, formularz
// wypełniony danymi zamówienia, przeliczanie sumy po zmianie ilości.

test("karta zamówienia → Edytuj zamówienie → formularz z danymi, suma się przelicza", async ({ page }) => {
  await page.goto("/admin/zamowienia");
  const first = page.locator('a[href^="/admin/zamowienia/"]').filter({ hasText: /#\d+/ }).first();
  const href = await first.getAttribute("href", { timeout: 15_000 }).catch(() => null);
  test.skip(!href, "brak zamówień na liście");
  await page.goto(href!);

  await page.getByRole("link", { name: "Edytuj zamówienie" }).click();
  await expect(page).toHaveURL(/\/edytuj$/);
  await expect(page.getByRole("heading", { name: /Edytuj zamówienie #\d+/ })).toBeVisible();

  await expect(page.getByLabel("Imię i nazwisko")).not.toHaveValue("");
  await expect(page.getByLabel("Ulica i numer")).not.toHaveValue("");

  const total = page.getByTestId("edit-order-total");
  const before = await total.innerText();
  const qty = page.getByLabel("Ilość").first();
  const q = Number(await qty.inputValue());
  await qty.fill(String(q + 1));
  await expect(total).not.toHaveText(before);

  await expect(page.getByRole("button", { name: "Zapisz zmiany" })).toBeEnabled();
  // NIE klikamy „Zapisz zmiany".
});
