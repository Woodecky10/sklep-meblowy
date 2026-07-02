import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/app/_lib/company";
import { getLocale } from "@/app/_lib/i18n-server";
import { localizeHref } from "@/app/_lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const de = locale === "de";
  return de
    ? {
        title: "Über uns",
        description: `Lernen Sie ${COMPANY.brandName} kennen — den Shop für Premium-Möbel. Wir gestalten Räume, in denen man leben möchte.`,
      }
    : {
        title: "O nas",
        description: `Poznaj ${COMPANY.brandName} — sklep z meblami premium. Tworzymy przestrzenie, w których chce się żyć.`,
      };
}

export default async function OnasPage() {
  const locale = await getLocale();
  const de = locale === "de";

  const c = de
    ? {
        h1: "Über uns",
        meta: `Lernen Sie ${COMPANY.brandName} kennen`,
        introBefore: " ist ein Ort für alle, die daran glauben, dass ein",
        introAfter:
          " Interieur den Alltag verändern kann. Wir gestalten ein Angebot an Premium-Möbeln für Zuhause, in denen jedes Detail zählt — von der Textur des Stoffes über die Konstruktion des Gestells bis hin zur Art, wie das Licht auf die gepolsterte Oberfläche fällt.",
        h2Philosophy: "Philosophie",
        philosophy:
          "Wir glauben, dass ein gutes Möbelstück gleich dreifach überzeugen sollte — schön, bequem und langlebig. Deshalb wählen wir jedes Stück unserer Kollektion sorgfältig aus, mit dem Fokus auf Verarbeitungsqualität und zeitloses Design, das nicht schon in der nächsten Saison veraltet.",
        h2Offer: "Was wir anbieten",
        offer1Strong: "Wohnzimmer",
        offer1:
          " — gepolsterte Sofas, Eckcouches in L- und U-Konfiguration, Ruhesessel, Hocker. Sorgfältig ausgewählte Materialien und klassische Proportionen, die sowohl zu modernen als auch zu eher traditionellen Interieurs passen.",
        offer2Strong: "Schlafzimmer",
        offer2:
          " — Boxspringbetten mit integrierter Matratze, gepolsterte Betten, Taschenfederkernmatratzen und Topper. Wir setzen auf Schlafkomfort und edle Verarbeitung.",
        h2How: "Wie wir arbeiten",
        how1:
          "Die meisten unserer Möbel fertigen wir auf Bestellung — dadurch können wir die Auswahl der Stoffe, die Konfiguration der Eckcouch oder die Wahl der Bettengröße anbieten. Die genaue Lieferzeit finden Sie bei jedem Produkt.",
        how2:
          "Wir liefern in ganz Polen — der Versand ist kostenlos (keine Versandkosten).",
        h2Quality: "Qualität und Garantie",
        quality:
          "Auf die meisten Produkte gewähren wir eine Garantie von 2 bis 10 Jahren — Einzelheiten finden Sie auf der Produktseite. Wir wählen Lieferanten aus, deren Materialien wir persönlich geprüft haben, und stehen unseren Kunden bei der Auswahl und nach dem Kauf mit Rat und Tat zur Seite.",
        h2Contact: "Kontaktieren Sie uns",
        contactBefore:
          "Haben Sie eine Frage zu einem Produkt, brauchen Sie Beratung oder möchten Sie sich vergewissern, dass Sie die richtige Wahl treffen? Schreiben Sie uns — wir helfen Ihnen gerne. Die Kontaktdaten finden Sie im Bereich ",
        contactLink: "Kontakt",
        contactAfter: ".",
      }
    : {
        h1: "O nas",
        meta: `Poznaj ${COMPANY.brandName}`,
        introBefore: " to miejsce dla tych, którzy wierzą, że",
        introAfter:
          " wnętrze potrafi zmienić codzienność. Tworzymy ofertę mebli premium z myślą o domach, w których każdy detal ma znaczenie — od faktury tkaniny, przez konstrukcję stelaża, aż po sposób, w jaki światło kładzie się na tapicerkowanej powierzchni.",
        h2Philosophy: "Filozofia",
        philosophy:
          "Wierzymy, że dobry mebel powinien być trzy razy — ładny, wygodny i trwały. Dlatego każdą pozycję w naszej kolekcji dobieramy starannie, z nastawieniem na jakość wykonania i ponadczasowy design, który nie zestarzeje się w następnym sezonie.",
        h2Offer: "Co oferujemy",
        offer1Strong: "Salon",
        offer1:
          " — sofy tapicerowane, narożniki w konfiguracji L i U, fotele wypoczynkowe, pufy. Starannie dobrane materiały i klasyczne proporcje, które pasują zarówno do nowoczesnych, jak i bardziej tradycyjnych wnętrz.",
        offer2Strong: "Sypialnia",
        offer2:
          " — łóżka kontynentalne z wbudowanym materacem, łóżka tapicerowane, materace kieszeniowe i toppery. Stawiamy na komfort snu i elegancję wykończenia.",
        h2How: "Jak pracujemy",
        how1:
          "Większość naszych mebli realizujemy na zamówienie — dzięki temu możemy zaoferować dobór tkanin, konfigurację narożnika czy wybór rozmiaru łóżka. Dokładny czas realizacji znajdziesz przy każdym produkcie.",
        how2:
          "Dostarczamy na terenie całej Polski — wysyłka jest darmowa (nie doliczamy kosztów dostawy).",
        h2Quality: "Jakość i gwarancja",
        quality:
          "Na większość produktów udzielamy gwarancji od 2 do 10 lat — szczegóły w karcie każdego produktu. Wybieramy dostawców, których materiały sprawdzaliśmy osobiście, a naszym klientom służymy wsparciem przy doborze i po zakupie.",
        h2Contact: "Skontaktuj się z nami",
        contactBefore:
          "Masz pytanie o produkt, potrzebujesz doradztwa albo chcesz się upewnić, że wybierasz dobrze? Napisz do nas — chętnie pomożemy. Szczegóły kontaktu znajdziesz w zakładce ",
        contactLink: "Kontakt",
        contactAfter: ".",
      };

  return (
    <>
      <h1>{c.h1}</h1>
      <span className="meta">{c.meta}</span>

      <p>
        <strong>{COMPANY.brandName}</strong>
        {c.introBefore}
        {c.introAfter}
      </p>

      <h2>{c.h2Philosophy}</h2>
      <p>{c.philosophy}</p>

      <h2>{c.h2Offer}</h2>
      <ul>
        <li>
          <strong>{c.offer1Strong}</strong>
          {c.offer1}
        </li>
        <li>
          <strong>{c.offer2Strong}</strong>
          {c.offer2}
        </li>
      </ul>

      <h2>{c.h2How}</h2>
      <p>{c.how1}</p>
      <p>{c.how2}</p>

      <h2>{c.h2Quality}</h2>
      <p>{c.quality}</p>

      <h2>{c.h2Contact}</h2>
      <p>
        {c.contactBefore}
        <Link href={localizeHref("/kontakt", locale)}>{c.contactLink}</Link>
        {c.contactAfter}
      </p>
    </>
  );
}
