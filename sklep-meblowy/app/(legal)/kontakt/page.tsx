import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY, formatFullAddress, isFilled } from "@/app/_lib/company";
import { localizeHref } from "@/app/_lib/i18n";
import { getLocale } from "@/app/_lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const de = locale === "de";
  return de
    ? {
        title: "Kontakt",
        description: "Kontaktieren Sie uns – E-Mail, Telefon, Adresse.",
      }
    : {
        title: "Kontakt",
        description: "Skontaktuj się z nami – e-mail, telefon, adres.",
      };
}

export default async function KontaktPage() {
  const locale = await getLocale();
  const de = locale === "de";

  const c = de
    ? {
        h1: "Kontakt",
        meta: "Wir beantworten Ihre Fragen gerne",
        intro:
          "Haben Sie eine Frage zu einem Produkt, einer Bestellung oder suchen Sie einfach einen Rat? Schreiben Sie uns – wir bemühen uns, innerhalb eines Werktags zu antworten.",
        emailLabel: "E-Mail",
        phoneLabel: "Telefon",
        contactHours: "Mo.–Fr., 9:00–17:00 Uhr",
        addressLabel: "Adresse",
        h2Registration: "Registerdaten",
        nipLabel: "Steuernummer (NIP)",
        regonLabel: "REGON",
        krsLabel: "Handelsregister (KRS)",
        h2Common: "Häufige Anliegen",
        commonOrderBefore: "Bestellstatus – ebenfalls einsehbar im Bereich ",
        commonOrderLink: "Meine Bestellungen",
        commonOrderAfter: " nach dem Anmelden.",
        commonReturnBefore: "Produktrückgabe – Einzelheiten unter ",
        commonReturnLink: "Rückgabe und Reklamation",
        commonReturnAfter: ".",
        commonComplaintBefore: "Reklamation – im Bereich ",
        commonComplaintLink: "Rückgabe und Reklamation",
        commonComplaintAfter: ".",
        commonAdvice:
          "Beratung bei der Produktauswahl – schreiben Sie uns, wir helfen Ihnen gerne.",
      }
    : {
        h1: "Kontakt",
        meta: "Chętnie odpowiemy na pytania",
        intro:
          "Masz pytanie o produkt, zamówienie lub po prostu szukasz porady? Napisz do nas – staramy się odpowiadać w ciągu jednego dnia roboczego.",
        emailLabel: "E-mail",
        phoneLabel: "Telefon",
        contactHours: COMPANY.contactHours,
        addressLabel: "Adres",
        h2Registration: "Dane rejestrowe",
        nipLabel: "NIP",
        regonLabel: "REGON",
        krsLabel: "KRS",
        h2Common: "Najczęstsze sprawy",
        commonOrderBefore: "Status zamówienia – sprawdzisz również w zakładce ",
        commonOrderLink: "Moje zamówienia",
        commonOrderAfter: " po zalogowaniu.",
        commonReturnBefore: "Zwrot produktu – szczegóły w ",
        commonReturnLink: "Zwroty i reklamacje",
        commonReturnAfter: ".",
        commonComplaintBefore: "Reklamacja – w zakładce ",
        commonComplaintLink: "Zwroty i reklamacje",
        commonComplaintAfter: ".",
        commonAdvice:
          "Doradztwo przy wyborze produktu – napisz do nas, chętnie pomożemy.",
      };

  return (
    <>
      <h1>{c.h1}</h1>
      <span className="meta">{c.meta}</span>

      <p>{c.intro}</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1.5rem",
          margin: "2rem 0",
        }}
      >
        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: "1rem",
            padding: "1.5rem",
          }}
        >
          <p
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--color-gold)",
              marginBottom: "0.5rem",
              fontFamily: "var(--font-sans)",
            }}
          >
            {c.emailLabel}
          </p>
          <a
            href={`mailto:${COMPANY.email}`}
            style={{
              fontSize: "1.1rem",
              fontWeight: 600,
              color: "var(--fg)",
              textDecoration: "none",
            }}
          >
            {COMPANY.email}
          </a>
        </div>

        {COMPANY.phone && (
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: "1rem",
              padding: "1.5rem",
            }}
          >
            <p
              style={{
                fontSize: "0.7rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--color-gold)",
                marginBottom: "0.5rem",
                fontFamily: "var(--font-sans)",
              }}
            >
              {c.phoneLabel}
            </p>
            <a
              href={`tel:${COMPANY.phone.replace(/\s/g, "")}`}
              style={{
                fontSize: "1.1rem",
                fontWeight: 600,
                color: "var(--fg)",
                textDecoration: "none",
              }}
            >
              {COMPANY.phone}
            </a>
            <p
              style={{
                fontSize: "0.8rem",
                color: "var(--muted)",
                marginTop: "0.5rem",
              }}
            >
              {c.contactHours}
            </p>
          </div>
        )}

        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: "1rem",
            padding: "1.5rem",
          }}
        >
          <p
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--color-gold)",
              marginBottom: "0.5rem",
              fontFamily: "var(--font-sans)",
            }}
          >
            {c.addressLabel}
          </p>
          <p style={{ fontSize: "0.95rem", color: "var(--fg)", lineHeight: 1.5 }}>
            {COMPANY.legalName}
            <br />
            {formatFullAddress(locale)}
          </p>
        </div>
      </div>

      <h2>{c.h2Registration}</h2>
      <ul>
        <li>
          <strong>{COMPANY.legalName}</strong>
        </li>
        <li>
          {c.nipLabel}: {COMPANY.nip}
        </li>
        {isFilled(COMPANY.regon) && (
          <li>
            {c.regonLabel}: {COMPANY.regon}
          </li>
        )}
        {COMPANY.krs && (
          <li>
            {c.krsLabel}: {COMPANY.krs}
          </li>
        )}
        <li>{formatFullAddress(locale)}</li>
      </ul>

      <h2>{c.h2Common}</h2>
      <ul>
        <li>
          {c.commonOrderBefore}
          <Link href={localizeHref("/konto/zamowienia", locale)}>
            {c.commonOrderLink}
          </Link>
          {c.commonOrderAfter}
        </li>
        <li>
          {c.commonReturnBefore}
          <Link href={localizeHref("/zwroty", locale)}>{c.commonReturnLink}</Link>
          {c.commonReturnAfter}
        </li>
        <li>
          {c.commonComplaintBefore}
          <Link href={localizeHref("/zwroty", locale)}>
            {c.commonComplaintLink}
          </Link>
          {c.commonComplaintAfter}
        </li>
        <li>{c.commonAdvice}</li>
      </ul>
    </>
  );
}
