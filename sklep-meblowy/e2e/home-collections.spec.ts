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
  // Liczymy kafelki TYLKO w sekcji "Nasze kolekcje". Linki z `?kolekcja=` moga
  // byc tez w navbarze, stopce i innych blokach home - te sa edytowalne z
  // panelu (edytor bloku podpowiada wprost "np. /sklep?kolekcja=lisbon"), wiec
  // liczenie po calej stronie psulaby test przy samej zmianie tresci w DB.
  const section = page.locator("section:has(#home-collections-rest)");

  // Skip TYLKO gdy nadwyzki nie da sie miec - decyzja na danych, nie na
  // obecnosci przycisku. Liczba page-level jest celowo zawyzona (lapie tez
  // linki spoza sekcji), wiec `total <= VISIBLE` znaczy "nadwyzka niemozliwa".
  const total = await page.locator('a[href*="kolekcja="]').count();
  test.skip(
    total <= VISIBLE,
    "mniej niz 7 kolekcji z pokazywaniem na home i aktywnymi produktami - brak nadwyzki"
  );

  // 7+ kolekcji, a przycisku nie ma = REGRESJA (usuniety przycisk, zerwane
  // aria-controls, wylaczony blok "collections"), a nie powod do skipa.
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

  // Widocznych dokladnie VISIBLE - linki sekcji minus te z ukrytego kontenera.
  const sectionLinks = section.locator('a[href*="kolekcja="]');
  expect((await sectionLinks.count()) - hiddenCount).toBe(VISIBLE);

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
