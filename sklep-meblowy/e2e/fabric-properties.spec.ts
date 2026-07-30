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
  // Wąski viewport LOKALNIE dla tego testu (globalny projekt to Desktop Chrome
  // 1280×720). Regresja, której pilnuje asercja na końcu, występuje wyłącznie
  // przy ciasnym wierszu rodziny tkaniny — na 1280 px nazwa + „szczegóły" +
  // dymek + trzy pigułki mieszczą się w jednym wierszu i nic się nie przycina.
  await page.setViewportSize({ width: 390, height: 844 });

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

  // Warianty renderuje komponent kliencki — czekamy na karty grup cenowych
  // (od 2026-07-30 widoczne OD WEJŚCIA, bez kroku „Zobacz więcej"), a gdy ich
  // nie ma (produkt bez tkanin z katalogu), pomijamy test zamiast fałszywie
  // failować.
  const groupCards = page.getByTestId("fabric-groups");
  const hasGroups = await groupCards
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    !hasGroups,
    "produkt nie ma kart grup tkanin (dane katalogu mogły się zmienić)"
  );

  // Karty grup startują zwinięte. Pigułki zwiniętych grup nie są w DOM-ie,
  // więc rozwijamy wszystkie — inaczej test pomijałby się tylko dlatego, że
  // tkanina z cechą siedzi w zamkniętej karcie. Nagłówek zwiniętej grupy ma
  // marker „▸".
  const collapsed = page.getByRole("button").filter({ hasText: "▸" });
  for (let i = 0; i < 20; i++) {
    const count = await collapsed.count();
    if (count === 0) break;
    await collapsed.first().click();
  }

  // Szukamy WYŁĄCZNIE w rozwiniętej liście tkanin (kontener z data-testid
  // w VariantSelector). `getByText` dopasowuje podłańcuchowo, a te same frazy
  // naturalnie występują w treści produktu — wystarczy wiersz specyfikacji
  // „Łatwa w czyszczeniu" nad selektorem, żeby `first()` trafił w niego
  // i asercja na pełny podpis poleciała z mylącym komunikatem.
  const badges = page.getByTestId("fabric-groups").getByText(LABEL_RE);
  const found = await badges.count();
  test.skip(found === 0, "żadna tkanina nie ma jeszcze zaznaczonej cechy w katalogu");

  const first = badges.first();
  await expect(first).toBeVisible();
  // Pigułka to samodzielny znacznik z pełnym podpisem, nie fragment zdania.
  await expect(first).toHaveText(new RegExp(`^(${LABELS.join("|")})$`));

  // Co dokładnie sprawdza asercja niżej: ŻADNA pigułka nie wychodzi w poziomie
  // poza kartę grupy cenowej, czyli poza swój najbliższy przodek z
  // `overflow-hidden` (VariantSelector.tsx:409). To granica, na której treść
  // jest realnie ucinana — dlatego mierzymy względem KARTY, nie viewportu:
  // przycięcie przez overflow-hidden nie zmienia getBoundingClientRect()
  // dziecka, więc porównanie z ekranem przepuszcza ucięcie kartą. Granicą jest
  // padding-box karty (prostokąt bez ramki). O pionie asercja nie mówi nic.
  //
  // To niezmiennik, którego pilnują zawijania wprowadzone w 2b048276 (wiersz
  // rodziny) i w samym FabricPropertyBadges (kontener pigułek). UWAGA na skalę
  // ochrony: przy krótkiej nazwie rodziny nawet bez tych zawijań pigułki wciąż
  // się mieszczą (wewnętrzne kontenery flex potrafią się skurczyć), więc test
  // NIE gwarantuje wykrycia każdego cofnięcia `flex-wrap` — łapie dopiero stan,
  // w którym pigułka faktycznie wyjeżdża poza kartę (dłuższe nazwy rodzin,
  // węższe karty, dłuższe podpisy cech). Mierzone są WSZYSTKIE pigułki, bo
  // wypada zwykle ostatnia w wierszu, nie pierwsza.
  const clips = await badges.evaluateAll((els) =>
    els.map((el) => {
      // Najbliższy przodek, który faktycznie przycina w poziomie (overflowX
      // inne niż `visible`). Dla pigułki w rozwiniętej liście to karta grupy.
      let node = el.parentElement;
      while (node && getComputedStyle(node).overflowX === "visible") {
        node = node.parentElement;
      }
      if (!node) return null;
      const style = getComputedStyle(node);
      const badge = el.getBoundingClientRect();
      const clipper = node.getBoundingClientRect();
      return {
        text: (el.textContent ?? "").trim(),
        overflowRight:
          // Padding-box: krawędź border-boxa minus ramka — tam tnie overflow.
          badge.right - (clipper.right - parseFloat(style.borderRightWidth || "0")),
        overflowLeft: clipper.left + parseFloat(style.borderLeftWidth || "0") - badge.left,
      };
    })
  );
  const measured = clips.filter((c) => c !== null);
  expect(measured.length, "każda pigułka ma przodka przycinającego treść (karta grupy)").toBe(
    clips.length
  );
  const worstRight = measured.reduce((acc, c) => (c.overflowRight > acc.overflowRight ? c : acc));
  const worstLeft = measured.reduce((acc, c) => (c.overflowLeft > acc.overflowLeft ? c : acc));
  expect(
    worstRight.overflowRight,
    `pigułka „${worstRight.text}" wychodzi poza prawą krawędź karty grupy (wiersz się nie zawija)`
  ).toBeLessThanOrEqual(1);
  expect(
    worstLeft.overflowLeft,
    `pigułka „${worstLeft.text}" wychodzi poza lewą krawędź karty grupy`
  ).toBeLessThanOrEqual(1);
});
