import { test, expect } from "@playwright/test";

// Zwijane sekcje grup cenowych na /tkaniny (spec 2026-07-30).
//
// URUCHAMIANIE: ustaw E2E_BASE_URL na localhost i dodaj --no-deps. Bez
// E2E_BASE_URL playwright.config.ts celuje w PRODUKCJE (www.mollien.pl), a bez
// --no-deps odpali projekt "setup" (auth.setup.ts), ktory loguje admina —
// niepotrzebny tutaj, bo /tkaniny jest publiczne.

const GROUP = "[data-testid='fabric-group']";

test("sekcje startuja zwiniete, a linki tkanin zostaja w HTML", async ({ page }) => {
  await page.goto("/tkaniny");

  // Sa sekcje grup (na produkcji trzy: Standard, Premium, Premium High).
  const groups = page.locator(GROUP);
  await expect(groups.first()).toBeVisible();
  const groupCount = await groups.count();
  expect(groupCount).toBeGreaterThan(0);

  // Zadna nie jest otwarta po wejsciu.
  await expect(page.locator(`${GROUP}[open]`)).toHaveCount(0);

  // Guard SEO: kafelki musza zostac w HTML nawet zwiniete, inaczej linki do
  // podstron tkanin wypadaja ze zrodla strony. Oczekiwana liczba linkow =
  // suma licznikow z naglowkow, wiec test nie ma zaszytej liczby tkanin.
  const counters = await page.locator("[data-testid='fabric-group-count']").allInnerTexts();
  expect(counters).toHaveLength(groupCount);
  const expectedLinks = counters.reduce(
    (sum, txt) => sum + Number(txt.match(/\d+/)?.[0] ?? 0),
    0
  );
  expect(expectedLinks).toBeGreaterThan(0);
  await expect(page.locator('a[href^="/tkaniny/"]')).toHaveCount(expectedLinks);
});

test("klik w naglowek rozwija tylko swoja sekcje i chowa podglad", async ({ page }) => {
  await page.goto("/tkaniny");

  const first = page.locator(GROUP).first();
  await expect(first.locator("[data-testid='fabric-group-preview']")).toBeVisible();

  await first.locator("summary").click();

  // Rozwinela sie dokladnie jedna sekcja — <details> bez atrybutu name nie
  // tworzy akordeonu, ale to tez guard na wypadek dodania go w przyszlosci.
  await expect(first).toHaveAttribute("open", "");
  await expect(page.locator(`${GROUP}[open]`)).toHaveCount(1);

  // Podglad miniatur znika po rozwinieciu (dublowalby pierwsze kafelki).
  await expect(first.locator("[data-testid='fabric-group-preview']")).toBeHidden();

  // Kafelki sa teraz widoczne.
  await expect(first.locator('a[href^="/tkaniny/"]').first()).toBeVisible();
});
