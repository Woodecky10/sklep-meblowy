import { Hr, Text } from "@react-email/components";
import { formatPrice } from "../../format";
import { shortSampleOrderRef } from "../../sample-pricing";
import type { SampleOrder, SampleOrderItem } from "../../types";
import type { MailBranding } from "../branding";
import { MailButton, MailLayout } from "./_Layout";

// PL-only, bez mapy COPY jak w OrderConfirmation: /probki jest zamrożone dla
// /de (DE_ENABLED), a próbki są PLN-only. Dodanie niemieckiego to dołożenie
// słownika tutaj — nie ma tu żadnej innej gałęzi językowej do rozplątania.
export function SampleOrderConfirmation({
  order,
  items,
  branding,
  orderUrl,
}: {
  order: SampleOrder;
  items: SampleOrderItem[];
  branding: MailBranding;
  orderUrl: string;
}) {
  const c = branding.colors;
  const ref = shortSampleOrderRef(order.id);
  const addr = order.shipping_address ?? {};
  const amount = Number(order.amount_total);
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
      locale="pl"
      preview={`Zamówienie próbek ${ref} przyjęte`}
      heading="Dziękujemy za zamówienie próbek"
    >
      <Text style={{ color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 24px" }}>
        Przyjęliśmy Twoje zamówienie próbek numer {ref}. Poniżej podsumowanie.
      </Text>

      <Text style={labelStyle}>Zamówione próbki</Text>
      {items.map((item) => (
        <Text key={item.id} style={rowStyle}>
          {item.fabric_name} {item.color} —{" "}
          {item.is_free ? "gratis" : formatPrice(Number(item.unit_price), "pl")}
        </Text>
      ))}

      <Hr style={{ borderColor: c.border, margin: "16px 0" }} />

      {/* Dwie różne prawdy o pieniądzach, nie jedno zdanie z liczbą 0 zł.
          Zamówienie w całości z darmowej puli nie ma płatności, a to
          potwierdzenie zamówienia płatnego wychodzi DOPIERO po rozliczeniu
          notyfikacji P24 (sample-notify.ts), więc „zaksięgowaliśmy" jest tu
          zdaniem prawdziwym, a nie obietnicą. */}
      <Text style={{ color: c.fg, fontSize: "15px", fontWeight: 700, margin: "0 0 8px" }}>
        {amount > 0
          ? `Zapłacono: ${formatPrice(amount, "pl")}`
          : "Nic nie płacisz — te próbki są w ramach Twojej darmowej puli"}
      </Text>
      <Text style={{ color: c.muted, fontSize: "13px", lineHeight: "1.6", margin: "0 0 24px" }}>
        Dostawa próbek jest zawsze bezpłatna.
      </Text>

      <Text style={labelStyle}>Adres wysyłki</Text>
      <Text style={{ color: c.fg, fontSize: "13px", lineHeight: "1.6", margin: "0 0 24px" }}>
        {addr.fullname ? `${addr.fullname}, ` : order.customer_name ? `${order.customer_name}, ` : ""}
        {addr.street}, {addr.postal_code} {addr.city}
      </Text>

      <Text style={{ color: c.muted, fontSize: "13px", lineHeight: "1.6", margin: "0 0 24px" }}>
        Wytniemy próbki i wyślemy je pocztą w ciągu kilku dni roboczych. Gdy paczka
        pojedzie, dostaniesz od nas kolejną wiadomość.
      </Text>

      {/* Zamawianie próbek wymaga konta (akcja odrzuca brak sesji), więc — inaczej
          niż przy meblach — nie ma tu wariantu „gość bez konta": link zawsze ma
          dokąd prowadzić. Strona sama sprawdza właściciela zamówienia. */}
      <MailButton branding={branding} href={orderUrl}>
        Zobacz zamówienie
      </MailButton>
    </MailLayout>
  );
}
