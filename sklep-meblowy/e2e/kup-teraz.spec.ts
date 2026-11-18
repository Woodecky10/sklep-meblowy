import { test, expect, type Page } from "@playwright/test";

// „Kup teraz" na karcie produktu: dodaje do koszyka i od razu przenosi na
// /koszyk (bez dymka „Dodano do koszyka" — klient i tak widzi koszyk). Przy
// produkcie z wariantami przyciski „Dodaj do koszyka" i „Kup teraz" są
// aktywne od wejścia i mają stały napis. Klik przy niepełnym wyborze niczego
// nie dodaje — pokazuje, której opcji brakuje, podświetla ją i przewija do niej.
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

test("produkt z wariantami — „Kup teraz” mówi, czego brakuje, i działa po wyborze", async ({
  page,
}) => {
  const href = await findProductHref(page, "/sklep", 'a[aria-label="Wybierz wariant"]');
  test.skip(!href, "brak produktu z wariantami na pierwszej stronie /sklep");

  await page.goto(href!);
  // exact + first: karty produktów niżej na stronie (cross-sell, kolekcja,
  // podobne) mają własne przyciski „Dodaj do koszyka"; główna sekcja jest
  // w DOM pierwsza.
  const buyNow = page.getByRole("button", { name: "Kup teraz", exact: true }).first();
  const hint = page.getByTestId("missing-options");
  const missing = page.locator('[data-missing="true"]');
  const addBtn = page.getByRole("button", { name: "Dodaj do koszyka", exact: true }).first();

  // Od wejścia: przyciski aktywne, stały napis, szara podpowiedź, nic nie podświetlone.
  await expect(buyNow).toBeEnabled();
  await expect(addBtn).toBeEnabled();
  await expect(page.getByRole("button", { name: "Wybierz wariant" })).toHaveCount(0);
  await expect(hint).toHaveAttribute("data-attempted", "false");
  await expect(hint).toContainText("Do wyboru:");
  await expect(missing).toHaveCount(0);

  // Klik bez pełnego wyboru: zostajemy na karcie, komunikat i podświetlenie, nic w koszyku.
  // Najpierw odjeżdżamy na dół, a klik wykonujemy z JS (bez auto-scrolla
  // Playwrighta) — inaczej test przeszedłby bez przewijania po stronie aplikacji.
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  const before1 = await page.evaluate(() => window.scrollY);
  await buyNow.evaluate((b) => (b as HTMLButtonElement).click());
  await expect(page).toHaveURL(/\/produkt\//);
  await expect(hint).toHaveAttribute("data-attempted", "true");
  await expect(hint).toContainText("Wybierz jeszcze:");
  await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(before1);
  await expect(missing.first()).toBeInViewport();
  await page.waitForTimeout(500);
  await expect(page.getByText("Dodano do koszyka")).toHaveCount(0);

  // Drugi klik po odjechaniu na dół strony znów przewija do brakującej opcji.
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  const before2 = await page.evaluate(() => window.scrollY);
  await addBtn.evaluate((b) => (b as HTMLButtonElement).click());
  await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(before2);
  await expect(missing.first()).toBeInViewport();
  await page.waitForTimeout(500);
  await expect(page.getByText("Dodano do koszyka")).toHaveCount(0);

  // Wybieramy po kolei pierwszą wartość w każdej grupie, która jeszcze
  // pokazuje „wybierz". Tkaniny bywają schowane w zwiniętych grupach albo za
  // „Zobacz więcej" — wtedy najpierw rozwijamy.
  const pending = page.locator("p").filter({
    has: page.locator("span", { hasText: /^wybierz$/ }),
  });
  let prevMissing = await missing.count();
  for (let i = 0; i < 20 && (await pending.count()) > 0; i++) {
    const group = pending.first().locator("xpath=..");
    const value = group.locator('[aria-pressed="false"]:visible').first();
    if ((await value.count()) > 0) {
      // Klik przy lewej krawędzi: pastylka może mieć w środku przycisk „i”.
      await value.click({ position: { x: 8, y: 8 } });
      const now = await missing.count();
      expect(now).toBeLessThanOrEqual(prevMissing);
      prevMissing = now;
      continue;
    }
    const expander = group.locator('button[aria-expanded="false"]:visible').first();
    if ((await expander.count()) === 0) break;
    await expander.click();
  }
  test.skip((await pending.count()) > 0, "nie udało się wybrać wszystkich wariantów");

  await expect(hint).toHaveCount(0);
  await expect(missing).toHaveCount(0);
  await buyNow.click();
  await expect(page).toHaveURL(/\/koszyk$/);
});
