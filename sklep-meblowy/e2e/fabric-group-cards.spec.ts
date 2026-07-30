import { test, expect } from "@playwright/test";

// Wybor tkaniny na karcie produktu (korekta wlasciciela 2026-07-30):
// karty grup cenowych widoczne OD WEJSCIA, wszystkie zwiniete - bez kroku
// posredniego "5 probek + Zobacz wiecej".
//
// URUCHAMIANIE: ustaw E2E_BASE_URL na localhost i dodaj --no-deps. Bez
// E2E_BASE_URL playwright.config.ts celuje w PRODUKCJE (www.mollien.pl).
//
// Produkt: Naroznik Amica U - ma opcje "Tkanina" z pelnym katalogiem probek
// (ten sam co w fabric-properties.spec.ts).
const PRODUCT_ID = "fe545101-de29-4a59-a012-c881e9971205";

test.beforeEach(async ({ page }) => {
  // Zgoda cookie z gory - baner (fixed, z-50) nie zaslania nic w tescie.
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
  await page.goto(`/produkt/${PRODUCT_ID}`);
});

test("karty grup widoczne od wejscia, wszystkie zwiniete, bez Zobacz wiecej", async ({ page }) => {
  const groups = page.getByTestId("fabric-groups");
  await expect(groups).toBeVisible();

  // Wszystkie naglowki grup zwiniete (aria-expanded=false).
  const headers = groups.locator("button[aria-expanded]");
  const count = await headers.count();
  expect(count).toBeGreaterThan(0);
  await expect(groups.locator("button[aria-expanded='true']")).toHaveCount(0);

  // Krok posredni zniknal: w bloku tkanin nie ma przycisku "Zobacz wiecej"
  // ani "Zobacz mniej".
  await expect(groups.getByRole("button", { name: /Zobacz (wiecej|więcej|mniej)/ })).toHaveCount(0);
});

test("klik w naglowek otwiera tylko te grupe", async ({ page }) => {
  const groups = page.getByTestId("fabric-groups");
  const headers = groups.locator("button[aria-expanded]");
  await expect(headers.first()).toBeVisible();

  await headers.first().click();

  await expect(headers.first()).toHaveAttribute("aria-expanded", "true");
  await expect(groups.locator("button[aria-expanded='true']")).toHaveCount(1);

  // W otwartej grupie widac probki (przyciski wyboru wartosci).
  const swatches = groups.locator("[aria-pressed]");
  await expect(swatches.first()).toBeVisible();

  // Ponowny klik zwija z powrotem.
  await headers.first().click();
  await expect(groups.locator("button[aria-expanded='true']")).toHaveCount(0);
});
