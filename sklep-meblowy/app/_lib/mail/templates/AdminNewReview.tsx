import { Hr, Text } from "@react-email/components";
import type { ReviewForMail } from "../../reviews-admin";
import type { MailBranding } from "../branding";
import { MailButton, MailLayout } from "./_Layout";

// Zawsze PL — panel opinii jest PL-only (ten sam powód co w AdminNewSampleOrder.tsx
// i AdminNewOrder.tsx: to ta sama osoba i ten sam panel). Gwiazdki jako znak
// tekstowy, nie ikona — dokładnie ten sam zapis, co w panelu (OpinieList.tsx:
// `"★".repeat(rating)`), żeby ocena wyglądała tak samo w mailu i na stronie.
export function AdminNewReview({
  opinia,
  branding,
  panelUrl,
}: {
  // Świadomie tylko te cztery pola z ReviewForMail: `id` i `created_at` nie
  // mają się w mailu pojawić, więc lepiej ich nie przyjmować, niż liczyć na to,
  // że nikt ich nie użyje.
  opinia: Pick<ReviewForMail, "rating" | "comment" | "author_name" | "product_name">;
  branding: MailBranding;
  panelUrl: string;
}) {
  const c = branding.colors;
  const pelne = "★".repeat(opinia.rating);
  const puste = "★".repeat(5 - opinia.rating);
  const autor = opinia.author_name ?? "Klient";
  const produkt = opinia.product_name ?? "produkt usunięty";

  return (
    <MailLayout
      branding={branding}
      locale="pl"
      preview={`${opinia.rating}/5 od ${autor} — ${produkt}`}
      heading="Nowa opinia klienta"
    >
      <Text style={{ fontSize: "20px", letterSpacing: "2px", margin: "0 0 8px" }}>
        <span style={{ color: c.gold }}>{pelne}</span>
        <span style={{ color: c.muted }}>{puste}</span>
      </Text>

      <Text style={{ color: c.fg, fontSize: "15px", fontWeight: 700, margin: "0 0 4px" }}>
        {autor}
      </Text>
      <Text style={{ color: c.muted, fontSize: "13px", margin: "0 0 16px" }}>{produkt}</Text>

      <Hr style={{ borderColor: c.border, margin: "16px 0" }} />

      {/* Pełna treść, bez przycinania — właścicielka ma decydować na podstawie
          tego, co faktycznie napisano, nie skrótu. Puste pole to ocena bez
          komentarza (dozwolone przez formularz), więc pokazujemy to wprost,
          zamiast zostawiać pustkę, która wyglądałaby jak błąd maila. */}
      <Text style={{ color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 24px" }}>
        {opinia.comment || "— bez komentarza —"}
      </Text>

      <MailButton branding={branding} href={panelUrl}>
        Otwórz panel opinii
      </MailButton>
    </MailLayout>
  );
}
