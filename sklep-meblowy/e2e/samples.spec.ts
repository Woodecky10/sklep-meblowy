import { test, expect } from "@playwright/test";

// Guard bramki logowania na zamawianiu probek (spec 2026-08-01).
// Darmowa pula bez tozsamosci jest nieograniczona (liczy sie per znormalizowany
// e-mail), wiec /probki MUSI odsylac niezalogowanego na logowanie — i MUSI
// zachowac wybrana tkanine, bo to miejsce, w ktorym gubi sie leady.
//
// URUCHAMIANIE: E2E_BASE_URL na localhost + --no-deps. Bez E2E_BASE_URL
// playwright.config.ts celuje w PRODUKCJE (www.mollien.pl), a projekt
// "chromium" zalezy od projektu "setup", ktory wymaga danych z .env.e2e.
//
// ⚠️ ZAKRES: testy sa WYLACZNIE ODCZYTOWE i koncza sie na bramce logowania —
// serwer dev chodzi po PRODUKCYJNEJ bazie, wiec zadne zamowienie tu nie
// powstaje. Zachowania po zalogowaniu (Enter w wyszukiwarce nie wysyla
// formularza, przycisk nieaktywny przy pustym wyborze) NIE SA tu pokryte:
// wymagaja sesji, a repo nie ma poswiadczen e2e ani renderera komponentow
// (@testing-library/react). Pilnuje ich — TEKSTOWO, nie behawioralnie —
// app/probki/__tests__/sample-form-guards.test.ts.

const SLUG = "testowa-tkanina";
const BACK = `/probki?tkanina=${SLUG}`;

// Adres logowania Z KOTWICA hosta: bez niej `/logowanie` dopasowaloby tez
// `/de/logowanie`, czyli przejscie na inna wersje jezykowa przeszloby jako
// sukces (a /probki jest PL-only).
const LOGIN_URL = /^https?:\/\/[^/]+\/logowanie(\?|$)/;

// ⚠️ TEN PLIK MUSI CHODZIC BEZ SESJI. Projekt "chromium" wstrzykuje
// storageState z e2e/.auth/admin.json — dzis pusty, bo nie ma .env.e2e, ale na
// maszynie z poswiadczeniami projekt "setup" zapisze tam sesje ADMINA. Admin ma
// user.email, wiec /probki NIE przekieruje i caly ten guard zapalilby sie na
// czerwono przy zdrowej aplikacji. Czyscimy stan na poziomie pliku.
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  // Zgoda cookie z gory — baner (fixed, z-50) nie zaslania nic w tescie.
  // ⚠️ `version: 1` jest obowiazkowe: getConsent() odrzuca wpis bez zgodnej
  // wersji i baner mimo wszystko sie wyrenderuje.
  await page.addInitScript(() => {
    localStorage.setItem(
      "mollien.cookie-consent",
      JSON.stringify({
        necessary: true,
        analytics: false,
        marketing: false,
        version: 1,
        decidedAt: new Date().toISOString(),
      })
    );
  });
});

test("niezalogowany trafia na logowanie z zachowana tkanina", async ({ page }) => {
  await page.goto(BACK);

  await expect(page).toHaveURL(LOGIN_URL);
  const url = new URL(page.url());
  const next = url.searchParams.get("next");
  expect(next).toBe(BACK);

  // ⚠️ Surowy adres, nie tylko odczyt przez searchParams: bez
  // encodeURIComponent `?tkanina=` byloby OSOBNYM parametrem logowania, a nie
  // czescia `next`. Przy jednym parametrze odczyt i tak by przeszedl (URL
  // tnie na pierwszym `&`), wiec sama asercja wyzej tego nie wylapie.
  expect(page.url()).toContain(`next=${encodeURIComponent(BACK)}`);
});

test("goly adres /probki tez odsyla na logowanie", async ({ page }) => {
  await page.goto("/probki");
  await expect(page).toHaveURL(LOGIN_URL);
});

// Sam parametr `next` w adresie to za malo: lead wraca do wybranej tkaniny
// tylko wtedy, gdy ta sciezka dojedzie do OBU drog logowania (Google i e-mail).
// Po drodze przechodzi przez safeNextPath, ktore odrzuca wszystko, co nie jest
// lokalna sciezka — regres w tym miejscu jest cichy: logowanie dziala, tylko
// klient laduje na /konto z pustym wyborem.
test("wybrana tkanina dojezdza do obu formularzy logowania", async ({ page }) => {
  await page.goto(BACK);
  await expect(page).toHaveURL(LOGIN_URL);

  const hidden = page.locator('input[type="hidden"][name="next"]');
  await expect(hidden).toHaveCount(2); // Google + e-mail
  await expect(hidden.first()).toHaveValue(BACK);
  await expect(hidden.last()).toHaveValue(BACK);

  // Klient odeslany z probek widzi POWOD, a nie goly formularz.
  await expect(page.getByText(/Zamawianie próbek wymaga zalogowania/)).toBeVisible();
});
