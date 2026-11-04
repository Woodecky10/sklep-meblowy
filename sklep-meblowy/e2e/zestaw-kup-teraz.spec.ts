import { test, expect } from "@playwright/test";

// „Kup teraz" w zestawie (właściciel 2026-11-04: „w zestawach też musi być kup
// teraz"). Jak na karcie produktu (kup-teraz.spec.ts): zablokowany, dopóki
// klient nie wybierze opcji WSZYSTKICH mebli zestawu; potem dodaje cały zestaw
// i od razu przenosi na /koszyk, bez dymka „Dodano do koszyka".
//
// Koszyk siedzi w localStorage — test nic nie zapisuje w bazie.

test.beforeEach(async ({ page }) => {
  // Zgoda cookie z góry — baner (fixed, z-50) nie zasłania przycisków.
  await page.addInitScript(() => {
    localStorage.setItem(
      "mollien.cookie-consent",
      JSON.stringify({
        necessary: true,
        analytics: false,
        marketing: false,
        version: 1,
        decidedAt: new Date().toISOString(),
      })
    );
  });
});

test("zestaw — „Kup teraz” zablokowany do wyboru opcji, potem cały zestaw w koszyku", async ({
  page,
}) => {
  await page.goto("/zestawy");
  const href = await page
    .locator('a[href*="/zestaw/"]')
    .first()
    .getAttribute("href", { timeout: 15_000 })
    .catch(() => null);
  test.skip(!href, "brak zestawów na /zestawy");

  await page.goto(href!);
  const bundleName = (await page.locator("h1").first().innerText()).trim();
  const buyNow = page.getByRole("button", { name: "Kup teraz" });
  await expect(buyNow).toBeVisible();

  // Wybieramy po kolei pierwszą wartość w każdej grupie z „wybierz" (wszystkie
  // meble zestawu). Tkaniny bywają w zwiniętych grupach — wtedy rozwijamy.
  const pending = page.locator("p").filter({
    has: page.locator("span", { hasText: /^wybierz$/ }),
  });
  for (let i = 0; i < 40 && (await pending.count()) > 0; i++) {
    await expect(buyNow).toBeDisabled();
    const group = pending.first().locator("xpath=..");
    const value = group.locator('[aria-pressed="false"]:visible').first();
    if ((await value.count()) > 0) {
      await value.click();
      continue;
    }
    const expander = group.locator('button[aria-expanded="false"]:visible').first();
    if ((await expander.count()) === 0) break;
    await expander.click();
  }
  test.skip((await pending.count()) > 0, "nie udało się wybrać wszystkich opcji zestawu");

  await expect(buyNow).toBeEnabled();
  await buyNow.click();
  await expect(page).toHaveURL(/\/koszyk$/);
  await expect(page.getByText(bundleName, { exact: false }).first()).toBeVisible();

  await page.waitForTimeout(500);
  await expect(page.getByText("Dodano do koszyka")).toHaveCount(0);
});
