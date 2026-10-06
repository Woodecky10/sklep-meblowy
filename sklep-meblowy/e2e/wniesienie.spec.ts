import { test, expect, type Page } from "@playwright/test";
import { CARRY_IN_PRICE } from "../app/_lib/carry-in";

// Wniesienie mebli raz na zamówienie (spec, aktualizacja 2026-10-06): pole
// w checkoucie między „Adres dostawy" a „Metoda płatności", przy produkcie
// go nie ma. Zamówienia NIE składamy — baza jest wspólna z produkcją.

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
  // Produkt bez wariantów — materace nawierzchniowe (jak w kup-teraz.spec.ts).
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

const money = (s: string) => Number(s.replace(/[^\d,]/g, "").replace(",", "."));

test("przy produkcie nie ma już pola wniesienia", async ({ page }) => {
  await openPlainProduct(page);
  await expect(page.getByRole("button", { name: "Kup teraz" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /wniesieni/i })).toHaveCount(0);
});

test("checkout: sekcja między adresem a płatnością, +250 zł raz, wybór przeżywa odświeżenie", async ({
  page,
}) => {
  await openPlainProduct(page);
  await page.getByRole("button", { name: "Dodaj do koszyka", exact: true }).first().click();
  await page.goto("/checkout");

  const address = page.getByRole("heading", { name: "Adres dostawy", exact: true });
  const carry = page.getByRole("heading", { name: "Wniesienie mebli", exact: true });
  const payment = page.getByRole("heading", { name: "Metoda płatności", exact: true });
  const [ya, yc, yp] = await Promise.all(
    [address, carry, payment].map(async (h) => (await h.boundingBox())!.y)
  );
  expect(ya).toBeLessThan(yc);
  expect(yc).toBeLessThan(yp);

  const checkbox = page.getByRole("checkbox", { name: /Dostawa z wniesieniem do 4\. piętra/ });
  await expect(checkbox).not.toBeChecked();
  const total = page.getByTestId("checkout-total");
  const before = money(await total.innerText());

  await checkbox.check();
  await expect.poll(async () => money(await total.innerText())).toBe(before + CARRY_IN_PRICE);
  await expect(page.getByText("Wniesienie mebli", { exact: true }).last()).toBeVisible();

  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Dostawa z wniesieniem do 4\. piętra/ })).toBeChecked();
  await expect.poll(async () => money(await page.getByTestId("checkout-total").innerText())).toBe(
    before + CARRY_IN_PRICE
  );
});
