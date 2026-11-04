import { test, expect } from "@playwright/test";

// Edytor wariantów w panelu — opcja „Tkanina" (decyzja właściciela 2026-11-04).
// Wcześniej każdy kolor był osobnym wierszem („Baloo 2071", „Baloo 2072"…),
// u Fotela Montes 480 wierszy. Teraz jedna zwinięta linia na tkaninę z katalogu:
// nazwa, grupa cenowa, liczba kolorów, dopłata dla całej tkaniny; kolory po
// rozwinięciu. Wpisywanie dowolnego tekstu w tej opcji wyłączone — tylko katalog.
//
// NIC NIE ZAPISUJE (baza wspólna z produkcją): zmiany zostają w pamięci
// przeglądarki, przycisku „Zapisz warianty" test nie dotyka.
const PRODUCT = "115fe5b6-ec13-4589-ad88-8f238a921dd3"; // Fotel Montes — 17 tkanin
const FABRIC = "Baloo";

test("tkaniny zwinięte do jednej linii, kolory po rozwinięciu, dopłata dla całej tkaniny", async ({
  page,
}) => {
  await page.goto(`/admin/produkty/${PRODUCT}`);
  const fabricOption = page
    .locator("div.rounded-xl")
    .filter({ has: page.locator('input[value="Tkanina"]') })
    .last();
  test.skip(
    (await page.locator('input[value="Tkanina"]').count()) === 0,
    `produkt ${PRODUCT} nie ma dziś opcji „Tkanina"`
  );

  // 1) Zwinięte: linie tkanin są, wierszy kolorów nie ma, pola tekstowego też nie.
  const groups = fabricOption.getByTestId("fabric-value-group");
  await expect(groups.first()).toBeVisible();
  expect(await groups.count()).toBeGreaterThan(1);
  await expect(fabricOption.getByLabel(/^Dopłata za Baloo \S+ \(zł\)$/)).toHaveCount(0);
  await expect(fabricOption.getByPlaceholder("np. Beżowy")).toHaveCount(0);
  await expect(fabricOption.getByRole("button", { name: "+ Dodaj tkaninę z katalogu" })).toBeVisible();

  // 2) Rozwinięcie pokazuje kolory jako same numery.
  const baloo = groups.filter({ has: page.getByRole("button", { name: new RegExp(`^${FABRIC}\\b`) }) });
  const toggle = baloo.getByRole("button", { name: new RegExp(`^${FABRIC}\\b`) });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const colorPrices = baloo.getByLabel(/^Dopłata za Baloo \S+ \(zł\)$/);
  expect(await colorPrices.count()).toBeGreaterThan(1);

  // 3) Dopłata przy tkaninie zmienia wszystkie jej kolory.
  const fabricPrice = baloo.getByLabel(`Dopłata za tkaninę ${FABRIC} (zł)`);
  await fabricPrice.fill("123");
  for (const input of await colorPrices.all()) await expect(input).toHaveValue("123");

  // 4) Inna dopłata jednego koloru → przy tkaninie „różne".
  await colorPrices.first().fill("7");
  await expect(fabricPrice).toHaveValue("");
  await expect(fabricPrice).toHaveAttribute("placeholder", "różne");

  // 5) Usunięcie całej tkaniny (po potwierdzeniu) zdejmuje jej linię.
  const before = await groups.count();
  await baloo.getByRole("button", { name: `Usuń tkaninę ${FABRIC}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Potwierdź" }).click();
  await expect(groups).toHaveCount(before - 1);
  await expect(page.getByText("Masz niezapisane zmiany w wariantach.")).toBeVisible();
});
