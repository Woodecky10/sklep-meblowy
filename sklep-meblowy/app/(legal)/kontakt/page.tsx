import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY, formatFullAddress, isFilled } from "@/app/_lib/company";

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Skontaktuj się z nami – e-mail, telefon, adres.",
};

export default function KontaktPage() {
  return (
    <>
      <h1>Kontakt</h1>
      <span className="meta">Chętnie odpowiemy na pytania</span>

      <p>
        Masz pytanie o produkt, zamówienie lub po prostu szukasz porady? Napisz do nas – staramy
        się odpowiadać w ciągu jednego dnia roboczego.
      </p>

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
            E-mail
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
              Telefon
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
              {COMPANY.contactHours}
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
            Adres
          </p>
          <p style={{ fontSize: "0.95rem", color: "var(--fg)", lineHeight: 1.5 }}>
            {COMPANY.legalName}
            <br />
            {formatFullAddress()}
          </p>
        </div>
      </div>

      <h2>Dane rejestrowe</h2>
      <ul>
        <li>
          <strong>{COMPANY.legalName}</strong>
        </li>
        <li>NIP: {COMPANY.nip}</li>
        {isFilled(COMPANY.regon) && <li>REGON: {COMPANY.regon}</li>}
        {COMPANY.krs && <li>KRS: {COMPANY.krs}</li>}
        <li>{formatFullAddress()}</li>
      </ul>

      <h2>Najczęstsze sprawy</h2>
      <ul>
        <li>
          Status zamówienia – sprawdzisz również w zakładce{" "}
          <Link href="/konto/zamowienia">Moje zamówienia</Link> po zalogowaniu.
        </li>
        <li>
          Zwrot produktu – szczegóły w <Link href="/zwroty">Zwroty i reklamacje</Link>.
        </li>
        <li>
          Reklamacja – w zakładce <Link href="/zwroty">Zwroty i reklamacje</Link>.
        </li>
        <li>
          Doradztwo przy wyborze produktu – napisz do nas, chętnie pomożemy.
        </li>
      </ul>
    </>
  );
}
