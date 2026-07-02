import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/admin.json";

// Logowanie kontem admina raz → zapis sesji do storageState, reużywanej przez
// testy responsywności. Dane z .env.e2e (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD).
setup("logowanie admina", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Brak danych logowania. Uzupełnij .env.e2e (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD)."
    );
  }

  await page.goto("/logowanie");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: /Zaloguj się|Anmelden/i }).click();

  // Poczekaj aż logowanie się rozstrzygnie (redirect po sukcesie albo błąd).
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  // 1) Wciąż na /logowanie → złe dane logowania.
  if (/\/logowanie/.test(page.url())) {
    const formText = (await page.locator("form").last().innerText().catch(() => "")).slice(0, 200);
    throw new Error(
      `Logowanie nieudane — nadal na /logowanie. Najpewniej złe E2E_ADMIN_EMAIL/PASSWORD.\nKomunikat formularza: ${formText}`
    );
  }

  // 2) Zalogowano — sprawdź dostęp do panelu.
  await page.goto("/admin");
  if (/\/logowanie/.test(page.url())) {
    throw new Error(
      `Zalogowano jako ${email}, ale to konto NIE ma dostępu do /admin (brak roli admin). ` +
        `Podaj w .env.e2e dane konta z rolą admin.`
    );
  }
  await expect(page.locator('aside a[href="/admin/zamowienia"]')).toBeVisible();

  await page.context().storageState({ path: authFile });
});
