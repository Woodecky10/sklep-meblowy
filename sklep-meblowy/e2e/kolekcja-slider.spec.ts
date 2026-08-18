import { test, expect } from "@playwright/test";

// Slider kolekcji na /sklep: wejscie w kolekcje ze strony glownej pokazuje
// karuzele z CALA kolekcja, a przycisk oddaje sterowanie dzisiejszej liscie.
//
// URUCHAMIANIE: ustaw E2E_BASE_URL na localhost i dodaj --no-deps. Bez
// E2E_BASE_URL playwright.config.ts celuje w PRODUKCJE (www.mollien.pl).
//
// Test jest WYLACZNIE czytajacy - baza jest wspolna z produkcja.

const SLIDER = "#collection-slider";

test.beforeEach(async ({ page }) => {
  // Zgoda cookie z gory - baner jest fixed/bottom-0/z-50 i zaslania przycisk
  // pod sliderem. Ksztalt musi byc DOKLADNIE taki jak typ CookieConsent: bez
  // `version: 1` getConsent() zwraca null i baner mimo wszystko sie pokazuje.
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

test("kolekcja ze strony glownej otwiera sie jako slider, przycisk przelacza na liste", async ({
  page,
}) => {
  await page.goto("/");

  // Kafelek bierzemy z widocznej siatki sekcji "Nasze kolekcje", nie z calej
  // strony: linki `?kolekcja=` sa tez w navbarze, stopce i w blokach home
  // edytowalnych z panelu, wiec pierwszy z brzegu bywa czyms innym.
  const tile = page.locator('#home-collections-visible a[href*="kolekcja="]').first();
  await expect(tile).toBeVisible();
  const href = await tile.getAttribute("href");
  expect(href).toBeTruthy();

  await tile.click();
  await expect(page).toHaveURL(/[?&]kolekcja=/);
  // Wejscie w kolekcje NIE moze przyniesc `widok` w adresie - slider jest
  // stanem domyslnym, a nie kolejnym parametrem do niesienia.
  await expect(page).not.toHaveURL(/[?&]widok=/);

  const slider = page.locator(SLIDER);
  await expect(slider).toBeVisible();

  // Slider pokazuje CALA kolekcje, wiec liczba kart musi zgadzac sie z
  // licznikiem pod naglowkiem ("N produktow"). To jest sedno funkcji: gdyby
  // stronicowanie zostalo wlaczone, karuzela pokazalaby pierwsza strone i
  // roznica bylaby niewidoczna golym okiem przy malych kolekcjach.
  const licznik = await page.locator("h1 + p").innerText();
  const zapowiedziane = Number(licznik.match(/\d+/)?.[0]);
  expect(zapowiedziane).toBeGreaterThan(0);

  // Liczymy UNIKALNE adresy produktow, nie linki: jedna karta niesie ich trzy
  // (zdjecie, tytul, strzalka), wiec `toHaveCount` na linkach dawaloby
  // potrojony wynik i test padalby na dzialajacym sliderze.
  const unikalne = await slider.evaluate(
    (el) =>
      new Set(
        [...el.querySelectorAll('a[href*="/produkt/"]')].map((a) =>
          a.getAttribute("href")
        )
      ).size
  );
  expect(unikalne).toBe(zapowiedziane);

  // Przycisk jest LINKIEM - ma dzialac bez JS i dac sie otworzyc w nowej karcie.
  const doListy = page.getByRole("link", { name: /jako list/i });
  await expect(doListy).toBeVisible();
  await doListy.click();

  await expect(page).toHaveURL(/[?&]widok=lista/);
  await expect(page.locator(SLIDER)).toHaveCount(0);
  await expect(doListy).toHaveCount(0);
  // Lista musi realnie pokazac produkty - sam brak slidera zieleniłby sie tez
  // na pustej stronie.
  await expect(page.locator('a[href*="/produkt/"]').first()).toBeVisible();
});

test("filtr odbiera slider i oddaje liste", async ({ page }) => {
  await page.goto("/sklep?kolekcja=kolekcja-mio");
  await expect(page.locator(SLIDER)).toBeVisible();

  // Ta sama kolekcja z dolozonym filtrem kategorii. Regula brzmi: cokolwiek
  // zaweza wynik, wraca lista - bez trzymania gdziekolwiek stanu "user chcial
  // liste".
  await page.goto("/sklep?kolekcja=kolekcja-mio&kategoria=sofy");
  await expect(page.locator(SLIDER)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /jako list/i })).toHaveCount(0);
});
