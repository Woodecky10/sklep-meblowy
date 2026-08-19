import { Text } from "@react-email/components";
import type { MailBranding } from "../branding";
import { MailButton, MailLayout } from "./_Layout";

const COPY = {
  pl: {
    preview: (p: string) => `Jak sprawdza się ${p}?`,
    heading: "Jak sprawdza się Twój nowy mebel?",
    headingPrzypomnienie: "Przypominamy o opinii",
    intro: (p: string, nr: number) =>
      `Jakiś czas temu odebrałeś zamówienie #${nr} — ${p}. Jeśli znajdziesz chwilę, napisz kilka zdań o tym, jak się sprawdza.`,
    pomoc:
      "Twoja opinia pomaga innym osobom wybrać mebel, którego nie mogą wcześniej zobaczyć na żywo. Zajmie to minutę.",
    cta: "Wystaw opinię",
    moderacja:
      "Twoja opinia pojawi się na stronie od razu po wysłaniu. Sprawdzamy opinie po publikacji i usuwamy wyłącznie spam oraz treści obraźliwe — nie usuwamy opinii krytycznych i nie zmieniamy ich treści.",
  },
  de: {
    preview: (p: string) => `Wie gefällt Ihnen ${p}?`,
    heading: "Wie bewährt sich Ihr neues Möbelstück?",
    headingPrzypomnienie: "Erinnerung an Ihre Bewertung",
    intro: (p: string, nr: number) =>
      `Vor einiger Zeit haben Sie die Bestellung #${nr} erhalten — ${p}. Wenn Sie einen Moment Zeit finden, schreiben Sie ein paar Sätze dazu.`,
    pomoc:
      "Ihre Bewertung hilft anderen, ein Möbelstück auszuwählen, das sie vorher nicht in echt sehen können. Es dauert eine Minute.",
    cta: "Bewertung schreiben",
    moderacja:
      "Ihre Bewertung erscheint sofort nach dem Absenden auf der Seite. Wir prüfen Bewertungen nach der Veröffentlichung und entfernen ausschließlich Spam und beleidigende Inhalte — kritische Bewertungen löschen wir nicht und ihren Inhalt ändern wir nicht.",
  },
} as const;

export function ReviewRequest({
  branding,
  locale,
  productName,
  reviewUrl,
  orderNumber,
  przypomnienie,
}: {
  branding: MailBranding;
  locale: "pl" | "de";
  productName: string;
  reviewUrl: string;
  orderNumber: number;
  // Ten sam szablon obsługuje pierwszą prośbę i ponaglenie — różnią się
  // wyłącznie nagłówkiem. Dwa osobne pliki rozjechałyby się przy pierwszej
  // zmianie treści.
  przypomnienie: boolean;
}) {
  const t = COPY[locale];
  const c = branding.colors;

  return (
    <MailLayout
      branding={branding}
      locale={locale}
      preview={t.preview(productName)}
      heading={przypomnienie ? t.headingPrzypomnienie : t.heading}
    >
      <Text style={{ color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 16px" }}>
        {t.intro(productName, orderNumber)}
      </Text>
      <Text style={{ color: c.muted, fontSize: "13px", lineHeight: "1.6", margin: "0 0 24px" }}>
        {t.pomoc}
      </Text>

      <MailButton branding={branding} href={reviewUrl}>
        {t.cta}
      </MailButton>

      <Text style={{ color: c.muted, fontSize: "12px", lineHeight: "1.6", margin: "24px 0 0" }}>
        {t.moderacja}
      </Text>
    </MailLayout>
  );
}
