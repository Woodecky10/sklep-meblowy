import { Hr, Row, Column, Section, Text } from "@react-email/components";
import { formatOrderAmount } from "../../money";
import { formatVariantLabel } from "../../variants";
import type { Order, OrderItem } from "../../types";
import type { MailBranding } from "../branding";
import { MailButton, MailLayout } from "./_Layout";

const COPY = {
  pl: {
    preview: (nr: number) => `Zamówienie #${nr} przyjęte`,
    heading: "Dziękujemy za zamówienie",
    intro: (nr: number) =>
      `Przyjęliśmy Twoje zamówienie numer #${nr}. Poniżej podsumowanie.`,
    items: "Zamówione produkty",
    products: "Produkty",
    bundleDiscount: "Rabat za zestaw",
    promoDiscount: "Rabat",
    totalPaid: "Zapłacono",
    totalCod: "Do zapłaty przy odbiorze",
    address: "Adres dostawy",
    cta: "Zobacz zamówienie",
    next: "Skontaktujemy się telefonicznie, aby ustalić termin dostawy.",
    variantsFor: "Wybrane opcje",
    notes: "Uwagi",
    noAccount:
      "Zamówienie nie jest powiązane z kontem. Jeśli utworzysz konto na ten sam adres e-mail, zobaczysz w nim historię i status zamówienia.",
  },
  de: {
    preview: (nr: number) => `Bestellung #${nr} angenommen`,
    heading: "Vielen Dank für Ihre Bestellung",
    intro: (nr: number) =>
      `Wir haben Ihre Bestellung Nummer #${nr} erhalten. Hier ist die Zusammenfassung.`,
    items: "Bestellte Produkte",
    products: "Produkte",
    bundleDiscount: "Set-Rabatt",
    promoDiscount: "Rabatt",
    totalPaid: "Bezahlt",
    totalCod: "Bei Lieferung zu zahlen",
    address: "Lieferadresse",
    cta: "Bestellung ansehen",
    next: "Wir rufen Sie an, um den Liefertermin zu vereinbaren.",
    variantsFor: "Gewählte Optionen",
    notes: "Anmerkungen",
    noAccount:
      "Diese Bestellung ist nicht mit einem Konto verknüpft. Wenn Sie ein Konto mit derselben E-Mail-Adresse erstellen, sehen Sie darin den Bestellverlauf und -status.",
  },
} as const;

export function OrderConfirmation({
  order,
  items,
  branding,
  locale,
  orderUrl,
  hasAccount,
}: {
  order: Order;
  items: OrderItem[];
  branding: MailBranding;
  locale: "pl" | "de";
  orderUrl: string;
  // Gościnne zamówienia (user_id = null) nie mają dokąd zaprowadzić:
  // /konto/zamowienia/<id> wymaga sesji i filtruje po user_id, więc
  // niezalogowany klik ląduje na gołym /logowanie. Przycisk tylko dla kont.
  hasAccount: boolean;
}) {
  const t = COPY[locale];
  const c = branding.colors;
  const cur = order.currency;
  const isCod = order.payment_method === "cod";

  const subtotal = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
  const bundleDiscount = Number(order.bundle_discount ?? 0);
  const promoDiscount = Number(order.promo_discount ?? 0);
  const addr = order.shipping_address;

  const rowStyle = { color: c.muted, fontSize: "13px", margin: "0 0 4px" };
  const labelStyle = {
    color: c.goldText,
    fontSize: "10px",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
    margin: "0 0 8px",
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

      <Text style={labelStyle}>{t.items}</Text>
      {items.map((item) => (
        <Section key={item.id} style={{ margin: "0 0 12px" }}>
          <Text style={{ color: c.fg, fontSize: "14px", fontWeight: 600, margin: 0 }}>
            {item.product?.name ?? "Produkt"}
            {item.bundle_label ? ` (${item.bundle_label})` : ""}
          </Text>
          {item.variant_values && (
            <Text style={rowStyle}>
              {t.variantsFor}: {formatVariantLabel(item.variant_values, locale)}
            </Text>
          )}
          {item.notes && (
            <Text style={rowStyle}>
              {t.notes}: {item.notes}
            </Text>
          )}
          {/* Ilosc x cena jednostkowa po lewej, suma pozycji po prawej — tak samo
              jak w szczegolach zamowienia w panelu admina. Bez sumy pozycji klient
              przy ilosci > 1 musi mnozyc w glowie, zeby zweryfikowac wiersz
              "Produkty". Pokazywana zawsze, takze przy jednej sztuce: spojna
              kolumna kwot czyta sie jak rachunek, warunek robilby dziury. */}
          <Row>
            <Column>
              <Text style={{ ...rowStyle, margin: 0 }}>
                {item.quantity} × {formatOrderAmount(Number(item.price), cur)}
              </Text>
            </Column>
            <Column align="right">
              <Text
                style={{
                  color: c.fg,
                  fontSize: "13px",
                  fontWeight: 600,
                  margin: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {formatOrderAmount(Number(item.price) * item.quantity, cur)}
              </Text>
            </Column>
          </Row>
        </Section>
      ))}

      <Hr style={{ borderColor: c.border, margin: "16px 0" }} />

      <Row>
        <Column>
          <Text style={rowStyle}>{t.products}</Text>
        </Column>
        <Column align="right">
          <Text style={rowStyle}>{formatOrderAmount(subtotal, cur)}</Text>
        </Column>
      </Row>
      {bundleDiscount > 0 && (
        <Row>
          <Column>
            <Text style={rowStyle}>{t.bundleDiscount}</Text>
          </Column>
          <Column align="right">
            <Text style={rowStyle}>−{formatOrderAmount(bundleDiscount, cur)}</Text>
          </Column>
        </Row>
      )}
      {promoDiscount > 0 && (
        <Row>
          <Column>
            <Text style={rowStyle}>{t.promoDiscount}</Text>
          </Column>
          <Column align="right">
            <Text style={rowStyle}>−{formatOrderAmount(promoDiscount, cur)}</Text>
          </Column>
        </Row>
      )}
      <Row>
        <Column>
          <Text style={{ color: c.fg, fontSize: "15px", fontWeight: 700, margin: "8px 0 0" }}>
            {isCod ? t.totalCod : t.totalPaid}
          </Text>
        </Column>
        <Column align="right">
          <Text style={{ color: c.fg, fontSize: "15px", fontWeight: 700, margin: "8px 0 0" }}>
            {formatOrderAmount(Number(order.total), cur)}
          </Text>
        </Column>
      </Row>

      <Hr style={{ borderColor: c.border, margin: "24px 0 16px" }} />

      <Text style={labelStyle}>{t.address}</Text>
      <Text style={{ color: c.fg, fontSize: "13px", lineHeight: "1.6", margin: "0 0 24px" }}>
        {addr?.fullname ? `${addr.fullname}, ` : ""}
        {addr?.street}, {addr?.postal_code} {addr?.city}
      </Text>

      <Text style={{ color: c.muted, fontSize: "13px", lineHeight: "1.6", margin: "0 0 24px" }}>
        {t.next}
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
