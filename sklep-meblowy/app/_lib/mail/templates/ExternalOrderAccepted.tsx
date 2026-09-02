import { Text } from "@react-email/components";
import type { Order } from "../../types";
import type { MailBranding } from "../branding";
import { MailButton, MailLayout } from "./_Layout";

// Mail do klienta, który kupił POZA sklepem (Allegro, OLX, …), wysyłany gdy
// admin ręcznie przestawia zamówienie zewnętrzne na „W realizacji" (spec
// 2026-09-02). Treść 1:1 od właściciela; jedyna zmienna to nazwa źródła.
// Tylko PL — zamówienia zewnętrzne są wyłącznie polskie.
//
// Świadomie bez numeru zamówienia i bez listy pozycji: klient zna numer
// z marketplace, a nasz #N nic mu nie mówi.
export const EXTERNAL_ORDER_ACCEPTED_SUBJECT = "Dziękujemy za zamówienie – Mollien 🤍";

export function ExternalOrderAccepted({
  order,
  branding,
  shopUrl,
}: {
  order: Order;
  branding: MailBranding;
  // Strona główna sklepu (NEXT_PUBLIC_APP_URL) — cel przycisku „Odwiedź sklep".
  shopUrl: string;
}) {
  const c = branding.colors;
  const p = { color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 16px" };

  return (
    <MailLayout
      branding={branding}
      locale="pl"
      preview="Dziękujemy za zakup i wybór Mollien"
      heading="Dziękujemy za zamówienie"
    >
      <Text style={p}>Dzień dobry,</Text>
      <Text style={p}>dziękujemy za zakup i wybór Mollien! 🤍</Text>
      <Text style={p}>
        Potwierdzamy, że Państwa zamówienie zostało przyjęte i przekazane do realizacji.
      </Text>
      <Text style={{ ...p, fontWeight: 600 }}>{`Źródło zamówienia: ${order.source}`}</Text>
      <Text style={p}>Mebel zostanie przygotowany zgodnie z wybranym przez Państwa wariantem.</Text>
      <Text style={p}>🛋️ Przewidywany czas realizacji: do 21 dni roboczych.</Text>
      <Text style={p}>O kolejnych etapach realizacji będziemy informować na bieżąco.</Text>
      <Text style={{ ...p, margin: "0 0 20px" }}>
        Jeżeli chcą Państwo zobaczyć więcej naszych modeli, dostępne kolekcje, tkaniny oraz
        pozostałe produkty znajdą Państwo w naszym sklepie:
      </Text>
      {/* Przycisk poza <Text>, jak w OrderShipped — <Button> ma własny blok. */}
      <MailButton branding={branding} href={shopUrl}>
        👉 Odwiedź sklep Mollien
      </MailButton>
      <Text style={{ ...p, margin: "24px 0 16px" }}>Dziękujemy za zaufanie i wybór Mollien!</Text>
      <Text style={p}>
        Mamy nadzieję, że nowy mebel będzie pięknym elementem Państwa wnętrza. 🤍
      </Text>
      <Text style={{ ...p, margin: 0 }}>
        Pozdrawiamy,
        <br />
        Zespół Mollien.
      </Text>
    </MailLayout>
  );
}
