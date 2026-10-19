import { Link, Text } from "@react-email/components";
import { COMPANY } from "../../company";
import { shortSampleOrderRef } from "../../sample-pricing";
import type { SampleOrder, SampleOrderItem } from "../../types";
import type { MailBranding } from "../branding";
import { MailLayout } from "./_Layout";

// Treść podana przez właścicielkę (2026-10-19), słowo w słowo. Dołożone od nas
// są tylko lista próbek i numer nadania — numer wpisuje się w panelu przy
// „Wysłane", więc bez niego w mailu to pole nie trafiałoby do nikogo.
// Kontakt bierzemy z COMPANY, żeby zmiana adresu była w jednym miejscu.
// PL-only (patrz SampleOrderConfirmation.tsx).
export function SampleOrderSent({
  order,
  items,
  branding,
  siteUrl,
}: {
  order: SampleOrder;
  items: SampleOrderItem[];
  branding: MailBranding;
  siteUrl: string;
}) {
  const c = branding.colors;
  const ref = shortSampleOrderRef(order.id);
  const tracking = (order.tracking ?? "").trim();
  const textStyle = { color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 16px" };
  const linkStyle = { color: c.fg, textDecoration: "underline" };
  const labelStyle = {
    color: c.goldText,
    fontSize: "10px",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
    margin: "0 0 4px",
  };

  return (
    <MailLayout
      branding={branding}
      locale="pl"
      preview={`Próbki ${ref} są w drodze`}
      heading="Twoje próbki są w drodze"
    >
      <Text style={textStyle}>Dzień dobry,</Text>
      <Text style={textStyle}>
        miło nam poinformować, że zamówione próbki tkanin zostały wysłane! 😊
      </Text>

      <Text style={{ ...labelStyle, margin: "8px 0 4px" }}>W kopercie</Text>
      {items.map((item) => (
        <Text key={item.id} style={{ color: c.fg, fontSize: "14px", margin: "0 0 4px" }}>
          {item.fabric_name} {item.color}
        </Text>
      ))}

      {/* Numer nadania jest opcjonalny: próbki jadą zwykłą kopertą, która często
          żadnego numeru nie ma (patrz markSampleSent w app/admin/probki/actions.ts).
          Bez numeru nie pokazujemy pustej etykiety. */}
      {tracking ? (
        <>
          <Text style={{ ...labelStyle, margin: "16px 0 4px" }}>Numer nadania</Text>
          <Text style={{ color: c.fg, fontSize: "14px", margin: "0 0 4px" }}>{tracking}</Text>
        </>
      ) : null}

      <Text style={{ ...textStyle, margin: "24px 0 16px" }}>
        Mamy nadzieję, że pomogą Państwu w wyborze odpowiedniego materiału i koloru, który
        będzie idealnie pasował do wnętrza.
      </Text>
      <Text style={textStyle}>
        W razie jakichkolwiek pytań dotyczących tkanin, produktów lub składania zamówienia
        zapraszamy do kontaktu:
      </Text>
      <Text style={textStyle}>
        📧 E-mail:{" "}
        <Link href={`mailto:${COMPANY.email}`} style={linkStyle}>
          {COMPANY.email}
        </Link>
        {COMPANY.phone ? (
          <>
            <br />
            📞 Telefon:{" "}
            <Link href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} style={linkStyle}>
              {COMPANY.phone}
            </Link>
          </>
        ) : null}
      </Text>
      <Text style={textStyle}>Chętnie pomożemy w wyborze odpowiedniego mebla i tkaniny.</Text>
      <Text style={textStyle}>
        Dziękujemy za zainteresowanie ofertą Mollien i życzymy udanego wyboru!
      </Text>
      <Text style={{ ...textStyle, margin: 0 }}>
        Pozdrawiamy serdecznie,
        <br />
        Zespół Mollien
        <br />
        <Link href={siteUrl} style={linkStyle}>
          www.{COMPANY.domain}
        </Link>
      </Text>
    </MailLayout>
  );
}
