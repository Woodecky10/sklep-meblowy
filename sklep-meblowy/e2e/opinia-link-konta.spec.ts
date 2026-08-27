import { expect, test } from "@playwright/test";

// Zgłoszenie z 2026-08-27: „po kliknięciu «Wystaw opinię» nic się nie dzieje".
// Mail dla zamówienia Z KONTEM prowadził na goły /produkt/<id>#opinie, a formularz
// w tej sekcji renderuje się wyłącznie zalogowanemu — klient bez sesji widział
// notkę i żadnego pola. Teraz link prowadzi na logowanie z adresem powrotu.
const PRODUKT = "1105e534-b424-4809-81f5-4896fe22c14a";
const POWROT = `/produkt/${PRODUKT}#opinie`;
const LINK_Z_MAILA = `/logowanie?next=${encodeURIComponent(POWROT)}`;

test.describe("link opinii dla zamówienia z kontem", () => {
  test.describe("klient bez sesji (tak klika się z maila)", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("dostaje logowanie z adresem powrotu na sekcję opinii", async ({ page }) => {
      await page.goto(LINK_Z_MAILA);
      await expect(page).toHaveURL(/\/logowanie\?next=/);
      // Ukryte pole niesie cel powrotu do akcji logowania (nextFromForm).
      await expect(page.locator('input[name="next"]').first()).toHaveValue(POWROT);
    });
  });

  test("klient z sesją idzie PROSTO na sekcję opinii, nie na /konto", async ({ page }) => {
    await page.goto(LINK_Z_MAILA);
    await expect(page).toHaveURL(new RegExp(`/produkt/${PRODUKT}`));
  });
});
