import { test, expect, type Page } from "@playwright/test";

// Uwagi do całego zamówienia: pole w checkoucie między „Wniesieniem mebli"
// a „Metodą płatności". Zamówienia NIE składamy — baza jest wspólna z produkcją.

test.beforeEach(async ({ page }) => {
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

async function openPlainProduct(page: Page) {
  await page.goto("/sklep?q=nawierzchniowy");
  const href = await page
    .locator("div.group")
    .filter({ has: page.locator('button[aria-label="Dodaj do koszyka"]') })
    .first()
    .locator('a[href*="/produkt/"]')
    .first()
    .getAttribute("href", { timeout: 15_000 })
    .catch(() => null);
  test.skip(!href, "brak produktu bez wariantów w wynikach 'nawierzchniowy'");
  await page.goto(href!);
}

test("checkout: pole uwag z licznikiem, między wniesieniem a płatnością", async ({ page }) => {
  await openPlainProduct(page);
  await page.getByRole("button", { name: "Dodaj do koszyka", exact: true }).first().click();
  await page.goto("/checkout");

  const note = page.getByLabel("Uwagi do zamówienia (opcjonalnie)");
  await expect(note).toBeVisible();
  await expect(note).toHaveAttribute("maxlength", "1000");
  await expect(page.getByText("0 / 1000 znaków")).toBeVisible();
  await note.fill("proszę o telefon");
  await expect(page.getByText("16 / 1000 znaków")).toBeVisible();

  const order = await page.evaluate(() =>
    [...document.querySelectorAll("h2")].map((h) => h.textContent?.trim())
  );
  const i = order.indexOf("Uwagi do zamówienia (opcjonalnie)");
  expect(i).toBeGreaterThan(order.indexOf("Wniesienie mebli"));
  expect(i).toBeLessThan(order.indexOf("Metoda płatności"));
});
