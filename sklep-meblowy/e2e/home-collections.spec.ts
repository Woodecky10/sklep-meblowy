import { test, expect } from "@playwright/test";

// Kolekcje na stronie glownej jako slider (2026-09-15, decyzja wlasciciela:
// „na kolekcjach tez tak" — jak zestawy). Wczesniej: siatka 6 + „Pokaz
// wszystkie kolekcje" (spec 2026-07-31), stad w historii tego pliku asercje
// o display:none — w sliderze nie ma juz zwijania.
//
// URUCHAMIANIE: ustaw E2E_BASE_URL na localhost i dodaj --no-deps. Bez
// E2E_BASE_URL playwright.config.ts celuje w PRODUKCJE (www.mollien.pl).

test.beforeEach(async ({ page }) => {
  // Zgoda cookie z gory - baner (fixed, bottom-0, z-50) nie zaslania strzalek.
  // Ksztalt musi byc DOKLADNIE taki jak typ CookieConsent: bez `version: 1`
  // getConsent() zwraca null i baner mimo wszystko sie pokazuje.
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

test("kolekcje na home: slider ze wszystkimi kafelkami i dzialajacymi strzalkami", async ({ page }) => {
  await page.goto("/");

  // Sekcja MUSI istniec - jej brak to FAIL (wylaczony blok albo regresja), nie skip.
  const section = page.locator("#home-collections");
  await expect(section).toHaveCount(1);

  // Liczymy kafelki TYLKO w sekcji: linki `?kolekcja=` sa tez w navbarze,
  // stopce i blokach edytowalnych z panelu.
  const tiles = section.locator('a[href*="kolekcja="]');
  const total = await tiles.count();
  expect(total).toBeGreaterThan(0);

  const prev = section.locator('button[aria-label="Poprzednie kolekcje"]');
  const next = section.locator('button[aria-label="Następne kolekcje"]');
  await expect(prev).toHaveCount(1);
  await expect(next).toHaveCount(1);

  // Na desktopie (viewport Playwrighta 1280px) widac 3 kafelki na ekran —
  // przewijanie ma sens dopiero przy 4+. Prod ma 15 kolekcji.
  test.skip(total <= 3, "za malo kolekcji na home, zeby przewijac");
  await expect(prev).toBeDisabled();
  await expect(next).toBeEnabled();

  await next.click();
  await expect(prev).toBeEnabled();
});
