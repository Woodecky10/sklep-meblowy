import { Hr, Text } from "@react-email/components";
import { formatPrice } from "../../format";
import { shortSampleOrderRef } from "../../sample-pricing";
import type { SampleOrder, SampleOrderItem } from "../../types";
import type { MailBranding } from "../branding";
import { MailButton, MailLayout } from "./_Layout";

// Zawsze PL — panel właścicielki jest PL-only, a /probki jest zamrożone dla /de.
// Układ, style i stopka są przepisane z AdminNewOrder.tsx: to ta sama skrzynka
// i ta sama osoba, więc oba maile o „nowym zamówieniu" mają wyglądać tak samo.
export function AdminNewSampleOrder({
  order,
  items,
  branding,
  adminUrl,
}: {
  // Świadomie `SampleOrder` + `SampleOrderItem[]` z types.ts, a nie
  // `SampleOrderWithItems` z samples.ts: szablon nie ma powodu zależeć od
  // warstwy danych (`server-only`), a podgląd maili karmi go zwykłą fiksturą.
  order: SampleOrder;
  items: SampleOrderItem[];
  branding: MailBranding;
  adminUrl: string;
}) {
  const c = branding.colors;
  const ref = shortSampleOrderRef(order.id);
  const addr = order.shipping_address ?? {};
  const rowStyle = { color: c.muted, fontSize: "13px", margin: "0 0 4px" };

  // Kwota mówi wprost, czy pieniądze już są. Mail wychodzi wyłącznie dla
  // zamówień rozliczonych (darmowe — od razu, płatne — dopiero po notyfikacji
  // P24), więc „czeka na płatność" nie powinno się tu w ogóle pojawić. Gałąź
  // istnieje, bo lepiej napisać prawdę niż zapewnić o wpłacie, której nie ma:
  // właścicielka na tej podstawie decyduje, czy pakować kopertę.
  const money =
    order.payment_status === "paid"
      ? `${formatPrice(Number(order.amount_total), "pl")} — opłacone`
      : order.payment_status === "none"
        ? "Bez opłaty — same darmowe próbki"
        : `${formatPrice(Number(order.amount_total), "pl")} — NIEOPŁACONE, nie pakuj`;

  return (
    <MailLayout
      branding={branding}
      locale="pl"
      preview={`Nowe zamówienie próbek ${ref} — ${money}`}
      heading={`Nowe zamówienie próbek ${ref}`}
    >
      <Text style={{ color: c.fg, fontSize: "15px", fontWeight: 700, margin: "0 0 16px" }}>
        {money}
      </Text>

      <Text style={rowStyle}>
        Klient: {order.customer_name || "—"} ({order.customer_email})
      </Text>
      <Text style={rowStyle}>Telefon: {order.customer_phone ?? addr.phone ?? "brak"}</Text>
      <Text style={rowStyle}>
        Adres: {addr.street ?? "—"}, {addr.postal_code ?? ""} {addr.city ?? ""}
      </Text>

      <Hr style={{ borderColor: c.border, margin: "16px 0" }} />

      {/* Nazwa tkaniny i numer koloru — dokładnie to, co właścicielka wycina.
          `fabric_name` jest snapshotem z chwili zamówienia, więc mail zostaje
          czytelny nawet po zmianie nazwy tkaniny w katalogu. */}
      {items.map((item) => (
        <Text key={item.id} style={rowStyle}>
          {item.fabric_name} {item.color} —{" "}
          {item.is_free ? "gratis" : formatPrice(Number(item.unit_price), "pl")}
        </Text>
      ))}
      {items.length === 0 && (
        <Text style={rowStyle}>Zamówienie nie ma ani jednej pozycji — sprawdź je w panelu.</Text>
      )}

      <Hr style={{ borderColor: c.border, margin: "16px 0 24px" }} />

      <MailButton branding={branding} href={adminUrl}>
        Otwórz w panelu
      </MailButton>
    </MailLayout>
  );
}
