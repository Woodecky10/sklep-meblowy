import { test, expect } from "@playwright/test";

// Rozmiar do dopłat za tkaninę (projekt 2026-11-17). Spec tylko CZYTA: żadnego
// „Zapisz", „Dodaj" ani „Usuń", żadnej akcji serwera (baza wspólna z produkcją).
// Uruchamiać na buildzie lokalnym: E2E_BASE_URL=http://localhost:3000 --no-deps.
const PRODUCT = "115fe5b6-ec13-4589-ad88-8f238a921dd3"; // Fotel Montes — ma opcję „Tkanina"

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

test("panel tkanin pokazuje rozmiary mebli do dopłat i formularz dodawania", async ({ page }) => {
  await page.goto("/admin/tkaniny");
  await expect(
    page.getByRole("heading", { name: "Rozmiary mebli do dopłat za tkaninę" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dodaj rozmiar" })).toBeVisible();
});

test("edytor produktu ma pole „Rozmiar do dopłat za tkaninę” z opcją „Z kategorii:”", async ({
  page,
}) => {
  await page.goto(`/admin/produkty/${PRODUCT}`);
  test.skip(
    (await page.locator('input[value="Tkanina"]').count()) === 0,
    `produkt ${PRODUCT} nie ma dziś opcji „Tkanina"`
  );
  const select = page.getByLabel("Rozmiar do dopłat za tkaninę");
  await expect(select).toBeVisible();
  await expect(select.locator("option").first()).toHaveText(/^Z kategorii:/);
});

test("bez rozmiarów kwoty grup na karcie produktu = kwoty grup z /tkaniny", async ({ page }) => {
  await page.goto("/tkaniny");
  const expected = new Map<string, string>();
  const sections = page.locator("section").filter({ has: page.locator("h2") });
  for (const section of await sections.all()) {
    const name = norm(await section.locator("h2").first().innerText());
    const amount = norm(await section.locator("h2 + span").first().innerText());
    expected.set(name, amount);
  }
  test.skip(expected.size === 0, "/tkaniny nie pokazuje żadnej grupy");

  await page.goto(`/produkt/${PRODUCT}`);
  const container = page.getByTestId("fabric-groups");
  test.skip((await container.count()) === 0, "karta produktu nie ma grup tkanin");
  const headers = container.locator("> div > button");
  const n = await headers.count();
  expect(n).toBeGreaterThan(0);

  let compared = 0;
  for (let i = 0; i < n; i++) {
    const spans = headers.nth(i).locator("span");
    const label = norm(await spans.nth(0).innerText());
    const amount = norm(await spans.nth(1).innerText());
    if (!amount) continue; // grupa „Pozostałe" nie ma kwoty
    const want = expected.get(label);
    if (want === undefined) continue;
    expect(amount, `kwota grupy „${label}"`).toBe(want);
    compared++;
  }
  expect(compared).toBeGreaterThan(0);
});
