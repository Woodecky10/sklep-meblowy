import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import { brandingFromRaw } from "../mail/branding";
import {
  ExternalOrderAccepted,
  EXTERNAL_ORDER_ACCEPTED_SUBJECT,
} from "../mail/templates/ExternalOrderAccepted";

// Od 2026-09-09 szablon nie zna zamówienia: CAŁA treść przychodzi z pola
// tekstowego na karcie zamówienia (pracownica może ją dowolnie zmienić),
// a szablon dokłada wyłącznie ramkę — logo, przycisk do sklepu i stopkę.
async function html(body: string) {
  return render(
    ExternalOrderAccepted({
      body,
      branding: brandingFromRaw(null),
      shopUrl: "https://www.mollien.pl",
    })
  );
}

describe("ExternalOrderAccepted", () => {
  it("temat dokładnie jak w zgłoszeniu właściciela (półpauza, białe serce)", () => {
    expect(EXTERNAL_ORDER_ACCEPTED_SUBJECT).toBe("Dziękujemy za zamówienie – Mollien 🤍");
  });

  it("drukuje treść wpisaną przez pracownicę — słowo w słowo", async () => {
    const out = await html("Dzień dobry,\n\nzamówienie przyjęte. Realizacja do 10 dni.");

    expect(out).toContain("zamówienie przyjęte. Realizacja do 10 dni.");
    // Czas realizacji NIE jest już wpisany na sztywno w szablonie — jeśli
    // pracownica napisała „10 dni", w mailu nie może wyjść „21 dni roboczych".
    expect(out).not.toContain("21 dni roboczych");
  });

  it("pusta linia rozdziela akapity — każdy w osobnym <p>", async () => {
    const out = await html("Pierwszy akapit.\n\nDrugi akapit.");

    const paragraphs = out.match(/<p[^>]*>/g) ?? [];
    // Ramka też ma swoje <p> (nazwa firmy, nagłówek, stopka) — liczy się to,
    // że oba akapity treści są osobnymi blokami, a nie jednym zlepkiem.
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(out).not.toContain("Pierwszy akapit. Drugi akapit.");
    expect(out).toContain("Pierwszy akapit.");
    expect(out).toContain("Drugi akapit.");
  });

  it("pojedyncze złamanie linii (lista pozycji) zostaje złamaniem, nie nowym akapitem", async () => {
    const out = await html("Zamówienie obejmuje:\n- Sofa Porto\n- Puf MONTES");

    expect(out).toContain("<br");
    expect(out).toContain("- Sofa Porto");
    expect(out).toContain("- Puf MONTES");
  });

  it("treść jest TEKSTEM, nie HTML-em — znaczniki są escapowane, nie wykonywane", async () => {
    const out = await html('Uwaga <script>alert("x")</script> i <b>pogrubienie</b>');

    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<b>pogrubienie</b>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("ramka zostaje: nazwa firmy, nagłówek i przycisk „Odwiedź sklep Mollien”", async () => {
    const out = await html("Dzień dobry,");

    expect(out).toContain("Mollien");
    expect(out).toContain("Dziękujemy za zamówienie");
    expect(out).toContain("Odwiedź sklep Mollien");
    expect(out).toContain('href="https://www.mollien.pl"');
  });

  it("pusta treść nie wywraca renderu — ramka i tak się wyświetli", async () => {
    const out = await html("   ");

    expect(out).toContain("Odwiedź sklep Mollien");
  });
});
