import { Fragment } from "react";
import { Text } from "@react-email/components";
import type { MailBranding } from "../branding";
import { MailButton, MailLayout } from "./_Layout";

// Mail do klienta, który kupił POZA sklepem (Allegro, OLX, …). Od 2026-09-09
// wysyła go WYŁĄCZNIE pracownica, przyciskiem na karcie zamówienia — automatu
// (przejście na „W realizacji", zapis zamówienia za pobraniem) już nie ma.
//
// Szablon nie zna zamówienia i niczego o nim nie twierdzi: CAŁA treść
// przychodzi w `body` z pola tekstowego w panelu (propozycję generuje
// buildAcceptedMailBody, app/_lib/order-accepted-mail.ts). Tutaj zostaje sama
// ramka — nazwa firmy, nagłówek, przycisk do sklepu i stopka — bo to ona
// robi z wiadomości mail od Mollien, a nie zwykłą notatkę.
//
// Tylko PL — zamówienia zewnętrzne są wyłącznie polskie.
export const EXTERNAL_ORDER_ACCEPTED_SUBJECT = "Dziękujemy za zamówienie – Mollien 🤍";

// Treść → akapity. Pusta linia (także z białymi znakami) zaczyna nowy akapit,
// pojedyncze złamanie linii zostaje złamaniem WEWNĄTRZ akapitu — dzięki temu
// lista pozycji trzyma się razem, a nie rozłazi na osobne bloki z odstępami.
function toParagraphs(body: string): string[][] {
  return body
    .split(/\r?\n[ \t]*\r?\n/)
    .map((block) => block.split(/\r?\n/))
    .filter((lines) => lines.some((line) => line.trim() !== ""));
}

export function ExternalOrderAccepted({
  body,
  branding,
  shopUrl,
}: {
  // Zwykły TEKST wpisany w panelu. React Email escapuje go przy renderze,
  // więc znaczniki HTML z pola tekstowego trafiają do maila jako napis —
  // pracownica pisze treść, nie kod.
  body: string;
  branding: MailBranding;
  // Strona główna sklepu (NEXT_PUBLIC_APP_URL) — cel przycisku „Odwiedź sklep".
  shopUrl: string;
}) {
  const c = branding.colors;
  const p = { color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 16px" };
  const paragraphs = toParagraphs(body);

  return (
    <MailLayout
      branding={branding}
      locale="pl"
      preview="Dziękujemy za zakup i wybór Mollien"
      heading="Dziękujemy za zamówienie"
    >
      {paragraphs.map((lines, i) => (
        <Text key={i} style={i === paragraphs.length - 1 ? { ...p, margin: "0 0 20px" } : p}>
          {lines.map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {line}
            </Fragment>
          ))}
        </Text>
      ))}
      {/* Przycisk poza <Text>, jak w OrderShipped — <Button> ma własny blok. */}
      <MailButton branding={branding} href={shopUrl}>
        👉 Odwiedź sklep Mollien
      </MailButton>
    </MailLayout>
  );
}
