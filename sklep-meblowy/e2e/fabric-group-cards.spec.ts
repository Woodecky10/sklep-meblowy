import { test, expect } from "@playwright/test";

// Wybor tkaniny na karcie produktu:
// - karty grup cenowych widoczne OD WEJSCIA, wszystkie zwiniete - bez kroku
//   posredniego "5 probek + Zobacz wiecej" (korekta wlasciciela 2026-07-30);
// - w otwartej grupie KAZDA TKANINA jest zwinieta: wiersz z nazwa, cechami
//   i pastylka "N kolorow", a probki kolorow pokazuja sie dopiero po kliku
//   (decyzja wlasciciela 2026-10-29: na telefonie grupa Standard to bylo
//   ~150 kolek i 5400 px przewijania do ostatniej tkaniny).
//
// URUCHAMIANIE: ustaw E2E_BASE_URL na localhost i dodaj --no-deps. Bez
// E2E_BASE_URL playwright.config.ts celuje w PRODUKCJE (www.mollien.pl).
//
// Produkt: Naroznik Amica U - ma opcje "Tkanina" z pelnym katalogiem probek
// (ten sam co w fabric-properties.spec.ts).
const PRODUCT_ID = "fe545101-de29-4a59-a012-c881e9971205";

// Pastylka tkaniny: liczba + polska liczba mnoga ("1 kolor", "2 kolory",
// "16 kolorow"). Bez kotwicy ^: w filtrze `hasText` tekst przycisku zaczyna
// sie od nazwy tkaniny ("Inari 16 kolorow").
const COLORS_PILL_RE = /\d+ kolor(y|ow|ów)?/;

// Przycisk tkaniny = ten z pastylka "N kolorow". Samo `button[aria-expanded]`
// to za malo: tak samo oznaczone sa naglowki grup i dymki "i" (ValueInfoTip).
const fabricToggles = (groups: import("@playwright/test").Locator) =>
  groups.locator("button[aria-expanded]").filter({ hasText: COLORS_PILL_RE });

test.beforeEach(async ({ page }) => {
  // Zgoda cookie z gory - baner (fixed, z-50) nie zaslania nic w tescie.
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
  await page.goto(`/produkt/${PRODUCT_ID}`);
});

test("karty grup widoczne od wejscia, wszystkie zwiniete, bez Zobacz wiecej", async ({ page }) => {
  const groups = page.getByTestId("fabric-groups");
  await expect(groups).toBeVisible();

  // Wszystkie naglowki grup zwiniete (aria-expanded=false).
  const headers = groups.locator("button[aria-expanded]");
  const count = await headers.count();
  expect(count).toBeGreaterThan(0);
  await expect(groups.locator("button[aria-expanded='true']")).toHaveCount(0);

  // Krok posredni zniknal: w bloku tkanin nie ma przycisku "Zobacz wiecej"
  // ani "Zobacz mniej".
  await expect(groups.getByRole("button", { name: /Zobacz (wiecej|więcej|mniej)/ })).toHaveCount(0);
});

test("klik w naglowek otwiera tylko te grupe, a tkaniny w niej sa zwiniete", async ({ page }) => {
  const groups = page.getByTestId("fabric-groups");
  const headers = groups.locator("button[aria-expanded]");
  await expect(headers.first()).toBeVisible();

  await headers.first().click();

  await expect(headers.first()).toHaveAttribute("aria-expanded", "true");
  await expect(groups.locator("button[aria-expanded='true']")).toHaveCount(1);

  // W otwartej grupie NIE widac jeszcze zadnej probki koloru - tkaniny sa
  // zwiniete, kazda ma wlasny przycisk rozwijania.
  await expect(groups.locator("[aria-pressed]")).toHaveCount(0);
  const fabricButtons = fabricToggles(groups);
  expect(await fabricButtons.count()).toBeGreaterThan(0);

  // Ponowny klik zwija grupe razem z lista tkanin.
  await headers.first().click();
  await expect(groups.locator("button[aria-expanded='true']")).toHaveCount(0);
  await expect(fabricButtons).toHaveCount(0);
});

test("tkanina ma pastylke z liczba kolorow, klik pokazuje probki, drugi klik chowa", async ({ page }) => {
  const groups = page.getByTestId("fabric-groups");
  const header = groups.locator("button[aria-expanded]").first();
  await header.click();

  // Liczba tkanin w naglowku grupy = liczba przyciskow tkanin w srodku.
  const headerCount = Number((await header.innerText()).match(/\b(\d+)\b/)?.[1]);
  const fabricButtons = fabricToggles(groups);
  await expect(fabricButtons).toHaveCount(headerCount);

  // Kazdy przycisk tkaniny niesie pastylke "N kolorow".
  const first = fabricButtons.first();
  const pill = first.getByText(COLORS_PILL_RE).first();
  await expect(pill).toBeVisible();
  const declared = Number((await pill.innerText()).match(/(\d+)/)?.[1]);
  expect(declared).toBeGreaterThan(0);

  // Klik w tkanine pokazuje dokladnie tyle probek, ile obiecuje pastylka.
  await first.click();
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await expect(groups.locator("[aria-pressed]")).toHaveCount(declared);

  // Wybor koloru nie zwija tkaniny - wybrana probka zostaje na ekranie.
  await groups.locator("[aria-pressed='false']").first().click();
  await expect(groups.locator("[aria-pressed='true']")).toHaveCount(1);
  await expect(first).toHaveAttribute("aria-expanded", "true");

  // Drugi klik w tkanine chowa probki.
  await first.click();
  await expect(groups.locator("[aria-pressed]")).toHaveCount(0);
});
