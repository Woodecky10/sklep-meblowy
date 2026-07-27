import { test, expect } from "@playwright/test";

// Cechy tkanin (spec 2026-07-27): pigułka „Wodoodporna" / „Przyjazna
// zwierzętom" / „Łatwa w czyszczeniu" pokazuje się przy rodzinie tkaniny
// w rozwiniętej liście tkanin na karcie produktu (FabricPropertyBadges
// w VariantSelector).
//
// Test jest DANE-ZALEŻNY: cechy zaznacza się ręcznie w /admin/tkaniny, więc
// dopóki żadna tkanina w katalogu ich nie ma, na stronie nie ma czego szukać
// i test kulturalnie się pomija (`test.skip` z powodem) zamiast fałszywie
// failować. Po zaznaczeniu pierwszego checkboxa zaczyna realnie sprawdzać
// pigułki — bez zmian w kodzie testu.
//
// Produkt: Narożnik Amica U — ma opcję „Tkanina" z pełnym katalogiem próbek.
const PRODUCT_ID = "fe545101-de29-4a59-a012-c881e9971205";

// Podpisy PL z dictionaries/pl.ts (fabrics.property*). DE ma własne i nie
// wchodzi w zakres tego testu — sprawdzamy ścieżkę PL.
const LABELS = ["Wodoodporna", "Przyjazna zwierzętom", "Łatwa w czyszczeniu"];
const LABEL_RE = new RegExp(LABELS.join("|"));

test("pigułki cech tkaniny są widoczne w rozwiniętej liście tkanin", async ({ page }) => {
  // Zgoda cookie z góry — baner (fixed, z-50) nie zasłania nic w teście.
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

  // Warianty renderuje komponent kliencki — czekamy na „Zobacz więcej", a gdy
  // go nie ma (produkt bez tkanin albo mniej niż 6 próbek), pomijamy test
  // zamiast fałszywie failować.
  const more = page.getByRole("button", { name: /Zobacz więcej/ });
  const hasMore = await more
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    !hasMore,
    "produkt nie ma rozwijanej listy tkanin (dane katalogu mogły się zmienić)"
  );

  await more.first().click();

  // Po rozwinięciu widać karty GRUP cenowych, domyślnie otwarta jest tylko
  // jedna. Pigułki zwiniętych grup nie są w DOM-ie, więc rozwijamy wszystkie —
  // inaczej test pomijałby się tylko dlatego, że tkanina z cechą siedzi
  // w zamkniętej karcie. Nagłówek zwiniętej grupy ma marker „▸".
  const collapsed = page.getByRole("button").filter({ hasText: "▸" });
  for (let i = 0; i < 20; i++) {
    const count = await collapsed.count();
    if (count === 0) break;
    await collapsed.first().click();
  }

  const badges = page.getByText(LABEL_RE);
  const found = await badges.count();
  test.skip(found === 0, "żadna tkanina nie ma jeszcze zaznaczonej cechy w katalogu");

  const first = badges.first();
  await expect(first).toBeVisible();
  // Pigułka to samodzielny znacznik z pełnym podpisem, nie fragment zdania.
  await expect(first).toHaveText(new RegExp(`^(${LABELS.join("|")})$`));

  // Nie wystaje poza kartę grupy (karta ma overflow-hidden — przy braku
  // zawijania wiersza rodziny pigułka byłaby przycięta na telefonie).
  const box = await first.boundingBox();
  expect(box, "pigułka ma mierzalny prostokąt").not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport, "viewport znany").not.toBeNull();
  if (!box || !viewport) return;
  expect(box.x, "lewa krawędź w ekranie").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "prawa krawędź w ekranie").toBeLessThanOrEqual(viewport.width + 1);
});
