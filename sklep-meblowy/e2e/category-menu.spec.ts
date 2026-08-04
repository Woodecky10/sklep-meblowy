import { test, expect } from "@playwright/test";

// Guard megamenu kategorii (migracja 68 — drzewo bez limitu głębokości).
//
// Test jest odporny na to, JAK Ola ułoży drzewo: nie zna nazw kategorii, nie
// zna liczby poziomów i NIE ZAKŁADA, który konkretnie korzeń ma podkategorie —
// szuka dowolnego korzenia z duplikatem href (trigger + skrót w panelu), a nie
// bierze pierwszego z sort_order. Jedyne założenie: że w CAŁYM drzewie istnieje
// przynajmniej jeden korzeń z dziećmi — to jest właśnie scenariusz, który ma
// pilnować (panel „wszystkie…"), więc jeśli akurat to przestanie być prawdą
// (drzewo całkiem spłaszczone), test słusznie się o to potknie.
// Pilnuje trzech rzeczy, które muszą być prawdziwe zawsze:
// 1. pasek pokazuje co najmniej jedną pozycję kategorii,
// 2. wszystkie linki kategorii w nagłówku prowadzą przez ?kategoria=,
//    a nie przez legacy ?sekcja= (te zostają obsłużone, ale nie generowane),
// 3. panel rozwijany ma skrót „wszystkie" do listingu całego poddrzewa —
//    dla przynajmniej jednego korzenia z dziećmi, niezależnie od tego, który
//    to korzeń.
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

    // Panel „wszystkie…" duplikuje href korzenia (trigger w pasku + link
    // w panelu) — ale TYLKO dla korzeni, które mają dzieci (NavStrip.tsx
    // renderuje panel warunkowo na root.children.length > 0). Nie wiemy,
    // KTÓRY korzeń to jest, więc sprawdzamy wszystkie unikalne hrefy i
    // szukamy choćby jednego z duplikatem — bez przesądzania pozycji.
    const hrefs = await categoryLinks.evaluateAll((els) =>
      Array.from(
        new Set(
          els.map((el) => el.getAttribute("href")).filter((h): h is string => !!h)
        )
      )
    );
    expect(hrefs.length, "brak żadnego linku kategorii w headerze").toBeGreaterThan(0);

    let rootWithChildrenHref: string | null = null;
    for (const href of hrefs) {
      const count = await header.locator(`a[href="${href}"]`).count();
      if (count >= 2) {
        rootWithChildrenHref = href;
        break;
      }
    }
    expect(
      rootWithChildrenHref,
      "żaden korzeń paska nie ma podkategorii — brak duplikatu href (trigger + skrót w panelu)"
    ).toBeTruthy();

    // Hover na trigger TEGO korzenia (ten z duplikatem) otwiera panel — skrót
    // w panelu prowadzi do tego samego listingu co nagłówek pozycji.
    await header.locator(`a[href="${rootWithChildrenHref}"]`).first().hover();
    await expect(
      header.locator(`a[href="${rootWithChildrenHref}"]`).nth(1)
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
