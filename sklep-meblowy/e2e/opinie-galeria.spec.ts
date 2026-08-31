import { test, expect } from "@playwright/test";

// ⚠️ Baza jest WSPÓLNA z produkcją — ten spec NICZEGO nie zapisuje.
//
// Tryb „tylko zdjęcia" na /opinie: siatka zdjęć pogrupowana produktami,
// bez tekstu opinii, z lightboxem chodzącym po zdjęciach JEDNEGO produktu.
test.describe("opinie — tryb tylko zdjęcia", () => {
  test("przełącznik pokazuje same zdjęcia, bez cytatów", async ({ page }) => {
    await page.goto("/opinie");

    // Poczekaj, aż lista opinii w ogóle się wyrenderuje — `count()` nie czeka,
    // więc liczenie od razu po `goto` raz dawało 2, a raz 0 i test cicho się
    // pomijał.
    await expect(page.locator("[data-review-card]").first()).toBeVisible();

    // Pomijamy WYŁĄCZNIE z powodu danych (brak zdjęć w opiniach), nigdy
    // z powodu braku przełącznika — inaczej na kodzie bez tej funkcji test
    // grzecznie by się pominął zamiast spaść i niczego by nie pilnował.
    const zdjeciaWKartach = await page.locator("[data-review-card] img").count();
    test.skip(
      zdjeciaWKartach === 0,
      "Żadna zatwierdzona opinia nie ma zdjęcia — nie ma czego grupować."
    );
    const zakladkaZdjecia = page.getByRole("button", { name: "Tylko zdjęcia" });
    await expect(zakladkaZdjecia).toBeVisible();

    // Wyjście: normalna lista z cytatami.
    await expect(page.locator("[data-review-card] blockquote").first()).toBeVisible();

    await zakladkaZdjecia.click();

    // W trybie zdjęć znikają karty opinii (a z nimi cytaty), zostają kafelki.
    await expect(page.locator("[data-review-card]")).toHaveCount(0);
    const kafelki = page.locator("[data-gallery-photo]");
    expect(await kafelki.count()).toBeGreaterThan(0);

    // Każde zdjęcie w siatce realnie się ładuje.
    for (const img of await page.locator("[data-gallery-photo] img").all()) {
      await expect
        .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    }

    // Powrót na opinie działa w obie strony.
    await page.getByRole("button", { name: "Wszystkie opinie" }).click();
    await expect(page.locator("[data-review-card] blockquote").first()).toBeVisible();
  });

  test("klik w kafelek otwiera lightbox zawężony do jednego produktu", async ({ page }) => {
    await page.goto("/opinie");

    await expect(page.locator("[data-review-card]").first()).toBeVisible();
    test.skip(
      (await page.locator("[data-review-card] img").count()) === 0,
      "Żadna zatwierdzona opinia nie ma zdjęcia — nie ma czego grupować."
    );
    const zakladkaZdjecia = page.getByRole("button", { name: "Tylko zdjęcia" });
    await expect(zakladkaZdjecia).toBeVisible();
    await zakladkaZdjecia.click();

    // Bierzemy PIERWSZĄ sekcję produktu i liczymy jej kafelki — lightbox nie
    // może wyjść poza ten zbiór, bo po to jest grupowanie per produkt.
    const sekcja = page.locator("section:has([data-gallery-photo])").first();
    const wSekcji = await sekcja.locator("[data-gallery-photo]").count();

    await sekcja.locator("[data-gallery-photo]").first().click();
    const lightbox = page.getByRole("dialog");
    await expect(lightbox).toBeVisible();

    const duze = lightbox.locator("img").first();
    await expect
      .poll(() => duze.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);

    // Obejście pełnego cyklu strzałką wraca do zdjęcia startowego: gdyby
    // lightbox dostał zdjęcia WSZYSTKICH produktów, po `wSekcji` krokach
    // stałby na cudzym zdjęciu.
    const pierwszeZrodlo = await duze.getAttribute("src");
    if (wSekcji > 1) {
      for (let i = 0; i < wSekcji; i++) await page.keyboard.press("ArrowRight");
      await expect(duze).toHaveAttribute("src", pierwszeZrodlo!);
    }

    await page.keyboard.press("Escape");
    await expect(lightbox).toBeHidden();
  });
});
