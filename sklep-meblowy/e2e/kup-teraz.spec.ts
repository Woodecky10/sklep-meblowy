import { test, expect, type Page } from "@playwright/test";

// „Kup teraz" na karcie produktu: dodaje do koszyka i od razu przenosi na
// /koszyk (bez dymka „Dodano do koszyka" — klient i tak widzi koszyk). Przy
// produkcie z wariantami przycisk jest zablokowany, dopóki klient nie wybierze
// WSZYSTKICH opcji.
//
// Produkty dobieramy z /sklep po przycisku na karcie listingu: „Dodaj do
// koszyka" = produkt bez wariantów, „Wybierz wariant" = z wariantami. Dzięki
// temu test nie zależy od konkretnych id w katalogu.
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

async function findProductHref(page: Page, listing: string, cardButton: string) {
  await page.goto(listing);
  const link = page
    .locator("div.group")
    .filter({ has: page.locator(cardButton) })
    .first()
    .locator('a[href*="/produkt/"]')
    .first();
  return link.getAttribute("href", { timeout: 15_000 }).catch(() => null);
}

test("produkt bez wariantów — „Kup teraz” dodaje i przenosi na /koszyk", async ({ page }) => {
  const href = await findProductHref(
    page,
    // Większość katalogu ma warianty — bez nich są m.in. materace nawierzchniowe.
    "/sklep?q=nawierzchniowy",
    'button[aria-label="Dodaj do koszyka"]'
  );
  test.skip(!href, "brak produktu bez wariantów w wynikach 'nawierzchniowy'");

  await page.goto(href!);
  const name = (await page.locator("h1").first().innerText()).trim();

  const buyNow = page.getByRole("button", { name: "Kup teraz" });
  await expect(buyNow).toBeEnabled();
  await buyNow.click();

  await expect(page).toHaveURL(/\/koszyk$/);
  await expect(page.getByText(name, { exact: false }).first()).toBeVisible();

  // Dymek pojawia się 20 ms po dodaniu — dajemy mu czas, żeby brak był pewny.
  await page.waitForTimeout(500);
  await expect(page.getByText("Dodano do koszyka")).toHaveCount(0);
});

test("produkt z wariantami — „Kup teraz” zablokowany do wyboru wszystkich opcji", async ({
  page,
}) => {
  const href = await findProductHref(page, "/sklep", 'a[aria-label="Wybierz wariant"]');
  test.skip(!href, "brak produktu z wariantami na pierwszej stronie /sklep");

  await page.goto(href!);
  const buyNow = page.getByRole("button", { name: "Kup teraz" });
  await expect(buyNow).toBeDisabled();

  // Klik w zablokowany przycisk nic nie robi — zostajemy na karcie produktu.
  await buyNow.click({ force: true });
  await expect(page).toHaveURL(/\/produkt\//);

  // Wybieramy po kolei pierwszą wartość w każdej grupie, która jeszcze
  // pokazuje „wybierz". Tkaniny bywają schowane w zwiniętych grupach albo za
  // „Zobacz więcej" — wtedy najpierw rozwijamy.
  const pending = page.locator("p").filter({
    has: page.locator("span", { hasText: /^wybierz$/ }),
  });
  for (let i = 0; i < 20 && (await pending.count()) > 0; i++) {
    // Dopóki choć jedna grupa jest niewybrana, przycisk ma być zablokowany.
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
  test.skip((await pending.count()) > 0, "nie udało się wybrać wszystkich wariantów");

  await expect(buyNow).toBeEnabled();
  await buyNow.click();
  await expect(page).toHaveURL(/\/koszyk$/);
});
