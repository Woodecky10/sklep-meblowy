import type { Metadata } from "next";
import { getLocale } from "@/app/_lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const de = locale === "de";
  return de
    ? {
        title: "Versand und Zahlung",
        description:
          "Informationen zu Versandarten, Versandkosten und Zahlungsmethoden.",
      }
    : {
        title: "Dostawa i płatności",
        description:
          "Informacje o sposobach dostawy, kosztach wysyłki i formach płatności.",
      };
}

export default async function DostawaPage() {
  const locale = await getLocale();
  const de = locale === "de";

  const c = de
    ? {
        h1: "Versand und Zahlung",
        meta: "Alles, was Sie über Ihre Bestellung wissen müssen",
        h2Payment: "Zahlungsmethoden",
        payCardStrong: "Zahlungskarte",
        payCard: " – Visa, Mastercard. Sofortige Autorisierung.",
        payBlikStrong: "BLIK",
        payBlik: " – Bestätigung mit einem 6-stelligen Code aus der Banking-App.",
        payTransferStrong: "Sofortüberweisung (Przelewy24)",
        payTransfer: " – automatische Weiterleitung zu Ihrer Bank.",
        paymentNote:
          "Alle Transaktionen sind durch ein SSL-Zertifikat gesichert. Wir speichern keine Kartennummern – diese werden vom Zahlungsdienstleister verarbeitet.",
        h2Cost: "Versandkosten",
        costBefore: "Die Versandkosten beginnen ",
        costAmount: "ab 99 zł",
        costMiddle: " und werden ",
        costIndividual: "individuell für jede Bestellung",
        costAfter: " festgelegt. Den endgültigen Betrag beeinflussen:",
        costItem1Strong: "Gewicht und Abmessungen des Möbels",
        costItem1:
          " – je größer und schwerer das Produkt, desto teurer der Transport (sperrige Möbel erfordern einen Möbeltransport, keinen Standardkurier).",
        costItem2Strong: "Lieferort",
        costItem2:
          " – die Entfernung von unserem Lager beeinflusst den Kraftstoffsatz; die Lieferung in große Städte ist mitunter günstiger als in kleinere Ortschaften.",
        costItem3Strong: "Anzahl der Produkte in der Bestellung",
        costItem3:
          " – der Versand mehrerer Möbel in einem Transport ist oft vorteilhafter als mehrfache Lieferungen.",
        costItem4Strong: "Erforderliche Zusatzleistung",
        costItem4:
          " – Hineintragen in eine bestimmte Etage (falls kein Aufzug vorhanden ist), Montage, Entsorgung des alten Möbels.",
        costContactBefore:
          "Nach der Bestellung kontaktieren wir Sie ",
        costContactStrong: "telefonisch oder per E-Mail",
        costContactAfter:
          " mit einem konkreten Kostenvoranschlag. Der Kostenvoranschlag bedarf Ihrer Zustimmung – wenn Sie mit dem Betrag nicht einverstanden sind, haben Sie das Recht, die Bestellung kostenfrei zu stornieren.",
        costTimeBefore: "Den Kostenvoranschlag teilen wir in der Regel innerhalb von ",
        costTimeStrong: "1 Werktag",
        costTimeAfter: " nach Eingang der Bestellung mit.",
        h2Time: "Lieferzeit",
        time:
          "Die Lieferzeit ist auf der Seite jedes Produkts angegeben. Wir rechnen sie ab dem Zeitpunkt der Zahlungsgutschrift. Nach der Zusammenstellung der Bestellung setzt sich der Kurier oder das Transportunternehmen telefonisch mit Ihnen in Verbindung, um einen passenden Liefertermin zu vereinbaren.",
        h2Area: "Liefergebiet",
        area: "Wir liefern im gesamten Gebiet der Republik Polen.",
        h2Process: "Wie der Versand abläuft",
        process1: "Nach Bezahlung der Bestellung erhalten Sie eine Bestätigung per E-Mail.",
        process2:
          "Wir informieren Sie über den Bearbeitungsstatus (in Vorbereitung, versandt, zugestellt).",
        process3:
          "Bei sperrigen Produkten – ein Anruf des Transportunternehmens mit einem Terminvorschlag für die Lieferung.",
        process4:
          "Bei der Annahme empfehlen wir, den Zustand der Verpackung im Beisein des Kuriers zu prüfen. Bei sichtbaren Schäden erleichtert die Erstellung eines Schadensprotokolls eine eventuelle Reklamation.",
        h2Carry: "Was ist mit dem Hineintragen der Möbel?",
        carry:
          "Die Standardlieferung umfasst den Transport bis zur ersten Tür des Gebäudes. Das Hineintragen der Möbel in eine bestimmte Etage oder in die Wohnung kann zusätzlich bestellt werden – die Einzelheiten geben Sie bei der telefonischen Terminvereinbarung an.",
        h2Damage: "Transportschaden",
        damageBefore:
          "Wurde das Produkt beim Transport beschädigt, bitten wir um unverzügliche Kontaktaufnahme unter der im Bereich ",
        damageLink: "Kontakt",
        damageAfter:
          " angegebenen Adresse, am besten mit Fotodokumentation und – wenn möglich – einem mit dem Kurier erstellten Schadensprotokoll. Wir bearbeiten den Fall innerhalb von 14 Tagen.",
      }
    : {
        h1: "Dostawa i płatności",
        meta: "Wszystko, co musisz wiedzieć o zamówieniu",
        h2Payment: "Formy płatności",
        payCardStrong: "Karta płatnicza",
        payCard: " – Visa, Mastercard. Natychmiastowa autoryzacja.",
        payBlikStrong: "BLIK",
        payBlik: " – potwierdzenie 6-cyfrowym kodem z aplikacji banku.",
        payTransferStrong: "Szybki przelew (Przelewy24)",
        payTransfer: " – automatyczne przekierowanie do Twojego banku.",
        paymentNote:
          "Wszystkie transakcje zabezpieczone są certyfikatem SSL. Nie przechowujemy numerów kart płatniczych – obsługuje je operator płatności.",
        h2Cost: "Koszt dostawy",
        costBefore: "Koszt dostawy zaczyna się ",
        costAmount: "od 99 zł",
        costMiddle: " i jest ustalany ",
        costIndividual: "indywidualnie dla każdego zamówienia",
        costAfter: ". Wpływ na ostateczną kwotę mają:",
        costItem1Strong: "Waga i gabaryty mebla",
        costItem1:
          " – im większy i cięższy produkt, tym droższy transport (mebel wielkogabarytowy wymaga transportu meblowego, nie standardowego kuriera).",
        costItem2Strong: "Miejsce dostawy",
        costItem2:
          " – odległość od naszego magazynu wpływa na stawkę paliwa; dostawa do dużych miast bywa tańsza niż do mniejszych miejscowości.",
        costItem3Strong: "Liczba produktów w zamówieniu",
        costItem3:
          " – wysyłka kilku mebli jednym transportem jest często korzystniejsza niż wielokrotne dostawy.",
        costItem4Strong: "Wymagana usługa dodatkowa",
        costItem4:
          " – wniesienie na konkretne piętro (jeśli nie ma windy), montaż, utylizacja starego mebla.",
        costContactBefore: "Po złożeniu zamówienia kontaktujemy się z Tobą ",
        costContactStrong: "telefonicznie lub mailowo",
        costContactAfter:
          " z konkretną wyceną. Wycena wymaga Twojej akceptacji – jeśli nie zgadzasz się z kwotą, masz prawo zrezygnować z zamówienia bez kosztów.",
        costTimeBefore: "Wycenę podajemy zwykle w ciągu ",
        costTimeStrong: "1 dnia roboczego",
        costTimeAfter: " od otrzymania zamówienia.",
        h2Time: "Czas dostawy",
        time:
          "Czas realizacji jest podany w karcie każdego produktu. Liczymy go od momentu zaksięgowania płatności. Po skompletowaniu zamówienia kurier lub firma transportowa skontaktuje się z Tobą telefonicznie, aby ustalić dogodny termin dostawy.",
        h2Area: "Obszar dostawy",
        area: "Dostarczamy na terenie całej Rzeczypospolitej Polskiej.",
        h2Process: "Jak przebiega dostawa",
        process1: "Po opłaceniu zamówienia otrzymujesz potwierdzenie e-mailem.",
        process2:
          "Informujemy Cię o statusie realizacji (w przygotowaniu, wysłane, dostarczone).",
        process3:
          "Dla produktów wielkogabarytowych – telefon od firmy transportowej z propozycją terminu dostawy.",
        process4:
          "Podczas odbioru zalecamy sprawdzenie stanu opakowania w obecności kuriera. W razie widocznych uszkodzeń – sporządzenie protokołu szkody ułatwi ewentualną reklamację.",
        h2Carry: "Co z wniesieniem mebli?",
        carry:
          "Standardowa dostawa obejmuje transport pod pierwsze drzwi budynku. Wniesienie mebli na konkretne piętro lub do mieszkania można zamówić dodatkowo – szczegóły podaj przy telefonicznym ustalaniu terminu dostawy.",
        h2Damage: "Uszkodzenie w transporcie",
        damageBefore:
          "Jeżeli produkt został uszkodzony w transporcie, prosimy o niezwłoczny kontakt pod adresem wskazanym w zakładce ",
        damageLink: "Kontakt",
        damageAfter:
          ", najlepiej z dokumentacją fotograficzną i – jeśli to możliwe – protokołem szkody spisanym z kurierem. Rozpatrzymy sprawę w terminie 14 dni.",
      };

  return (
    <>
      <h1>{c.h1}</h1>
      <span className="meta">{c.meta}</span>

      <h2>{c.h2Payment}</h2>
      <ul>
        <li>
          <strong>{c.payCardStrong}</strong>
          {c.payCard}
        </li>
        <li>
          <strong>{c.payBlikStrong}</strong>
          {c.payBlik}
        </li>
        <li>
          <strong>{c.payTransferStrong}</strong>
          {c.payTransfer}
        </li>
      </ul>
      <p>{c.paymentNote}</p>

      <h2>{c.h2Cost}</h2>
      <p>
        {c.costBefore}
        <strong>{c.costAmount}</strong>
        {c.costMiddle}
        <strong>{c.costIndividual}</strong>
        {c.costAfter}
      </p>
      <ul>
        <li>
          <strong>{c.costItem1Strong}</strong>
          {c.costItem1}
        </li>
        <li>
          <strong>{c.costItem2Strong}</strong>
          {c.costItem2}
        </li>
        <li>
          <strong>{c.costItem3Strong}</strong>
          {c.costItem3}
        </li>
        <li>
          <strong>{c.costItem4Strong}</strong>
          {c.costItem4}
        </li>
      </ul>
      <p>
        {c.costContactBefore}
        <strong>{c.costContactStrong}</strong>
        {c.costContactAfter}
      </p>
      <p>
        {c.costTimeBefore}
        <strong>{c.costTimeStrong}</strong>
        {c.costTimeAfter}
      </p>

      <h2>{c.h2Time}</h2>
      <p>{c.time}</p>

      <h2>{c.h2Area}</h2>
      <p>{c.area}</p>

      <h2>{c.h2Process}</h2>
      <ol>
        <li>{c.process1}</li>
        <li>{c.process2}</li>
        <li>{c.process3}</li>
        <li>{c.process4}</li>
      </ol>

      <h2>{c.h2Carry}</h2>
      <p>{c.carry}</p>

      <h2>{c.h2Damage}</h2>
      <p>
        {c.damageBefore}
        <a href="/kontakt">{c.damageLink}</a>
        {c.damageAfter}
      </p>
    </>
  );
}
