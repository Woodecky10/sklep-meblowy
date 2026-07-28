import { test, expect } from "@playwright/test";

// Regresja: dymek „i" przy wartości wariantu (ValueInfoTip) nie może chować się
// pod przyklejonym nagłówkiem ani wystawać poza ekran. Wcześniej renderował się
// w flow strony jako `absolute bottom-full` — ZAWSZE nad kotwicą — więc przy
// pierwszej (najwyższej) grupie opcji wjeżdżał pod header (sticky, ~133 px)
// i był ucinany. Teraz idzie portalem do <body> z position: fixed i przy braku
// miejsca u góry odwraca się pod kotwicę.
//
// Produkt: Narożnik Amica U — opcja „Pianka" ma ⓘ przy obu wartościach.
const PRODUCT_ID = "fe545101-de29-4a59-a012-c881e9971205";

test("dymek wariantu nie chowa się pod nagłówkiem i mieści się w ekranie", async ({ page }) => {
  // Zgoda cookie z góry — baner (fixed, z-50) nie zasłania nic w teście.
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

  // Warianty renderuje komponent kliencki — czekamy na ⓘ, a gdy go nie ma
  // (zmienione dane katalogu), pomijamy test zamiast fałszywie failować.
  const icons = page.locator('[aria-label="Informacja o wariancie"]');
  const hasTips = await icons
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    !hasTips,
    "produkt nie ma wartości wariantu z ⓘ (dane katalogu mogły się zmienić)"
  );

  const header = page.locator("[data-sticky-header]");
  await expect(header).toBeVisible();
  const icon = icons.first();

  // Ustaw ikonkę TUŻ pod nagłówkiem — dokładnie sytuacja, w której dymek
  // otwierany w górę wjeżdżałby pod header.
  await icon.scrollIntoViewIfNeeded();
  const headerBottom = await header.evaluate((el) => el.getBoundingClientRect().bottom);
  const delta = await icon.evaluate(
    (el, target) => el.getBoundingClientRect().top - target,
    headerBottom + 10
  );
  await page.evaluate((d) => window.scrollBy(0, d), delta);

  await icon.hover();

  const tip = page.locator('[role="tooltip"]').first();
  await expect(tip).toBeVisible({ timeout: 5000 });

  const box = await tip.boundingBox();
  expect(box, "dymek ma mierzalny prostokąt").not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport, "viewport znany").not.toBeNull();
  if (!box || !viewport) return;

  // Nagłówek mierzymy PO przewinięciu (jego wysokość może się zmienić).
  const obstacleBottom = await header.evaluate((el) => el.getBoundingClientRect().bottom);
  expect(box.y, "dymek nie wchodzi pod przyklejony nagłówek").toBeGreaterThanOrEqual(
    obstacleBottom - 1
  );
  expect(box.y, "górna krawędź w ekranie").toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, "dolna krawędź w ekranie").toBeLessThanOrEqual(viewport.height + 1);
  expect(box.x, "lewa krawędź w ekranie").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "prawa krawędź w ekranie").toBeLessThanOrEqual(viewport.width + 1);

  // Tekst nie jest przycięty wewnątrz dymka (brak ukrytego przewijania).
  const notClipped = await tip.evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
  expect(notClipped, "tekst dymka nie jest przycięty").toBe(true);
});
