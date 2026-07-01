import { test, expect, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const PAGES = [
  { name: "dashboard", path: "/admin" },
  { name: "zamowienia", path: "/admin/zamowienia" },
  { name: "produkty", path: "/admin/produkty" },
];

// Brak poziomego przewijania = nic nie wychodzi poza ekran / nie ucina się.
async function assertNoHorizontalOverflow(page: Page, label: string) {
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }));
  expect(
    m.scrollW,
    `poziome przewijanie (${label}): scrollWidth ${m.scrollW} > innerWidth ${m.innerW}`
  ).toBeLessThanOrEqual(m.innerW + 1);
}

for (const vp of VIEWPORTS) {
  for (const p of PAGES) {
    test(`${p.name} @ ${vp.name} — brak ucinania`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(p.path);
      await expect(page).toHaveURL(new RegExp(p.path.replace(/\//g, "\\/")));

      await assertNoHorizontalOverflow(page, `${p.name}/${vp.name}`);

      const hamburger = page.getByRole("button", { name: "Otwórz menu" });
      if (vp.width < 1024) {
        // Tablet/telefon: hamburger widoczny, sidebar schowany do czasu kliknięcia.
        await expect(hamburger).toBeVisible();
        // Zamknięty: drawer poza ekranem (x < 0).
        const closed = await page.locator("aside").boundingBox();
        expect(closed!.x, "drawer domyślnie schowany").toBeLessThan(0);
        await hamburger.click();
        // Po kliknięciu drawer wsuwa się (uwzględnij transition ~200ms).
        await expect
          .poll(
            async () => {
              const b = await page.locator("aside").boundingBox();
              return b ? Math.round(b.x) : -9999;
            },
            { timeout: 5000, message: "drawer nie wysunął się po kliknięciu hamburgera" }
          )
          .toBeGreaterThanOrEqual(-1);
        await page.screenshot({ path: `e2e/screens/${p.name}-${vp.name}-drawer.png` });
      } else {
        // Desktop: brak hamburgera, sidebar statyczny widoczny.
        await expect(hamburger).toBeHidden();
        await expect(page.locator("aside").getByRole("link", { name: "Zamówienia" })).toBeVisible();
      }

      await page.screenshot({ path: `e2e/screens/${p.name}-${vp.name}.png`, fullPage: true });
    });
  }
}

// Szczegóły zamówienia (jeśli są zamówienia) — sprawdza fix statusu i klikalny wiersz.
test("szczegóły zamówienia @ mobile — status się nie rozciąga", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin/zamowienia");

  const manage = page.getByRole("link", { name: /Zarządzaj/ }).first();
  const count = await page.getByRole("link", { name: /Zarządzaj/ }).count();
  if (count === 0) {
    test.skip(true, "Brak zamówień do sprawdzenia szczegółów.");
    return;
  }

  await manage.click();
  await expect(page).toHaveURL(/\/admin\/zamowienia\/[0-9a-f-]+/);
  await assertNoHorizontalOverflow(page, "szczegóły/mobile");

  // Select statusu nie może wychodzić poza szerokość okna.
  const select = page.locator("select").first();
  if (await select.count()) {
    const box = await select.boundingBox();
    if (box) {
      expect(box.x + box.width, "select statusu w granicach ekranu").toBeLessThanOrEqual(375 + 1);
    }
  }

  await page.screenshot({ path: "e2e/screens/zamowienie-detail-mobile.png", fullPage: true });
});

test("/admin nie ma publicznej nawigacji ani stopki", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin");
  // Stopka sklepu i pasek wyszukiwarki sklepu (dwie osobne grupy chrome) — ukryte.
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.getByPlaceholder(/Szukaj mebli/i)).toHaveCount(0);
  // Sanity: panel admina nadal renderuje swój sidebar.
  await expect(page.locator('aside a[href="/admin/zamowienia"]')).toBeVisible();
});

test("strona publiczna (/sklep) nadal ma nawigację i stopkę", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/sklep");
  await expect(page.locator("footer")).toBeVisible();
  await expect(page.getByPlaceholder(/Szukaj mebli/i)).toBeVisible();
});
