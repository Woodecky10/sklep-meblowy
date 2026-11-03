import { test, expect, devices, type Page } from "@playwright/test";

// Karta produktu na telefonie (decyzja właściciela 2026-11-03): zdjęcie, nazwa
// i cena mają być widoczne od razu, na pierwszym ekranie, bez przewijania.
// Wcześniej na iPhonie nazwa zaczynała się ~1114 px, cena ~1370 px przy
// ekranie 664 px — przed nimi stały okruszki z pełną nazwą (4–6 linii),
// miniatury i cała tabela „Szczegóły produktu".
//
// Na telefonie: okruszki = jedna linia „‹ kategoria", galeria przewijana
// palcem z kropkami i licznikiem, specyfikacja POD przyciskami. Na komputerze
// bez zmian: pełne okruszki, miniatury, specyfikacja w lewej kolumnie.
//
// Test tylko czyta strony — nic nie zapisuje w bazie.

// iPhone 14 bez `defaultBrowserType` (webkit) — projekt e2e jedzie na Chromium.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...iPhone } = devices["iPhone 14"];

test.beforeEach(async ({ page }) => {
  // Zgoda cookie z góry — baner (fixed) zasłoniłby dół ekranu.
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

// Pierwszy produkt z /sklep — test nie zależy od konkretnych id w katalogu.
async function openFirstProduct(page: Page) {
  await page.goto("/sklep");
  const href = await page.locator('a[href*="/produkt/"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(href!);
}

async function expectInFirstScreen(page: Page, what: string, box: { y: number; height: number } | null) {
  const vh = page.viewportSize()!.height;
  expect(box, `${what}: brak elementu`).not.toBeNull();
  expect(box!.y, `${what}: nad ekranem`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${what}: poniżej pierwszego ekranu (${vh} px)`).toBeLessThanOrEqual(vh);
}

test.describe("telefon", () => {
  test.use(iPhone);

  test("zdjęcie, nazwa i cena na pierwszym ekranie, bez przewijania", async ({ page }) => {
    await openFirstProduct(page);
    const gallery = page.getByTestId("product-gallery");
    await expectInFirstScreen(page, "zdjęcie", await gallery.boundingBox());
    await expectInFirstScreen(page, "nazwa", await page.locator("h1").boundingBox());
    await expectInFirstScreen(page, "cena", await page.getByTestId("product-price").boundingBox());
  });

  test("przesunięcie galerii palcem zmienia licznik zdjęć", async ({ page }) => {
    await openFirstProduct(page);
    const counter = page.getByTestId("gallery-counter");
    // Licznik jest tylko przy więcej niż jednym zdjęciu.
    test.skip((await page.getByTestId("gallery-track").locator("button").count()) < 2, "jedno zdjęcie");
    await expect(counter).toBeVisible();
    await expect(counter).toHaveText(/^1\s*\/\s*\d+$/);
    await page
      .getByTestId("gallery-track")
      .evaluate((el) => el.scrollTo({ left: el.clientWidth, behavior: "instant" }));
    await expect(counter).toHaveText(/^2\s*\/\s*\d+$/);
  });

  test("okruszki w jednej linii, specyfikacja pod przyciskami", async ({ page }) => {
    await openFirstProduct(page);
    // Pełna ścieżka (Dom / Sklep / … / nazwa) jest schowana — zostaje „‹ kategoria".
    await expect(page.getByRole("link", { name: "Sklep", exact: true }).first()).toBeHidden();
    const spec = page.getByRole("heading", { name: "Szczegóły produktu" });
    const buyNow = page.getByRole("button", { name: "Kup teraz" });
    const specBox = await spec.boundingBox();
    const buyBox = await buyNow.boundingBox();
    expect(specBox && buyBox).toBeTruthy();
    expect(specBox!.y).toBeGreaterThan(buyBox!.y);
  });
});

test.describe("komputer", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("bez zmian: pełne okruszki, miniatury przełączają zdjęcie, specyfikacja z lewej", async ({
    page,
  }) => {
    await openFirstProduct(page);
    await expect(page.getByRole("link", { name: "Sklep", exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("gallery-counter")).toBeHidden();

    const second = page.getByRole("button", { name: "Pokaż zdjęcie 2" });
    if (await second.count()) {
      await second.click();
      await expect(second).toHaveAttribute("aria-current", "true");
    }

    // Specyfikacja w lewej kolumnie — obok przycisków, nie pod nimi.
    const specBox = await page.getByRole("heading", { name: "Szczegóły produktu" }).boundingBox();
    const priceBox = await page.getByTestId("product-price").boundingBox();
    expect(specBox && priceBox).toBeTruthy();
    expect(specBox!.x).toBeLessThan(priceBox!.x);
  });
});
