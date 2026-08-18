import { test, expect } from "@playwright/test";

// ⚠️ Baza jest wspólna z produkcją — ten spec NIC nie zapisuje. Sprawdza
// niezmienniki, które trzymają się niezależnie od tego, ile opinii jest
// zatwierdzonych, więc nie zgaśnie po pierwszej prawdziwej opinii.
//
// URUCHAMIANIE: ustaw E2E_BASE_URL na localhost i dodaj --no-deps. Bez
// E2E_BASE_URL playwright.config.ts celuje w PRODUKCJE (www.mollien.pl).

test("strona główna nie renderuje pustej sekcji opinii", async ({ page }) => {
  await page.goto("/");
  const sekcja = page.locator("#home-reviews");
  // Niezmiennik: sekcja albo nie istnieje, albo ma co najmniej jedną kartę.
  // Pusty slider z nagłówkiem „Co mówią klienci" to defekt, nie stan przejściowy.
  if ((await sekcja.count()) > 0) {
    await expect(sekcja.locator("[data-review-card]").first()).toBeVisible();
  }
});

test("/opinie odpowiada i wyjaśnia, skąd pochodzą opinie", async ({ page }) => {
  const res = await page.goto("/opinie");
  expect(res?.status()).toBe(200);
  // Zdanie o weryfikacji zakupu to wymóg Omnibusa — musi stać na stronie
  // także wtedy, gdy nie ma jeszcze ani jednej opinii.
  await expect(page.getByText(/kupiły u nas mebel/i)).toBeVisible();
});
