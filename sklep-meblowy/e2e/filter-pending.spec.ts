import { test, expect } from "@playwright/test";

// Regresja płynności filtrów: po kliknięciu opcji tkaniny UI reaguje
// NATYCHMIAST (optymistyczne podświetlenie + aria-busy na kontenerze),
// zanim serwer odpowie. Dławimy odpowiedzi nawigacji z ?tkanina= o ~1,5 s,
// żeby okno pending było deterministycznie obserwowalne.
test("filtr tkaniny — natychmiastowy feedback przed odpowiedzią serwera", async ({ page }) => {
  await page.route("**/sklep*", async (route) => {
    if (route.request().url().includes("tkanina=")) {
      await new Promise((r) => setTimeout(r, 1500));
    }
    await route.continue();
  });

  await page.goto("/sklep");

  // Otwórz dropdown "Tkanina" i kliknij pierwszą opcję.
  await page.getByRole("button", { name: "Tkanina", exact: false }).first().click();
  const option = page
    .locator("div.flex.flex-wrap.gap-1\\.5 > button")
    .first();
  const optionLabel = (await option.textContent())?.trim() ?? "";
  await option.click();

  // NATYCHMIAST (przed upływem dławienia): kontener FilterBara w stanie busy
  // i kliknięta opcja optymistycznie aktywna (złote tło).
  const busy = page.locator('div[aria-busy="true"]');
  await expect(busy).toBeVisible({ timeout: 500 });
  await expect(option).toHaveClass(/bg-\[var\(--color-gold\)\]/, { timeout: 500 });

  // Po zatwierdzeniu nawigacji: URL niesie ?tkanina=, busy znika.
  await expect(page).toHaveURL(/tkanina=/, { timeout: 10_000 });
  await expect(page.locator('div[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
  expect(optionLabel.length).toBeGreaterThan(0);
});

// Regresja: nawigacja na IDENTYCZNY URL (ponowny klik aktywnego sortowania)
// nie może zostawić wiszącego wskaźnika pending.
test("ponowny klik aktywnej opcji sortowania — pending znika", async ({ page }) => {
  await page.goto("/sklep?sortuj=newest");
  await page.getByRole("button", { name: /sortuj/i }).first().click();
  // kliknij już-aktywną opcję "Najnowsze" w dropdownie sortowania (dopasowanie
  // dokładne odróżnia opcję "Najnowsze" od piguły wyzwalającej "Sortuj: Najnowsze").
  const active = page.getByRole("button", { name: "Najnowsze", exact: true });
  await active.click();
  // pending może się pojawić, ale MUSI zniknąć po zakończeniu transition
  await expect(page.locator('div[aria-busy="true"]')).toHaveCount(0, { timeout: 5000 });
});

// Krok A (2026-07-14): filtr wymiarów — wpisanie zakresu nawiguję po debounce
// (500 ms), URL niesie ?szer_od=, pending znika po zatwierdzeniu. Pill "Wymiary"
// renderuje się tylko gdy jakiś produkt ma wymiary (dane żywej bazy) — gdy
// brak, test się pomija zamiast fałszywie failować.
test("filtr wymiarów — zakres trafia do URL, pending znika", async ({ page }) => {
  await page.goto("/sklep");
  const pill = page.getByRole("button", { name: "Wymiary", exact: false });
  test.skip((await pill.count()) === 0, "brak produktów z wymiarami w bazie");
  await pill.first().click();
  // Jedyne widoczne inputy "od…" to panel wymiarów (panel ceny nie jest
  // zamontowany, gdy zamknięty) — pierwszy input = "Szerokość od".
  await page.getByPlaceholder(/^od/).first().fill("50");
  await expect(page).toHaveURL(/szer_od=50/, { timeout: 10_000 });
  await expect(page.locator('div[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
});
