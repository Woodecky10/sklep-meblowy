import { Text } from "@react-email/components";
import { shortSampleOrderRef } from "../../sample-pricing";
import type { SampleOrder, SampleOrderItem } from "../../types";
import type { MailBranding } from "../branding";
import { MailButton, MailLayout } from "./_Layout";

// Odpowiednik OrderShipped.tsx dla próbek: ten sam układ etykieta/wartość
// i ta sama stopka. PL-only (patrz SampleOrderConfirmation.tsx).
export function SampleOrderSent({
  order,
  items,
  branding,
  shopUrl,
}: {
  order: SampleOrder;
  items: SampleOrderItem[];
  branding: MailBranding;
  shopUrl: string;
}) {
  const c = branding.colors;
  const ref = shortSampleOrderRef(order.id);
  const tracking = (order.tracking ?? "").trim();
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
      <Text style={{ color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 24px" }}>
        Wysłaliśmy pocztą próbki z zamówienia {ref}.
      </Text>

      <Text style={labelStyle}>W kopercie</Text>
      {items.map((item) => (
        <Text key={item.id} style={{ color: c.fg, fontSize: "14px", margin: "0 0 4px" }}>
          {item.fabric_name} {item.color}
        </Text>
      ))}

      {/* Numer nadania jest opcjonalny: próbki jadą zwykłą kopertą, która często
          żadnego numeru nie ma (patrz markSampleSent w app/admin/probki/actions.ts).
          Brak numeru dostaje własne zdanie — inaczej klient szukałby w mailu
          czegoś, czego nigdy nie było, i pisałby z pytaniem. */}
      {tracking ? (
        <>
          <Text style={{ ...labelStyle, margin: "16px 0 4px" }}>Numer nadania</Text>
          <Text style={{ color: c.fg, fontSize: "14px", margin: "0 0 16px" }}>{tracking}</Text>
        </>
      ) : (
        <Text style={{ color: c.muted, fontSize: "13px", lineHeight: "1.6", margin: "16px 0 0" }}>
          Przesyłka idzie zwykłą kopertą listową, więc nie ma numeru do śledzenia.
          Zwykle dociera w ciągu kilku dni roboczych.
        </Text>
      )}

      <Text style={{ color: c.muted, fontSize: "13px", lineHeight: "1.6", margin: "16px 0 24px" }}>
        Gdy już wybierzesz tkaninę, znajdziesz ją przy każdym meblu w naszym sklepie.
      </Text>

      <MailButton branding={branding} href={shopUrl}>
        Zobacz meble
      </MailButton>
    </MailLayout>
  );
}
