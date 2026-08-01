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

  // Liczymy kafelki TYLKO w widocznej siatce sekcji "Nasze kolekcje". Linki
  // z `?kolekcja=` moga byc tez w navbarze, stopce i innych blokach home - te
  // sa edytowalne z panelu (edytor bloku podpowiada wprost
  // "np. /sklep?kolekcja=lisbon"), wiec liczenie po calej stronie robiloby
  // dwie szkody naraz: 6 legalnych kolekcji + jedno takie CTA zawyzaloby
  // wynik i test padalby na zdrowym kodzie, a znikniecie calej sekcji
  // (REGRESJA) dawaloby 0 i ciche `test.skip` - guard milczalby dokladnie
  // wtedy, gdy chronionej sekcji nie ma.
  const visibleCount = await page
    .locator('#home-collections-visible a[href*="kolekcja="]')
    .count();

  // Sekcja MUSI istniec - jej brak to FAIL, nie skip.
  expect(visibleCount).toBeGreaterThan(0);
  // Skip TYLKO gdy nadwyzki nie da sie miec - decyzja na danych, nie na
  // obecnosci przycisku.
  test.skip(visibleCount < VISIBLE, "mniej niz 6 kolekcji na home");
  expect(visibleCount).toBe(VISIBLE);

  // Widocznych 6, a przycisku nie ma = REGRESJA (usuniety przycisk, zerwane
  // aria-controls, wylaczony blok "collections"), a nie powod do skipa.
  // Uwaga: widoczna siatka jest twardo obcieta do VISIBLE, wiec przy DOKLADNIE
  // 6 kolekcjach na home (bez nadwyzki) ta asercja padnie. Swiadomy kompromis:
  // lepszy falszywy alarm w tym jednym granicznym stanie danych niz zielony
  // test przy zniknietej sekcji. Prod ma 11 kolekcji.
  await expect(button).toHaveCount(1);

  // Kluczowa asercja: ukrycie musi byc display:none, bo tylko wtedy
  // przegladarka nie pobiera leniwych zdjec ze schowanego kontenera.
  // Zamiana na opacity-0 jest wizualnie niewykrywalna i niszczy caly zysk.
  await expect(rest).toBeHidden();
  await expect(rest).toHaveCSS("display", "none");

  const hiddenCount = await rest.locator('a[href*="kolekcja="]').count();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  // Z nawiasami: samo `+5` zlapaloby tez "(+55)".
  await expect(button).toContainText(`(+${hiddenCount})`);

  await button.click();

  await expect(rest).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(button).toHaveText("Zwiń");

  // Zwijanie z powrotem - pelny powrot do stanu wyjsciowego. Samo toBeHidden()
  // przeszloby tez dla elementu odpietego z DOM, stad znowu display:none.
  await button.click();
  await expect(rest).toBeHidden();
  await expect(rest).toHaveCSS("display", "none");
  await expect(button).toHaveAttribute("aria-expanded", "false");
});
