import { test, expect } from "@playwright/test";

// Regresja zapisu kategorii produktu w edytorze (sekcja „Podstawowe dane").
//
// Bug (naprawiony): formularz używał <form action={fn}>. React 19 po zakończeniu
// akcji formularza robi automatyczny form.reset(), który cofał niekontrolowany
// <select name="category"> do wartości z mountu. Admin zmieniał kategorię, zapis
// do DB przechodził, ale select wizualnie wracał do starej kategorii — a kolejny
// „Zapisz" odsyłał starą kategorię i NADPISYWAŁ nową w bazie.
//
// Fix: onSubmit + preventDefault (React nie woła wtedy form.reset()). Ten test
// pilnuje, że po zapisie select trzyma nową kategorię — i przed reloadem (regresja
// auto-resetu), i po reloadzie (potwierdzenie zapisu w DB).
//
// Samowystarczalny: tworzy produkt testowy i usuwa go w afterEach (także po failu),
// żeby nie zostawiać śladów w danych.
test.describe("zapis kategorii produktu", () => {
  // Ustawiane po utworzeniu produktu → afterEach ma co sprzątać nawet po failu.
  let createdProductName: string | null = null;

  test.afterEach(async ({ page }) => {
    if (!createdProductName) return;
    const name = createdProductName;
    createdProductName = null;

    // Usuwanie żyje na liście /admin/produkty (DeleteProductButton), nie w edytorze.
    await page.goto("/admin/produkty");
    const deleteBtn = page.getByRole("button", { name: `Usuń produkt ${name}` });
    if ((await deleteBtn.count()) === 0) return; // nie powstał / już usunięty

    await deleteBtn.first().click();
    // Potwierdzenie w ConfirmDialog (role=alertdialog, przycisk domyślny „Potwierdź").
    await page.getByRole("alertdialog").getByRole("button", { name: "Potwierdź" }).click();
    // Po router.refresh() produkt znika z listy.
    await expect(
      page.getByRole("button", { name: `Usuń produkt ${name}` })
    ).toHaveCount(0, { timeout: 15_000 });
  });

  test("zmiana kategorii nie cofa się po zapisie (bez reloadu i po reloadzie)", async ({
    page,
  }) => {
    const name = `E2E kategoria ${Date.now()}`;

    // 1) Utwórz produkt przez /admin/produkty/nowy (pierwsza dostępna kategoria).
    await page.goto("/admin/produkty/nowy");
    await page.fill('input[name="name"]', name);
    await page.fill('input[name="price"]', "1");

    const createSelect = page.locator('select[name="category"]');
    // Indeks 0 to disabled placeholder „— wybierz kategorię —"; bierzemy pierwszą realną.
    const firstCat = await createSelect
      .locator("option:not([disabled])")
      .first()
      .getAttribute("value");
    expect(
      firstCat,
      "brak kategorii w systemie — nie da się utworzyć produktu testowego"
    ).toBeTruthy();
    await createSelect.selectOption(firstCat!);

    // Od tego momentu afterEach musi posprzątać (nawet gdy dalej coś padnie).
    createdProductName = name;
    await page.getByRole("button", { name: "Utwórz produkt" }).click();

    // 2) Redirect do edytora utworzonego produktu.
    await expect(page).toHaveURL(/\/admin\/produkty\/[0-9a-f-]+$/, { timeout: 15_000 });

    // Sekcja „Podstawowe dane" startuje rozwinięta; select kategorii jest unikalny
    // na stronie edytora (jedyny <select name="category">).
    const editSelect = page.locator('select[name="category"]');
    await expect(editSelect).toBeVisible();

    // Aktualna wartość + jakakolwiek INNA opcja z tego selecta.
    const current = await editSelect.inputValue();
    const values = await editSelect
      .locator("option")
      .evaluateAll((opts) =>
        opts
          .map((o) => (o as HTMLOptionElement).value)
          .filter((v) => v.length > 0)
      );
    const other = values.find((v) => v !== current);
    test.skip(!other, "system ma tylko jedną kategorię — brak innej opcji do wyboru");

    // 3) Zmień kategorię na inną i zapisz sekcję.
    await editSelect.selectOption(other!);
    await expect(editSelect).toHaveValue(other!);
    await page.getByRole("button", { name: "Zapisz podstawowe dane" }).click();

    // Toast sukcesu potwierdza, że akcja przeszła.
    await expect(page.locator('[data-toast-type="success"]')).toBeVisible();

    // 4) KLUCZOWA asercja regresji: BEZ przeładowania select trzyma nową kategorię
    //    (przed fixem auto-reset cofał go do starej wartości z mountu).
    await expect(editSelect).toHaveValue(other!);

    // 5) Po reloadzie nadal nowa kategoria → zapis faktycznie utrwalony w DB.
    await page.reload();
    await expect(page.locator('select[name="category"]')).toHaveValue(other!);
  });
});
