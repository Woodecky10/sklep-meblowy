import { test, expect } from "@playwright/test";

// ⚠️ Ten spec CELOWO nie wysyła formularza. Baza jest wspólna z produkcją,
// więc udany zapis zostawiłby śmieć wśród prawdziwych opinii. Sprawdzamy
// wyłącznie odmowę — pełną ścieżkę zapisu przechodzi człowiek na prawdziwym
// zamówieniu.
//
// URUCHAMIANIE: ustaw E2E_BASE_URL na localhost i dodaj --no-deps. Bez
// E2E_BASE_URL playwright.config.ts celuje w PRODUKCJE (www.mollien.pl).
test("nieznany token nie otwiera formularza opinii", async ({ page }) => {
  const res = await page.goto("/opinia/000000000000000000000000000000000000000000000000000000000000dead");
  expect(res?.status()).toBe(404);
});
