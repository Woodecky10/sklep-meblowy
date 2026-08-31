import { test, expect } from "@playwright/test";

// ⚠️ Baza jest WSPÓLNA z produkcją — ten spec NICZEGO nie zapisuje.
//
// Co ten spec REALNIE łapie zawsze: crash CAŁEJ strony na kodzie czytającym
// opinie (np. `review.photos.length` bez normalizacji wywaliłoby renderowanie
// strony, nie tylko jednej karty) — to test na FAIL-SOFT przed migracją 79:
// dopóki kolumny `photos` nie ma w bazie, `select("*")` jej nie zwraca,
// więc `review.photos` jest `undefined`.
//
// Czego NIE łapie sam, bez dalszego kroku niżej: normalizacja
// `Array.isArray(photos) ? photos : []` siedzi WEWNĄTRZ `rows.map(...)`
// w warstwie danych — `[].map(fn)` nigdy nie wywołuje `fn`. Dopóki w bazie
// jest zero zatwierdzonych opinii, ta gałąź kodu w ogóle się nie wykonuje,
// więc samo „strona zwróciła 200 i nie ma pageerror” o niej nic nie mówi.
// Dlatego każdy test liczy karty opinii (`[data-review-card]`) i:
// - przy zera kart ŚWIADOMIE się pomija (test.skip) zamiast udawać zielono,
//   że sprawdził ścieżkę per-wiersz, której nie wykonał;
// - przy co najmniej jednej karcie dodatkowo sprawdza, że KAŻDE zdjęcie
//   w karcie faktycznie się załadowało (naturalWidth > 0) — to już realnie
//   dotyka ścieżki `photos`, nie tylko obecności strony.
test.describe("opinie ze zdjęciami — odczyt", () => {
  test("strona główna renderuje się mimo braku kolumny photos", async ({ page }) => {
    const bledy: string[] = [];
    page.on("pageerror", (e) => bledy.push(e.message));
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("footer")).toBeVisible();
    expect(bledy).toEqual([]);

    const karty = page.locator("[data-review-card]");
    const liczbaKart = await karty.count();
    test.skip(
      liczbaKart === 0,
      "Baza nie ma jeszcze zatwierdzonych opinii — ścieżka per-wiersz " +
        "(normalizacja photos w rows.map) się nie wykonała, więc guard śpi."
    );

    const zdjecia = karty.locator("img");
    for (const img of await zdjecia.all()) {
      await expect
        .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    }
  });

  test("/opinie renderuje się i nie zgłasza błędów", async ({ page }) => {
    const bledy: string[] = [];
    page.on("pageerror", (e) => bledy.push(e.message));
    const res = await page.goto("/opinie");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    expect(bledy).toEqual([]);

    const karty = page.locator("[data-review-card]");
    const liczbaKart = await karty.count();
    test.skip(
      liczbaKart === 0,
      "Baza nie ma jeszcze zatwierdzonych opinii — ścieżka per-wiersz " +
        "(normalizacja photos w rows.map) się nie wykonała, więc guard śpi."
    );

    const zdjecia = karty.locator("img");
    for (const img of await zdjecia.all()) {
      await expect
        .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    }
  });
});

// Klik w miniaturę ma otwierać lightbox z powiększeniem — tak jak we wzorniku
// tkanin (FabricSwatchGrid). Wcześniej miniatury były zwykłym <Image> bez
// żadnego celu kliknięcia, więc zdjęcia od klientów dało się oglądać wyłącznie
// w rozmiarze kciuka.
test.describe("opinie ze zdjęciami — powiększanie", () => {
  test("klik w miniaturę otwiera lightbox, Esc go zamyka", async ({ page }) => {
    await page.goto("/opinie");

    // Celowo szukamy po samym <img>, a nie po markerze dodanym razem z poprawką:
    // inaczej na kodzie SPRZED niej test by się pomijał zamiast spaść, a wtedy
    // niczego nie dowodzi. Karta opinii nie ma innych <img> niż zdjęcia klienta
    // (gwiazdki to SVG).
    const miniatury = page.locator("[data-review-card] img");
    const liczba = await miniatury.count();
    test.skip(
      liczba === 0,
      "Baza nie ma zatwierdzonej opinii ZE ZDJĘCIEM — nie ma czego kliknąć."
    );

    const lightbox = page.getByRole("dialog");
    await expect(lightbox).toBeHidden();

    await miniatury.first().click();
    await expect(lightbox).toBeVisible();

    // Powiększone zdjęcie faktycznie się załadowało i jest większe niż miniatura
    // (72–200 px w karcie) — sam otwarty dialog niczego by nie dowodził.
    const duze = lightbox.locator("img").first();
    await expect
      .poll(() => duze.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    const szerokosc = await duze.evaluate((el) => el.getBoundingClientRect().width);
    expect(szerokosc).toBeGreaterThan(300);

    await page.keyboard.press("Escape");
    await expect(lightbox).toBeHidden();
  });
});
