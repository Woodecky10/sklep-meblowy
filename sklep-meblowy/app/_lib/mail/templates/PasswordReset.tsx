import { Text } from "@react-email/components";
import type { MailBranding } from "../branding";
import { MailButton, MailLayout } from "./_Layout";

const COPY = {
  pl: {
    preview: "Ustaw nowe hasło do konta",
    heading: "Ustaw nowe hasło",
    intro:
      "Dostaliśmy prośbę o zmianę hasła do Twojego konta. Kliknij przycisk poniżej, aby ustawić nowe hasło.",
    cta: "Ustaw nowe hasło",
    ignore:
      "Jeśli ta prośba nie pochodzi od Ciebie, zignoruj tę wiadomość — hasło zostanie bez zmian. Link jest jednorazowy.",
  },
  de: {
    preview: "Neues Passwort festlegen",
    heading: "Neues Passwort festlegen",
    intro:
      "Wir haben eine Anfrage zur Änderung Ihres Passworts erhalten. Klicken Sie unten, um ein neues Passwort festzulegen.",
    cta: "Neues Passwort festlegen",
    ignore:
      "Falls diese Anfrage nicht von Ihnen stammt, ignorieren Sie diese Nachricht — Ihr Passwort bleibt unverändert. Der Link gilt nur einmal.",
  },
} as const;

// UWAGA: ten szablon NIE jest wysyłany z kodu — jak AuthConfirm. Supabase
// trzyma szablony maili Auth w konfiguracji projektu (panel: Authentication →
// Emails → Templates → Reset password), nie w repo. Źródło zostaje tutaj, żeby
// dało się je wersjonować i odtworzyć — procedura w docs/maile-konfiguracja.md.
//
// `resetUrl` MUSI prowadzić wprost do naszej trasy app/auth/confirm/route.ts z
// `token_hash` i `type=recovery` (patrz skrypt scripts/preview-mail.mjs).
// Znacznik {{ .ConfirmationURL }} tutaj nie zadziała: Supabase zużyłby token po
// swojej stronie i przekierował bez `token_hash`, więc klient nie dostałby
// sesji recovery i `updatePassword` odbiłby go komunikatem o wygasłej sesji.
export function PasswordReset({
  branding,
  locale,
  resetUrl,
}: {
  branding: MailBranding;
  locale: "pl" | "de";
  resetUrl: string;
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
      <MailButton branding={branding} href={resetUrl}>
        {t.cta}
      </MailButton>
      <Text style={{ color: c.muted, fontSize: "12px", lineHeight: "1.6", margin: "24px 0 0" }}>
        {t.ignore}
      </Text>
    </MailLayout>
  );
}
