import { test, expect } from "@playwright/test";

// Behawioralny guard jedynego <h1> strony głównej (spec 2026-08-31).
// Test jednostkowy app/_lib/__tests__/home-h1.test.ts czyta ŹRÓDŁO — łapie
// usunięcie nagłówka z kodu, ale nie zobaczy stanów, które robi DANE i panel:
// dwa widoczne wiersze hero w `page_blocks` albo hero przeciągnięty w dół
// w /admin/wyglad. Tu liczymy h1 w wyrenderowanym DOM.
//
// ⚠️ Ten spec NIC nie zapisuje — baza jest wspólna z produkcją.
//
// URUCHAMIANIE: ustaw E2E_BASE_URL na localhost i dodaj --no-deps. Bez
// E2E_BASE_URL playwright.config.ts celuje w PRODUKCJE (www.mollien.pl).

// Treść pochodzi z `home.h1` w app/_lib/dictionaries/pl.ts (e2e nie importuje
// kodu aplikacji — patrz pozostałe spece). Przy zmianie słownika popraw tutaj;
// samą treść pod frazy z Search Console pilnuje test jednostkowy.
const H1 = "Sklep internetowy z meblami tapicerowanymi od polskiego producenta";

test("strona główna ma dokładnie jeden widoczny h1", async ({ page }) => {
  await page.goto("/");

  const h1 = page.locator("h1");
  // Dokładnie jeden — zero znaczy, że nagłówek znowu zniknął (było
  // 2026-08-17), więcej niż jeden rozmywa sygnał dla wyszukiwarki.
  await expect(h1).toHaveCount(1);
  // Widoczny, nie `sr-only`/`hidden` — ukryty tekst Google traktuje jak
  // cloaking, a przy okazji to jedyne zdanie mówiące, czym jest sklep.
  await expect(h1).toBeVisible();
  await expect(h1).toHaveText(H1);
});
