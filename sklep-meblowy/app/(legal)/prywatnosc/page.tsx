import type { Metadata } from "next";
import { COMPANY, formatFullAddress } from "@/app/_lib/company";
import { getContactInfo } from "@/app/_lib/contact-server";
import { getLocale } from "@/app/_lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const de = locale === "de";
  return de
    ? {
        title: "Datenschutzerklärung",
        description:
          "Grundsätze der Verarbeitung personenbezogener Daten im Online-Shop gemäß DSGVO.",
      }
    : {
        title: "Polityka prywatności",
        description:
          "Zasady przetwarzania danych osobowych w sklepie internetowym, zgodnie z RODO.",
      };
}

// HINWEIS: Die deutsche Fassung ist eine maschinelle Übersetzung der polnischen
// Vorlage und sollte vor dem Produktiveinsatz von einem Juristen geprüft werden.

export default async function PrywatnoscPage() {
  const locale = await getLocale();
  const de = locale === "de";
  const contact = await getContactInfo();

  const c = de
    ? {
        h1: "Datenschutzerklärung",
        meta: "Gültig ab 1. Januar 2026",

        s1: "§ 1. Verantwortlicher für die personenbezogenen Daten",
        s1Before: "Verantwortlicher für Ihre personenbezogenen Daten ist ",
        s1Mid: " mit Sitz unter der Adresse ",
        s1NipLabel: ", Steuernummer (NIP): ",
        s1AfterNip:
          " (nachfolgend: „Verantwortlicher“). Kontakt in Angelegenheiten des Datenschutzes: ",
        s1End: ".",

        s2: "§ 2. Welche Daten wir erheben und zu welchem Zweck",
        s2Intro:
          "Wir verarbeiten die folgenden Kategorien von Daten, abhängig von der Interaktion mit dem Shop:",
        s2aTitle: "a) Aufgabe einer Bestellung",
        s2a1: "Vor- und Nachname,",
        s2a2: "Lieferadresse,",
        s2a3: "E-Mail-Adresse,",
        s2a4: "Telefonnummer (optional, für den Kontakt durch den Kurier),",
        s2a5: "bei einer Rechnung: Firmendaten und Steuernummer (NIP).",
        s2aPurposeStrong: "Zweck:",
        s2aPurpose:
          " Erfüllung des Kaufvertrags (Art. 6 Abs. 1 lit. b DSGVO), Ausstellung von Buchhaltungsdokumenten (Art. 6 Abs. 1 lit. c DSGVO).",
        s2bTitle: "b) Anlegen eines Kontos",
        s2b1: "E-Mail-Adresse und Passwort (in verschlüsselter Form gespeichert),",
        s2b2:
          "optional: gespeicherte Daten zur schnelleren Aufgabe weiterer Bestellungen.",
        s2bPurposeStrong: "Zweck:",
        s2bPurpose: " Erbringung der Kontodienstleistung (Art. 6 Abs. 1 lit. b DSGVO).",
        s2cTitle: "c) Zahlungsabwicklung",
        s2cBefore:
          "Zahlungsdaten (Kartennummer, Transaktionsdaten) werden ",
        s2cStrong: "nicht gespeichert",
        s2cMid: " durch den Shop. Sie werden vom Zahlungsdienstleister ",
        s2cOperatorStrong: "PayPro S.A. (Przelewy24)",
        s2cAfter:
          " verarbeitet, der ein gesonderter Verantwortlicher für diese Daten ist – Einzelheiten in § 9 dieser Erklärung.",
        s2dTitle: "d) Nutzung der Website",
        s2d1: "IP-Adresse,",
        s2d2: "Informationen über Browser und Betriebssystem,",
        s2d3Before: "Cookies (siehe § 6).",
        s2dPurposeStrong: "Zweck:",
        s2dPurpose:
          " ordnungsgemäßer Betrieb des Shops, Sicherheit, Analytik (Art. 6 Abs. 1 lit. f DSGVO – berechtigtes Interesse).",

        s3: "§ 3. Empfänger der Daten",
        s3Intro: "Ihre personenbezogenen Daten können weitergegeben werden an:",
        s3_1Strong: "Kurierunternehmen",
        s3_1:
          " – in dem für die Lieferung erforderlichen Umfang (Vorname, Nachname, Adresse, Telefon).",
        s3_2Strong: "den Zahlungsdienstleister",
        s3_2:
          " PayPro S.A. (Przelewy24), ul. Pastelowa 8, 60-198 Poznań, KRS 0000347935, NIP 7792369887 – in dem für die Durchführung der Transaktion erforderlichen Umfang (Einzelheiten in § 9).",
        s3_3Strong: "Infrastruktur-Anbieter",
        s3_3:
          " – Supabase (Datenbank-Hosting), Vercel (Anwendungs-Hosting), Resend (Versand transaktionaler E-Mails).",
        s3_4Strong: "das Buchhaltungsbüro",
        s3_4: " – in dem für die Buchführung erforderlichen Umfang.",
        s3_5Strong: "öffentliche Stellen",
        s3_5: " – ausschließlich, wenn dies aus einer gesetzlichen Pflicht folgt.",

        s4: "§ 4. Übermittlung von Daten außerhalb des EWR",
        s4Body:
          "Ein Teil der Infrastruktur-Anbieter (Vercel) hat seinen Sitz außerhalb des Europäischen Wirtschaftsraums. Die Übermittlung der Daten erfolgt auf Grundlage der von der Europäischen Kommission genehmigten Standardvertragsklauseln sowie eines Angemessenheitsbeschlusses zum Datenschutzniveau (EU-US Data Privacy Framework). Der Zahlungsdienstleister PayPro S.A. (Przelewy24) hat seinen Sitz in Polen – die Daten an den Zahlungsdienstleister werden nicht außerhalb des EWR übermittelt.",

        s5: "§ 5. Aufbewahrungsdauer der Daten",
        s5_1Strong: "Bestelldaten",
        s5_1:
          " – für 5 Jahre ab dem Ende des Kalenderjahres, in dem die Bestellung ausgeführt wurde (steuerliche Pflicht).",
        s5_2Strong: "Kontodaten",
        s5_2: " – bis zur Löschung des Kontos durch den Nutzer.",
        s5_3Strong: "Marketingdaten",
        s5_3: " (sofern Sie eingewilligt haben) – bis zum Widerruf der Einwilligung.",

        s6: "§ 6. Cookies",
        s6_1:
          "Der Shop verwendet Cookies, um den ordnungsgemäßen Betrieb der Website sicherzustellen und den Verkehr zu analysieren.",
        s6_2Intro: "Wir verwenden die folgenden Cookie-Kategorien:",
        s6_2aStrong: "Notwendige",
        s6_2a:
          " – erforderlich für den Betrieb des Shops (z. B. Aufrechterhaltung der Anmeldesitzung, Warenkorb). Erfordern keine Einwilligung.",
        s6_2bStrong: "Analytische",
        s6_2b:
          " – helfen zu verstehen, wie Nutzer die Website verwenden. Erfordern eine Einwilligung.",
        s6_2cStrong: "Marketing",
        s6_2c:
          " – dienen der Präsentation von Werbeinhalten. Erfordern eine Einwilligung.",
        s6_3:
          "Sie können Cookies in den Einstellungen Ihres Browsers sowie über das Cookie-Banner verwalten, das beim ersten Besuch des Shops angezeigt wird.",
        s6_4:
          "Zur Verkehrsanalyse nutzen wir Google Analytics 4 (Anbieter: Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland). Das Skript wird erst geladen, nachdem Sie in analytische Cookies eingewilligt haben – ohne diese Einwilligung werden keine Daten an Google übermittelt. Google Analytics speichert u. a. die Cookies _ga und _ga_*, die eine wiederkehrende Sitzung unterscheiden. Dabei können Daten außerhalb des EWR übermittelt werden, auf Grundlage der von der Europäischen Kommission genehmigten Standardvertragsklauseln.",

        s7: "§ 7. Ihre Rechte",
        s7Intro:
          "Im Zusammenhang mit der Verarbeitung Ihrer personenbezogenen Daten haben Sie das Recht auf:",
        s7_1: "Zugang zum Inhalt Ihrer Daten,",
        s7_2: "Berichtigung (Korrektur) der Daten,",
        s7_3: "Löschung der Daten („Recht auf Vergessenwerden“),",
        s7_4: "Einschränkung der Verarbeitung,",
        s7_5: "Datenübertragbarkeit,",
        s7_6:
          "Widerspruch gegen die auf dem berechtigten Interesse des Verantwortlichen beruhende Verarbeitung,",
        s7_7:
          "Widerruf der Einwilligung zu jedem Zeitpunkt (dies berührt nicht die Rechtmäßigkeit der zuvor erfolgten Verarbeitung),",
        s7_8:
          "Einreichung einer Beschwerde beim Präsidenten des Amtes für den Schutz personenbezogener Daten (ul. Stawki 2, 00-193 Warszawa).",
        s7OutroBefore:
          "In Angelegenheiten, die Ihre Rechte betreffen, kontaktieren Sie uns unter der Adresse ",
        s7OutroAfter: ".",

        s8: "§ 8. Änderungen der Datenschutzerklärung",
        s8Body:
          "Die Datenschutzerklärung kann aktualisiert werden. Das Datum der letzten Aktualisierung ist zu Beginn des Dokuments angegeben. Über wesentliche Änderungen informieren wir Nutzer mit einem aktiven Konto per E-Mail.",

        s9: "§ 9. An den Zahlungsdienstleister übermittelte Daten (Przelewy24)",
        s9_1Before:
          "Zur Abwicklung der Zahlung für die Bestellung stellen wir dem Zahlungsdienstleister die folgenden personenbezogenen Daten des Kunden zur Verfügung: ",
        s9_1Strong: "E-Mail-Adresse, Vorname, Nachname, Adresse",
        s9_1After:
          ". Diese Daten werden in dem für die Durchführung der Zahlungstransaktion erforderlichen Umfang übermittelt.",
        s9_2Strong: "Empfänger dieser Daten (gesonderter Verantwortlicher):",
        s9_2:
          "PayPro Spółka Akcyjna mit Sitz in Poznań, ul. Pastelowa 8, 60-198 Poznań, eingetragen im Unternehmerregister des Landesgerichtsregisters, geführt vom Amtsgericht Poznań Nowe Miasto i Wilda in Poznań, VIII. Wirtschaftsabteilung des KRS, unter der KRS-Nummer ",
        s9_2Krs: "0000347935",
        s9_2NipLabel: ", NIP ",
        s9_2Nip: "7792369887",
        s9_2After:
          ", REGON 301345068, nationales Zahlungsinstitut, eingetragen im Register der KNF unter der Nummer IP24/2014.",
        s9_3Strong: "Zwecke der Datenverarbeitung durch PayPro:",
        s9_3:
          " Erbringung von Zahlungsdienstleistungen (Annahme und Abrechnung von Zahlungen zugunsten des Shops), insbesondere in dem zur Verhinderung von Betrug im Zusammenhang mit den erbrachten Zahlungsdienstleistungen sowie zur Verfolgung und Aufdeckung solcher Betrugsfälle erforderlichen Umfang, sowie zur Identifizierung des Zahlers in dem sich aus den gesetzlichen Vorschriften ergebenden Umfang (Gesetz über Zahlungsdienste, AML-Gesetz).",
        s9_4Before:
          "Die ausführliche Informationsklausel der PayPro S.A. zur Verarbeitung personenbezogener Daten der Zahler ist unter der folgenden Adresse verfügbar: ",
        s9_4After: ".",
      }
    : {
        h1: "Polityka prywatności",
        meta: "Obowiązuje od 1 stycznia 2026 r.",

        s1: "§ 1. Administrator danych osobowych",
        s1Before: "Administratorem Twoich danych osobowych jest ",
        s1Mid: " z siedzibą pod adresem ",
        s1NipLabel: ", NIP: ",
        s1AfterNip:
          " (dalej: „Administrator”). Kontakt w sprawach ochrony danych: ",
        s1End: ".",

        s2: "§ 2. Jakie dane zbieramy i w jakim celu",
        s2Intro:
          "Przetwarzamy następujące kategorie danych, w zależności od interakcji ze Sklepem:",
        s2aTitle: "a) Złożenie zamówienia",
        s2a1: "imię i nazwisko,",
        s2a2: "adres dostawy,",
        s2a3: "adres e-mail,",
        s2a4: "numer telefonu (opcjonalnie, do kontaktu kuriera),",
        s2a5: "w przypadku faktury: dane firmy i NIP.",
        s2aPurposeStrong: "Cel:",
        s2aPurpose:
          " realizacja umowy sprzedaży (art. 6 ust. 1 lit. b RODO), wystawienie dokumentów księgowych (art. 6 ust. 1 lit. c RODO).",
        s2bTitle: "b) Założenie konta",
        s2b1: "adres e-mail i hasło (przechowywane w formie zaszyfrowanej),",
        s2b2:
          "opcjonalnie: dane zapamiętane do szybszego składania kolejnych zamówień.",
        s2bPurposeStrong: "Cel:",
        s2bPurpose: " świadczenie usługi konta (art. 6 ust. 1 lit. b RODO).",
        s2cTitle: "c) Obsługa płatności",
        s2cBefore: "Dane płatności (numer karty, dane transakcji) ",
        s2cStrong: "nie są przechowywane",
        s2cMid: " przez Sklep. Obsługuje je operator płatności ",
        s2cOperatorStrong: "PayPro S.A. (Przelewy24)",
        s2cAfter:
          ", który jest odrębnym administratorem tych danych — szczegóły w § 9 niniejszej Polityki.",
        s2dTitle: "d) Korzystanie ze strony",
        s2d1: "adres IP,",
        s2d2: "informacje o przeglądarce i systemie operacyjnym,",
        s2d3Before: "pliki cookies (patrz § 6).",
        s2dPurposeStrong: "Cel:",
        s2dPurpose:
          " prawidłowe działanie Sklepu, bezpieczeństwo, analityka (art. 6 ust. 1 lit. f RODO – uzasadniony interes).",

        s3: "§ 3. Odbiorcy danych",
        s3Intro: "Twoje dane osobowe mogą być przekazywane:",
        s3_1Strong: "Firmom kurierskim",
        s3_1:
          " – w zakresie niezbędnym do dostawy (imię, nazwisko, adres, telefon).",
        s3_2Strong: "Operatorowi płatności",
        s3_2:
          " PayPro S.A. (Przelewy24), ul. Pastelowa 8, 60-198 Poznań, KRS 0000347935, NIP 7792369887 – w zakresie niezbędnym do realizacji transakcji (szczegóły w § 9).",
        s3_3Strong: "Dostawcom infrastruktury",
        s3_3:
          " – Supabase (hosting bazy danych), Vercel (hosting aplikacji), Resend (wysyłka e-maili transakcyjnych).",
        s3_4Strong: "Biuru rachunkowemu",
        s3_4: " – w zakresie niezbędnym do prowadzenia księgowości.",
        s3_5Strong: "Organom publicznym",
        s3_5: " – wyłącznie gdy wynika to z obowiązku prawnego.",

        s4: "§ 4. Przekazywanie danych poza EOG",
        s4Body:
          "Część dostawców infrastruktury (Vercel) ma siedzibę poza Europejskim Obszarem Gospodarczym. Przekazanie danych odbywa się na podstawie standardowych klauzul umownych zatwierdzonych przez Komisję Europejską oraz decyzji o odpowiednim poziomie ochrony danych (EU-US Data Privacy Framework). Operator płatności PayPro S.A. (Przelewy24) ma siedzibę w Polsce — dane do operatora płatności nie są przekazywane poza EOG.",

        s5: "§ 5. Okres przechowywania danych",
        s5_1Strong: "Dane zamówienia",
        s5_1:
          " – przez 5 lat od końca roku kalendarzowego, w którym zrealizowano zamówienie (obowiązek podatkowy).",
        s5_2Strong: "Dane konta",
        s5_2: " – do momentu usunięcia konta przez użytkownika.",
        s5_3Strong: "Dane marketingowe",
        s5_3: " (jeśli wyraziłeś zgodę) – do momentu wycofania zgody.",

        s6: "§ 6. Pliki cookies",
        s6_1:
          "Sklep używa plików cookies (ciasteczek) w celu zapewnienia prawidłowego działania strony oraz analizy ruchu.",
        s6_2Intro: "Stosujemy następujące kategorie cookies:",
        s6_2aStrong: "Niezbędne",
        s6_2a:
          " – wymagane do działania Sklepu (np. utrzymanie sesji zalogowania, koszyk). Nie wymagają zgody.",
        s6_2bStrong: "Analityczne",
        s6_2b:
          " – pomagają zrozumieć, jak użytkownicy korzystają ze strony. Wymagają zgody.",
        s6_2cStrong: "Marketingowe",
        s6_2c:
          " – służą do prezentowania treści reklamowych. Wymagają zgody.",
        s6_3:
          "Możesz zarządzać cookies w ustawieniach przeglądarki oraz poprzez baner cookies wyświetlany przy pierwszej wizycie w Sklepie.",
        s6_4:
          "Do analizy ruchu korzystamy z Google Analytics 4 (dostawca: Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irlandia). Skrypt ładuje się dopiero po wyrażeniu przez Ciebie zgody na cookies analityczne – bez tej zgody żadne dane nie trafiają do Google. Google Analytics zapisuje m.in. cookies _ga oraz _ga_*, które pozwalają odróżnić powracającą sesję. Dane mogą być przy tym przekazywane poza EOG, na podstawie standardowych klauzul umownych zatwierdzonych przez Komisję Europejską.",

        s7: "§ 7. Twoje prawa",
        s7Intro:
          "W związku z przetwarzaniem Twoich danych osobowych masz prawo do:",
        s7_1: "dostępu do treści swoich danych,",
        s7_2: "sprostowania (poprawienia) danych,",
        s7_3: "usunięcia danych („prawo do bycia zapomnianym”),",
        s7_4: "ograniczenia przetwarzania,",
        s7_5: "przenoszenia danych,",
        s7_6:
          "wniesienia sprzeciwu wobec przetwarzania opartego na uzasadnionym interesie Administratora,",
        s7_7:
          "wycofania zgody w dowolnym momencie (nie wpływa to na legalność wcześniejszego przetwarzania),",
        s7_8:
          "wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa).",
        s7OutroBefore:
          "W sprawach związanych z Twoimi prawami skontaktuj się z nami pod adresem ",
        s7OutroAfter: ".",

        s8: "§ 8. Zmiany polityki prywatności",
        s8Body:
          "Polityka prywatności może być aktualizowana. Data ostatniej aktualizacji wskazana jest na początku dokumentu. O istotnych zmianach poinformujemy użytkowników z aktywnym kontem drogą e-mailową.",

        s9: "§ 9. Dane przekazywane operatorowi płatności (Przelewy24)",
        s9_1Before:
          "W celu realizacji płatności za zamówienie udostępniamy operatorowi płatności następujące dane osobowe Klienta: ",
        s9_1Strong: "adres e-mail, imię, nazwisko, adres",
        s9_1After:
          ". Dane te przekazywane są w zakresie niezbędnym do przeprowadzenia transakcji płatniczej.",
        s9_2Strong: "Odbiorca tych danych (odrębny administrator):",
        s9_2:
          "PayPro Spółka Akcyjna z siedzibą w Poznaniu, ul. Pastelowa 8, 60-198 Poznań, wpisana do Rejestru Przedsiębiorców Krajowego Rejestru Sądowego prowadzonego przez Sąd Rejonowy Poznań Nowe Miasto i Wilda w Poznaniu, VIII Wydział Gospodarczy KRS pod numerem KRS ",
        s9_2Krs: "0000347935",
        s9_2NipLabel: ", NIP ",
        s9_2Nip: "7792369887",
        s9_2After:
          ", REGON 301345068, krajowa instytucja płatnicza wpisana do rejestru KNF pod numerem IP24/2014.",
        s9_3Strong: "Cele przetwarzania danych przez PayPro:",
        s9_3:
          " świadczenie usług płatniczych (przyjmowanie i rozliczanie płatności na rzecz Sklepu), w szczególności w zakresie niezbędnym do zapobiegania oszustwom związanym z wykonywanymi usługami płatniczymi oraz dochodzenia i wykrywania tego rodzaju oszustw, a także identyfikacji Płatnika w zakresie wynikającym z przepisów prawa (Ustawa o usługach płatniczych, Ustawa AML).",
        s9_4Before:
          "Szczegółowa klauzula informacyjna PayPro S.A. dotycząca przetwarzania danych osobowych Płatników dostępna jest pod adresem: ",
        s9_4After: ".",
      };

  return (
    <>
      <h1>{c.h1}</h1>
      <span className="meta">{c.meta}</span>

      <h2>{c.s1}</h2>
      <p>
        {c.s1Before}
        <strong>{COMPANY.legalName}</strong>
        {c.s1Mid}
        {formatFullAddress(locale)}
        {c.s1NipLabel}
        {COMPANY.nip}
        {c.s1AfterNip}
        <strong>{contact.email}</strong>
        {c.s1End}
      </p>

      <h2>{c.s2}</h2>
      <p>{c.s2Intro}</p>
      <h3>{c.s2aTitle}</h3>
      <ul>
        <li>{c.s2a1}</li>
        <li>{c.s2a2}</li>
        <li>{c.s2a3}</li>
        <li>{c.s2a4}</li>
        <li>{c.s2a5}</li>
      </ul>
      <p>
        <strong>{c.s2aPurposeStrong}</strong>
        {c.s2aPurpose}
      </p>

      <h3>{c.s2bTitle}</h3>
      <ul>
        <li>{c.s2b1}</li>
        <li>{c.s2b2}</li>
      </ul>
      <p>
        <strong>{c.s2bPurposeStrong}</strong>
        {c.s2bPurpose}
      </p>

      <h3>{c.s2cTitle}</h3>
      <p>
        {c.s2cBefore}
        <strong>{c.s2cStrong}</strong>
        {c.s2cMid}
        <strong>{c.s2cOperatorStrong}</strong>
        {c.s2cAfter}
      </p>

      <h3>{c.s2dTitle}</h3>
      <ul>
        <li>{c.s2d1}</li>
        <li>{c.s2d2}</li>
        <li>{c.s2d3Before}</li>
      </ul>
      <p>
        <strong>{c.s2dPurposeStrong}</strong>
        {c.s2dPurpose}
      </p>

      <h2>{c.s3}</h2>
      <p>{c.s3Intro}</p>
      <ul>
        <li>
          <strong>{c.s3_1Strong}</strong>
          {c.s3_1}
        </li>
        <li>
          <strong>{c.s3_2Strong}</strong>
          {c.s3_2}
        </li>
        <li>
          <strong>{c.s3_3Strong}</strong>
          {c.s3_3}
        </li>
        <li>
          <strong>{c.s3_4Strong}</strong>
          {c.s3_4}
        </li>
        <li>
          <strong>{c.s3_5Strong}</strong>
          {c.s3_5}
        </li>
      </ul>

      <h2>{c.s4}</h2>
      <p>{c.s4Body}</p>

      <h2>{c.s5}</h2>
      <ul>
        <li>
          <strong>{c.s5_1Strong}</strong>
          {c.s5_1}
        </li>
        <li>
          <strong>{c.s5_2Strong}</strong>
          {c.s5_2}
        </li>
        <li>
          <strong>{c.s5_3Strong}</strong>
          {c.s5_3}
        </li>
      </ul>

      <h2>{c.s6}</h2>
      <ol>
        <li>{c.s6_1}</li>
        <li>
          {c.s6_2Intro}
          <ul>
            <li>
              <strong>{c.s6_2aStrong}</strong>
              {c.s6_2a}
            </li>
            <li>
              <strong>{c.s6_2bStrong}</strong>
              {c.s6_2b}
            </li>
            <li>
              <strong>{c.s6_2cStrong}</strong>
              {c.s6_2c}
            </li>
          </ul>
        </li>
        <li>{c.s6_3}</li>
        <li>{c.s6_4}</li>
      </ol>

      <h2>{c.s7}</h2>
      <p>{c.s7Intro}</p>
      <ul>
        <li>{c.s7_1}</li>
        <li>{c.s7_2}</li>
        <li>{c.s7_3}</li>
        <li>{c.s7_4}</li>
        <li>{c.s7_5}</li>
        <li>{c.s7_6}</li>
        <li>{c.s7_7}</li>
        <li>{c.s7_8}</li>
      </ul>
      <p>
        {c.s7OutroBefore}
        <strong>{contact.email}</strong>
        {c.s7OutroAfter}
      </p>

      <h2>{c.s8}</h2>
      <p>{c.s8Body}</p>

      <h2>{c.s9}</h2>
      <p>
        {c.s9_1Before}
        <strong>{c.s9_1Strong}</strong>
        {c.s9_1After}
      </p>
      <p>
        <strong>{c.s9_2Strong}</strong>
        <br />
        {c.s9_2}
        <strong>{c.s9_2Krs}</strong>
        {c.s9_2NipLabel}
        <strong>{c.s9_2Nip}</strong>
        {c.s9_2After}
      </p>
      <p>
        <strong>{c.s9_3Strong}</strong>
        {c.s9_3}
      </p>
      <p>
        {c.s9_4Before}
        <a
          href="https://www.przelewy24.pl/obowiazek-informacyjny-rodo-platnicy"
          target="_blank"
          rel="noopener noreferrer"
        >
          przelewy24.pl/obowiazek-informacyjny-rodo-platnicy
        </a>
        {c.s9_4After}
      </p>
    </>
  );
}
