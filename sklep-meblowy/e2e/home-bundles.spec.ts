import { test, expect } from "@playwright/test";

// Zestawy mebli (2026-09-15): lista /zestawy + sekcja na stronie glownej.
// Sekcja to slider ze WSZYSTKIMI widocznymi zestawami (strzalki na desktopie,
// przewijanie palcem na mobile) i linkiem do pelnej listy /zestawy — link jest
// w DOM dwa razy (wariant desktop nad sliderem i mobile pod nim), widoczny
// zawsze dokladnie jeden.
//
// URUCHAMIANIE: E2E_BASE_URL=http://localhost:3000 na BUILDZIE
// (npm run build && npm start) i --no-deps. Bez E2E_BASE_URL
// playwright.config.ts celuje w PRODUKCJE (www.mollien.pl).

test.beforeEach(async ({ page }) => {
  // Zgoda cookie z gory - baner (fixed, bottom-0, z-50) nie zaslania niczego.
  // Ksztalt DOKLADNIE jak typ CookieConsent (patrz home-collections.spec.ts).
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

// Ile zestawow widzi klient - liczone z listy, bo to ona jest zrodlem prawdy
// (ta sama warstwa odczytu karmi sekcje na home).
async function countListedBundles(page: import("@playwright/test").Page) {
  const res = await page.goto("/zestawy");
  expect(res?.status()).toBe(200);
  return page.locator('#bundles-list a[href^="/zestaw/"]').count();
}

test("lista /zestawy: naglowek, kafelki z linkiem do strony zestawu i cena od", async ({ page }) => {
  const total = await countListedBundles(page);
  await expect(page.locator("h1")).toHaveText("Zestawy mebli");
  test.skip(total === 0, "brak widocznych zestawow w bazie");

  const first = page.locator('#bundles-list a[href^="/zestaw/"]').first();
  await expect(first).toContainText("Oszczędzasz od");
  // Kafelek prowadzi na istniejaca strone zestawu (nie 404 po zmianie sluga).
  const href = await first.getAttribute("href");
  const res = await page.goto(href!);
  expect(res?.status()).toBe(200);
});

test("sekcja zestawow na home: slider ze wszystkimi zestawami, strzalki i link do listy", async ({ page }) => {
  const total = await countListedBundles(page);
  test.skip(total === 0, "brak widocznych zestawow w bazie");

  await page.goto("/");
  // Sekcja MUSI istniec - jej brak to FAIL (wylaczony blok "bundles" w panelu
  // albo regresja renderu), nie skip.
  const section = page.locator("#home-bundles");
  await expect(section).toHaveCount(1);

  // Slider trzyma WSZYSTKIE zestawy w DOM (przewijanie, nie obcinanie).
  await expect(section.locator('a[href^="/zestaw/"]')).toHaveCount(total);
  await expect(section.locator('a[href="/zestawy"]:visible')).toHaveCount(1);

  const prev = section.locator('button[aria-label="Poprzednie zestawy"]');
  const next = section.locator('button[aria-label="Następne zestawy"]');
  await expect(next).toHaveCount(1);
  test.skip(total <= 3, "za malo zestawow, zeby przewijac");
  await expect(prev).toBeDisabled();
  await next.click();
  await expect(prev).toBeEnabled();
});
