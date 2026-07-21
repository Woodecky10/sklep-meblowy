import type { Metadata } from "next";
import { COMPANY, formatFullAddress } from "@/app/_lib/company";
import { getContactInfo } from "@/app/_lib/contact-server";
import { getLocale } from "@/app/_lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const de = locale === "de";
  return de
    ? {
        title: "Rückgabe und Reklamation",
        description:
          "Wie Sie ein Produkt zurückgeben oder eine Reklamation einreichen – 14-tägiges Widerrufsrecht und Gewährleistung.",
      }
    : {
        title: "Zwroty i reklamacje",
        description:
          "Jak zwrócić produkt lub złożyć reklamację – 14-dniowe prawo odstąpienia i rękojmia.",
      };
}

export default async function ZwrotyPage() {
  const locale = await getLocale();
  const de = locale === "de";
  const contact = await getContactInfo();

  const c = de
    ? {
        h1: "Rückgabe und Reklamation",
        meta: "14 Tage Rückgaberecht • 2 Jahre Gewährleistung",
        h2Return: "Rückgabe – Widerruf des Vertrags",
        returnIntroBefore:
          "Wenn Sie Verbraucher oder ein Unternehmer mit Verbraucherrechten sind, haben Sie das Recht, einen im Fernabsatz geschlossenen Vertrag innerhalb von ",
        returnIntroStrong: "14 Tagen",
        returnIntroAfter:
          " ab dem Tag des Erhalts des Produkts ohne Angabe von Gründen zu widerrufen.",
        h3How: "Wie geht das?",
        howStep1Before: "Senden Sie eine Widerrufserklärung an die Adresse ",
        howStep1After: ". Sie können das ",
        howStep1Link: "Musterformular",
        howStep1End: " unten verwenden – es ist jedoch nicht verpflichtend.",
        howStep2:
          "Senden Sie das Produkt in unverändertem Zustand an die Adresse des Verkäufers zurück, am besten in der Originalverpackung.",
        howStep3:
          "Wir erstatten Ihnen den vollständigen für das Produkt gezahlten Betrag unverzüglich, spätestens innerhalb von 14 Tagen nach Erhalt der Erklärung. Der Versand an Sie war kostenlos, daher gibt es keine Lieferkosten zu erstatten. Wir können die Erstattung zurückhalten, bis wir das Produkt oder einen Nachweis seiner Rücksendung erhalten haben.",
        h3Important: "Wichtige Informationen",
        important1: "Die Kosten der Rücksendung des Produkts trägt der Kunde.",
        important2:
          "Bei sperrigen Möbeln können diese Kosten erheblich sein (dedizierter Transport) – die geschätzten Kosten finden Sie auf der Produktseite.",
        important3:
          "Die Erstattung der Zahlung erfolgt über denselben Kanal, über den die Zahlung geleistet wurde, sofern wir keine andere Vorgehensweise vereinbaren.",
        important4Strong: "Das Rückgaberecht besteht nicht",
        important4:
          " bei Produkten, die nach individueller Bestellung gefertigt wurden (Sondermaße, personalisierter Stoff usw.) – gemäß Art. 38 des Verbraucherrechtegesetzes.",
        h2Complaint: "Reklamation – Gewährleistung",
        complaintIntroBefore: "Jedes Produkt unterliegt einer ",
        complaintIntroStrong: "Gewährleistung von 2 Jahren",
        complaintIntroAfter:
          " ab dem Tag der Übergabe (für Verbraucher), gemäß den Bestimmungen des Zivilgesetzbuches. Weist das Produkt einen Mangel auf, können Sie:",
        complaintOpt1: "Reparatur oder Austausch gegen ein neues verlangen,",
        complaintOpt2: "eine Preisminderung verlangen,",
        complaintOpt3: "vom Vertrag zurücktreten (bei einem wesentlichen Mangel).",
        h3HowComplaint: "Wie reicht man eine Reklamation ein?",
        complaintStep1Before: "Schreiben Sie an ",
        complaintStep1After:
          " – geben Sie die Bestellnummer, eine Beschreibung des Mangels und Ihre Erwartungen an (Reparatur, Austausch, Preisminderung).",
        complaintStep2: "Fügen Sie nach Möglichkeit Fotos des Mangels bei.",
        complaintStep3Before: "Wir bearbeiten die Reklamation innerhalb von ",
        complaintStep3Strong: "14 Tagen",
        complaintStep3After: " ab dem Tag ihres Eingangs.",
        h2Form: "Muster-Widerrufsformular",
        formIntroBefore:
          "Sie können den folgenden Text kopieren, ausfüllen und an die Adresse ",
        formIntroAfter: " oder per Post an die Adresse des Verkäufers senden:",
        formTemplate: `An: ${COMPANY.legalName}
${formatFullAddress(locale)}
E-Mail: ${contact.email}

Ich/Wir, der/die Unterzeichnende [VOR- UND NACHNAME], teile/teilen hiermit den Widerruf des Kaufvertrags über folgende Produkte mit:

– [PRODUKTNAME, BESTELLNUMMER]

Datum des Vertragsabschlusses: [BESTELLDATUM]
Datum des Erhalts des Produkts: [ERHALTSDATUM]
Vor- und Nachname des Verbrauchers: [VOR- UND NACHNAME]
Anschrift des Verbrauchers: [ANSCHRIFT]

Datum: [DATUM]
Unterschrift (nur bei Übermittlung des Formulars in Papierform): .....................`,
        h2Odr: "Außergerichtliche Streitbeilegung",
        odrBefore:
          "Im Falle einer fehlenden Einigung können Sie außergerichtliche Methoden der Streitbeilegung in Anspruch nehmen, u. a. die Online-Plattform ODR der Europäischen Kommission: ",
        odrAfter: ".",
      }
    : {
        h1: "Zwroty i reklamacje",
        meta: "14 dni na zwrot • 2 lata rękojmi",
        h2Return: "Zwrot – odstąpienie od umowy",
        returnIntroBefore:
          "Jeżeli jesteś konsumentem lub przedsiębiorcą na prawach konsumenta, masz prawo odstąpić od umowy zawartej na odległość w ciągu ",
        returnIntroStrong: "14 dni",
        returnIntroAfter:
          " od dnia otrzymania produktu, bez podawania przyczyny.",
        h3How: "Jak to zrobić?",
        howStep1Before: "Wyślij oświadczenie o odstąpieniu na adres ",
        howStep1After: ". Możesz skorzystać z ",
        howStep1Link: "wzoru formularza",
        howStep1End: " poniżej – ale nie jest on obowiązkowy.",
        howStep2:
          "Odeślij produkt na adres Sprzedawcy w stanie niezmienionym, najlepiej w oryginalnym opakowaniu.",
        howStep3:
          "Zwrócimy Ci pełną kwotę zapłaconą za produkt niezwłocznie, nie później niż w ciągu 14 dni od otrzymania oświadczenia. Wysyłka do Ciebie była darmowa, więc nie ma kosztu dostawy do zwrotu. Możemy wstrzymać zwrot do czasu otrzymania produktu lub dowodu jego odesłania.",
        h3Important: "Ważne informacje",
        important1: "Koszt odesłania produktu pokrywa Klient.",
        important2:
          "Dla mebli wielkogabarytowych koszt ten może być znaczny (transport dedykowany) – szacunkowe koszty znajdują się w karcie produktu.",
        important3:
          "Zwrot płatności następuje tym samym kanałem, którym dokonano zapłaty, chyba że uzgodnimy inny sposób.",
        important4Strong: "Prawo zwrotu nie przysługuje",
        important4:
          " w przypadku produktów wykonanych na indywidualne zamówienie (niestandardowe wymiary, spersonalizowana tkanina itp.) – zgodnie z art. 38 ustawy o prawach konsumenta.",
        h2Complaint: "Reklamacja – rękojmia",
        complaintIntroBefore: "Każdy produkt objęty jest ",
        complaintIntroStrong: "rękojmią przez 2 lata",
        complaintIntroAfter:
          " od dnia wydania (dla konsumentów), zgodnie z przepisami Kodeksu cywilnego. Jeżeli produkt ma wadę, możesz:",
        complaintOpt1: "żądać naprawy lub wymiany na nowy,",
        complaintOpt2: "żądać obniżenia ceny,",
        complaintOpt3: "odstąpić od umowy (przy wadzie istotnej).",
        h3HowComplaint: "Jak złożyć reklamację?",
        complaintStep1Before: "Napisz na ",
        complaintStep1After:
          " – podaj numer zamówienia, opis wady i swoje oczekiwania (naprawa, wymiana, obniżenie ceny).",
        complaintStep2: "Dołącz zdjęcia wady, jeżeli to możliwe.",
        complaintStep3Before: "Rozpatrzymy reklamację w terminie ",
        complaintStep3Strong: "14 dni",
        complaintStep3After: " od dnia jej otrzymania.",
        h2Form: "Wzór formularza odstąpienia od umowy",
        formIntroBefore: "Możesz skopiować poniższy tekst, uzupełnić i wysłać na adres ",
        formIntroAfter: " lub pocztą na adres Sprzedawcy:",
        formTemplate: `Do: ${COMPANY.legalName}
${formatFullAddress(locale)}
E-mail: ${contact.email}

Ja, niżej podpisany/a [IMIĘ I NAZWISKO], niniejszym informuję o odstąpieniu od umowy sprzedaży następujących produktów:

– [NAZWA PRODUKTU, NUMER ZAMÓWIENIA]

Data zawarcia umowy: [DATA ZAMÓWIENIA]
Data otrzymania produktu: [DATA OTRZYMANIA]
Imię i nazwisko konsumenta: [IMIĘ I NAZWISKO]
Adres konsumenta: [ADRES]

Data: [DATA]
Podpis (tylko jeżeli formularz jest przesyłany w wersji papierowej): .....................`,
        h2Odr: "Pozasądowe rozwiązywanie sporów",
        odrBefore:
          "W przypadku braku porozumienia możesz skorzystać z pozasądowych metod rozpatrywania sporów, m.in. z platformy internetowej ODR Komisji Europejskiej: ",
        odrAfter: ".",
      };

  return (
    <>
      <h1>{c.h1}</h1>
      <span className="meta">{c.meta}</span>

      <h2>{c.h2Return}</h2>
      <p>
        {c.returnIntroBefore}
        <strong>{c.returnIntroStrong}</strong>
        {c.returnIntroAfter}
      </p>

      <h3>{c.h3How}</h3>
      <ol>
        <li>
          {c.howStep1Before}
          <strong>{contact.email}</strong>
          {c.howStep1After}
          <a href="#wzor-odstapienia">{c.howStep1Link}</a>
          {c.howStep1End}
        </li>
        <li>{c.howStep2}</li>
        <li>{c.howStep3}</li>
      </ol>

      <h3>{c.h3Important}</h3>
      <ul>
        <li>{c.important1}</li>
        <li>{c.important2}</li>
        <li>{c.important3}</li>
        <li>
          <strong>{c.important4Strong}</strong>
          {c.important4}
        </li>
      </ul>

      <h2>{c.h2Complaint}</h2>
      <p>
        {c.complaintIntroBefore}
        <strong>{c.complaintIntroStrong}</strong>
        {c.complaintIntroAfter}
      </p>
      <ul>
        <li>{c.complaintOpt1}</li>
        <li>{c.complaintOpt2}</li>
        <li>{c.complaintOpt3}</li>
      </ul>

      <h3>{c.h3HowComplaint}</h3>
      <ol>
        <li>
          {c.complaintStep1Before}
          <strong>{contact.email}</strong>
          {c.complaintStep1After}
        </li>
        <li>{c.complaintStep2}</li>
        <li>
          {c.complaintStep3Before}
          <strong>{c.complaintStep3Strong}</strong>
          {c.complaintStep3After}
        </li>
      </ol>

      <h2 id="wzor-odstapienia">{c.h2Form}</h2>
      <p>
        {c.formIntroBefore}
        <strong>{contact.email}</strong>
        {c.formIntroAfter}
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
        {c.formTemplate}
      </div>

      <h2>{c.h2Odr}</h2>
      <p>
        {c.odrBefore}
        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
          ec.europa.eu/consumers/odr
        </a>
        {c.odrAfter}
      </p>
    </>
  );
}
