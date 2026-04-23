import type { Metadata } from "next";
import { COMPANY, formatFullAddress } from "@/app/_lib/company";

export const metadata: Metadata = {
  title: "Zwroty i reklamacje",
  description: "Jak zwrócić produkt lub złożyć reklamację – 14-dniowe prawo odstąpienia i rękojmia.",
};

export default function ZwrotyPage() {
  return (
    <>
      <h1>Zwroty i reklamacje</h1>
      <span className="meta">14 dni na zwrot • 2 lata rękojmi</span>

      <h2>Zwrot – odstąpienie od umowy</h2>
      <p>
        Jeżeli jesteś konsumentem lub przedsiębiorcą na prawach konsumenta, masz prawo odstąpić od
        umowy zawartej na odległość w ciągu <strong>14 dni</strong> od dnia otrzymania produktu,
        bez podawania przyczyny.
      </p>

      <h3>Jak to zrobić?</h3>
      <ol>
        <li>
          Wyślij oświadczenie o odstąpieniu na adres <strong>{COMPANY.email}</strong>. Możesz
          skorzystać z{" "}
          <a href="#wzor-odstapienia">wzoru formularza</a> poniżej – ale nie jest on obowiązkowy.
        </li>
        <li>
          Odeślij produkt na adres Sprzedawcy w stanie niezmienionym, najlepiej w oryginalnym
          opakowaniu.
        </li>
        <li>
          Zwrócimy Ci wszystkie otrzymane płatności (w tym koszt dostawy podstawowej)
          niezwłocznie, nie później niż w ciągu 14 dni od otrzymania oświadczenia. Możemy
          wstrzymać zwrot do czasu otrzymania produktu lub dowodu jego odesłania.
        </li>
      </ol>

      <h3>Ważne informacje</h3>
      <ul>
        <li>Koszt odesłania produktu pokrywa Klient.</li>
        <li>
          Dla mebli wielkogabarytowych koszt ten może być znaczny (transport dedykowany) –
          szacunkowe koszty znajdują się w karcie produktu.
        </li>
        <li>
          Zwrot płatności następuje tym samym kanałem, którym dokonano zapłaty, chyba że
          uzgodnimy inny sposób.
        </li>
        <li>
          <strong>Prawo zwrotu nie przysługuje</strong> w przypadku produktów wykonanych na
          indywidualne zamówienie (niestandardowe wymiary, spersonalizowana tkanina itp.) – zgodnie
          z art. 38 ustawy o prawach konsumenta.
        </li>
      </ul>

      <h2>Reklamacja – rękojmia</h2>
      <p>
        Każdy produkt objęty jest <strong>rękojmią przez 2 lata</strong> od dnia wydania (dla
        konsumentów), zgodnie z przepisami Kodeksu cywilnego. Jeżeli produkt ma wadę, możesz:
      </p>
      <ul>
        <li>żądać naprawy lub wymiany na nowy,</li>
        <li>żądać obniżenia ceny,</li>
        <li>odstąpić od umowy (przy wadzie istotnej).</li>
      </ul>

      <h3>Jak złożyć reklamację?</h3>
      <ol>
        <li>
          Napisz na <strong>{COMPANY.email}</strong> – podaj numer zamówienia, opis wady i swoje
          oczekiwania (naprawa, wymiana, obniżenie ceny).
        </li>
        <li>Dołącz zdjęcia wady, jeżeli to możliwe.</li>
        <li>
          Rozpatrzymy reklamację w terminie <strong>14 dni</strong> od dnia jej otrzymania.
        </li>
      </ol>

      <h2 id="wzor-odstapienia">Wzór formularza odstąpienia od umowy</h2>
      <p>
        Możesz skopiować poniższy tekst, uzupełnić i wysłać na adres{" "}
        <strong>{COMPANY.email}</strong> lub pocztą na adres Sprzedawcy:
      </p>
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: "0.75rem",
          padding: "1.5rem",
          marginBottom: "1rem",
          fontFamily: "var(--font-sans)",
          fontSize: "0.9rem",
          lineHeight: 1.7,
          color: "var(--fg)",
          whiteSpace: "pre-line",
        }}
      >
        {`Do: ${COMPANY.legalName}
${formatFullAddress()}
E-mail: ${COMPANY.email}

Ja, niżej podpisany/a [IMIĘ I NAZWISKO], niniejszym informuję o odstąpieniu od umowy sprzedaży następujących produktów:

– [NAZWA PRODUKTU, NUMER ZAMÓWIENIA]

Data zawarcia umowy: [DATA ZAMÓWIENIA]
Data otrzymania produktu: [DATA OTRZYMANIA]
Imię i nazwisko konsumenta: [IMIĘ I NAZWISKO]
Adres konsumenta: [ADRES]

Data: [DATA]
Podpis (tylko jeżeli formularz jest przesyłany w wersji papierowej): .....................`}
      </div>

      <h2>Pozasądowe rozwiązywanie sporów</h2>
      <p>
        W przypadku braku porozumienia możesz skorzystać z pozasądowych metod rozpatrywania
        sporów, m.in. z platformy internetowej ODR Komisji Europejskiej:{" "}
        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
          ec.europa.eu/consumers/odr
        </a>
        .
      </p>
    </>
  );
}
