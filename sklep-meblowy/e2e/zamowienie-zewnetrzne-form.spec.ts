import { test, expect } from "@playwright/test";

// Formularz „Dodaj zamówienie" (zamówienia spoza sklepu) — spec 2026-09-02.
//
// ⚠️ TEST JEST NIEZAPISUJĄCY i to warunek jego istnienia: baza jest jedna dla
// wszystkich środowisk (localhost łączy się z produkcyjnym Supabase), więc klik
// w „Zapisz zamówienie" dodałby PRAWDZIWE zamówienie z numerem na liście
// i wysłałby maile przy zmianie statusu. Sprawdzamy wyłącznie stan formularza:
// wyszukiwarkę, dodanie wiersza z podpowiedzianą ceną, przeliczenie sumy
// i pole „Nazwa źródła" przy „Inne".
//
// Wymaga sesji admina (storageState z auth.setup + .env.e2e). Uruchamiaj
// z E2E_BASE_URL na buildzie (`npm run build && PORT=3100 npm run start`).

test("wyszukiwarka dodaje wiersz z ceną, suma się przelicza, „Zapisz” NIE jest klikane", async ({ page }) => {
  await page.goto("/admin/zamowienia/nowe");
  await expect(page).not.toHaveURL(/\/logowanie/);
  await expect(page.getByRole("heading", { name: "Dodaj zamówienie" })).toBeVisible();

  // Przycisk zapisu zablokowany bez pozycji.
  const save = page.getByRole("button", { name: "Zapisz zamówienie" });
  await expect(save).toBeDisabled();

  // Szukaj po fragmencie — lista produktów w sklepie zmienia się, więc
  // bierzemy pierwszy wynik dla samogłoski, nie konkretną nazwę.
  await page.getByPlaceholder("Szukaj produktu…").fill("a");
  const results = page.getByLabel("Wyniki wyszukiwania").getByRole("button");
  await expect(results.first()).toBeVisible();
  // Pierwszy <span> w przycisku to nazwa produktu (drugi to „u nas: cena”).
  const firstName = (await results.first().locator("span").first().innerText()).trim();
  await results.first().click();

  const rows = page.getByLabel("Pozycje zamówienia").getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(firstName);

  // Cena podpowiedziana ze sklepu → nadpisujemy ceną „z Allegro" z przecinkiem.
  const price = rows.first().getByLabel("Cena (zł)");
  await expect(price).not.toHaveValue("");
  await price.fill("1 299,50");
  await rows.first().getByLabel("Ilość").fill("2");
  await expect(page.getByTestId("external-order-total")).toContainText("2599");

  // Z pozycją przycisk jest aktywny — ale NIE KLIKAMY (żywa baza).
  await expect(save).toBeEnabled();

  // „Inne" odsłania wymagane pole nazwy.
  await page.getByLabel("Skąd przyszło zamówienie").selectOption("Inne");
  await expect(page.getByLabel("Nazwa źródła")).toBeVisible();

  await page.screenshot({ path: "e2e/screens/zamowienie-zewnetrzne-form.png", fullPage: true });
});

// Zgłoszenie pracownicy 2026-09-09 — dwa braki naprawione w tej samej sesji.
// Ten test też NIE ZAPISUJE: sprawdza wyłącznie, że formularz daje się ustawić
// na pobranie i przyjmuje pozycję spoza katalogu.
test("pobranie i pozycja spoza katalogu — formularz przyjmuje oba, „Zapisz” NIE jest klikane", async ({
  page,
}) => {
  await page.goto("/admin/zamowienia/nowe");
  await expect(page).not.toHaveURL(/\/logowanie/);
  await expect(page.getByRole("heading", { name: "Dodaj zamówienie" })).toBeVisible();

  // Domyślnie „Opłacone w źródle" — tak działał formularz przed tą zmianą
  // i taka jest większość zamówień z marketplace'ów.
  const oplacone = page.getByRole("radio", { name: /Opłacone w źródle/ });
  const pobranie = page.getByRole("radio", { name: /Płatność przy odbiorze/ });
  await expect(oplacone).toBeChecked();
  await expect(pobranie).not.toBeChecked();

  await pobranie.check();
  await expect(pobranie).toBeChecked();
  await expect(oplacone).not.toBeChecked();

  // Pozycja spoza katalogu: wiersz z pustą nazwą do wpisania, bez wyszukiwarki.
  const save = page.getByRole("button", { name: "Zapisz zamówienie" });
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "+ Pozycja spoza katalogu" }).click();

  const rows = page.getByLabel("Pozycje zamówienia").getByRole("listitem");
  await expect(rows).toHaveCount(1);
  const nazwa = rows.first().getByLabel("Nazwa pozycji");
  await expect(nazwa).toHaveValue("");
  await nazwa.fill("Pufa Vena, tkanina Rico 12");

  // Cena bez podpowiedzi — nie ma jej skąd wziąć; ta sama walidacja co zawsze.
  await rows.first().getByLabel("Cena (zł)").fill("250,00");
  await rows.first().getByLabel("Ilość").fill("2");
  await expect(page.getByTestId("external-order-total")).toContainText("500");

  await expect(save).toBeEnabled();

  await page.screenshot({
    path: "e2e/screens/zamowienie-zewnetrzne-pobranie-custom.png",
    fullPage: true,
  });
});
