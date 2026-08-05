import { test, expect } from "@playwright/test";

// Wstążka „Promocja" na zdjęciach. Dwie rzeczy, których nie pilnują testy
// jednostkowe: że wstążka faktycznie renderuje się na głównym zdjęciu karty
// produktu, i że NIE wchodzi do lightboxa (powiększone zdjęcie ma osobny
// <Image> w portalu — łatwo je przeoczyć przy zmianach w ImageGallery).
//
// Test zależy od DANYCH: wymaga produktu z aktywną promocją. Jeśli promocji nie
// ma, test się pomija z jasnym komunikatem — brak promocji w sklepie to decyzja
// biznesowa, nie regresja kodu, i nie ma czerwienić CI.
const PROMO_PRODUCT = "d1dc85bb-d019-4a8d-b890-40f04e311886";

test.describe("wstążka promocji", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/produkt/${PROMO_PRODUCT}`);
    const ribbon = page.getByText("Promocja", { exact: true });
    // Plakietka przy cenie ma ten sam napis, więc samo count() > 0 nie wystarcza
    // — czekamy, aż strona się wyrenderuje, i dopiero wtedy decydujemy.
    await expect(page.getByRole("button", { name: "Powiększ zdjęcie" }).first()).toBeVisible();
    test.skip(
      (await ribbon.count()) === 0,
      `produkt ${PROMO_PRODUCT} nie ma dziś aktywnej promocji — nie ma czego sprawdzać`
    );
  });

  test("jest na głównym zdjęciu, ale nie w lightboxie", async ({ page }) => {
    const hero = page.getByRole("button", { name: "Powiększ zdjęcie" }).first();
    // Wstążka siedzi WEWNĄTRZ klikalnego kontenera zdjęcia (to on ją przycina).
    await expect(hero.getByText("Promocja", { exact: true })).toBeVisible();

    await hero.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Promocja", { exact: true })).toHaveCount(0);
  });

  test("jest na kaflu listingu razem z przekreśloną ceną i etykietą Omnibusu", async ({ page }) => {
    await page.goto("/sklep?kategoria=materace-nawierzchniowe");
    const kafel = page
      .locator("div.relative")
      .filter({ has: page.locator(`a[href*="${PROMO_PRODUCT}"]`) })
      .first();
    await expect(kafel.getByText("Promocja", { exact: true })).toBeVisible();

    // Omnibus: ogłaszając obniżkę musimy pokazać najniższą cenę z 30 dni.
    await expect(page.getByText(/Najniższa cena z 30 dni przed obniżką/).first()).toBeVisible();
  });
});
