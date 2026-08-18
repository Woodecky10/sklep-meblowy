import { test, expect } from "@playwright/test";

// Sekcja "Pelna kolekcja" na karcie produktu ma byc SLIDEREM z cala kolekcja.
//
// Zgloszenie wlascicielki (2026-08-18): "jak wejdziesz w produkt z jakiejs
// kolekcji i masz kolekcja Mio, to ja chcialam ten slider tam". Wczesniej byla
// tam siatka obcieta do 8 pozycji, a slider stal na /sklep - czyli nie tam,
// gdzie mial byc.
//
// URUCHAMIANIE: ustaw E2E_BASE_URL na localhost i dodaj --no-deps. Bez
// E2E_BASE_URL playwright.config.ts celuje w PRODUKCJE (www.mollien.pl).
//
// Test jest WYLACZNIE czytajacy - baza jest wspolna z produkcja.

const SLIDER = "#product-collection-slider";

// Kolekcja z najwieksza liczba produktow (15). Wazna, bo tylko na takiej
// widac roznice miedzy stara siatka (8 sztuk) a sliderem z cala kolekcja.
const KOLEKCJA = "kolekcja-mio";

test("karta produktu pokazuje cala kolekcje jako slider", async ({ page }) => {
  await page.goto(`/sklep?kolekcja=${KOLEKCJA}`);

  // Ile produktow ma kolekcja - z licznika pod naglowkiem, zeby test nie
  // zaszywal liczby, ktora zmieni sie przy pierwszym dodanym meblu.
  const licznik = await page.locator("h1 + p").innerText();
  const wKolekcji = Number(licznik.match(/\d+/)?.[0]);
  expect(wKolekcji).toBeGreaterThan(8); // inaczej test niczego nie dowodzi

  await page.locator('a[href*="/produkt/"]').first().click();
  await expect(page).toHaveURL(/\/produkt\//);

  const slider = page.locator(SLIDER);
  await expect(slider).toBeVisible({ timeout: 15000 });

  // Slider niesie CALA reszte kolekcji, nie osiem sztuk. Liczymy UNIKALNE
  // adresy: jedna karta ma trzy linki (zdjecie, tytul, strzalka).
  const unikalne = await slider.evaluate(
    (el) =>
      new Set(
        [...el.querySelectorAll('a[href*="/produkt/"]')].map((a) =>
          a.getAttribute("href")
        )
      ).size
  );
  // -1, bo ogladany produkt nie pokazuje sam siebie w swojej kolekcji.
  expect(unikalne).toBe(wKolekcji - 1);

  // Wyjscie na strone kolekcji. Sprawdzamy TAKZE adres, nie sam napis:
  // link prowadzacy donikad albo do zlej kolekcji wygladalby identycznie.
  const doKolekcji = page.getByRole("link", { name: /całą kolekcj/i });
  await expect(doKolekcji).toBeVisible();
  await doKolekcji.click();
  await expect(page).toHaveURL(new RegExp(`kolekcja=${KOLEKCJA}`));
  await expect(page.locator("h1")).toHaveText(/Mio/);
});

test("na /sklep kolekcja jest zwykla lista, bez slidera", async ({ page }) => {
  await page.goto(`/sklep?kolekcja=${KOLEKCJA}`);

  // Slider zostal PRZENIESIONY na karte produktu - tutaj ma go nie byc.
  await expect(page.locator("#collection-slider")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /jako list/i })).toHaveCount(0);

  // ...a siatka i stronicowanie maja dzialac jak przed cala ta zmiana.
  await expect(page.locator("div.grid.xl\\:grid-cols-4")).toBeVisible();
  await expect(page.locator('a[href*="/produkt/"]').first()).toBeVisible();
});
