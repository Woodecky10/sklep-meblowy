import { test, expect } from "@playwright/test";

// Regresja: graficzny picker strony narożnika musi renderować kafelki ZAWSZE
// w kolejności lewa→prawa, niezależnie od kolejności wartości zapisanej w danych
// (katalog ma oba warianty zapisu — część produktów ma "Prawostronny" pierwszy).
// Sprawdzamy produkt z ODWRÓCONYM zapisem i z NORMALNYM — oba mają pokazać
// lewy kafelek = naroznik-lewostronny.svg, prawy = naroznik-prawostronny.svg.
//
// UWAGA: domyślnie testuje localhost (dev z fixem). Na prod (mollien.pl) też
// przejdzie po wdrożeniu; przed wdrożeniem prod pokaże niespójność.
const PRODUCTS = [
  { label: "odwrócony zapis w DB (VEGAS TWIN)", id: "1105e534-b424-4809-81f5-4896fe22c14a" },
  { label: "normalny zapis w DB (FADO L)", id: "5d57b18d-e7f9-4fc2-8994-704221a05cac" },
];

// Srcy grafik stron w kolejności DOM (odporne na next/image _next/image?url=...).
async function sideImageOrder(page: import("@playwright/test").Page) {
  return page
    .locator("button img")
    .evaluateAll((imgs) =>
      imgs
        .map((i) => i.getAttribute("src") || "")
        .filter((s) => /lewostronny|prawostronny/i.test(s))
    );
}

for (const p of PRODUCTS) {
  test(`picker strony — ${p.label} → lewy kafelek = lewostronny`, async ({ page }) => {
    await page.goto(`/produkt/${p.id}`);

    // Poczekaj aż wyrenderują się obie grafiki stron (2 kafelki).
    await expect
      .poll(async () => (await sideImageOrder(page)).length, { timeout: 15_000 })
      .toBe(2);

    const order = await sideImageOrder(page);
    expect(order[0], "pierwszy (lewy) kafelek ma być lewostronny").toMatch(/lewostronny/i);
    expect(order[1], "drugi (prawy) kafelek ma być prawostronny").toMatch(/prawostronny/i);

    // Zrzut samego pickera (grid-cols-2 zawierający kafelek lewostronny).
    const picker = page
      .locator('div.grid:has(button img[src*="lewostronny"])')
      .first();
    await picker.scrollIntoViewIfNeeded();
    await picker.screenshot({ path: `e2e/screens/corner-${p.id}.png` });
  });
}
