import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { COMPANY, formatCompanyHeader } from "../../company";
import type { MailBranding } from "../branding";

// Przycisk CTA — JEDYNE miejsce ze stylem przycisku. Wszystkie szablony
// używają tego komponentu; nie powtarzaj bloku stylu w szablonie.
export function MailButton({
  branding,
  href,
  children,
}: {
  branding: MailBranding;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: branding.colors.gold,
        borderRadius: "8px",
        color: branding.colors.navy,
        fontFamily: branding.fonts.sans,
        fontSize: "12px",
        fontWeight: 700,
        letterSpacing: "2px",
        padding: "12px 24px",
        textDecoration: "none",
        textTransform: "uppercase",
      }}
    >
      {children}
    </Button>
  );
}

// Wspólna rama wszystkich maili. Kolory i fonty WYŁĄCZNIE inline —
// klient pocztowy nie zna zmiennych CSS ani klas Tailwinda.
export function MailLayout({
  branding,
  locale,
  preview,
  heading,
  children,
}: {
  branding: MailBranding;
  locale: "pl" | "de";
  // Tekst w podglądzie skrzynki (obok tematu). Bez tego klient pokazuje
  // pierwsze słowa treści, co wygląda przypadkowo.
  preview: string;
  heading: string;
  children: React.ReactNode;
}) {
  const c = branding.colors;
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: c.bg,
          color: c.fg,
          fontFamily: branding.fonts.sans,
          margin: 0,
          padding: "24px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: c.cardBg,
            border: `1px solid ${c.border}`,
            borderRadius: "16px",
            maxWidth: "600px",
            margin: "0 auto",
            padding: "32px",
          }}
        >
          <Text
            style={{
              color: c.goldText,
              fontFamily: branding.fonts.sans,
              fontSize: "11px",
              letterSpacing: "3px",
              textTransform: "uppercase",
              margin: "0 0 8px",
            }}
          >
            {COMPANY.displayName}
          </Text>
          <Text
            style={{
              color: c.fg,
              fontFamily: branding.fonts.display,
              fontSize: "26px",
              fontWeight: 700,
              lineHeight: "1.25",
              margin: "0 0 24px",
            }}
          >
            {heading}
          </Text>

          {children}

          <Hr style={{ borderColor: c.border, margin: "32px 0 16px" }} />
          <Section>
            <Text style={{ color: c.muted, fontSize: "11px", lineHeight: "1.6", margin: 0 }}>
              {formatCompanyHeader(locale)}
            </Text>
            <Text style={{ color: c.muted, fontSize: "11px", lineHeight: "1.6", margin: "4px 0 0" }}>
              {COMPANY.domain}
              {COMPANY.phone ? ` · ${COMPANY.phone}` : ""}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
