import { test, expect } from "@playwright/test";

// ⚠️ Baza jest WSPÓLNA z produkcją — ten spec NICZEGO nie zapisuje.
// Sprawdza wyłącznie to, co da się sprawdzić odczytem: że strony renderujące
// opinie nie wywalają się na kodzie czytającym `photos`. To jest test na
// FAIL-SOFT przed migracją 79 (kolumny nie ma → pole jest undefined),
// czyli dokładnie na scenariusz, który wystąpi na produkcji między
// deployem a migracją, gdyby ktoś odwrócił kolejność.
test.describe("opinie ze zdjęciami — odczyt", () => {
  test("strona główna renderuje się mimo braku kolumny photos", async ({ page }) => {
    const bledy: string[] = [];
    page.on("pageerror", (e) => bledy.push(e.message));
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("footer")).toBeVisible();
    expect(bledy).toEqual([]);
  });

  test("/opinie renderuje się i nie zgłasza błędów", async ({ page }) => {
    const bledy: string[] = [];
    page.on("pageerror", (e) => bledy.push(e.message));
    const res = await page.goto("/opinie");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    expect(bledy).toEqual([]);
  });
});
