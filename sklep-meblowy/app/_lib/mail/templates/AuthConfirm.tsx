import { Text } from "@react-email/components";
import type { MailBranding } from "../branding";
import { MailButton, MailLayout } from "./_Layout";

const COPY = {
  pl: {
    preview: "Potwierdź swój adres e-mail",
    heading: "Potwierdź adres e-mail",
    intro:
      "Dziękujemy za utworzenie konta. Kliknij przycisk poniżej, aby potwierdzić adres e-mail i aktywować konto.",
    cta: "Potwierdź adres",
    ignore:
      "Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość — nic się nie stanie.",
  },
  de: {
    preview: "Bestätigen Sie Ihre E-Mail-Adresse",
    heading: "E-Mail-Adresse bestätigen",
    intro:
      "Danke für die Registrierung. Klicken Sie unten, um Ihre E-Mail-Adresse zu bestätigen und das Konto zu aktivieren.",
    cta: "Adresse bestätigen",
    ignore:
      "Falls Sie kein Konto angelegt haben, ignorieren Sie diese Nachricht — es passiert nichts.",
  },
} as const;

// UWAGA: ten szablon NIE jest wysyłany z kodu. Supabase trzyma szablony maili
// Auth w konfiguracji projektu (panel: Auth → Email Templates), nie w repo.
// Źródło zostaje tutaj, żeby dało się je wersjonować i odtworzyć — procedura
// wklejenia w docs/maile-konfiguracja.md.
export function AuthConfirm({
  branding,
  locale,
  confirmationUrl,
}: {
  branding: MailBranding;
  locale: "pl" | "de";
  confirmationUrl: string;
}) {
  const t = COPY[locale];
  const c = branding.colors;

  return (
    <MailLayout
      branding={branding}
      locale={locale}
      preview={t.preview}
      heading={t.heading}
    >
      <Text style={{ color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 24px" }}>
        {t.intro}
      </Text>
      <MailButton branding={branding} href={confirmationUrl}>
        {t.cta}
      </MailButton>
      <Text style={{ color: c.muted, fontSize: "12px", lineHeight: "1.6", margin: "24px 0 0" }}>
        {t.ignore}
      </Text>
    </MailLayout>
  );
}
