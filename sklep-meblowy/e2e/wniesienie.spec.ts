import { test, expect, type Page } from "@playwright/test";
import { CARRY_IN_KEY, CARRY_IN_PRICE } from "../app/_lib/carry-in";

// Wniesienie mebli (spec 2026-10-06): pole przy produkcie, domyślnie
// odznaczone. Sprawdzamy koszyk w localStorage (cena sztuki, klucz) i dopisek
// na /koszyk. Nic nie zapisujemy w bazie — checkoutu nie składamy.

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

type StoredItem = { id: string; price: number; variantValues?: Record<string, string> };
const cartItems = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("mollien-cart-items") ?? "[]") as StoredItem[]
  );

test("wniesienie: odznaczone domyślnie, zaznaczone dolicza 250 zł i dopisek", async ({ page }) => {
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

  const checkbox = page.getByRole("checkbox", { name: /Wniesienie mebli/ });
  await expect(checkbox).not.toBeChecked();

  // Slidery na stronie produktu mają karty z tym samym aria-label; główny
  // przycisk jest w DOM przed nimi.
  const add = page.getByRole("button", { name: "Dodaj do koszyka", exact: true }).first();
  await add.click();
  await checkbox.check();
  await add.click();

  await expect.poll(async () => (await cartItems(page)).length).toBe(2);
  const [plain, carried] = await cartItems(page);
  expect(plain.variantValues).toBeUndefined();
  expect(carried.variantValues).toEqual({ [CARRY_IN_KEY]: "Tak" });
  expect(carried.price).toBe(plain.price + CARRY_IN_PRICE);

  await page.goto("/koszyk");
  await expect(page.getByText(`${CARRY_IN_KEY}: Tak`)).toHaveCount(1);
});
