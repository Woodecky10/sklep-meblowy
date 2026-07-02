import type { Metadata } from "next";
import { getLocale } from "@/app/_lib/i18n-server";
import { localizeHref } from "@/app/_lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const de = locale === "de";
  return de
    ? {
        title: "Versand und Zahlung",
        description:
          "Kostenloser Versand in ganz Polen. Informationen zu Lieferung und Zahlungsmethoden.",
      }
    : {
        title: "Dostawa i płatności",
        description:
          "Darmowa wysyłka na terenie całej Polski. Informacje o dostawie i formach płatności.",
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
        h2Cost: "Kostenloser Versand",
        costFree:
          "Der Versand ist in ganz Polen kostenlos — wir berechnen keine Versandkosten. Der angezeigte Preis ist der Endpreis; nach der Bestellung vereinbart das Transportunternehmen telefonisch einen Liefertermin mit Ihnen.",
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
        h2Cost: "Darmowa wysyłka",
        costFree:
          "Wysyłka jest darmowa na terenie całej Polski — nie doliczamy żadnych kosztów dostawy. Cena, którą widzisz, jest ceną końcową; po złożeniu zamówienia firma transportowa ustali z Tobą telefonicznie dogodny termin dostawy.",
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
      <p>{c.costFree}</p>

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
        <a href={localizeHref("/kontakt", locale)}>{c.damageLink}</a>
        {c.damageAfter}
      </p>
    </>
  );
}
