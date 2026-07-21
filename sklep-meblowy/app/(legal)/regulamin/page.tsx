import type { Metadata } from "next";
import { COMPANY, formatFullAddress, isFilled } from "@/app/_lib/company";
import { getContactInfo } from "@/app/_lib/contact-server";
import { localizeHref } from "@/app/_lib/i18n";
import { getLocale } from "@/app/_lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const de = locale === "de";
  return de
    ? {
        title: "AGB",
        description:
          "Allgemeine Geschäftsbedingungen des Online-Shops – Regeln des Vertragsabschlusses, Versand, Zahlungen, Reklamationen.",
      }
    : {
        title: "Regulamin sklepu",
        description:
          "Regulamin sklepu internetowego – zasady zawierania umów, dostawa, płatności, reklamacje.",
      };
}

// UWAGA: To jest szablon zgodny z polskim prawem konsumenckim (ustawa o prawach
// konsumenta z 30.05.2014, RODO, ustawa o świadczeniu usług drogą elektroniczną).
// Przed uruchomieniem produkcji przejrzyj dokument — najlepiej z prawnikiem —
// i dostosuj punkty specyficzne dla Twojej działalności.
//
// HINWEIS: Die deutsche Fassung ist eine maschinelle Übersetzung der polnischen
// Vorlage und sollte vor dem Produktiveinsatz von einem Juristen geprüft werden.

export default async function RegulaminPage() {
  const locale = await getLocale();
  const de = locale === "de";
  const contact = await getContactInfo();

  const c = de
    ? {
        h1: "Allgemeine Geschäftsbedingungen des Online-Shops",
        meta: "Gültig ab 1. Januar 2026",

        s1: "§ 1. Allgemeine Bestimmungen",
        s1_1Before:
          "Diese Geschäftsbedingungen regeln die Nutzung des Online-Shops, der unter der Adresse ",
        s1_1After: " verfügbar ist (nachfolgend: „Shop“).",
        s1_2Before: "Inhaber des Shops ist ",
        s1_2Mid: " mit Sitz unter der Adresse ",
        s1_2NipLabel: ", Steuernummer (NIP): ",
        s1_2RegonLabel: ", REGON: ",
        s1_2KrsLabel: ", KRS: ",
        s1_2After: " (nachfolgend: „Verkäufer“).",
        s1_3Before: "Kontakt zum Verkäufer: E-Mail ",
        s1_3Phone: ", Telefon ",
        s1_3End: ".",
        s1_4:
          "Der Shop betreibt den Einzelhandel mit Möbeln und Einrichtungszubehör über das Internet auf dem Gebiet der Republik Polen.",

        s2: "§ 2. Begriffsbestimmungen",
        s2_1Strong: "Kunde",
        s2_1:
          " – eine natürliche Person, juristische Person oder Organisationseinheit ohne Rechtspersönlichkeit, die im Shop einen Kauf tätigt.",
        s2_2Strong: "Verbraucher",
        s2_2:
          " – ein Kunde als natürliche Person, der einen Vertrag schließt, der nicht unmittelbar mit seiner gewerblichen oder beruflichen Tätigkeit zusammenhängt.",
        s2_3Strong: "Unternehmer mit Verbraucherrechten",
        s2_3:
          " – eine natürliche Person, die eine gewerbliche Tätigkeit ausübt und einen Vertrag schließt, der unmittelbar mit ihrer Tätigkeit zusammenhängt, wenn sich aus dessen Inhalt ergibt, dass er für sie keinen beruflichen Charakter hat.",
        s2_4Strong: "Produkt",
        s2_4: " – eine im Shop zum Verkauf angebotene Ware.",
        s2_5Strong: "Bestellung",
        s2_5:
          " – eine Willenserklärung des Kunden, die unmittelbar auf den Abschluss eines Kaufvertrags über ein Produkt gerichtet ist.",

        s3: "§ 3. Aufgabe von Bestellungen",
        s3_1:
          "Bestellungen können rund um die Uhr über die Shop-Website aufgegeben werden. Bestellungen, die an Werktagen nach 12:00 Uhr sowie an arbeitsfreien Tagen aufgegeben werden, werden am nächstfolgenden Werktag zur Bearbeitung angenommen.",
        s3_2:
          "Die Aufgabe einer Bestellung erfordert die Angabe der zur Vertragserfüllung erforderlichen personenbezogenen Daten: Vorname, Nachname, Lieferadresse, Telefonnummer und E-Mail-Adresse.",
        s3_3:
          "Im Rahmen der Bestellung bestätigt der Kunde, diese Geschäftsbedingungen zur Kenntnis genommen und deren Bestimmungen akzeptiert zu haben.",
        s3_4:
          "Die Bestellung gilt mit dem Erhalt einer Bestätigung über deren Annahme durch den Kunden an die angegebene E-Mail-Adresse als aufgegeben.",
        s3_5:
          "Der Kaufvertrag kommt mit der Gutschrift der Zahlung auf dem Bankkonto des Verkäufers oder des Zahlungsdienstleisters zustande.",

        s4: "§ 4. Preise und Zahlungen",
        s4_1:
          "Alle im Shop angegebenen Produktpreise sind Bruttopreise (inklusive Mehrwertsteuer) und werden in polnischen Złoty (PLN) angegeben.",
        s4_2:
          "Der Produktpreis ist der Endpreis — der Versand innerhalb der Republik Polen ist kostenlos, der Verkäufer berechnet keine Lieferkosten.",
        s4_3Intro:
          "Der Kunde kann eine der im Shop verfügbaren Zahlungsmethoden wählen:",
        s4_3a: "Online-Zahlung mit Zahlungskarte,",
        s4_3b: "BLIK,",
        s4_3c: "Sofortüberweisung (Przelewy24).",
        s4_4:
          "Der Verkäufer stellt einen Kassenbon oder – auf in der Bestellung gemeldeten Wunsch des Kunden – eine Mehrwertsteuerrechnung aus.",

        s5: "§ 5. Bestellabwicklung und Lieferung",
        s5_1:
          "Die Bearbeitungszeit der Bestellung wird ab dem Tag der Gutschrift der Zahlung gerechnet und ist jeweils auf der Produktseite angegeben.",
        s5_2:
          "Die Lieferung erfolgt auf dem Gebiet der Republik Polen über ein Kurierunternehmen oder einen Möbeltransport (bei sperrigen Produkten).",
        s5_3Before: "Der Versand innerhalb der Republik Polen ist ",
        s5_3Strong: "kostenlos",
        s5_3Mid:
          " — der Verkäufer berechnet keine Lieferkosten. Nach Aufgabe der Bestellung setzt sich das Transportunternehmen mit dem Kunden in Verbindung, um einen passenden Liefertermin zu vereinbaren. Einzelheiten finden Sie im Bereich ",
        s5_3Link: "Versand und Zahlung",
        s5_3After: ".",
        s5_4:
          "Der Kunde ist verpflichtet, den Zustand der Sendung im Beisein des Kuriers zu prüfen. Werden Schäden an der Verpackung oder am Produkt festgestellt, wird die Erstellung eines Schadensprotokolls empfohlen.",

        s6: "§ 6. Widerrufsrecht",
        s6_1:
          "Der Verbraucher sowie der Unternehmer mit Verbraucherrechten haben das Recht, den Vertrag innerhalb von 14 Tagen ab dem Tag des Erhalts des Produkts ohne Angabe von Gründen zu widerrufen.",
        s6_2Before:
          "Um vom Widerrufsrecht Gebrauch zu machen, ist der Verkäufer mittels einer eindeutigen Erklärung, die an die E-Mail-Adresse ",
        s6_2After:
          " oder die Postanschrift des Verkäufers gesendet wird, über die Entscheidung zu informieren.",
        s6_3Before:
          "Der Kunde kann das Muster-Widerrufsformular verwenden, das im Bereich ",
        s6_3Link: "Rückgabe und Reklamation",
        s6_3After: " verfügbar ist.",
        s6_4:
          "Im Falle des Widerrufs gilt der Vertrag als nicht geschlossen. Der Verkäufer erstattet dem Kunden alle erhaltenen Zahlungen, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich aus der vom Kunden gewählten anderen als der vom Shop angebotenen günstigsten Lieferart ergeben), unverzüglich, spätestens 14 Tage ab dem Tag des Erhalts der Widerrufserklärung.",
        s6_5:
          "Der Kunde trägt die unmittelbaren Kosten der Rücksendung des Produkts. Bei Produkten, die aufgrund ihrer Abmessungen nicht als gewöhnliche Sendung zurückgesendet werden können, können diese Kosten höher sein – die geschätzten Rücksendekosten sind auf der Produktseite angegeben.",
        s6_6:
          "Das Widerrufsrecht besteht nicht bei Produkten, die nach individueller Bestellung des Kunden gefertigt wurden (z. B. ungewöhnliche Abmessungen, personalisierter Stoff), gemäß Art. 38 des Verbraucherrechtegesetzes.",

        s7: "§ 7. Reklamationen (Gewährleistung)",
        s7_1:
          "Der Verkäufer haftet gegenüber dem Verbraucher aus der Gewährleistung für Mängel des Produkts für einen Zeitraum von 2 Jahren ab dem Tag der Übergabe des Produkts, gemäß den Bestimmungen des Zivilgesetzbuches.",
        s7_2Before:
          "Eine Reklamation kann in elektronischer Form (an die Adresse ",
        s7_2After: ") oder schriftlich (an die Adresse des Verkäufers) eingereicht werden.",
        s7_3:
          "Die Reklamationsmeldung sollte enthalten: die Daten des Kunden, die Bestellnummer, eine Beschreibung des Mangels sowie das Begehren des Kunden (Reparatur, Austausch, Preisminderung, Rücktritt vom Vertrag).",
        s7_4:
          "Der Verkäufer bearbeitet die Reklamation innerhalb von 14 Tagen ab dem Tag ihres Eingangs und informiert den Kunden über die Art ihrer Erledigung.",

        s8: "§ 8. Außergerichtliche Methoden der Reklamationsbearbeitung",
        s8_1Intro:
          "Der Verbraucher hat die Möglichkeit, außergerichtliche Methoden der Reklamationsbearbeitung und Geltendmachung von Ansprüchen in Anspruch zu nehmen, darunter:",
        s8_1a:
          "Mediation, die von den Woiwodschaftsinspektoraten der Handelsinspektion durchgeführt wird,",
        s8_1b: "ständige Schiedsgerichte für Verbraucher,",
        s8_1cBefore: "die Online-Plattform ODR der Europäischen Kommission: ",
        s8_1cAfter: ".",

        s9: "§ 9. Schutz personenbezogener Daten",
        s9Before:
          "Die Grundsätze der Verarbeitung personenbezogener Daten sind in einem gesonderten Dokument beschrieben: ",
        s9Link: "Datenschutzerklärung",
        s9After: ".",

        s10: "§ 10. Schlussbestimmungen",
        s10_1:
          "In Angelegenheiten, die in diesen Geschäftsbedingungen nicht geregelt sind, finden die Vorschriften des polnischen Rechts Anwendung, insbesondere des Zivilgesetzbuches, des Verbraucherrechtegesetzes sowie des Gesetzes über die Erbringung von Dienstleistungen auf elektronischem Wege.",
        s10_2:
          "Der Verkäufer behält sich das Recht vor, die Geschäftsbedingungen zu ändern. Die Änderungen treten zu dem vom Verkäufer angegebenen Zeitpunkt in Kraft, der nicht kürzer als 7 Tage ab dem Tag der Veröffentlichung auf der Shop-Website ist. Die Änderungen gelten nicht für Bestellungen, die vor dem Zeitpunkt ihres Inkrafttretens aufgegeben wurden.",
        s10_3:
          "Etwaige Streitigkeiten, die im Zusammenhang mit einem auf Grundlage dieser Geschäftsbedingungen geschlossenen Vertrag entstehen, werden von dem für den Wohnsitz des Verbrauchers zuständigen ordentlichen Gericht entschieden, bei Kunden, die keine Verbraucher sind, von dem für den Sitz des Verkäufers zuständigen Gericht.",
      }
    : {
        h1: "Regulamin sklepu internetowego",
        meta: "Obowiązuje od 1 stycznia 2026 r.",

        s1: "§ 1. Postanowienia ogólne",
        s1_1Before:
          "Niniejszy regulamin określa zasady korzystania ze sklepu internetowego dostępnego pod adresem ",
        s1_1After: " (dalej: „Sklep”).",
        s1_2Before: "Właścicielem Sklepu jest ",
        s1_2Mid: " z siedzibą pod adresem ",
        s1_2NipLabel: ", NIP: ",
        s1_2RegonLabel: ", REGON: ",
        s1_2KrsLabel: ", KRS: ",
        s1_2After: " (dalej: „Sprzedawca”).",
        s1_3Before: "Kontakt ze Sprzedawcą: e-mail ",
        s1_3Phone: ", telefon ",
        s1_3End: ".",
        s1_4:
          "Sklep prowadzi sprzedaż detaliczną mebli oraz akcesoriów wyposażenia wnętrz za pośrednictwem sieci Internet na terenie Rzeczypospolitej Polskiej.",

        s2: "§ 2. Definicje",
        s2_1Strong: "Klient",
        s2_1:
          " – osoba fizyczna, osoba prawna lub jednostka organizacyjna nieposiadająca osobowości prawnej, która dokonuje zakupu w Sklepie.",
        s2_2Strong: "Konsument",
        s2_2:
          " – Klient będący osobą fizyczną, zawierający umowę niezwiązaną bezpośrednio z jego działalnością gospodarczą lub zawodową.",
        s2_3Strong: "Przedsiębiorca na prawach konsumenta",
        s2_3:
          " – osoba fizyczna prowadząca działalność gospodarczą, zawierająca umowę bezpośrednio związaną z jej działalnością, gdy z jej treści wynika, że nie posiada ona dla niej charakteru zawodowego.",
        s2_4Strong: "Produkt",
        s2_4: " – towar oferowany do sprzedaży w Sklepie.",
        s2_5Strong: "Zamówienie",
        s2_5:
          " – oświadczenie woli Klienta, zmierzające bezpośrednio do zawarcia umowy sprzedaży Produktu.",

        s3: "§ 3. Składanie zamówień",
        s3_1:
          "Zamówienia można składać 24 godziny na dobę przez stronę Sklepu. Zamówienia złożone w dni robocze po godz. 12:00 oraz w dni wolne od pracy są przyjmowane do realizacji w najbliższym dniu roboczym.",
        s3_2:
          "Złożenie zamówienia wymaga podania danych osobowych niezbędnych do realizacji umowy: imienia, nazwiska, adresu dostawy, numeru telefonu oraz adresu e-mail.",
        s3_3:
          "W procesie składania zamówienia Klient potwierdza zapoznanie się z niniejszym regulaminem oraz akceptację jego postanowień.",
        s3_4:
          "Zamówienie uważa się za złożone z chwilą otrzymania przez Klienta potwierdzenia jego przyjęcia na wskazany adres e-mail.",
        s3_5:
          "Umowa sprzedaży zostaje zawarta z chwilą zaksięgowania płatności na rachunku bankowym Sprzedawcy lub operatora płatności.",

        s4: "§ 4. Ceny i płatności",
        s4_1:
          "Wszystkie ceny Produktów podane w Sklepie są cenami brutto (zawierają podatek VAT) i są wyrażone w złotych polskich (PLN).",
        s4_2:
          "Cena Produktu jest ceną końcową — wysyłka na terenie Rzeczypospolitej Polskiej jest bezpłatna, Sprzedawca nie dolicza kosztów dostawy.",
        s4_3Intro: "Klient może wybrać jedną z dostępnych w Sklepie form płatności:",
        s4_3a: "płatność online kartą płatniczą,",
        s4_3b: "BLIK,",
        s4_3c: "szybki przelew (Przelewy24).",
        s4_4:
          "Sprzedawca wystawia paragon fiskalny lub – na życzenie Klienta zgłoszone w zamówieniu – fakturę VAT.",

        s5: "§ 5. Realizacja zamówienia i dostawa",
        s5_1:
          "Czas realizacji zamówienia liczy się od dnia zaksięgowania płatności i jest każdorazowo wskazany w karcie Produktu.",
        s5_2:
          "Dostawa odbywa się na terenie Rzeczypospolitej Polskiej za pośrednictwem firmy kurierskiej lub transportu meblowego (dla Produktów wielkogabarytowych).",
        s5_3Before: "Wysyłka na terenie Rzeczypospolitej Polskiej jest ",
        s5_3Strong: "bezpłatna",
        s5_3Mid:
          " — Sprzedawca nie dolicza kosztów dostawy. Po złożeniu zamówienia firma transportowa skontaktuje się z Klientem w celu ustalenia dogodnego terminu dostawy. Szczegóły dostępne są w zakładce ",
        s5_3Link: "Dostawa i płatności",
        s5_3After: ".",
        s5_4:
          "Klient jest zobowiązany do sprawdzenia stanu przesyłki w obecności kuriera. W razie stwierdzenia uszkodzeń opakowania lub Produktu zaleca się sporządzenie protokołu szkody.",

        s6: "§ 6. Prawo odstąpienia od umowy",
        s6_1:
          "Konsument oraz Przedsiębiorca na prawach konsumenta mają prawo odstąpić od umowy w terminie 14 dni od dnia otrzymania Produktu, bez podawania przyczyny.",
        s6_2Before:
          "Aby skorzystać z prawa odstąpienia, należy poinformować Sprzedawcę o swojej decyzji w formie jednoznacznego oświadczenia, wysłanego na adres e-mail ",
        s6_2After: " lub adres pocztowy Sprzedawcy.",
        s6_3Before:
          "Klient może skorzystać z wzoru formularza odstąpienia dostępnego w zakładce ",
        s6_3Link: "Zwroty i reklamacje",
        s6_3After: ".",
        s6_4:
          "W przypadku odstąpienia od umowy, umowę uważa się za niezawartą. Sprzedawca zwraca Klientowi wszystkie otrzymane płatności, w tym koszty dostawy (z wyjątkiem dodatkowych kosztów wynikających z wybranego przez Klienta sposobu dostawy innego niż najtańszy oferowany przez Sklep), niezwłocznie, nie później niż 14 dni od dnia otrzymania oświadczenia o odstąpieniu.",
        s6_5:
          "Klient ponosi bezpośrednie koszty zwrotu Produktu. W przypadku Produktów, których ze względu na ich gabaryty nie można odesłać zwykłą przesyłką, koszty te mogą być wyższe – szacunkowe koszty zwrotu wskazane są w karcie Produktu.",
        s6_6:
          "Prawo odstąpienia nie przysługuje w przypadku Produktów wykonanych na indywidualne zamówienie Klienta (np. nietypowe wymiary, spersonalizowana tkanina), zgodnie z art. 38 ustawy o prawach konsumenta.",

        s7: "§ 7. Reklamacje (rękojmia)",
        s7_1:
          "Sprzedawca ponosi odpowiedzialność wobec Konsumenta z tytułu rękojmi za wady Produktu przez okres 2 lat od dnia wydania Produktu, zgodnie z przepisami Kodeksu cywilnego.",
        s7_2Before:
          "Reklamację można złożyć w formie elektronicznej (na adres ",
        s7_2After: ") lub pisemnej (na adres Sprzedawcy).",
        s7_3:
          "Zgłoszenie reklamacji powinno zawierać: dane Klienta, numer zamówienia, opis wady oraz żądanie Klienta (naprawa, wymiana, obniżenie ceny, odstąpienie od umowy).",
        s7_4:
          "Sprzedawca rozpatruje reklamację w terminie 14 dni od dnia jej otrzymania i informuje Klienta o sposobie jej załatwienia.",

        s8: "§ 8. Pozasądowe sposoby rozpatrywania reklamacji",
        s8_1Intro:
          "Konsument ma możliwość skorzystania z pozasądowych sposobów rozpatrywania reklamacji i dochodzenia roszczeń, w tym:",
        s8_1a: "mediacji prowadzonej przez Wojewódzkie Inspektoraty Inspekcji Handlowej,",
        s8_1b: "stałych polubownych sądów konsumenckich,",
        s8_1cBefore: "platformy internetowej ODR Komisji Europejskiej: ",
        s8_1cAfter: ".",

        s9: "§ 9. Ochrona danych osobowych",
        s9Before:
          "Zasady przetwarzania danych osobowych opisane są w odrębnym dokumencie: ",
        s9Link: "Polityce prywatności",
        s9After: ".",

        s10: "§ 10. Postanowienia końcowe",
        s10_1:
          "W sprawach nieuregulowanych niniejszym regulaminem zastosowanie mają przepisy prawa polskiego, w szczególności Kodeksu cywilnego, ustawy o prawach konsumenta oraz ustawy o świadczeniu usług drogą elektroniczną.",
        s10_2:
          "Sprzedawca zastrzega sobie prawo do zmiany regulaminu. Zmiany wchodzą w życie w terminie wskazanym przez Sprzedawcę, nie krótszym niż 7 dni od dnia publikacji na stronie Sklepu. Zmiany nie mają zastosowania do zamówień złożonych przed datą ich wejścia w życie.",
        s10_3:
          "Ewentualne spory powstałe w związku z umową zawartą na podstawie niniejszego regulaminu będą rozstrzygane przez sąd powszechny właściwy dla miejsca zamieszkania Konsumenta, a w przypadku Klientów niebędących Konsumentami – przez sąd właściwy dla siedziby Sprzedawcy.",
      };

  return (
    <>
      <h1>{c.h1}</h1>
      <span className="meta">{c.meta}</span>

      <h2>{c.s1}</h2>
      <ol>
        <li>
          {c.s1_1Before}
          <strong>{COMPANY.domain}</strong>
          {c.s1_1After}
        </li>
        <li>
          {c.s1_2Before}
          <strong>{COMPANY.legalName}</strong>
          {c.s1_2Mid}
          {formatFullAddress(locale)}
          {c.s1_2NipLabel}
          {COMPANY.nip}
          {isFilled(COMPANY.regon) && (
            <>
              {c.s1_2RegonLabel}
              {COMPANY.regon}
            </>
          )}
          {COMPANY.krs && (
            <>
              {c.s1_2KrsLabel}
              {COMPANY.krs}
            </>
          )}
          {c.s1_2After}
        </li>
        <li>
          {c.s1_3Before}
          <strong>{contact.email}</strong>
          {contact.phone && (
            <>
              {c.s1_3Phone}
              {contact.phone}
            </>
          )}
          {c.s1_3End}
        </li>
        <li>{c.s1_4}</li>
      </ol>

      <h2>{c.s2}</h2>
      <ol>
        <li>
          <strong>{c.s2_1Strong}</strong>
          {c.s2_1}
        </li>
        <li>
          <strong>{c.s2_2Strong}</strong>
          {c.s2_2}
        </li>
        <li>
          <strong>{c.s2_3Strong}</strong>
          {c.s2_3}
        </li>
        <li>
          <strong>{c.s2_4Strong}</strong>
          {c.s2_4}
        </li>
        <li>
          <strong>{c.s2_5Strong}</strong>
          {c.s2_5}
        </li>
      </ol>

      <h2>{c.s3}</h2>
      <ol>
        <li>{c.s3_1}</li>
        <li>{c.s3_2}</li>
        <li>{c.s3_3}</li>
        <li>{c.s3_4}</li>
        <li>{c.s3_5}</li>
      </ol>

      <h2>{c.s4}</h2>
      <ol>
        <li>{c.s4_1}</li>
        <li>{c.s4_2}</li>
        <li>
          {c.s4_3Intro}
          <ul>
            <li>{c.s4_3a}</li>
            <li>{c.s4_3b}</li>
            <li>{c.s4_3c}</li>
          </ul>
        </li>
        <li>{c.s4_4}</li>
      </ol>

      <h2>{c.s5}</h2>
      <ol>
        <li>{c.s5_1}</li>
        <li>{c.s5_2}</li>
        <li>
          {c.s5_3Before}
          <strong>{c.s5_3Strong}</strong>
          {c.s5_3Mid}
          <a href={localizeHref("/dostawa", locale)}>{c.s5_3Link}</a>
          {c.s5_3After}
        </li>
        <li>{c.s5_4}</li>
      </ol>

      <h2>{c.s6}</h2>
      <ol>
        <li>{c.s6_1}</li>
        <li>
          {c.s6_2Before}
          <strong>{contact.email}</strong>
          {c.s6_2After}
        </li>
        <li>
          {c.s6_3Before}
          <a href={localizeHref("/zwroty", locale)}>{c.s6_3Link}</a>
          {c.s6_3After}
        </li>
        <li>{c.s6_4}</li>
        <li>{c.s6_5}</li>
        <li>{c.s6_6}</li>
      </ol>

      <h2>{c.s7}</h2>
      <ol>
        <li>{c.s7_1}</li>
        <li>
          {c.s7_2Before}
          <strong>{contact.email}</strong>
          {c.s7_2After}
        </li>
        <li>{c.s7_3}</li>
        <li>{c.s7_4}</li>
      </ol>

      <h2>{c.s8}</h2>
      <ol>
        <li>
          {c.s8_1Intro}
          <ul>
            <li>{c.s8_1a}</li>
            <li>{c.s8_1b}</li>
            <li>
              {c.s8_1cBefore}
              <a
                href="https://ec.europa.eu/consumers/odr"
                target="_blank"
                rel="noopener noreferrer"
              >
                ec.europa.eu/consumers/odr
              </a>
              {c.s8_1cAfter}
            </li>
          </ul>
        </li>
      </ol>

      <h2>{c.s9}</h2>
      <p>
        {c.s9Before}
        <a href={localizeHref("/prywatnosc", locale)}>{c.s9Link}</a>
        {c.s9After}
      </p>

      <h2>{c.s10}</h2>
      <ol>
        <li>{c.s10_1}</li>
        <li>{c.s10_2}</li>
        <li>{c.s10_3}</li>
      </ol>
    </>
  );
}
