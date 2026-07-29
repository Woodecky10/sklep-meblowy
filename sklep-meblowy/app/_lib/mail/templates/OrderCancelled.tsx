import { Text } from "@react-email/components";
import { formatOrderAmount } from "../../money";
import { COMPANY } from "../../company";
import type { Order } from "../../types";
import type { MailBranding } from "../branding";
import { MailLayout } from "./_Layout";

const COPY = {
  pl: {
    preview: (nr: number) => `Zamówienie #${nr} zostało anulowane`,
    heading: "Zamówienie anulowane",
    intro: (nr: number) => `Zamówienie #${nr} zostało anulowane.`,
    // Nie obiecujemy automatycznego zwrotu — zwroty robi się ręcznie
    // po stronie operatora płatności (patrz spec).
    refund: (amount: string) =>
      `Zamówienie było opłacone (${amount}). Skontaktujemy się z Tobą w sprawie zwrotu środków.`,
    // Odpowiedź na maila nie może być JEDYNĄ drogą kontaktu: mollien.pl nie ma
    // rekordów MX, więc bez działającego MAIL_REPLY_TO odpowiedź się odbija —
    // a trafia to do klienta, któremu właśnie anulowano zamówienie.
    questions: (email: string) =>
      `Jeśli to pomyłka albo masz pytania — odpowiedz na tę wiadomość albo napisz na ${email}.`,
  },
  de: {
    preview: (nr: number) => `Bestellung #${nr} wurde storniert`,
    heading: "Bestellung storniert",
    intro: (nr: number) => `Bestellung #${nr} wurde storniert.`,
    refund: (amount: string) =>
      `Die Bestellung war bezahlt (${amount}). Wir melden uns bei Ihnen wegen der Rückerstattung.`,
    questions: (email: string) =>
      `Falls das ein Versehen ist oder Sie Fragen haben — antworten Sie auf diese E-Mail oder schreiben Sie an ${email}.`,
  },
} as const;

export function OrderCancelled({
  order,
  branding,
  locale,
  wasPaid,
}: {
  order: Order;
  branding: MailBranding;
  locale: "pl" | "de";
  // Czy zamówienie było opłacone PRZED anulowaniem — status jest już
  // "cancelled", więc tej informacji nie da się odczytać z samego zamówienia.
  wasPaid: boolean;
}) {
  const t = COPY[locale];
  const c = branding.colors;

  return (
    <MailLayout
      branding={branding}
      locale={locale}
      preview={t.preview(order.order_number)}
      heading={t.heading}
    >
      <Text style={{ color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 16px" }}>
        {t.intro(order.order_number)}
      </Text>
      {wasPaid && (
        <Text style={{ color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 16px" }}>
          {t.refund(formatOrderAmount(Number(order.total), order.currency))}
        </Text>
      )}
      <Text style={{ color: c.muted, fontSize: "13px", lineHeight: "1.6", margin: 0 }}>
        {t.questions(COMPANY.email)}
      </Text>
    </MailLayout>
  );
}
