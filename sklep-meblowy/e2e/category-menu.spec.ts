import { test, expect } from "@playwright/test";

// Guard megamenu kategorii (migracja 68 — drzewo bez limitu głębokości).
//
// Test jest odporny na to, JAK Ola ułoży drzewo: nie zna nazw kategorii ani
// liczby poziomów. Pilnuje trzech rzeczy, które muszą być prawdziwe zawsze:
// 1. pasek pokazuje co najmniej jedną pozycję kategorii,
// 2. wszystkie linki kategorii w nagłówku prowadzą przez ?kategoria=,
//    a nie przez legacy ?sekcja= (te zostają obsłużone, ale nie generowane),
// 3. panel rozwijany ma skrót „wszystkie" do listingu całego poddrzewa.
test.describe("megamenu kategorii", () => {
  test("pasek linkuje przez ?kategoria= i ma skrót do całego poddrzewa", async ({
    page,
  }) => {
    await page.goto("/");

    const header = page.locator("header");
    const categoryLinks = header.locator('a[href*="/sklep?kategoria="]');
    await expect(categoryLinks.first()).toHaveCount(1, { timeout: 15_000 });

    // Żadna pozycja paska nie generuje już legacy ?sekcja=.
    await expect(header.locator('a[href*="/sklep?sekcja="]')).toHaveCount(0);

    // Pierwsza pozycja paska: hover otwiera panel ze skrótem „wszystkie …".
    const firstTrigger = categoryLinks.first();
    const rootHref = await firstTrigger.getAttribute("href");
    expect(rootHref).toBeTruthy();
    await firstTrigger.hover();

    // Skrót w panelu prowadzi do tego samego listingu co nagłówek pozycji.
    await expect(
      header.locator(`a[href="${rootHref}"]`).nth(1)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("listing kategorii z paska odpowiada i pokazuje nagłówek", async ({ page }) => {
    await page.goto("/");
    const first = page.locator('header a[href*="/sklep?kategoria="]').first();
    const href = await first.getAttribute("href");
    await page.goto(href!);
    await expect(page.locator("h1")).toBeVisible();
    // Legacy alias musi dawać tę samą stronę co nowy parametr.
    const slug = new URL(href!, "http://x").searchParams.get("kategoria")!;
    const viaKategoria = await page.locator("h1").textContent();
    await page.goto(`/sklep?sekcja=${slug}`);
    await expect(page.locator("h1")).toHaveText(viaKategoria!.trim());
  });
});
