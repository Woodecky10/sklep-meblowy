import { test, expect } from "@playwright/test";

// Panel → Zestawy → edycja: pole „Zdjęcie zestawu" (migracja 85, właściciel
// 2026-11-04). Wgrane zdjęcie zastępuje mozaikę na kafelku zestawu (home,
// /zestawy) — tę część pilnuje test jednostkowy bundle-tiles.test.ts.
//
// NIC NIE ZAPISUJE (baza wspólna z produkcją): plik wybieramy, oglądamy
// podgląd i wychodzimy „Anuluj". Przycisku „Zapisz zestaw" test nie dotyka.

// 1×1 px PNG — mniejszy niż próg kompresji (800 KB), więc idzie bez zmian.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test("zdjęcie zestawu: podgląd po wybraniu, usunięcie, HEIC odrzucony od razu", async ({ page }) => {
  await page.goto("/admin/zestawy");
  const edit = page.getByRole("button", { name: "Edytuj" }).first();
  test.skip((await edit.count()) === 0, "brak zestawów w panelu");
  await edit.click();

  const input = page.getByLabel("Wybierz zdjęcie zestawu");
  await expect(input).toBeAttached();
  const preview = page.getByAltText("Podgląd zdjęcia zestawu");

  // 1) Wybrany plik → podgląd w kadrze kafelka + informacja, że zapisze się dopiero po zapisie.
  await input.setInputFiles({ name: "zestaw.png", mimeType: "image/png", buffer: PNG_1PX });
  await expect(preview).toBeVisible();
  await expect(page.getByText(/Nowe zdjęcie zapisze się po kliknięciu/)).toBeVisible();

  // 2) „Usuń zdjęcie" → podgląd znika.
  await page.getByRole("button", { name: "Usuń zdjęcie" }).click();
  await expect(page.getByText(/Nowe zdjęcie zapisze się/)).toHaveCount(0);
  await expect(preview).toHaveCount(0);

  // 3) HEIC (iPhone) → jasny komunikat od razu, bez podglądu.
  await input.setInputFiles({ name: "IMG_0001.heic", mimeType: "image/heic", buffer: Buffer.from("heic") });
  await expect(page.getByText(/Tego formatu nie da się wgrać/)).toBeVisible();
  await expect(page.getByText(/Nowe zdjęcie zapisze się/)).toHaveCount(0);

  // Wyjście bez zapisu.
  await page.getByRole("button", { name: "Anuluj" }).click();
  await expect(page.getByRole("button", { name: "+ Nowy zestaw" })).toBeVisible();
});
