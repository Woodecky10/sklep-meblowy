import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/app/_lib/company";

export const metadata: Metadata = {
  title: "O nas",
  description: `Poznaj ${COMPANY.brandName} — sklep z meblami premium. Tworzymy przestrzenie, w których chce się żyć.`,
};

export default function OnasPage() {
  return (
    <>
      <h1>O nas</h1>
      <span className="meta">Poznaj {COMPANY.brandName}</span>

      <p>
        <strong>{COMPANY.brandName}</strong> to miejsce dla tych, którzy wierzą, że
        wnętrze potrafi zmienić codzienność. Tworzymy ofertę mebli premium z myślą o
        domach, w których każdy detal ma znaczenie — od faktury tkaniny, przez
        konstrukcję stelaża, aż po sposób, w jaki światło kładzie się na
        tapicerkowanej powierzchni.
      </p>

      <h2>Filozofia</h2>
      <p>
        Wierzymy, że dobry mebel powinien być trzy razy — ładny, wygodny i trwały.
        Dlatego każdą pozycję w naszej kolekcji dobieramy starannie, z nastawieniem
        na jakość wykonania i ponadczasowy design, który nie zestarzeje się w
        następnym sezonie.
      </p>

      <h2>Co oferujemy</h2>
      <ul>
        <li>
          <strong>Salon</strong> — sofy tapicerowane, narożniki w konfiguracji L i
          U, fotele wypoczynkowe, pufy. Starannie dobrane materiały i klasyczne
          proporcje, które pasują zarówno do nowoczesnych, jak i bardziej
          tradycyjnych wnętrz.
        </li>
        <li>
          <strong>Sypialnia</strong> — łóżka kontynentalne z wbudowanym materacem,
          łóżka tapicerowane, materace kieszeniowe i toppery. Stawiamy na komfort
          snu i elegancję wykończenia.
        </li>
      </ul>

      <h2>Jak pracujemy</h2>
      <p>
        Większość naszych mebli realizujemy na zamówienie — dzięki temu możemy
        zaoferować dobór tkanin, konfigurację narożnika czy wybór rozmiaru łóżka.
        Zwykle czas realizacji mieści się w przedziale 7–35 dni roboczych. Dokładny
        termin znajdziesz przy każdym produkcie.
      </p>
      <p>
        Dostarczamy na terenie całej Polski. Przy zamówieniach powyżej 2000 zł
        dostawa jest bezpłatna.
      </p>

      <h2>Jakość i gwarancja</h2>
      <p>
        Na większość produktów udzielamy gwarancji od 2 do 10 lat — szczegóły w
        karcie każdego produktu. Wybieramy dostawców, których materiały
        sprawdzaliśmy osobiście, a naszym klientom służymy wsparciem przy doborze
        i po zakupie.
      </p>

      <h2>Skontaktuj się z nami</h2>
      <p>
        Masz pytanie o produkt, potrzebujesz doradztwa albo chcesz się upewnić, że
        wybierasz dobrze? Napisz do nas — chętnie pomożemy. Szczegóły kontaktu
        znajdziesz w zakładce <Link href="/kontakt">Kontakt</Link>.
      </p>
    </>
  );
}
