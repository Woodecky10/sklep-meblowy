import { Text } from "@react-email/components";
import type { Order } from "../../types";
import type { MailBranding } from "../branding";
import { MailButton, MailLayout } from "./_Layout";

const COPY = {
  pl: {
    preview: (nr: number) => `Zamówienie #${nr} jest w drodze`,
    heading: "Twoje zamówienie jest w drodze",
    intro: (nr: number) => `Zamówienie #${nr} zostało przekazane do transportu.`,
    carrier: "Przewoźnik",
    tracking: "Numer śledzenia",
    phone: "Firma transportowa skontaktuje się telefonicznie, aby ustalić termin dostawy.",
    cta: "Zobacz zamówienie",
    noAccount:
      "Zamówienie nie jest powiązane z kontem. Jeśli utworzysz konto na ten sam adres e-mail, zobaczysz w nim historię i status zamówienia.",
  },
  de: {
    preview: (nr: number) => `Bestellung #${nr} ist unterwegs`,
    heading: "Ihre Bestellung ist unterwegs",
    intro: (nr: number) => `Bestellung #${nr} wurde an den Transport übergeben.`,
    carrier: "Spediteur",
    tracking: "Sendungsnummer",
    phone: "Die Spedition ruft Sie an, um den Liefertermin zu vereinbaren.",
    cta: "Bestellung ansehen",
    noAccount:
      "Diese Bestellung ist nicht mit einem Konto verknüpft. Wenn Sie ein Konto mit derselben E-Mail-Adresse erstellen, sehen Sie darin den Bestellverlauf und -status.",
  },
} as const;

export function OrderShipped({
  order,
  branding,
  locale,
  orderUrl,
  hasAccount,
}: {
  order: Order;
  branding: MailBranding;
  locale: "pl" | "de";
  orderUrl: string;
  // Patrz komentarz w OrderConfirmation.tsx — gość (user_id = null) nie ma
  // dokąd wejść pod /konto/zamowienia/<id>, więc przycisk tylko dla kont.
  hasAccount: boolean;
}) {
  const t = COPY[locale];
  const c = branding.colors;
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
      locale={locale}
      preview={t.preview(order.order_number)}
      heading={t.heading}
    >
      <Text style={{ color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 24px" }}>
        {t.intro(order.order_number)}
      </Text>

      {order.carrier && (
        <>
          <Text style={labelStyle}>{t.carrier}</Text>
          <Text style={{ color: c.fg, fontSize: "14px", margin: "0 0 16px" }}>
            {order.carrier}
          </Text>
        </>
      )}
      {order.tracking_number && (
        <>
          <Text style={labelStyle}>{t.tracking}</Text>
          <Text style={{ color: c.fg, fontSize: "14px", margin: "0 0 16px" }}>
            {order.tracking_number}
          </Text>
        </>
      )}

      <Text style={{ color: c.muted, fontSize: "13px", lineHeight: "1.6", margin: "8px 0 24px" }}>
        {t.phone}
      </Text>

      {hasAccount ? (
        <MailButton branding={branding} href={orderUrl}>
          {t.cta}
        </MailButton>
      ) : (
        <Text style={{ color: c.muted, fontSize: "13px", lineHeight: "1.6", margin: 0 }}>
          {t.noAccount}
        </Text>
      )}
    </MailLayout>
  );
}
