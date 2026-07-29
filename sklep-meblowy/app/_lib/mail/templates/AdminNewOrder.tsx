import { Hr, Text } from "@react-email/components";
import { formatOrderAmount } from "../../money";
import { formatVariantLabel } from "../../variants";
import type { Order, OrderItem } from "../../types";
import type { MailBranding } from "../branding";
import { MailButton, MailLayout } from "./_Layout";

// Zawsze PL — panel admina jest PL-only.
export function AdminNewOrder({
  order,
  items,
  branding,
  customerEmail,
  adminUrl,
}: {
  order: Order;
  items: OrderItem[];
  branding: MailBranding;
  customerEmail: string;
  adminUrl: string;
}) {
  const c = branding.colors;
  const cur = order.currency;
  const addr = order.shipping_address;
  const rowStyle = { color: c.muted, fontSize: "13px", margin: "0 0 4px" };

  return (
    <MailLayout
      branding={branding}
      locale="pl"
      preview={`Nowe zamówienie #${order.order_number} — ${formatOrderAmount(Number(order.total), cur)}`}
      heading={`Nowe zamówienie #${order.order_number}`}
    >
      <Text style={{ color: c.fg, fontSize: "15px", fontWeight: 700, margin: "0 0 16px" }}>
        {formatOrderAmount(Number(order.total), cur)}
        {order.payment_method === "cod" ? " — za pobraniem" : " — opłacone online"}
      </Text>

      <Text style={rowStyle}>Klient: {addr?.fullname ?? "—"} ({customerEmail})</Text>
      <Text style={rowStyle}>Telefon: {addr?.phone ?? "brak"}</Text>
      <Text style={rowStyle}>
        Adres: {addr?.street}, {addr?.postal_code} {addr?.city}
      </Text>

      <Hr style={{ borderColor: c.border, margin: "16px 0" }} />

      {items.map((item) => (
        <Text key={item.id} style={rowStyle}>
          {item.quantity} × {item.product?.name ?? "Produkt"}
          {item.variant_values ? ` — ${formatVariantLabel(item.variant_values, "pl")}` : ""}
          {item.notes ? ` — uwagi: ${item.notes}` : ""}
        </Text>
      ))}

      <Hr style={{ borderColor: c.border, margin: "16px 0 24px" }} />

      <MailButton branding={branding} href={adminUrl}>
        Otwórz w panelu
      </MailButton>
    </MailLayout>
  );
}
