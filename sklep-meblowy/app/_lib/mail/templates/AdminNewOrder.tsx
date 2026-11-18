import { Fragment } from "react";
import { Hr, Text } from "@react-email/components";
import { formatOrderAmount } from "../../money";
import { formatVariantLabel } from "../../variants";
import { orderItemDisplayName } from "../../order-items";
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
  const customerNote = order.customer_note?.trim() ? order.customer_note : null;
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
      {customerNote && (
        <Text style={rowStyle}>
          {customerNote.split(/\r?\n/).map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {i === 0 ? `Uwagi do zamówienia: ${line}` : line}
            </Fragment>
          ))}
        </Text>
      )}

      <Hr style={{ borderColor: c.border, margin: "16px 0" }} />

      {items.map((item) => (
        <Text key={item.id} style={rowStyle}>
          {item.quantity} × {orderItemDisplayName(item, "Produkt")}
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
