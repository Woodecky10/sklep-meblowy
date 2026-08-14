import { test, expect, type Page } from "@playwright/test";

// Regresja dwóch usterek świadomie zmergowanych z menu linków własnych (PR #128)
// — sekcja „DO POPRAWY" w docs/superpowers/plans/2026-08-07-menu-linki-wlasne.md.
// Obie dotyczą wygody pracy w panelu, nie tego, co widzi klient.
//
// ⚠️ OBA TESTY SĄ NIEZAPISUJĄCE — i to jest celowy warunek ich istnienia.
// Baza jest jedna dla wszystkich środowisk (localhost łączy się z produkcyjnym
// Supabase), więc test, który dodaje pozycję menu, zmienia nagłówek ŻYWEGO
// sklepu. Pierwszy test dodaje DUPLIKAT, który akcja odrzuca przed zapisem;
// drugi nie wychodzi poza stan formularza. Jeśli kiedyś dopiszesz tu przypadek
// udanego dodania, pamiętaj, że dotknie prawdziwego menu.
//
// Wymaga sesji admina (storageState z auth.setup + .env.e2e) — jak pozostałe
// testy panelu. Uruchamiaj z E2E_BASE_URL, inaczej polecą na produkcję.

// Zasiane migracją pozycje „navbar": /tkaniny, /o-nas, /kontakt.
const DUPLICATE_ROUTE = "/kontakt";
// Trasa spoza menu; jej kanoniczna etykieta („Sklep") różni się od „Kontakt”.
const OTHER_ROUTE = "/sklep";

// h3 „Menu główne" → dziadek to kontener sekcji navbar. Scope jest konieczny:
// druga sekcja („Stopka") ma identyczny formularz z tymi samymi etykietami.
function mainMenuSection(page: Page) {
  return page
    .getByRole("heading", { name: "Menu główne", exact: true })
    .locator("xpath=../..");
}

async function openCustomLinkForm(page: Page) {
  await page.goto("/admin/podstrony");
  await expect(page).not.toHaveURL(/\/logowanie/);
  const section = mainMenuSection(page);
  await section.getByRole("button", { name: "Link własny" }).click();
  return section;
}

test("odrzucone dodanie NIE czyści wpisanych pól", async ({ page }) => {
  const section = await openCustomLinkForm(page);
  const route = section.getByLabel("Strona sklepu");
  const label = section.getByLabel("Etykieta w menu");

  await route.selectOption(DUPLICATE_ROUTE);
  // Wybór trasy podpowiada etykietę — to zachowanie zostaje.
  await expect(label).toHaveValue("Kontakt");

  await section.getByRole("button", { name: /Dodaj/ }).click();

  // Akcja odbija duplikat (nic nie zapisuje)…
  await expect(page.locator('[data-toast-type="error"]')).toContainText(
    "już jest w tym menu"
  );
  // …a wpisane dane MUSZĄ zostać. Przed poprawką oba pola były tu puste
  // i trzeba było wystukać wszystko od nowa.
  await expect(route).toHaveValue(DUPLICATE_ROUTE);
  await expect(label).toHaveValue("Kontakt");
});

test("podpowiedź nie nadpisuje etykiety wpisanej ręcznie", async ({ page }) => {
  const section = await openCustomLinkForm(page);
  const route = section.getByLabel("Strona sklepu");
  const label = section.getByLabel("Etykieta w menu");

  // „Kontakt" jest jedną z kanonicznych nazw w MENU_ROUTES. Stary warunek
  // rozpoznawał pochodzenie etykiety przez porównanie WARTOŚCI z tą listą,
  // więc ręcznie wpisany tekst wyglądał jak własna podpowiedź i ginął.
  await label.fill("Kontakt");
  await route.selectOption(OTHER_ROUTE);

  await expect(label).toHaveValue("Kontakt");
});

test("podpowiedź nadal działa, gdy etykieta jest pusta", async ({ page }) => {
  // Kontrola, że poprawka nie zabiła samej podpowiedzi: puste pole + wybór
  // trasy = etykieta wypełniona. I dalej — druga zmiana trasy nadpisuje
  // podpowiedź, bo nadal pochodzi od nas, nie od administratorki.
  const section = await openCustomLinkForm(page);
  const route = section.getByLabel("Strona sklepu");
  const label = section.getByLabel("Etykieta w menu");

  await route.selectOption(OTHER_ROUTE);
  await expect(label).toHaveValue("Sklep");

  await route.selectOption(DUPLICATE_ROUTE);
  await expect(label).toHaveValue("Kontakt");
});
