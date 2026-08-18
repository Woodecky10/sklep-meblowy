import { test, expect } from "@playwright/test";

// Klikniecie w etykiete pola NIE MOZE zmieniac tresci edytora.
//
// Zgloszenie wlascicielki (2026-08-18): "edytowalam tkanine i jak kliknelam
// poza obszar edytora, to sie pogrubila". Przyczyna: Field owijal zawartosc
// w <label>, a <label> bez `for` aktywuje PIERWSZY etykietowalny element
// potomka. `input type="hidden"` etykietowalny nie jest, wiec pierwszym byl
// przycisk "Pogrubienie" z paska narzedzi RichTextEditora.
//
// URUCHAMIANIE: ustaw E2E_BASE_URL na localhost i dodaj --no-deps. Bez
// E2E_BASE_URL playwright.config.ts celuje w PRODUKCJE (www.mollien.pl).
//
// Test jest WYLACZNIE czytajacy: otwiera formularz i klika, ale NIGDY nie
// zapisuje - baza jest wspolna z produkcja.

test("klikniecie w etykiete pola nie zmienia tresci edytora", async ({ page }) => {
  await page.goto("/admin/tkaniny");

  await page.getByRole("button", { name: "Edytuj", exact: true }).first().click();

  const edytor = page.locator('[contenteditable="true"]').first();
  await expect(edytor).toBeVisible({ timeout: 15000 });

  // Zaznaczenie CALEJ tresci - to jest stan, w ktorym usterka bolala najbardziej:
  // jeden klik obok zmienial formatowanie calego opisu.
  await edytor.click();
  await page.keyboard.press("ControlOrMeta+a");

  const przed = await edytor.innerHTML();
  expect(przed.length).toBeGreaterThan(0);

  // Napis etykiety - wizualnie POZA edytorem, ale wewnatrz tego samego <label>,
  // dopoki Field nie dostanie `composite`.
  await page.getByText("Opis", { exact: true }).first().click();
  await page.waitForTimeout(400);

  // Asercja na CALEJ tresci, nie na samym <strong>: klikniecie obok nie ma
  // prawa zmienic NICZEGO. Wersja szukajaca tylko pogrubienia przepuscilaby
  // ten sam blad, gdyby pierwszym przyciskiem paska zostala kiedys kursywa
  // albo "wyczysc formatowanie".
  expect(await edytor.innerHTML()).toBe(przed);

  // I druga strona tej samej monety: pasek nie moze uznac, ze wlasnie wlaczono
  // pogrubienie. Aktywny przycisk ma klase z granatowym tlem (btn(active)).
  const bold = page.getByRole("button", { name: "Pogrubienie" }).first();
  await expect(bold).not.toHaveClass(/bg-\[var\(--color-navy\)\]/);
});
