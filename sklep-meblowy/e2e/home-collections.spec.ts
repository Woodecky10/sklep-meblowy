import { test, expect } from "@playwright/test";

// Zwijanie kolekcji na stronie glownej (spec 2026-07-31): widocznych 6,
// reszta po kliknieciu.
//
// URUCHAMIANIE: ustaw E2E_BASE_URL na localhost i dodaj --no-deps. Bez
// E2E_BASE_URL playwright.config.ts celuje w PRODUKCJE (www.mollien.pl).
const VISIBLE = 6;

test.beforeEach(async ({ page }) => {
  // Zgoda cookie z gory - baner (fixed, bottom-0, z-50) nie zaslania przycisku
  // rozwijania. Ksztalt musi byc DOKLADNIE taki jak typ CookieConsent: bez
  // `version: 1` getConsent() zwraca null i baner mimo wszystko sie pokazuje
  // (sprawdzone) - stad ta sama tresc co w fabric-group-cards.spec.ts.
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

test("pierwsze 6 kolekcji widoczne, reszta ukryta i rozwijana", async ({ page }) => {
  await page.goto("/");

  const rest = page.locator("#home-collections-rest");
  const button = page.locator('button[aria-controls="home-collections-rest"]');

  // Sekcja moze nie miec nadwyzki (<= 6 kolekcji) - wtedy nie ma czego testowac.
  if ((await button.count()) === 0) {
    test.skip(true, "mniej niz 7 kolekcji na home - brak przycisku");
  }

  // Kluczowa asercja: ukrycie musi byc display:none, bo tylko wtedy
  // przegladarka nie pobiera leniwych zdjec ze schowanego kontenera.
  // Zamiana na opacity-0 jest wizualnie niewykrywalna i niszczy caly zysk.
  await expect(rest).toBeHidden();
  await expect(rest).toHaveCSS("display", "none");

  const hiddenCount = await rest.locator('a[href*="kolekcja="]').count();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toContainText(`+${hiddenCount}`);

  // Widocznych dokladnie VISIBLE - liczymy linki spoza ukrytego kontenera.
  const allLinks = page.locator('a[href*="kolekcja="]');
  expect((await allLinks.count()) - hiddenCount).toBe(VISIBLE);

  await button.click();

  await expect(rest).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(button).toHaveText("Zwiń");

  // Zwijanie z powrotem
  await button.click();
  await expect(rest).toBeHidden();
});
